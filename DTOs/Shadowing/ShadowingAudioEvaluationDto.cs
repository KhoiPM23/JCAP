using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Http;

namespace JCAP.DTOs.Shadowing
{
    public class ShadowingAudioEvaluationRequestDto
    {
        public IFormFile? Audio { get; set; }

        /// <summary>
        /// Câu đang luyện. Khi có, backend lấy câu mẫu từ CSDL (bỏ qua TargetText do client gửi) và LƯU kết quả chấm
        /// để dùng khi hoàn thành buổi luyện. Không có thì chỉ chấm theo TargetText và không lưu (công cụ thử nghiệm).
        /// </summary>
        public int? SentenceId { get; set; }

        /// <summary>Câu mẫu tiếng Nhật. Chỉ dùng để đối chiếu, KHÔNG gửi cho nhà cung cấp STT. Bị bỏ qua khi có SentenceId.</summary>
        public string TargetText { get; set; } = string.Empty;

        /// <summary>
        /// Transcript ĐÃ CHỐT (final) từ Web Speech API của trình duyệt. Không bao giờ chứa kết quả interim.
        /// Chỉ được dùng khi nhà cung cấp STT chính gặp lỗi kỹ thuật (xem ShadowingEvaluationService).
        /// </summary>
        public string? ClientTranscript { get; set; }

        /// <summary>final | empty | unsupported | error</summary>
        public string? ClientRecognitionStatus { get; set; }

        /// <summary>Mã lỗi của Web Speech nếu ClientRecognitionStatus = error (no-speech, network, not-allowed...).</summary>
        public string? ClientRecognitionError { get; set; }

        /// <summary>good | acceptable | needs_retry | unmeasured — do client đo bằng Web Audio API (heuristic, chưa hiệu chuẩn).</summary>
        public string? AudioGateStatus { get; set; }
        public string? AudioGateDetail { get; set; }
        public int? DurationMs { get; set; }

        /// <summary>
        /// Bản ghi đã xuất sang WAV PCM 16-bit mono 16 kHz (client resample) để đo nhịp nói. Tùy chọn:
        /// thiếu hoặc sai định dạng chỉ làm mất phần số liệu nhịp nói, không ảnh hưởng điểm Content Match.
        /// </summary>
        public IFormFile? AnalysisWav { get; set; }

        /// <summary>
        /// Id giọng VOICEVOX mà người học đã nghe làm mẫu (để so nhịp nói với đúng giọng đó). Tùy chọn;
        /// thiếu hoặc không hợp lệ thì dùng giọng mặc định trong cấu hình.
        /// </summary>
        public int? ReferenceSpeakerId { get; set; }
    }

    /// <summary>
    /// Số liệu thô về nhịp nói đo từ tín hiệu. KHÔNG phải điểm và KHÔNG nói lên phát âm đúng hay sai;
    /// ngưỡng phát hiện tiếng nói là heuristic chưa hiệu chuẩn trên giọng người học thật.
    /// </summary>
    public class FluencyMetricsDto
    {
        /// <summary>available | unavailable. Không đo được thì unavailable kèm ReasonCode, KHÔNG phải số 0.</summary>
        public string Status { get; set; } = "unavailable";

        /// <summary>NO_SIGNAL | LOW_LEVEL | NOISE_ONLY | AUDIO_TOO_SHORT | SPEECH_TOO_SHORT | INVALID_WAV | UNSUPPORTED_WAV_FORMAT | ANALYSIS_ERROR</summary>
        public string? ReasonCode { get; set; }

        public string Version { get; set; } = string.Empty;

        public int? DurationMs { get; set; }
        public int? LeadingSilenceMs { get; set; }
        public int? TrailingSilenceMs { get; set; }

        /// <summary>Từ đầu đoạn tiếng nói đầu tiên đến hết đoạn tiếng nói cuối cùng.</summary>
        public int? SpeechSpanMs { get; set; }

        /// <summary>Tổng thời gian có tiếng nói (không tính khoảng dừng).</summary>
        public int? SpeechMs { get; set; }

