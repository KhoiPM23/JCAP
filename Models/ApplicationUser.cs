using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;

namespace JCAP.Models
{
    public class ApplicationUser : IdentityUser
    {
        public string? FullName { get; set; }
        public string Role { get; set; } = "Learner";
        public bool IsActive { get; set; } = true;
        public string? ProfilePictureUrl { get; set; }
        public int CreditBalance { get; set; } = 0;
        public string JLPTLevel { get; set; } = "N5"; // Domain restricted to N5, N4, N3
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        /// <summary>
        /// Thời điểm hết hạn gói tháng của người dùng (UTC).
        /// Null = chưa mua gói, có giá trị quá khứ = gói đã hết hạn.
        /// Được set bởi webhook/verify khi thanh toán Subscription thành công.
        /// </summary>
        public DateTime? SubscriptionExpiresAt { get; set; }

        /// <summary>
        /// Mã gói tháng đang sử dụng (ví dụ "plan-pro", "plan-promax").
        /// Dùng để tra hạn mức quota trong <see cref="JCAP.Services.Subscriptions.SubscriptionPlanCatalog"/>.
        /// Null = chưa từng mua gói tháng.
        /// </summary>
        public string? SubscriptionPlanId { get; set; }

        /// <summary>
        /// Thời điểm kích hoạt gói tháng hiện tại (UTC). Dùng để hiển thị và đối soát.
        /// </summary>
        public DateTime? SubscriptionStartedAt { get; set; }

        /// <summary>
        /// Trạng thái bài kiểm tra xếp lớp đầu vào:
        /// "NotStarted" | "Skipped" | "InProgress" | "InsufficientEvidence" | "Completed"
        /// </summary>
        [MaxLength(30)]
        public string PlacementTestStatus { get; set; } = "NotStarted";

        /// <summary>
        /// Đánh dấu người học đã từng nhìn thấy lời mời Placement Test lần đầu đăng nhập (BR-PT-02).
        /// </summary>
        public bool HasSeenPlacementPrompt { get; set; } = false;

        /// <summary>
        /// Trình độ giao tiếp ước lượng ban đầu (bất biến sau khi Completed - BR-PT-20): "N5" | "N4" | "N3" | "N5-N4" | "N4-N3"
        /// </summary>
        [MaxLength(20)]
        public string? InitialEstimatedLevel { get; set; }

        /// <summary>
        /// Độ tin cậy của kết quả đánh giá đầu vào: "High" | "Medium" | "Low"
        /// </summary>
        [MaxLength(20)]
        public string? InitialConfidenceTier { get; set; }

        /// <summary>
        /// JSON lưu bất biến toàn bộ kết quả Placement Test (4 chiều Rubric, SpeechDeliveryNullable, EventEvidenceLog, OverallScore).
        /// </summary>
        public string? InitialProficiencySnapshotJson { get; set; }

        /// <summary>
        /// Thời điểm hoàn thành bài Placement Test (nếu đã Completed).
        /// </summary>
        public DateTime? PlacementTestCompletedAtUtc { get; set; }
    }
}
