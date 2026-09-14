namespace JCAP.Models
{
    public class CreditTransaction
    {
        public int Id { get; set; }
        public string UserId { get; set; }
        public int Amount { get; set; }          // + TopUp, - Deduct
        public string Type { get; set; }         // "TopUp" | "Deduct" | "Voucher"
        public string? Description { get; set; }
        public string? PayOsOrderCode { get; set; }  // để trống ở Phase 1, dùng ở Phase 2
        public string Status { get; set; }           // "Pending" | "Paid" | "Cancelled"
        public DateTime CreatedAt { get; set; }
        public ApplicationUser User { get; set; }

    }

}