        /// <summary>SpeechMs / SpeechSpanMs (0..1).</summary>
        public double? SpeechRatio { get; set; }

        /// <summary>Số khoảng dừng (khoảng lặng ≥ 250 ms nằm giữa hai đoạn tiếng nói).</summary>
        public int? PauseCount { get; set; }
        public int? TotalPauseMs { get; set; }
        public int? LongestPauseMs { get; set; }
        public double? PauseRatio { get; set; }
        public List<FluencyPauseDto> Pauses { get; set; } = new();

        public int? MoraCount { get; set; }

        /// <summary>mora/giây trên toàn SpeechSpanMs (gồm khoảng dừng). Null nếu không biết số mora.</summary>
        public double? SpeakingRateMoraPerSec { get; set; }

        /// <summary>mora/giây không tính khoảng dừng.</summary>
        public double? ArticulationRateMoraPerSec { get; set; }

        /// <summary>Số liệu nhịp nói của giọng mẫu (cùng bộ VAD, cùng tiêu chí khoảng dừng). Null nếu chưa thử so sánh.</summary>
        public FluencyReferenceDto? Reference { get; set; }

        /// <summary>Kết quả so sánh với giọng mẫu. Null nếu không có bản ghi phân tích.</summary>
        public FluencyComparisonDto? Comparison { get; set; }

        /// <summary>Nhận xét có bằng chứng (tối đa 3). Rỗng nếu không đủ điều kiện hoặc chênh lệch nhỏ.</summary>
        public List<FluencyObservationDto> Observations { get; set; } = new();

        /// <summary>Đo thời lượng từng mora so với giọng mẫu (THỬ NGHIỆM). Null nếu chưa đủ điều kiện để thử đo.</summary>
        public MoraDurationDto? Duration { get; set; }
    }

    /// <summary>
    /// Kết quả đo thời lượng mora (trường âm) bằng cách căn chỉnh DTW giữa giọng người học và giọng mẫu VOICEVOX.
    /// THỬ NGHIỆM: mốc mora của giọng mẫu là ước lượng của engine, căn chỉnh giữa hai giọng khác nhau là xấp xỉ,
    /// và ngưỡng chưa hiệu chuẩn trên giọng người học thật. Không có điểm.
    /// </summary>
    public class MoraDurationDto
    {
        /// <summary>available | unavailable</summary>
        public string Status { get; set; } = "unavailable";

        /// <summary>
        /// TIMELINE_UNAVAILABLE | TIMELINE_MISMATCH | REFERENCE_UNAVAILABLE | LEARNER_UNAVAILABLE | ALIGNMENT_FAILED |
        /// ALIGNMENT_UNRELIABLE | NO_LONG_VOWEL | NOT_ELIGIBLE | ANALYSIS_ERROR
        /// </summary>
        public string? ReasonCode { get; set; }

        public string Version { get; set; } = string.Empty;

        /// <summary>Khoảng cách MFCC trung bình trên đường căn chỉnh (thấp = hai bản ghi giống nhau). Dùng để lọc độ tin cậy.</summary>
        public double? AlignmentCost { get; set; }

        /// <summary>Tốc độ chung của người học so với mẫu (trung vị tỷ lệ thời lượng các mora thường). 1.0 = bằng nhau.</summary>
        public double? TempoRatio { get; set; }

        /// <summary>Độ phân tán (MAD/trung vị) của tỷ lệ thời lượng các mora thường: càng cao càng kém tin cậy.</summary>
        public double? TempoSpread { get; set; }

        public List<MoraDurationUnitDto> Units { get; set; } = new();
    }

    public class MoraDurationUnitDto
    {
        /// <summary>chouon</summary>
        public string Kind { get; set; } = "chouon";

        /// <summary>Kana của đoạn được đo (mora mang nguyên âm + phần trường âm), vd. "ばあ".</summary>
        public string Text { get; set; } = string.Empty;

        public int MoraIndex { get; set; }
        public int ReferenceMs { get; set; }
        public int LearnerMs { get; set; }

