using System;
using System.Collections.Generic;

namespace JCAP.Models
{
    public class FeedbackTicket
    {
        public int Id { get; set; }

        /// <summary>
        /// ID của Học viên tạo bài góp ý.
        /// Chỉ dùng để lọc lịch sử riêng tư của chính Học viên đó (WHERE UserId == currentUserId).
        /// Tuyệt đối KHÔNG trả trường này về bất kỳ DTO/API nào của Admin để đảm bảo ẩn danh 100%.
        /// </summary>
        public string UserId { get; set; } = string.Empty;
        public ApplicationUser? User { get; set; }

        /// <summary>
        /// Mã định danh ẩn danh hiển thị trên giao diện (VD: #ANON-8492)
        /// </summary>
        public string AnonymousCode { get; set; } = string.Empty;

        public string Title { get; set; } = string.Empty;

        /// <summary>
        /// SCENARIO_BUG | AI_ASSESSMENT | PAYMENT_CREDIT | SYSTEM_BUG | SUGGESTION
        /// </summary>
        public string Category { get; set; } = "SUGGESTION";

        /// <summary>
        /// PENDING | IN_PROGRESS | CLOSED
        /// </summary>
        public string Status { get; set; } = "PENDING";

        /// <summary>
        /// Thời điểm Admin mở xem bài lần đầu (giúp Học viên biết Admin đã để ý bài chưa)
        /// </summary>
        public DateTime? AdminSeenAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? ClosedAt { get; set; }

        public ICollection<FeedbackMessage> Messages { get; set; } = new List<FeedbackMessage>();
    }
}

