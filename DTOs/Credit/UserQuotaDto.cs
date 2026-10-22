namespace JCAP.DTOs.Credit
{
    public class UserQuotaDto
    {
        // Chu kỳ tuần (Weekly Quota)
        public int WeeklyTotalCredits { get; set; } = 1000;
        public int WeeklyUsedCredits { get; set; }
        public int WeeklyRemainingCredits { get; set; }
        public int WeeklyRemainingPercent { get; set; }
        public string WeeklyResetsInText { get; set; } = string.Empty;

        // Chu kỳ 5 giờ (Rolling 5-Hour)
        public int FiveHourTotalCredits { get; set; } = 50;
        public int FiveHourUsedCredits { get; set; }
        public int FiveHourRemainingCredits { get; set; }
        public int FiveHourRemainingPercent { get; set; }
        public string FiveHourResetsInText { get; set; } = string.Empty;

        // Số dư Credit nạp thêm (Extra Credit Balance)
        public int ExtraCreditBalance { get; set; }

        // Thông tin gói
        public string PlanName { get; set; } = "Gói Tháng Pro (Cơ Bản)";
        public string PlanTier { get; set; } = "Pro";
    }
}
