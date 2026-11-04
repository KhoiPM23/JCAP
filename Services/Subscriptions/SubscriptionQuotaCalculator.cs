using JCAP.Data;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Subscriptions
{
    /// <summary>
    /// Kết quả tính hạn ngạch cho một người dùng tại một thời điểm.
    /// </summary>
    public class QuotaSnapshot
    {
        public SubscriptionPlan Plan { get; init; } = null!;

        public int FiveHourUsed { get; init; }
        public int FiveHourTotal { get; init; }
        public int FiveHourRemaining => Math.Max(0, FiveHourTotal - FiveHourUsed);

        public int WeeklyUsed { get; init; }
        public int WeeklyTotal { get; init; }
        public int WeeklyRemaining => Math.Max(0, WeeklyTotal - WeeklyUsed);

        /// <summary>Thời điểm (UTC) lượt khấu trừ cũ nhất rơi khỏi cửa sổ 5 giờ, kèm lượng credit được giải phóng.</summary>
        public DateTime? FiveHourNextRelease { get; init; }
        public int FiveHourNextReleaseAmount { get; init; }

        public DateTime? WeeklyNextRelease { get; init; }
        public int WeeklyNextReleaseAmount { get; init; }

        public bool HasRoomFor(int credits) =>
            FiveHourRemaining >= credits && WeeklyRemaining >= credits;
    }

    /// <summary>
    /// Tính hạn ngạch quota của gói tháng từ bảng CreditTransactions.
    ///
    /// Thiết kế dạng static nhận AppDbContext làm tham số (thay vì service được inject) để
    /// RoleplaySessionService dùng được mà không phải đổi constructor — đổi constructor sẽ phá
    /// toàn bộ test hiện có của service đó.
    ///
    /// Quy ước đếm: CHỈ tính các dòng Type = "Deduct" có CoveredBySubscription = true.
    /// Trước đây truy vấn đếm mọi dòng Deduct, nên user không có gói tháng (đã bị trừ
    /// CreditBalance thật) vẫn thấy quota cạn dần — bị tính hai lần.
    /// </summary>
    public static class SubscriptionQuotaCalculator
    {
        public const int FiveHourWindowHours = 5;
        public const int WeeklyWindowDays = 7;

        /// <summary>
        /// Người dùng có gói tháng còn hiệu lực tại thời điểm <paramref name="now"/> hay không.
        /// </summary>
        public static bool HasActiveSubscription(ApplicationUser user, DateTime now)
        {
            return user.SubscriptionExpiresAt.HasValue
                && user.SubscriptionExpiresAt.Value > now;
        }

        public static async Task<QuotaSnapshot> CalculateAsync(
            AppDbContext dbContext,
            string userId,
            string? planId,
            DateTime now,
            CancellationToken cancellationToken = default)
        {
            var plan = SubscriptionPlanCatalog.FindOrDefault(planId);

            var fiveHoursAgo = now.AddHours(-FiveHourWindowHours);
            var weekAgo = now.AddDays(-WeeklyWindowDays);

            // Chỉ lấy các lượt do gói tháng chi trả, trong cửa sổ rộng nhất (7 ngày),
            // rồi chia cửa sổ trong bộ nhớ để tránh gọi DB nhiều lần.
            var covered = await dbContext.CreditTransactions
                .AsNoTracking()
                .Where(t => t.UserId == userId
                            && t.Type == "Deduct"
                            && t.CoveredBySubscription
                            && t.CreatedAt >= weekAgo)
                .Select(t => new { t.Amount, t.CreatedAt })
                .ToListAsync(cancellationToken);

            // Amount của Deduct là số âm (-1, -5) nên lấy giá trị tuyệt đối làm lượng đã dùng.
            var weeklyUsed = covered.Sum(t => Math.Abs(t.Amount));
            var inFiveHour = covered.Where(t => t.CreatedAt >= fiveHoursAgo).ToList();
            var fiveHourUsed = inFiveHour.Sum(t => Math.Abs(t.Amount));

            var oldestInFiveHour = inFiveHour
                .OrderBy(t => t.CreatedAt)
                .FirstOrDefault();

            var oldestInWeek = covered
                .OrderBy(t => t.CreatedAt)
                .FirstOrDefault();

            return new QuotaSnapshot
            {
                Plan = plan,
                FiveHourUsed = fiveHourUsed,
                FiveHourTotal = plan.FiveHourQuota,
                WeeklyUsed = weeklyUsed,
                WeeklyTotal = plan.WeeklyQuota,

                FiveHourNextRelease = oldestInFiveHour?.CreatedAt.AddHours(FiveHourWindowHours),
                FiveHourNextReleaseAmount = oldestInFiveHour == null ? 0 : Math.Abs(oldestInFiveHour.Amount),

                WeeklyNextRelease = oldestInWeek?.CreatedAt.AddDays(WeeklyWindowDays),
                WeeklyNextReleaseAmount = oldestInWeek == null ? 0 : Math.Abs(oldestInWeek.Amount)
            };
        }

        /// <summary>
        /// Mô tả thời điểm credit kế tiếp được giải phóng.
        ///
        /// Cửa sổ trượt không có một mốc "reset về đầy" duy nhất: khi lượt cũ nhất rơi khỏi cửa sổ
        /// thì chỉ lượng credit của riêng lượt đó được giải phóng. Text cũ ghi "còn 2 giờ 30 phút"
        /// khiến người dùng hiểu là lúc đó quota về đầy, nên ở đây nói rõ số credit được hoàn lại.
        /// </summary>
        public static string DescribeNextRelease(DateTime? nextRelease, int releaseAmount, DateTime now, string fullText)
        {
            if (nextRelease == null || releaseAmount <= 0)
            {
                return fullText;
            }

            var diff = nextRelease.Value - now;
            if (diff.TotalMinutes <= 0)
            {
                return "Đang hồi phục";
            }

            string when;
            if (diff.TotalDays >= 1)
            {
                when = $"{(int)diff.TotalDays} ngày {diff.Hours} giờ";
            }
            else if (diff.TotalHours >= 1)
            {
                when = $"{(int)diff.TotalHours} giờ {diff.Minutes} phút";
            }
            else
            {
                when = $"{diff.Minutes} phút";
            }

            return $"+{releaseAmount} credits sau {when}";
        }
    }
}
