namespace JCAP.DTOs.Credit
{
    public class PurchaseCreditRequestDto
    {
        public int PackageId { get; set; }
    }

    public class PurchaseCreditResponseDto
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public string? CheckoutUrl { get; set; }
        public long? OrderCode { get; set; }
        public bool IsMock { get; set; }
        public int? AddedCredits { get; set; }
        public int? NewCreditBalance { get; set; }
    }
}
