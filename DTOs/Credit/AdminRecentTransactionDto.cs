using System;

namespace JCAP.DTOs.Credit
{
    public class AdminRecentTransactionDto
    {
        public string Id { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string User { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string PackageName { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty; // "subscription" | "credit"
        public decimal Amount { get; set; }
        public int Credits { get; set; }
        public string Status { get; set; } = string.Empty; // "Paid" | "Pending" | "Cancelled"
        public string Method { get; set; } = "VietQR PayOS";
        public DateTime CreatedAt { get; set; }
    }
}
