namespace JCAP.DTOs.Credit
{
    public class CreditTransactionDto
    {
        public int Id { get; set; }
        public int Amount { get; set; }
        public string Type { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? PayOsOrderCode { get; set; }
        public string Status { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
    }

    public class CreditHistoryResponseDto
    {
        public List<CreditTransactionDto> Transactions { get; set; } = new();
        public int TotalCount { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalPages { get; set; }
        public int CurrentCreditBalance { get; set; }
    }
}