        /// <summary>(thời lượng người học / mẫu) chia cho tốc độ chung. Thấp hơn 1 nghĩa là ngắn hơn mẫu.</summary>
        public double RelativeRatio { get; set; }

        public bool Flagged { get; set; }
    }

    public class FluencyReferenceDto
    {
        /// <summary>voicevox</summary>
        public string Source { get; set; } = "voicevox";
        public int? SpeakerId { get; set; }
        public FluencyMetricsDto Metrics { get; set; } = new();
    }

    public class FluencyComparisonDto
    {
        /// <summary>available | unavailable. unavailable nghĩa là KHÔNG đủ điều kiện để so sánh (không có nghĩa là nói tốt hay kém).</summary>
        public string Status { get; set; } = "unavailable";

        /// <summary>
        /// NOT_APPLICABLE | TRANSCRIPT_NOT_RELIABLE | CONTENT_BELOW_THRESHOLD | TRANSCRIPT_MORA_MISMATCH |
        /// LEARNER_UNAVAILABLE | REFERENCE_UNAVAILABLE | SPEECH_TOO_SHORT_FOR_COMPARISON
        /// </summary>
        public string? ReasonCode { get; set; }

        /// <summary>Tốc độ trong thời gian có tiếng nói (không tính khoảng dừng): người học / giọng mẫu. 1.0 = bằng nhau.</summary>
        public double? ArticulationRateRatio { get; set; }

        /// <summary>Tốc độ trên toàn khoảng nói (gồm cả khoảng dừng): người học / giọng mẫu.</summary>
        public double? SpeakingRateRatio { get; set; }

        public int? LearnerPauseCount { get; set; }
        public int? ReferencePauseCount { get; set; }

        /// <summary>Số khoảng dừng của người học dài ≥ ngưỡng và không có khoảng dừng tương ứng ở giọng mẫu.</summary>
        public int? ExtraPauseCount { get; set; }

        /// <summary>Số mora của transcript / số mora câu mẫu (dùng kiểm tra transcript có tương ứng với câu mẫu không).</summary>
        public double? MoraCountConsistency { get; set; }
    }

    public class FluencyObservationDto
    {
        /// <summary>slow_vs_reference | fast_vs_reference | extra_pause</summary>
        public string Code { get; set; } = string.Empty;

        /// <summary>Nhận xét tiếng Việt, sinh từ số đo thật.</summary>
        public string Message { get; set; } = string.Empty;

        /// <summary>Giá trị đo được (tỷ lệ tốc độ, hoặc độ dài khoảng dừng thừa dài nhất tính bằng mili-giây).</summary>
        public double MeasuredValue { get; set; }

        /// <summary>Ngưỡng đã kích hoạt nhận xét này.</summary>
        public double Threshold { get; set; }

        /// <summary>Dữ liệu hỗ trợ (vd. số khoảng dừng thừa, vị trí tương đối trong câu).</summary>
        public Dictionary<string, object?> Data { get; set; } = new();
    }

    public class FluencyPauseDto
    {
        public int StartMs { get; set; }
        public int EndMs { get; set; }
        public int DurationMs { get; set; }
    }

    public class ShadowingDiffTokenDto
    {
        public string Text { get; set; } = string.Empty;

        /// <summary>correct | mismatched | missing</summary>
        public string Status { get; set; } = "correct";
        /// <summary>Những gì người học nói ở vị trí này (kana, theo cách đọc).</summary>
        public string? SpokenPart { get; set; }

        /// <summary>Cách đọc chuẩn của đoạn này (kana). Chỉ có với token chưa đúng, để làm chú thích.</summary>
        public string? ExpectedReading { get; set; }

        /// <summary>chouon | sokuon | hatsuon | voicing | mora | extra</summary>
        public string? ErrorType { get; set; }
    }

    public class ShadowingAudioEvaluationResponseDto
    {
        /// <summary>Id kết quả chấm đã lưu (chỉ có khi gửi SentenceId và câu được chấm). Dùng khi hoàn thành buổi luyện.</summary>
        public Guid? EvaluationId { get; set; }

        public int? SentenceId { get; set; }

