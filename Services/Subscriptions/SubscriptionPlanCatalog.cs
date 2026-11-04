namespace JCAP.Services.Subscriptions
{
    /// <summary>
    /// Định nghĩa một gói tháng: giá và hạn mức quota.
    /// </summary>
    public class SubscriptionPlan
    {
        public string Id { get; init; } = string.Empty;
        public string Name { get; init; } = string.Empty;
        public string Tier { get; init; } = string.Empty;

        /// <summary>Hạn mức credit trong cửa sổ trượt 7 ngày.</summary>
        public int WeeklyQuota { get; init; }

        /// <summary>Hạn mức credit trong cửa sổ trượt 5 giờ.</summary>
        public int FiveHourQuota { get; init; }

        /// <summary>Giá niêm yết (VND) cho một chu kỳ.</summary>
        public decimal Price { get; init; }

        /// <summary>Số ngày hiệu lực của một chu kỳ.</summary>
        public int DurationDays { get; init; } = 30;
    }

    /// <summary>
    /// Nguồn sự thật phía server cho giá và hạn mức gói tháng.
    ///
    /// Lý do tồn tại: trước đây <c>PurchaseSubscriptionRequestDto</c> nhận Price, CreditsAmount,
    /// FiveHourQuota trực tiếp từ client gửi lên và dùng luôn để tạo payment link — client có thể
    /// tự khai giá 1.000đ cho gói 349.000đ. Toàn bộ các giá trị đó giờ được tra từ đây theo PlanId.
    ///
    /// Giữ dạng static vì danh sách gói hiện cố định (khớp DEFAULT_PLANS ở frontend
    /// subscriptionPlanService.ts). Khi cần cho admin sửa gói trong runtime thì chuyển thành
    /// bảng DB + controller CRUD, giữ nguyên interface tra cứu bên dưới.
    /// </summary>
    public static class SubscriptionPlanCatalog
    {
        public const string DefaultPlanId = "plan-pro";

        private static readonly Dictionary<string, SubscriptionPlan> Plans =
            new(StringComparer.OrdinalIgnoreCase)
            {
                ["plan-pro"] = new SubscriptionPlan
                {
                    Id = "plan-pro",
                    Name = "Gói Tháng Pro (Cơ Bản)",
                    Tier = "Pro",
                    WeeklyQuota = 1000,
                    FiveHourQuota = 50,
                    Price = 199000m,
                    DurationDays = 30
                },
                ["plan-promax"] = new SubscriptionPlan
                {
                    Id = "plan-promax",
                    Name = "Gói Tháng Pro Max (Chuyên Sâu)",
                    Tier = "ProMax",
                    WeeklyQuota = 2500,
                    FiveHourQuota = 150,
                    Price = 349000m,
                    DurationDays = 30
                }
            };

        public static IReadOnlyCollection<SubscriptionPlan> All => Plans.Values.ToList();

        /// <summary>
        /// Tra gói theo mã. Trả null nếu mã không tồn tại (client gửi mã lạ).
        /// </summary>
        public static SubscriptionPlan? Find(string? planId)
        {
            if (string.IsNullOrWhiteSpace(planId))
            {
                return null;
            }

            return Plans.TryGetValue(planId, out var plan) ? plan : null;
        }

        /// <summary>
        /// Tra gói theo mã, rơi về gói mặc định nếu không tìm thấy.
        /// Dùng khi tính quota cho user có SubscriptionPlanId cũ/không hợp lệ — thà cho hạn mức
        /// gói thấp nhất còn hơn để user mất quyền truy cập.
        /// </summary>
        public static SubscriptionPlan FindOrDefault(string? planId)
        {
            return Find(planId) ?? Plans[DefaultPlanId];
        }
    }
}
