using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Điều phối đánh giá một câu Shadowing theo CHIỀU (Shadowing V2). Backend là nơi DUY NHẤT tính điểm cuối cùng.
    ///
    /// Thứ tự:
    ///  1. Backend tự kiểm tra âm thanh (ShadowingAudioValidator); kết quả kiểm tra của trình duyệt không quyết định.
    ///  2. Chiều NỘI DUNG: nhận dạng lời nói bằng ASR (`Shadowing:Content:Provider`, mặc định faster-whisper — Decision 1) rồi so
    ///     transcript với câu mẫu (KanaMoraComparer). ASR không dùng được → Content UNAVAILABLE, KHÔNG tự chuyển nguồn khác.
    ///     `phoneme` (mô hình âm vị, chấm theo câu mẫu) chỉ còn là lựa chọn cấu hình tường minh cho giai đoạn chuyển tiếp.
    ///  3. Chiều PHÁT ÂM: UNAVAILABLE (INSUFFICIENT_ACOUSTIC_EVIDENCE) cho tới khi phương pháp được kiểm chứng trên giọng người học.
    ///     Không bao giờ suy ra từ điểm nội dung.
    ///  4. Chiều LƯU LOÁT: số đo nhịp nói (FluencyAnalyzer), chưa có điểm đã kiểm chứng. NGỮ ĐIỆU: chưa triển khai.
    ///  5. Điểm tổng = điểm nội dung (OverallScoreBasis = "content").
    /// Không có nguồn chấm dự phòng và không bao giờ chấm bằng transcript Web Speech; thiếu dữ liệu → null + mã lỗi, không phải 0.
    /// </summary>
    public class ShadowingEvaluationService : IAiShadowingAssessmentService
    {
        private readonly IJapaneseTextComparer _comparer;
        private readonly IConfiguration _configuration;
        private readonly ILogger<ShadowingEvaluationService> _logger;
        private readonly IFluencyAnalyzer? _fluencyAnalyzer;
        private readonly IReferenceVoiceProvider? _referenceProvider;
        private readonly IPhonemeRecognizer? _phonemeRecognizer;
        private readonly ShadowingRecognitionThrottle? _throttle;
        private readonly ISpeechRecognitionService? _asr;

        /// <summary>Kết quả chỉ một mora mà độ tự tin thấp hơn mức này coi là nhiễu (mô hình đôi khi nghe nền ồn thành 「あ」).</summary>
        private const double MinSingleMoraConfidence = 0.6;

        /// <summary>
        /// Whisper tự dùng ngưỡng nén 2.4 để nhận ra đoạn văn bản lặp vô nghĩa (ảo giác). Vượt ngưỡng thì transcript không đáng tin:
        /// không kết luận người học nói sai.
        /// </summary>
        private const double MaxCompressionRatio = 2.4;

        public const string ProviderAsr = "faster-whisper";
        public const string ProviderPhoneme = "phoneme";

        public ShadowingEvaluationService(
            IJapaneseTextComparer comparer,
            IConfiguration configuration,
            ILogger<ShadowingEvaluationService> logger,
            IFluencyAnalyzer? fluencyAnalyzer = null,
            IReferenceVoiceProvider? referenceProvider = null,
            IPhonemeRecognizer? phonemeRecognizer = null,
            ShadowingRecognitionThrottle? throttle = null,
            ISpeechRecognitionService? asr = null)
        {
            _comparer = comparer;
            _configuration = configuration;
            _logger = logger;
            _fluencyAnalyzer = fluencyAnalyzer;
            _referenceProvider = referenceProvider;
            _phonemeRecognizer = phonemeRecognizer;
            _throttle = throttle;
            _asr = asr;
        }

        /// <summary>Đo nhịp nói (Lưu loát, tham khảo) và so với giọng mẫu khi chấm (`Shadowing:Fluency:Enabled`, mặc định true).</summary>
        private bool FluencyEnabled => _configuration.GetValue<bool?>("Shadowing:Fluency:Enabled") ?? true;

        private string ContentProvider =>
            string.Equals(_configuration["Shadowing:Content:Provider"], ProviderPhoneme, StringComparison.OrdinalIgnoreCase)
                ? ProviderPhoneme : ProviderAsr;

        public async Task<ShadowingAudioEvaluationResponseDto> EvaluateAsync(
            ShadowingAudioEvaluationInput input,
            CancellationToken cancellationToken = default)
        {
            var watch = System.Diagnostics.Stopwatch.StartNew();
            var response = await EvaluateCoreAsync(input, cancellationToken);
            response.ProcessingMs = (int)watch.ElapsedMilliseconds;
            FinalizeDimensions(response);
            return response;
        }

        private async Task<ShadowingAudioEvaluationResponseDto> EvaluateCoreAsync(
            ShadowingAudioEvaluationInput input,
            CancellationToken cancellationToken)
        {
            var response = NewResponse(input);

            if (string.IsNullOrWhiteSpace(input.TargetText))
            {
                return Unavailable(response, "MISSING_TARGET_TEXT", "Thiếu câu mẫu cần đối chiếu.");
            }

            // 1. Kiểm tra âm thanh phía backend (không tin kết quả do trình duyệt gửi).
            var audio = ShadowingAudioValidator.Validate(input.AnalysisWav, input.Audio);
            response.AudioQualityStatus = audio.QualityStatus;
            response.AudioQualityDetail = audio.Message;
            if (!audio.IsValid)
            {
                return Unavailable(response, audio.ErrorCode!, audio.Message!);
            }
            // Bản ghi nhỏ đã được khuếch đại: nhận dạng và đo nhịp nói trên bản đã khuếch đại
            if (audio.NormalizedWav != null) input = WithAnalysisWav(input, audio.NormalizedWav);

            // 2. Chiều Nội dung
            return ContentProvider == ProviderPhoneme
                ? await EvaluateWithPhonemeModelAsync(input, response, audio, cancellationToken)
                : await EvaluateWithAsrAsync(input, response, cancellationToken);
        }

        /// <summary>Nội dung từ ASR (Faster-Whisper): transcript so với câu mẫu.</summary>
        private async Task<ShadowingAudioEvaluationResponseDto> EvaluateWithAsrAsync(
            ShadowingAudioEvaluationInput input, ShadowingAudioEvaluationResponseDto response, CancellationToken cancellationToken)
        {
            response.RecognitionSource = ProviderAsr;
            if (_asr == null)
            {
                return Unavailable(response, "ASR_UNAVAILABLE", AsrMessage("ASR_UNAVAILABLE"));
            }

            var asr = await _asr.RecognizeAsync(new SpeechRecognitionRequest { Wav = input.AnalysisWav! }, cancellationToken);
            response.AsrModel = string.IsNullOrEmpty(asr.Model) ? asr.Provider : $"{asr.Provider}:{asr.Model}";
            if (!asr.IsCompleted)
            {
                var code = asr.ErrorCode ?? "ASR_UNAVAILABLE";
                var result = Unavailable(response, code, AsrMessage(code));
                if (asr.Status == "failed") result.EvaluationStatus = "failed";
                return result;
            }

            if (asr.Segments.Any(s => s.CompressionRatio > MaxCompressionRatio))
            {
                // Văn bản lặp vô nghĩa: lỗi nhận dạng, KHÔNG phải người học nói sai.
                return Unavailable(response, "ASR_UNRELIABLE",
                    "Hệ thống chưa nhận dạng được bản ghi này một cách đáng tin cậy. Điểm chưa được ghi nhận, hãy thu lại.");
            }

            var text = asr.Text.Trim();
            if (JapaneseMora.Normalize(text).Length == 0)
            {
                response.RecognitionStatus = "no_speech";
                return Unavailable(response, "NO_SPEECH_DETECTED",
                    "Không nghe rõ giọng nói trong bản ghi. Hãy đọc to và rõ hơn rồi thử lại.", keepRecognitionStatus: true);
            }

            if (!ContainsJapanese(text))
            {
                // Dịch vụ luôn chạy với language=ja; trả chữ Latin thuần (bản ghi thật: 一週間です → "It's your godness.")
                // là ảo giác của mô hình, không phải bằng chứng người học nói sai: không chấm, mời thu lại.
                return Unavailable(response, "ASR_UNRELIABLE",
                    "Hệ thống chưa nhận ra tiếng Nhật trong bản ghi này. Điểm chưa được ghi nhận, hãy thu lại và đọc rõ hơn.");
            }

            response.EvaluationStatus = "completed";
            response.RecognitionMode = "asr";
            // Cách đọc của transcript: do dịch vụ ASR tính (OpenJTalk, cùng G2P với dữ liệu câu mẫu) nếu có — không cần VOICEVOX lúc chấm;
            // không có thì đọc transcript qua các nguồn cách đọc của hệ thống.
            var comparison = !string.IsNullOrWhiteSpace(asr.Reading)
                ? await _comparer.CompareTranscriptAsync(input.TargetText, text, asr.Reading!, cancellationToken)
                : await _comparer.CompareAsync(input.TargetText, text, cancellationToken);
            return await ScoreTranscriptAsync(input, response, text, cancellationToken, precomputed: comparison);
        }

        /// <summary>Có ít nhất một kana hoặc chữ Hán (chữ số đứng riêng như "3,070" không tính là tiếng Nhật).</summary>
        private static bool ContainsJapanese(string text) =>
            text.Any(c => (c >= '぀' && c <= 'ヿ') || (c >= '一' && c <= '鿿') || (c >= '㐀' && c <= '䶿') || c == '々');

        private static ShadowingAudioEvaluationInput WithAnalysisWav(ShadowingAudioEvaluationInput i, byte[] wav) => new()
        {
            Audio = i.Audio,
            MimeType = i.MimeType,
            TargetText = i.TargetText,
            ClientTranscript = i.ClientTranscript,
            ClientRecognitionStatus = i.ClientRecognitionStatus,
            ClientRecognitionError = i.ClientRecognitionError,
            AudioGateStatus = i.AudioGateStatus,
            AudioGateDetail = i.AudioGateDetail,
            AnalysisWav = wav,
            ReferenceSpeakerId = i.ReferenceSpeakerId,
        };

        private static string AsrMessage(string code) => code switch
        {
            "ASR_BUSY" => "Hệ thống nhận dạng đang bận. Hãy gửi lại sau vài giây.",
            "ASR_TIMEOUT" => "Nhận dạng lời nói quá lâu chưa có kết quả. Điểm chưa được ghi nhận, hãy gửi lại.",
            "ASR_REJECTED_AUDIO" => "Bản ghi không xử lý được. Hãy thu lại.",
            _ => "Hệ thống nhận dạng lời nói đang tạm ngừng. Điểm chưa được ghi nhận, hãy thử lại sau.",
        };

        /// <summary>
        /// Lựa chọn chuyển tiếp (`Shadowing:Content:Provider = phoneme`): nội dung từ mô hình âm vị trên chính bản ghi
        /// (chấm theo câu mẫu, hoặc nhận dạng tự do khi đọc câu khác).
        /// </summary>
        private async Task<ShadowingAudioEvaluationResponseDto> EvaluateWithPhonemeModelAsync(
            ShadowingAudioEvaluationInput input, ShadowingAudioEvaluationResponseDto response, ShadowingAudioValidation audio,
            CancellationToken cancellationToken)
        {
            if (_phonemeRecognizer == null || !_phonemeRecognizer.IsAvailable)
            {
                _logger.LogWarning("Chưa có mô hình nhận dạng âm vị; lượt này không chấm được (chạy scripts/download-speech-models).");
                return Unavailable(response, "RECOGNIZER_UNAVAILABLE",
                    "Hệ thống chấm phát âm đang tạm ngừng. Điểm chưa được ghi nhận, hãy thử lại sau.");
            }

            using var slot = _throttle == null ? null : await _throttle.TryEnterAsync(cancellationToken);
            if (_throttle != null && slot == null)
            {
                return Unavailable(response, "SERVER_BUSY", "Hệ thống đang bận chấm cho nhiều người. Hãy gửi lại sau vài giây.");
            }

            var recognized = RecognizeFromRecording(audio.Samples16k!);
            if (recognized == null)
            {
                return Unavailable(response, "RECOGNIZER_UNAVAILABLE",
                    "Không phân tích được bản ghi lúc này. Điểm chưa được ghi nhận, hãy thử lại.");
            }

            response.RecognitionSource = ProviderPhoneme;
            if (recognized.Value.NoSpeech)
            {
                response.RecognitionStatus = "no_speech";
                return Unavailable(response, "NO_SPEECH_DETECTED",
                    "Không nghe rõ giọng nói trong bản ghi. Hãy đọc to và rõ hơn rồi thử lại.", keepRecognitionStatus: true);
            }

            response.EvaluationStatus = "completed";
            response.FreeRecognizedText = recognized.Value.Kana;

            var aligned = await TryAlignWithTargetAsync(input, recognized.Value.Result, cancellationToken);
            if (aligned != null)
            {
                response.RecognitionMode = "aligned";
                return await ScoreTranscriptAsync(input, response, JapaneseMora.Join(aligned.Value.Heard.Heard), cancellationToken,
                    precomputed: aligned.Value.Comparison);
            }

            response.RecognitionMode = "free";
            return await ScoreTranscriptAsync(input, response, recognized.Value.Kana, cancellationToken);
        }

        /// <summary>
        /// Trạng thái từng chiều. Phát âm KHÔNG suy ra từ nội dung; lưu loát chưa có điểm; điểm tổng ghi rõ chỉ là điểm nội dung.
        /// </summary>
        private static void FinalizeDimensions(ShadowingAudioEvaluationResponseDto r)
        {
            var contentSource = r.RecognitionSource == ProviderAsr ? (string.IsNullOrEmpty(r.AsrModel) ? ProviderAsr : r.AsrModel)
                : r.RecognitionSource == ProviderPhoneme ? $"phoneme-{r.RecognitionMode}" : null;
            r.Dimensions = new EvaluationDimensionsDto
            {
                Content = r.ContentMatchScore.HasValue
                    ? new EvaluationDimensionDto { Status = "COMPLETED", Score = r.ContentMatchScore, Source = contentSource }
                    : new EvaluationDimensionDto
                    {
                        Status = r.EvaluationStatus == "failed" ? "FAILED" : "UNAVAILABLE",
                        Reason = r.ErrorCode ?? "NOT_MEASURED",
                        Source = contentSource,
                    },
                Pronunciation = new EvaluationDimensionDto { Status = "UNAVAILABLE", Reason = "INSUFFICIENT_ACOUSTIC_EVIDENCE" },
                Fluency = r.Fluency?.Status == "available"
                    ? new EvaluationDimensionDto { Status = "COMPLETED", Reason = "SCORE_NOT_VALIDATED", Source = "vad" }
                    : new EvaluationDimensionDto { Status = "UNAVAILABLE", Reason = r.Fluency?.ReasonCode ?? "NOT_MEASURED", Source = "vad" },
                Prosody = new EvaluationDimensionDto { Status = "UNAVAILABLE", Reason = "NOT_IMPLEMENTED" },
            };
            r.PronunciationScore = null;
            r.FluencyScore = null;
            r.OverallScoreBasis = r.OverallScore.HasValue ? "content" : null;
            r.UnavailableDimensions = new List<string> { "pronunciation", "fluency", "prosody" };
            r.ScoringVersion = ShadowingScoring.Version;
        }

        /// <summary>
        /// Chấm theo câu mẫu (PronunciationAligner): với từng mora, so "đọc đúng" với các kiểu đọc sai thường gặp trên chính
        /// xác suất của mô hình âm vị. Null khi tắt (`Shadowing:Recognition:Mode = free`), không có cách đọc câu mẫu, mô hình không
        /// trả xác suất, hoặc bản ghi KHÔNG giống câu mẫu (đọc câu khác) — khi đó nhận dạng tự do cho kết quả trung thực hơn.
        /// </summary>
        private async Task<(AlignedRecognition Heard, JapaneseTextComparison Comparison)?> TryAlignWithTargetAsync(
            ShadowingAudioEvaluationInput input, PhonemeRecognitionResult result, CancellationToken cancellationToken)
        {
            var mode = _configuration["Shadowing:Recognition:Mode"];
            if (string.Equals(mode, "free", StringComparison.OrdinalIgnoreCase)) return null;
            if (result.LogProbabilities.Length == 0 || result.Labels.Count == 0) return null;

            try
            {
                var reading = await _comparer.ReadTargetAsync(input.TargetText, cancellationToken);
                if (reading == null || reading.Moras.Count == 0) return null;

                var defaults = new AlignmentOptions();
                var options = new AlignmentOptions
                {
                    Margin = _configuration.GetValue<double?>("Shadowing:Alignment:Margin") ?? defaults.Margin,
                    VowelExtraMargin = _configuration.GetValue<double?>("Shadowing:Alignment:VowelExtraMargin") ?? defaults.VowelExtraMargin,
                    MaxMismatchPerFrame = _configuration.GetValue<double?>("Shadowing:Alignment:MaxMismatchPerFrame") ?? defaults.MaxMismatchPerFrame,
                };
                var aligned = PronunciationAligner.Align(reading.Moras, result.LogProbabilities, result.Labels, options);
                if (aligned == null) return null;
                if (aligned.IsMismatch)
                {
                    _logger.LogInformation("Bản ghi không giống câu mẫu (lệch {Mismatch} nat/khung); chấm bằng nhận dạng tự do.", aligned.MismatchPerFrame);
                    return null;
                }

                return (aligned, _comparer.CompareHeard(input.TargetText, reading, aligned.Heard));
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Chấm theo câu mẫu lỗi; dùng nhận dạng tự do.");
                return null;
            }
        }

        /// <summary>
        /// Nhận dạng âm vị trên mẫu 16 kHz đã được kiểm tra. Null khi mô hình lỗi (lỗi ở đây không bao giờ thành điểm 0).
        /// </summary>
        private (bool NoSpeech, string Kana, PhonemeRecognitionResult Result)? RecognizeFromRecording(float[] samples)
        {
            try
            {
                var result = _phonemeRecognizer!.Recognize(samples);
                if (result == null) return null;

                var moras = JapaneseMora.FromKana(result.Kana, preserveLongVowelSpelling: false);
                if (moras.Count == 0) return (true, string.Empty, result);

                // Một mora lẻ với độ tự tin thấp thường là nền ồn bị nghe thành nguyên âm, không phải tiếng nói.
                var speech = result.Phonemes.Where(p => !PhonemeKana.IsNonSpeech(p.Label)).ToList();
                var confidence = speech.Count == 0 ? 0 : speech.Average(p => p.Confidence);
                if (moras.Count == 1 && confidence < MinSingleMoraConfidence) return (true, string.Empty, result);

                return (false, result.Kana, result);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Nhận dạng âm vị lỗi; lượt này không chấm được.");
                return null;
            }
        }

        private async Task<ShadowingAudioEvaluationResponseDto> ScoreTranscriptAsync(
            ShadowingAudioEvaluationInput input,
            ShadowingAudioEvaluationResponseDto response,
            string transcript,
            CancellationToken cancellationToken,
            JapaneseTextComparison? precomputed = null)
        {
            // So khớp + chấm điểm (một công thức duy nhất). Transcript là cách đọc (kana từ mô hình âm vị) nên không đọc lại.
            var comparison = precomputed
                ?? await _comparer.CompareWithReadingAsync(input.TargetText, transcript, cancellationToken);
            if (comparison.ReadingUnavailable)
            {
                // Không chuyển được sang cách đọc đáng tin cậy (engine VOICEVOX tắt/ký tự lạ): KHÔNG đoán và KHÔNG cho điểm.
                // Transcript vẫn được trả để người học thấy hệ thống nghe được gì; đây là lỗi kỹ thuật, không phải điểm thấp.
                _logger.LogWarning("Không có cách đọc đáng tin cậy cho câu mẫu/transcript; không chấm điểm.");
                response.EvaluationStatus = "failed";
                response.RecognitionStatus = "recognized";
                response.Source = response.RecognitionSource;
                response.RecognizedText = transcript;
                response.ErrorCode = "READING_UNAVAILABLE";
                response.ErrorMessage = "Hệ thống chưa chuyển được câu sang cách đọc để chấm điểm. Điểm chưa được ghi nhận, hãy thử lại sau.";
                return response;
            }

            var content = comparison.ContentMatchScore;
            var overall = ShadowingScoring.ComputeOverall(content, fluency: null);

            response.Source = response.RecognitionSource;
            response.RecognitionStatus = "recognized";
            response.RecognizedText = transcript;
            response.RecognizedDisplayText = string.IsNullOrEmpty(comparison.RecognizedDisplay) ? transcript : comparison.RecognizedDisplay;
            response.ContentMatchScore = content;
            response.FluencyScore = null;
            response.PronunciationScore = null;
            response.OverallScore = overall;
            response.Tier = ShadowingScoring.TierFor(overall);
            response.Feedback = comparison.Feedback;
            response.DiffTokens = comparison.Tokens.ToList();
            response.ReadingSource = comparison.ReadingSource;
            response.TargetReading = comparison.TargetReading;
            response.RecognizedReading = comparison.RecognizedReading;
            response.MissingWords = comparison.Tokens.Where(t => t.Status == "missing").Select(t => t.Text).ToList();
            response.MismatchedWords = comparison.Tokens.Where(t => t.Status == "mismatched").Select(t => t.Text).ToList();
            response.Fluency = await AnalyzeFluencyAsync(input, response, comparison, cancellationToken);
            return response;
        }

        /// <summary>
        /// Nhịp nói chỉ để tham khảo: lỗi hay thiếu dữ liệu ở đây KHÔNG bao giờ làm mất hay đổi điểm Content Match.
        /// Chỉ so sánh với giọng mẫu và tạo nhận xét khi đủ điều kiện (xem <see cref="FluencyComparer.CheckEligibility"/>).
        /// </summary>
        private async Task<FluencyMetricsDto?> AnalyzeFluencyAsync(
            ShadowingAudioEvaluationInput input,
            ShadowingAudioEvaluationResponseDto response,
            JapaneseTextComparison comparison,
            CancellationToken cancellationToken)
        {
            // Đo nhịp nói và so với giọng mẫu (Lưu loát, hiển thị tham khảo, không tính điểm). Tắt bằng `Shadowing:Fluency:Enabled = false`
            // (nhanh hơn, không cần giọng mẫu lúc chấm).
            // Phát hiện đoạn tiếng nói (VAD) cho bộ kiểm tra âm thanh KHÔNG phụ thuộc cài đặt này.
            if (!FluencyEnabled)
                return new FluencyMetricsDto { Status = "unavailable", ReasonCode = "NOT_ENABLED", Version = FluencyAnalyzer.Version };
            if (_fluencyAnalyzer == null || input.AnalysisWav == null || input.AnalysisWav.Length == 0) return null;

            try
            {
                var options = FluencyComparisonOptions.FromConfiguration(_configuration);
                var targetMoras = CountMoras(comparison.TargetReading);
                var context = new FluencyComparisonContext
                {
                    // Điểm cao không đồng nghĩa transcript chính xác, nên ngoài ngưỡng Content Match còn kiểm tra số mora tương ứng.
                    TranscriptReliable = response.EvaluationStatus == "completed" && !string.IsNullOrWhiteSpace(response.RecognizedText),
                    ContentMatchScore = comparison.ContentMatchScore,
                    TargetMoraCount = targetMoras,
                    RecognizedMoraCount = CountMoras(comparison.RecognizedReading),
                };

                var gate = FluencyComparer.CheckEligibility(context, options);

                // Số mora chỉ đếm từ câu mẫu và chỉ dùng khi người học thực sự đọc câu đó (tránh tốc độ mora/giây vô nghĩa).
                var learner = _fluencyAnalyzer.Analyze(input.AnalysisWav, gate == null ? targetMoras : null);
                if (gate != null)
                {
                    learner.Comparison = FluencyComparer.Unavailable(gate);
                    return learner;
                }

                FluencyMetricsDto? referenceMetrics = null;
                ReferenceVoice? referenceVoice = null;
                var durationObservations = new List<FluencyObservationDto>();
                if (learner.Status == "available" && _referenceProvider != null)
                {
                    var voice = await _referenceProvider.GetAsync(input.TargetText, input.ReferenceSpeakerId, cancellationToken);
                    if (voice != null)
                    {
                        // Cùng bộ VAD và tiêu chí khoảng dừng cho cả hai phía.
                        referenceVoice = voice;
                        referenceMetrics = _fluencyAnalyzer.AnalyzeAnyRate(voice.Wav, targetMoras);
                        learner.Reference = new FluencyReferenceDto { Source = voice.Source, SpeakerId = voice.SpeakerId, Metrics = referenceMetrics };
                        durationObservations = AnalyzeMoraDuration(input, voice, learner, options);
                    }
                }

                var (comparisonResult, observations) = FluencyComparer.Compare(learner, referenceMetrics, context, options);
                learner.Comparison = comparisonResult;
                var hesitations = PlaceExtraPauseOnWords(observations, input, referenceVoice, comparison, targetMoras);
                if (comparisonResult.Status == "available")
                    comparisonResult.HesitationCount = comparisonResult.ExtraPauseCount == 0 ? 0 : hesitations;
                // Nhận xét cụ thể về trường âm (nếu có) đứng trước nhận xét nhịp chung; tổng không quá giới hạn.
                learner.Observations = durationObservations.Concat(observations).Take(options.MaxObservations).ToList();
                return learner;
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Không đo được nhịp nói; bỏ qua phần số liệu này.");
                return new FluencyMetricsDto { Status = "unavailable", ReasonCode = "ANALYSIS_ERROR", Version = FluencyAnalyzer.Version };
            }
        }

        /// <summary>
        /// Nêu khoảng dừng thừa theo TỪ cụ thể (sau từ nào, trước từ nào) thay cho cách nói chung "giữa câu".
        /// Không xác định được thì giữ nguyên nhận xét chung; lỗi ở đây không bao giờ ảnh hưởng điểm hay các nhận xét khác.
        /// Trả về số khoảng dừng định vị được nằm GIỮA một từ (ngập ngừng); null nếu không định vị được khoảng nào.
        /// </summary>
        private int? PlaceExtraPauseOnWords(
            List<FluencyObservationDto> observations, ShadowingAudioEvaluationInput input, ReferenceVoice? voice,
            JapaneseTextComparison comparison, int targetMoras)
        {
            var observation = observations.FirstOrDefault(x => x.Code == "extra_pause");
            if (observation == null) return null;
            if (voice?.Timeline == null || input.AnalysisWav == null || comparison.TargetWords.Count == 0)
            {
                observation.Data["placementFailure"] = voice == null ? "NO_REFERENCE_VOICE" : voice.Timeline == null ? "NO_TIMELINE" : input.AnalysisWav == null ? "NO_ANALYSIS_WAV" : "NO_TARGET_WORDS";
                _logger.LogInformation("Không nêu được từ cho khoảng dừng: {Failure}", observation.Data["placementFailure"]);
                return null;
            }
            if (observation.Data.GetValueOrDefault("pauses") is not List<ExtraPauseInfo> pauses || pauses.Count == 0) return null;

            try
            {
                var options = MoraDurationOptions.FromConfiguration(_configuration);
                var maxCost = _configuration.GetValue<double?>("Shadowing:Pause:MaxAlignmentCost") ?? PausePositionLocator.DefaultMaxAlignmentCost;
                var learnerSamples = WavPcmReader.ReadMono16k(input.AnalysisWav);
                var referenceSamples = WavPcmReader.ResampleTo16k(WavPcmReader.ReadMonoAnyRate(voice.Wav, out var rate), rate);

                // Chỉ định vị các khoảng dừng sẽ được nêu (dài nhất, tối đa MaxPausesListed) để không tốn thời gian vô ích.
                var listed = pauses.Select((p, i) => (p, i)).OrderByDescending(x => x.p.DurationMs).ThenBy(x => x.i)
                    .Take(FluencyComparer.MaxPausesListed).Select(x => x.i).ToHashSet();

                var items = new List<(int DurationMs, string? Where)>();
                var placements = new List<Dictionary<string, object?>>();
                var anyPlaced = false;
                for (var i = 0; i < pauses.Count; i++)
                {
                    var pause = pauses[i];
                    var where = observation.Data.GetValueOrDefault("positionReliable") is true ? "ở khoảng giữa câu" : null;
                    var entry = new Dictionary<string, object?> { ["startMs"] = pause.StartMs, ["durationMs"] = pause.DurationMs };

                    if (listed.Contains(i))
                    {
                        var alignment = PausePositionLocator.Locate(
                            learnerSamples, referenceSamples, voice.Timeline, targetMoras, pause.StartMs, options, maxCost);
                        entry["placementFailure"] = alignment.Failure;
                        entry["placementCost"] = alignment.Cost == null ? null : Math.Round(alignment.Cost.Value, 2);

                        if (alignment.CompletedMoras == null)
                        {
                            _logger.LogInformation("Không nêu được từ cho khoảng dừng {Start} ms: {Failure} (cost={Cost}, ngưỡng={Max})",
                                pause.StartMs, alignment.Failure, alignment.Cost, maxCost);
                        }
                        else
                        {
                            var placement = PausePositionLocator.Place(alignment.CompletedMoras.Value, comparison.TargetWords);
                            var text = placement?.Describe();
                            if (placement != null && !string.IsNullOrEmpty(text))
                            {
                                where = text;
                                anyPlaced = true;
                                entry["completedMoras"] = alignment.CompletedMoras.Value;
                                entry["moraIndex"] = placement.MoraIndex;
                                entry["previousWord"] = placement.PreviousWord;
                                entry["nextWord"] = placement.NextWord;
                                entry["insideWord"] = placement.InsideWord;
                            }
                        }
                    }

                    items.Add((pause.DurationMs, where));
                    placements.Add(entry);
                }

                observation.Data["placements"] = placements;
                if (!anyPlaced) return null;
                observation.Message = FluencyComparer.DescribePauses(items);
                return placements.Count(p => p.GetValueOrDefault("insideWord") is string);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Không xác định được từ ứng với khoảng dừng; giữ nhận xét chung.");
                return null;
            }
        }

        /// <summary>
        /// Đo thời lượng trường âm (THỬ NGHIỆM). Mọi lỗi ở đây chỉ làm mất phần này, không ảnh hưởng điểm hay nhận xét nhịp chung.
        /// </summary>
        private List<FluencyObservationDto> AnalyzeMoraDuration(
            ShadowingAudioEvaluationInput input, ReferenceVoice voice, FluencyMetricsDto learner, FluencyComparisonOptions comparisonOptions)
        {
            if (!MoraDurationOptions.FromConfiguration(_configuration).Enabled) return new(); // tính năng thử nghiệm đang tắt: không đo, không nhận xét

            if (voice.Timeline == null)
            {
                learner.Duration = MoraDurationAnalyzer.Unavailable("TIMELINE_UNAVAILABLE");
                return new();
            }

            try
            {
                var options = MoraDurationOptions.FromConfiguration(_configuration);
                var learnerSamples = WavPcmReader.ReadMono16k(input.AnalysisWav!);
                var referenceSamples = WavPcmReader.ResampleTo16k(WavPcmReader.ReadMonoAnyRate(voice.Wav, out var rate), rate);

                learner.Duration = MoraDurationAnalyzer.Analyze(learnerSamples, referenceSamples, voice.Timeline, options);
                // Chừa chỗ cho nhận xét nhịp chung: tối đa 2 nhận xét trường âm.
                return MoraDurationAnalyzer.ToObservations(learner.Duration, options, Math.Min(2, comparisonOptions.MaxObservations));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Không đo được thời lượng mora; bỏ qua phần thử nghiệm này.");
                learner.Duration = MoraDurationAnalyzer.Unavailable("ANALYSIS_ERROR");
                return new();
            }
        }

        private static int CountMoras(string? kana) =>
            string.IsNullOrEmpty(kana) ? 0 : JapaneseMora.FromKana(kana).Count;

        private ShadowingAudioEvaluationResponseDto NewResponse(ShadowingAudioEvaluationInput input)
        {
            // Chất lượng âm thanh do BACKEND kiểm tra (đặt lại sau ShadowingAudioValidator); giá trị client gửi không được dùng.
            return new ShadowingAudioEvaluationResponseDto
            {
                EvaluationStatus = "completed",
                RecognitionStatus = "unavailable",
                RecognitionSource = "none",
                Source = "none",
                AudioQualityStatus = "unmeasured",
                ScoringVersion = ShadowingScoring.Version,
                ComparisonMethod = _comparer.MethodId,
                TargetText = input.TargetText ?? string.Empty,
                UnavailableDimensions = new List<string> { "fluency", "pronunciation" }
            };
        }

        private static ShadowingAudioEvaluationResponseDto Unavailable(
            ShadowingAudioEvaluationResponseDto response, string code, string message, bool keepRecognitionStatus = false)
        {
            response.EvaluationStatus = "unavailable";
            if (!keepRecognitionStatus) response.RecognitionStatus = "unavailable";
            response.ErrorCode = code;
            response.ErrorMessage = message;
            response.ContentMatchScore = null;
            response.OverallScore = null;
            response.Tier = string.Empty;
            response.Source = response.RecognitionSource;
            return response;
        }
    }
}
