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
    }
}
