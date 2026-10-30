using System;

namespace JCAP.Models
{
    /// <summary>
    /// Kết quả chấm một câu Shadowing do CHÍNH backend tạo ra (qua evaluate-audio) và lưu lại.
    /// Đây là nguồn điểm duy nhất khi hoàn thành buổi luyện: client chỉ gửi Id, không gửi điểm.
    /// Chỉ lưu các lượt chấm được (completed/partial); lượt "chưa chấm được" không có điểm nên không lưu.
    /// </summary>
    public class ShadowingSentenceEvaluation
    {
        public Guid Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public int ShadowingSentenceId { get; set; }

        /// <summary>Buổi luyện đã dùng kết quả này; null khi chưa được gắn vào buổi nào.</summary>
        public Guid? ShadowingPracticeSessionId { get; set; }

        public string RecognizedText { get; set; } = string.Empty;
        public int ContentMatchScore { get; set; }
        public int OverallScore { get; set; }

        /// <summary>green | yellow | red</summary>
        public string Tier { get; set; } = string.Empty;

        /// <summary>completed | partial</summary>
        public string EvaluationStatus { get; set; } = string.Empty;

        /// <summary>gemini | web_speech</summary>
        public string RecognitionSource { get; set; } = string.Empty;

        public string ScoringVersion { get; set; } = string.Empty;
        public string ComparisonMethod { get; set; } = string.Empty;
        public string AudioQualityStatus { get; set; } = "unmeasured";
        public string Feedback { get; set; } = string.Empty;

        /// <summary>Danh sách ShadowingDiffTokenDto (JSON) để hiển thị lại trong lịch sử.</summary>
        public string DiffTokensJson { get; set; } = "[]";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ApplicationUser? User { get; set; }
        public ShadowingSentence? ShadowingSentence { get; set; }
        public ShadowingPracticeSession? ShadowingPracticeSession { get; set; }
    }
}
