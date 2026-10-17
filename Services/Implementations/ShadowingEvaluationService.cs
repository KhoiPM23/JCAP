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
    /// Điều phối đánh giá một câu Shadowing. Backend là nơi DUY NHẤT tính điểm cuối cùng.
    ///
    /// Nhận dạng giọng nói chạy trên trình duyệt (Web Speech): backend chỉ chấm theo transcript ĐÃ CHỐT (final)
    /// do client gửi, không bao giờ dùng kết quả interim. Không có transcript hợp lệ → "chưa chấm được"
    /// (unavailable), KHÔNG phải điểm 0. Âm thanh gốc không được dùng để nhận dạng; chỉ bản WAV phân tích
    /// (nếu có) được dùng để đo nhịp nói.
    /// </summary>
    public class ShadowingEvaluationService : IAiShadowingAssessmentService
    {
        private const int MaxClientTranscriptLength = 500;
        private const int MaxGateDetailLength = 200;

        private static readonly string[] ValidGateStatuses = { "good", "acceptable", "needs_retry", "unmeasured" };

        private readonly IJapaneseTextComparer _comparer;
        private readonly IConfiguration _configuration;
        private readonly ILogger<ShadowingEvaluationService> _logger;
        private readonly IFluencyAnalyzer? _fluencyAnalyzer;
        private readonly IReferenceVoiceProvider? _referenceProvider;

        public ShadowingEvaluationService(
            IJapaneseTextComparer comparer,
            IConfiguration configuration,
            ILogger<ShadowingEvaluationService> logger,
            IFluencyAnalyzer? fluencyAnalyzer = null,
            IReferenceVoiceProvider? referenceProvider = null)
        {
            _comparer = comparer;
            _configuration = configuration;
            _logger = logger;
            _fluencyAnalyzer = fluencyAnalyzer;
            _referenceProvider = referenceProvider;
        }

        public async Task<ShadowingAudioEvaluationResponseDto> EvaluateAsync(
            ShadowingAudioEvaluationInput input,
            CancellationToken cancellationToken = default)
        {
            var response = NewResponse(input);

            if (string.IsNullOrWhiteSpace(input.TargetText))
            {
                return Unavailable(response, "MISSING_TARGET_TEXT", "Thiếu câu mẫu cần đối chiếu.");
            }

            // Chất lượng âm thanh do client đo (heuristic): needs_retry thì không chấm.
            if (response.AudioQualityStatus == "needs_retry")
            {
                return Unavailable(response, "AUDIO_QUALITY_INSUFFICIENT",
                    response.AudioQualityDetail ?? "Chất lượng âm thanh chưa đạt, hãy thu âm lại.");
            }

            return await EvaluateBrowserTranscriptAsync(input, response, cancellationToken);
        }

        /// <summary>
        /// Chấm theo transcript Web Speech ĐÃ CHỐT do client gửi. Điểm chỉ là so khớp nội dung;
        /// thiếu transcript hợp lệ thì "chưa chấm được", không phải điểm 0.
        /// </summary>
        private async Task<ShadowingAudioEvaluationResponseDto> EvaluateBrowserTranscriptAsync(
            ShadowingAudioEvaluationInput input,
            ShadowingAudioEvaluationResponseDto response,
            CancellationToken cancellationToken)
        {
            response.RecognitionSource = "web_speech";

            var transcript = TryUseClientTranscript(input);
            if (transcript == null)
            {
                var status = input.ClientRecognitionStatus?.Trim().ToLowerInvariant();
                switch (status)
                {
                    case "unsupported":
                        return Unavailable(response, "BROWSER_STT_UNSUPPORTED",
                            "Trình duyệt này không hỗ trợ nhận dạng giọng nói. Hãy dùng Chrome hoặc Edge.");
                    case "error":
                        return Unavailable(response, "BROWSER_STT_ERROR",
                            "Trình duyệt chưa nhận dạng được giọng nói (kiểm tra quyền micro), hãy thử lại.");
                    default:
                        response.RecognitionStatus = "no_speech";
                        return Unavailable(response, "NO_SPEECH_DETECTED",
                            "Không nghe rõ giọng nói. Hãy đọc to và rõ hơn rồi thử lại.", keepRecognitionStatus: true);
                }
            }

            response.EvaluationStatus = "completed";
            return await ScoreTranscriptAsync(input, response, transcript, cancellationToken);
        }

        private async Task<ShadowingAudioEvaluationResponseDto> ScoreTranscriptAsync(
            ShadowingAudioEvaluationInput input,
            ShadowingAudioEvaluationResponseDto response,
            string transcript,
            CancellationToken cancellationToken)
        {
            // So khớp + chấm điểm (một công thức duy nhất)
            var comparison = await _comparer.CompareAsync(input.TargetText, transcript, cancellationToken);
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
                PlaceExtraPauseOnWords(observations, input, referenceVoice, comparison, targetMoras);
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
        /// </summary>
        private void PlaceExtraPauseOnWords(
            List<FluencyObservationDto> observations, ShadowingAudioEvaluationInput input, ReferenceVoice? voice,
            JapaneseTextComparison comparison, int targetMoras)
        {
            var observation = observations.FirstOrDefault(x => x.Code == "extra_pause");
            if (observation == null) return;
            if (voice?.Timeline == null || input.AnalysisWav == null || comparison.TargetWords.Count == 0)
            {
                observation.Data["placementFailure"] = voice == null ? "NO_REFERENCE_VOICE" : voice.Timeline == null ? "NO_TIMELINE" : input.AnalysisWav == null ? "NO_ANALYSIS_WAV" : "NO_TARGET_WORDS";
                _logger.LogInformation("Không nêu được từ cho khoảng dừng: {Failure}", observation.Data["placementFailure"]);
                return;
            }
            if (observation.Data.GetValueOrDefault("pauses") is not List<ExtraPauseInfo> pauses || pauses.Count == 0) return;

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
                if (anyPlaced) observation.Message = FluencyComparer.DescribePauses(items);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Không xác định được từ ứng với khoảng dừng; giữ nhận xét chung.");
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
            var gate = (input.AudioGateStatus ?? string.Empty).Trim().ToLowerInvariant();
            if (!ValidGateStatuses.Contains(gate)) gate = "unmeasured";

            var detail = input.AudioGateDetail?.Trim();
            if (detail != null && detail.Length > MaxGateDetailLength) detail = detail[..MaxGateDetailLength];

            return new ShadowingAudioEvaluationResponseDto
            {
                EvaluationStatus = "completed",
                RecognitionStatus = "unavailable",
                RecognitionSource = "none",
                Source = "none",
                AudioQualityStatus = gate,
                AudioQualityDetail = string.IsNullOrEmpty(detail) ? null : detail,
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

        /// <summary>Chỉ nhận transcript ĐÃ CHỐT, không rỗng sau chuẩn hóa. Không bao giờ dùng interim.</summary>
        private static string? TryUseClientTranscript(ShadowingAudioEvaluationInput input)
        {
            if (!string.Equals(input.ClientRecognitionStatus, "final", StringComparison.OrdinalIgnoreCase)) return null;

            var text = input.ClientTranscript?.Trim();
            if (string.IsNullOrEmpty(text)) return null;
            if (JapaneseMora.Normalize(text).Length == 0) return null;

            return text.Length > MaxClientTranscriptLength ? text[..MaxClientTranscriptLength] : text;
        }
    }
}
