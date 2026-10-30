namespace JCAP.Models
{
    public class CreditTransaction
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public int Amount { get; set; }          // + TopUp, - Deduct
        public string Type { get; set; } = string.Empty;         // "TopUp" | "Deduct" | "Voucher"
        public string? Description { get; set; }
        public string? PayOsOrderCode { get; set; }  // để trống ở Phase 1, dùng ở Phase 2
        public string Status { get; set; } = string.Empty;           // "Pending" | "Paid" | "Cancelled"
        public DateTime CreatedAt { get; set; }
        public ApplicationUser? User { get; set; }

        /// <summary>
        /// Số tiền thật (VND) của giao dịch nạp/đăng ký gói. 0 với giao dịch Deduct.
        /// Lưu tại thời điểm giao dịch để báo cáo doanh thu không bị sai khi admin đổi giá gói về sau.
        /// </summary>
        public decimal AmountVnd { get; set; }

        /// <summary>
        /// True nếu lượt khấu trừ này được gói tháng chi trả (không trừ CreditBalance).
        /// Chỉ các dòng Deduct có cờ này mới được tính vào hạn mức quota 5 giờ / tuần.
        /// False với lượt trừ trực tiếp từ số dư credit nạp thêm.
        /// </summary>
        public bool CoveredBySubscription { get; set; }

        /// <summary>
        /// Mã gói tháng liên quan. Với Type = "Subscription" là gói được mua;
        /// với Type = "Deduct" và CoveredBySubscription = true là gói đã chi trả lượt đó.
        /// </summary>
        public string? SubscriptionPlanId { get; set; }
    }

}
