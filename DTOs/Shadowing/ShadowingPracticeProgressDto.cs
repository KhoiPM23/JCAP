using System;
using System.Collections.Generic;

namespace JCAP.DTOs.Shadowing
{
    /// <summary>Bắt đầu hoặc tiếp tục phiên luyện (ShadowingPracticeProgress) cho một bài + vai.</summary>
    public class StartShadowingProgressDto
    {
        public int DialogueId { get; set; }

        /// <summary>A | B</summary>
        public string LearnerRole { get; set; } = "A";

        /// <summary>true: bỏ phiên đang luyện (chuyển abandoned) và bắt đầu phiên mới từ câu đầu.</summary>
        public bool Restart { get; set; }

        /// <summary>
        /// Khi Restart: Id phiên mà client đang thấy. Nếu phiên đang luyện hiện tại khác (vd. tab khác vừa làm lại)
        /// thì trả phiên hiện tại, không tạo thêm phiên.
        /// </summary>
        public Guid? ExpectedProgressId { get; set; }

        /// <summary>
        /// Vị trí gợi ý từ dữ liệu cũ trong trình duyệt. CHỈ được dùng khi server chưa từng có phiên nào cho bài + vai này
        /// (dữ liệu cũ không bao giờ ghi đè tiến độ đã có trên server).
        /// </summary>
        public int? SuggestedSentenceIndex { get; set; }
    }

    public class UpdateShadowingProgressDto
    {
        public int CurrentSentenceIndex { get; set; }
    }

    /// <summary>
    /// Trạng thái một câu của vai người học, suy ra từ các lần chấm đã lưu trong phiên.
    /// RECORDING / RECORDED / EVALUATING chỉ tồn tại ở client và không bao giờ được lưu, nên không câu nào kẹt ở các trạng thái đó.
    /// </summary>
    public class ShadowingProgressSentenceDto
    {
        public int SentenceId { get; set; }

        /// <summary>Chỉ số trong danh sách câu của bài (theo OrderIndex).</summary>
        public int SentenceIndex { get; set; }

        /// <summary>NOT_STARTED | EVALUATED | EVALUATION_FAILED</summary>
        public string State { get; set; } = "NOT_STARTED";

        /// <summary>Số lần đã gửi chấm (kể cả lần chưa chấm được).</summary>
        public int SubmissionCount { get; set; }

        /// <summary>Điểm cao nhất trong phiên; null nếu chưa có lần nào chấm được.</summary>
        public int? BestScore { get; set; }

        /// <summary>Mã lỗi của lần gửi gần nhất nếu lần đó chưa chấm được.</summary>
        public string? LastErrorCode { get; set; }

        public DateTime? LastSubmittedAt { get; set; }
    }

    public class ShadowingPracticeProgressDto
    {
        public Guid Id { get; set; }
        public int DialogueId { get; set; }
        public string DialogueTitle { get; set; } = string.Empty;
        public string JlptLevel { get; set; } = string.Empty;
        public string LearnerRole { get; set; } = "A";

        /// <summary>in_progress | completed | abandoned</summary>
        public string Status { get; set; } = "in_progress";

        public int CurrentSentenceIndex { get; set; }
        public string CurrentSentenceText { get; set; } = string.Empty;

        /// <summary>Tổng số câu của bài (cả hai vai).</summary>
        public int TotalSentenceCount { get; set; }

        /// <summary>Số câu của vai người học.</summary>
        public int LearnerSentenceCount { get; set; }

        /// <summary>Số câu của vai người học đã có ít nhất một lần chấm được.</summary>
        public int EvaluatedSentenceCount { get; set; }

        public DateTime StartedAt { get; set; }
        public DateTime LastActivityAt { get; set; }
        public DateTime? CompletedAt { get; set; }

        /// <summary>Buổi luyện bất biến đã tạo khi hoàn thành (nếu có).</summary>
        public Guid? SessionId { get; set; }

        /// <summary>true nếu phiên vừa được tạo trong lần gọi này (false: tiếp tục phiên đã có).</summary>
        public bool Created { get; set; }

        public List<ShadowingProgressSentenceDto> Sentences { get; set; } = new();
    }
}
