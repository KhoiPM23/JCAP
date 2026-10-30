namespace JCAP.DTOs.Credit
{
    public class PurchaseSubscriptionRequestDto
    {
        public string PlanId { get; set; } = string.Empty;
        public string PlanName { get; set; } = string.Empty;
        public int CreditsAmount { get; set; }
        public int FiveHourQuota { get; set; }
        public decimal Price { get; set; }
    }
}

