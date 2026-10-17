using System;
using System.Collections.Generic;

namespace JCAP.Models
{
    /// <summary>
    /// ShadowingPracticeSession: bản ghi lịch sử BẤT BIẾN của một buổi luyện Shadowing đã hoàn thành.
    /// Điểm tổng được backend tính từ các ShadowingSentenceEvaluation đã lưu, không lấy từ client.
    /// Không xóa cứng: ẩn bằng IsActive = false.
    /// </summary>
    public class ShadowingPracticeSession
    {
        public Guid Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public int ShadowingDialogueId { get; set; }

        /// <summary>A | B</summary>
        public string LearnerRole { get; set; } = "A";

        public DateTime StartedAt { get; set; }
        public DateTime CompletedAt { get; set; } = DateTime.UtcNow;
        public int DurationSeconds { get; set; }

        public int ContentMatchScore { get; set; }

        /// <summary>null = chưa đo (không phải 0).</summary>
        public int? FluencyScore { get; set; }

        public int WeightedOverallScore { get; set; }
        public string ScoringVersion { get; set; } = string.Empty;
        public string AudioQualityStatus { get; set; } = "unmeasured";
        public string RankTitle { get; set; } = string.Empty;

        /// <summary>Số câu của vai người học trong bài (mẫu số khi tính điểm tổng).</summary>
        public int LearnerSentenceCount { get; set; }

        /// <summary>Số câu thực sự được chấm trong buổi này.</summary>
        public int ScoredSentenceCount { get; set; }

        public bool IsActive { get; set; } = true;

        public ApplicationUser? User { get; set; }
        public ShadowingDialogue? ShadowingDialogue { get; set; }
        public ICollection<ShadowingSentenceEvaluation> SentenceEvaluations { get; set; } = new List<ShadowingSentenceEvaluation>();
    }
}
