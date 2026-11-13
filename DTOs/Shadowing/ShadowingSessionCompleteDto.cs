using System;
using System.Collections.Generic;
using System.Linq;

namespace JCAP.DTOs.Shadowing
{
    /// <summary>
    /// Hoàn thành buổi luyện. Client KHÔNG gửi điểm: chỉ gửi Id các kết quả chấm câu (EvaluationId) mà backend đã trả
    /// từ evaluate-audio; backend tự đọc điểm đã lưu, tính điểm tổng và lưu ShadowingPracticeSession.
    /// </summary>
    public class ShadowingSessionCompleteDto
    {
        public int DialogueId { get; set; }

        /// <summary>A | B</summary>
        public string LearnerRole { get; set; } = "A";

        public int DurationSeconds { get; set; }

        /// <summary>Thời điểm bắt đầu luyện (tùy chọn; không hợp lệ thì suy ra từ DurationSeconds).</summary>
        public DateTime? StartedAt { get; set; }

        public List<Guid> EvaluationIds { get; set; } = new();

        /// <summary>
        /// Phiên luyện ở server (ShadowingPracticeProgress). Có thì backend tự lấy các lần chấm của phiên (bỏ qua EvaluationIds),
        /// chuyển phiên sang completed; gọi lại trả về đúng buổi đã tạo. Không có: chạy như cũ theo EvaluationIds (client cũ).
        /// </summary>
        public Guid? ProgressId { get; set; }
    }

    public class ShadowingSessionCompleteResponseDto
    {
        public Guid SessionId { get; set; }
        public int DialogueId { get; set; }
        public string DialogueTitle { get; set; } = string.Empty;
        public int OverallAccuracyScore { get; set; }
        public int? OverallFluencyScore { get; set; }
        public string AudioQualityStatus { get; set; } = "unmeasured";
        public int WeightedOverallScore { get; set; }
        public string ScoringVersion { get; set; } = string.Empty;
        public string RankTitle { get; set; } = string.Empty;
        public string SummaryFeedback { get; set; } = string.Empty;
        public int LearnerSentenceCount { get; set; }
        public int ScoredSentenceCount { get; set; }

        /// <summary>Tổng kết buổi luyện do backend tính từ các lần chấm đã lưu (Shadowing V2).</summary>
        public ShadowingSessionSummaryDto Summary { get; set; } = new();
    }

    /// <summary>
    /// Tổng kết một buổi luyện. Phân biệt: lần THU (chỉ ở trình duyệt, không lưu), lần GỬI CHẤM (mỗi lần một ShadowingSentenceEvaluation,
    /// kể cả chưa chấm được) và BUỔI LUYỆN. Không dùng điểm của chiều này để giả lập chiều khác.
    /// </summary>
    public class ShadowingSessionSummaryDto
    {
        public int TotalSentenceCount { get; set; }
        public int LearnerSentenceCount { get; set; }
        /// <summary>Câu của vai người học có ít nhất một lần chấm được.</summary>
        public int EvaluatedSentenceCount { get; set; }
        /// <summary>Tổng số lần gửi chấm trong buổi (kể cả chưa chấm được).</summary>
        public int TotalSubmissions { get; set; }
        /// <summary>Số lần gửi chấm không có điểm (âm thanh không đạt, hệ thống tạm ngừng…).</summary>
        public int UnscoredSubmissions { get; set; }

        /// <summary>Độ chính xác nội dung của buổi (câu chưa chấm tính 0, như điểm buổi).</summary>
        public int ContentAccuracy { get; set; }
        /// <summary>COMPLETED | UNAVAILABLE — các chiều chưa có điểm đã kiểm chứng thì không có số.</summary>
        public string PronunciationStatus { get; set; } = "UNAVAILABLE";
        public string FluencyStatus { get; set; } = "UNAVAILABLE";
        public string ProsodyStatus { get; set; } = "UNAVAILABLE";

        /// <summary>Câu nên luyện lại: chưa chấm được lần nào, hoặc điểm cao nhất dưới mức vàng (65).</summary>
        public List<ShadowingRetrySentenceDto> SentencesToRetry { get; set; } = new();

        /// <summary>Số lỗi theo loại (chouon, sokuon, hatsuon, voicing, mora, extra, missing) trên lần chấm tốt nhất của mỗi câu.</summary>
        public Dictionary<string, int> ErrorTypeCounts { get; set; } = new();
    }

    public class ShadowingRetrySentenceDto
    {
        public int SentenceId { get; set; }
        public int OrderIndex { get; set; }
        public string JapaneseText { get; set; } = string.Empty;
        public int? BestScore { get; set; }
        /// <summary>NOT_EVALUATED | LOW_SCORE</summary>
        public string Reason { get; set; } = "NOT_EVALUATED";
        public string? MainErrorType { get; set; }
    }

    /// <summary>Một lần gửi chấm trong buổi luyện (lịch sử chi tiết).</summary>
    public class ShadowingSubmissionDto
    {
        public Guid EvaluationId { get; set; }
        public int SentenceId { get; set; }
        public int OrderIndex { get; set; }
        public DateTime SubmittedAt { get; set; }
        public string EvaluationStatus { get; set; } = string.Empty;
        public string? ErrorCode { get; set; }
        public int? ContentMatchScore { get; set; }
        public string Tier { get; set; } = string.Empty;
        public string RecognizedText { get; set; } = string.Empty;
        public string RecognitionSource { get; set; } = string.Empty;
        public string? AsrModel { get; set; }
        public string ScoringVersion { get; set; } = string.Empty;
        /// <summary>true nếu là lần được tính vào điểm buổi (lần điểm cao nhất của câu).</summary>
        public bool CountedInSession { get; set; }
    }