        /// <summary>
        /// completed: điểm Content Match tính từ transcript do nguồn STT chính cung cấp.
        /// partial: điểm tính được nhưng phải dùng nguồn dự phòng (Web Speech) do nguồn chính lỗi kỹ thuật.
        /// unavailable: không đủ dữ liệu tin cậy để chấm (im lặng, quá ngắn, âm thanh không đạt, sai định dạng).
        /// failed: lỗi kỹ thuật và không có nguồn dự phòng hợp lệ.
        /// </summary>
        public string EvaluationStatus { get; set; } = "completed";

        /// <summary>recognized | no_speech | unavailable — tách biệt với chất lượng âm thanh.</summary>
        public string RecognitionStatus { get; set; } = "recognized";

        /// <summary>gemini | web_speech | none</summary>
        public string RecognitionSource { get; set; } = "gemini";

        /// <summary>Lý do dùng nguồn dự phòng (vd. AI_TIMEOUT). Null nếu dùng nguồn chính.</summary>
        public string? FallbackReason { get; set; }

        /// <summary>good | acceptable | needs_retry | unmeasured. Tách biệt với RecognitionStatus.</summary>
        public string AudioQualityStatus { get; set; } = "unmeasured";
        public string? AudioQualityDetail { get; set; }

        /// <summary>Phiên bản công thức chấm điểm đã tạo ra kết quả này.</summary>
        public string ScoringVersion { get; set; } = string.Empty;

        /// <summary>Phương pháp so khớp văn bản đã dùng (interim, thay thế ở Phase 2).</summary>
        public string ComparisonMethod { get; set; } = string.Empty;

        public string TargetText { get; set; } = string.Empty;

        /// <summary>Nguồn cách đọc đã dùng cho cả hai phía (voicevox). Rỗng nếu không chấm.</summary>
        public string ReadingSource { get; set; } = string.Empty;

        /// <summary>Cách đọc (hiragana) của câu mẫu và của transcript, dùng để người học đối chiếu.</summary>
        public string TargetReading { get; set; } = string.Empty;
        public string RecognizedReading { get; set; } = string.Empty;

        /// <summary>Transcript cuối cùng được chấm. Rỗng nếu không có; KHÔNG bao giờ thay bằng câu mẫu.</summary>
        public string RecognizedText { get; set; } = string.Empty;

        /// <summary>Điểm khớp nội dung chữ viết/âm đọc (0 - 100). Null nếu không chấm được.</summary>
        public int? ContentMatchScore { get; set; }

        /// <summary>Chưa được đo ở phiên bản chấm hiện tại: luôn null.</summary>
        public int? PronunciationScore { get; set; }

        /// <summary>Chưa đo được đáng tin cậy: null.</summary>
        public int? FluencyScore { get; set; }

        /// <summary>
        /// Số liệu thô về nhịp nói (tốc độ, khoảng dừng). Null nếu client không gửi bản ghi phân tích.
        /// KHÔNG được tính vào OverallScore cho tới khi được kiểm chứng.
        /// </summary>
        public FluencyMetricsDto? Fluency { get; set; }

        /// <summary>Điểm tổng thể = trung bình có trọng số của các chiều đã đo (hiện chỉ có Content Match).</summary>
        public int? OverallScore { get; set; }

        /// <summary>Các chiều chưa đo được (vd. fluency, pronunciation).</summary>
        public List<string> UnavailableDimensions { get; set; } = new();

        /// <summary>green | yellow | red; rỗng nếu không có điểm.</summary>
        public string Tier { get; set; } = string.Empty;

        public string Feedback { get; set; } = string.Empty;

        public List<ShadowingDiffTokenDto> DiffTokens { get; set; } = new();

        /// <summary>Suy ra từ DiffTokens do backend tính, không lấy từ nhà cung cấp AI.</summary>
        public List<string> MissingWords { get; set; } = new();
        public List<string> MismatchedWords { get; set; } = new();

        /// <summary>Tương thích ngược: trùng RecognitionSource.</summary>
        public string Source { get; set; } = "gemini";

        public string? ErrorCode { get; set; }
        public string? ErrorMessage { get; set; }
    }
}
