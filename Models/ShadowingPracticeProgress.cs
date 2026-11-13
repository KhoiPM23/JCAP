using System;
using System.Collections.Generic;

namespace JCAP.Models
{
    /// <summary>
    /// ShadowingPracticeProgress: tiến độ một lần luyện ĐANG DIỄN RA của một người học cho một bài và một vai (lưu ở server,
    /// tiếp tục được trên thiết bị khác). Khi hoàn thành sinh ra một ShadowingPracticeSession bất biến.
    /// Mỗi người học chỉ có tối đa MỘT tiến độ in_progress cho mỗi bài + vai (index duy nhất có lọc).
    /// Không xóa cứng: làm lại hoặc bỏ dở thì chuyển sang abandoned.
    /// </summary>
    public class ShadowingPracticeProgress
    {
        public const string StatusInProgress = "in_progress";
        public const string StatusCompleted = "completed";
        public const string StatusAbandoned = "abandoned";

        public Guid Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public int ShadowingDialogueId { get; set; }

        /// <summary>A | B</summary>
        public string LearnerRole { get; set; } = "A";

        /// <summary>in_progress | completed | abandoned</summary>
        public string Status { get; set; } = StatusInProgress;

        /// <summary>Vị trí câu đang luyện (chỉ số trong danh sách câu của bài, theo OrderIndex).</summary>
        public int CurrentSentenceIndex { get; set; }

        public DateTime StartedAt { get; set; } = DateTime.UtcNow;
        public DateTime LastActivityAt { get; set; } = DateTime.UtcNow;
        public DateTime? CompletedAt { get; set; }

        /// <summary>Buổi luyện bất biến được tạo khi hoàn thành; null khi chưa hoàn thành.</summary>
        public Guid? ShadowingPracticeSessionId { get; set; }

        public ApplicationUser? User { get; set; }
        public ShadowingDialogue? ShadowingDialogue { get; set; }
        public ShadowingPracticeSession? ShadowingPracticeSession { get; set; }
        public ICollection<ShadowingSentenceEvaluation> SentenceEvaluations { get; set; } = new List<ShadowingSentenceEvaluation>();
    }
}