    public class ShadowingSessionDetailDto
    {
        public ShadowingPracticeSessionDto Session { get; set; } = new();
        public ShadowingSessionSummaryDto Summary { get; set; } = new();
        public List<ShadowingSubmissionDto> Submissions { get; set; } = new();
    }

    /// <summary>Gợi ý luyện tập theo quy tắc (không dùng AI): chỉ từ lỗi lặp lại đủ nhiều.</summary>
    public class ShadowingRecommendationDto
    {
        public List<ShadowingFocusDto> Focus { get; set; } = new();
        public List<ShadowingRecommendedDialogueDto> Dialogues { get; set; } = new();
        /// <summary>Số lần chấm được dùng để phân tích.</summary>
        public int EvaluationsAnalyzed { get; set; }
    }

    public class ShadowingFocusDto
    {
        /// <summary>chouon | sokuon | hatsuon | voicing</summary>
        public string ErrorType { get; set; } = string.Empty;
        public int Occurrences { get; set; }
        public int SentenceCount { get; set; }
        public string Message { get; set; } = string.Empty;
    }

    public class ShadowingRecommendedDialogueDto
    {
        public int DialogueId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string JlptLevel { get; set; } = string.Empty;
        public string ErrorType { get; set; } = string.Empty;
        /// <summary>Số câu trong bài có âm cần luyện (theo cách đọc đã tính sẵn).</summary>
        public int MatchingSentenceCount { get; set; }
    }

    /// <summary>Một buổi luyện trong lịch sử (đọc từ CSDL).</summary>
    public class ShadowingPracticeSessionDto
    {
        public Guid Id { get; set; }
        public int DialogueId { get; set; }
        public string DialogueTitle { get; set; } = string.Empty;
        public string ScenarioTitle { get; set; } = string.Empty;
        public string JlptLevel { get; set; } = string.Empty;
        public string LearnerRole { get; set; } = "A";
        public DateTime StartedAt { get; set; }
        public DateTime CompletedAt { get; set; }
        public int DurationSeconds { get; set; }
        public int ContentMatchScore { get; set; }
        public int? FluencyScore { get; set; }
        public int WeightedOverallScore { get; set; }
        public string ScoringVersion { get; set; } = string.Empty;
        public string AudioQualityStatus { get; set; } = "unmeasured";
        public string RankTitle { get; set; } = string.Empty;
        public int LearnerSentenceCount { get; set; }
        public int ScoredSentenceCount { get; set; }
        /// <summary>Tổng số lần gửi chấm của buổi (kể cả chưa chấm được); null với buổi trước Shadowing V2 (không có phiên server).</summary>
        public int? TotalSubmissions { get; set; }
        public List<ShadowingSessionSentenceDto> Sentences { get; set; } = new();
    }

    /// <summary>Kết quả chấm của một câu trong buổi luyện (đã lưu ở backend).</summary>
    public class ShadowingSessionSentenceDto
    {
        public Guid EvaluationId { get; set; }
        public int SentenceId { get; set; }
        public int OrderIndex { get; set; }
        public string TargetText { get; set; } = string.Empty;
        public string RecognizedText { get; set; } = string.Empty;
        public int ContentMatchScore { get; set; }
        public int OverallScore { get; set; }
        public string Tier { get; set; } = string.Empty;
        public string Feedback { get; set; } = string.Empty;
        public string ScoringVersion { get; set; } = string.Empty;
        public List<ShadowingDiffTokenDto> DiffTokens { get; set; } = new();
        public DateTime EvaluatedAt { get; set; }
    }

    /// <summary>
    /// Số liệu Lưu loát rút gọn của một lần chấm, lưu cùng kết quả để tổng hợp theo buổi (không lưu danh sách khoảng dừng chi tiết).
    /// Tỷ lệ tốc độ = tốc độ người học / tốc độ giọng mẫu (&lt; 1 là chậm hơn).
    /// </summary>
    public class ShadowingFluencySnapshotDto
    {
        public double? RateRatio { get; set; }
        public double? SpeakingRateRatio { get; set; }
        public int? PauseCount { get; set; }
        public int? ReferencePauseCount { get; set; }
        public int? ExtraPauseCount { get; set; }
        public int? HesitationCount { get; set; }
        public int? LongestPauseMs { get; set; }
        public double? MeanRunMoras { get; set; }
        public double? ReferenceMeanRunMoras { get; set; }
        /// <summary>Câu nhận xét nhịp nói của lần chấm (tối đa 3).</summary>
        public List<string> Notes { get; set; } = new();

        /// <summary>Null khi không so được với giọng mẫu (đọc chưa đúng câu, thiếu giọng mẫu, câu quá ngắn, đã tắt Lưu loát).</summary>
        public static ShadowingFluencySnapshotDto? From(FluencyMetricsDto? f)
        {
            var c = f?.Comparison;
            if (f == null || f.Status != "available" || c == null || c.Status != "available") return null;
            return new ShadowingFluencySnapshotDto
            {
                RateRatio = c.ArticulationRateRatio,
                SpeakingRateRatio = c.SpeakingRateRatio,
                PauseCount = c.LearnerPauseCount ?? f.PauseCount,
                ReferencePauseCount = c.ReferencePauseCount,
                ExtraPauseCount = c.ExtraPauseCount,
                HesitationCount = c.HesitationCount,
                LongestPauseMs = f.LongestPauseMs,
                MeanRunMoras = f.MeanRunMoras,
                ReferenceMeanRunMoras = f.Reference?.Metrics.MeanRunMoras,
                Notes = f.Observations.Select(o => o.Message).Where(m => !string.IsNullOrWhiteSpace(m)).Take(3).ToList(),
            };
        }
    }
}
