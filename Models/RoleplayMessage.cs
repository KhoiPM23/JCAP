namespace JCAP.Models
{
    public class RoleplayMessage
    {
        public int Id { get; set; }
        public int RoleplaySessionId { get; set; }
        public string Sender { get; set; } = string.Empty; // "Ai" | "User"
        public string JapaneseText { get; set; } = string.Empty;
        public string? VietnameseMeaning { get; set; }
        public string? FuriganaHtml { get; set; }
        public string? LinguisticFeedbackJson { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation property
        public RoleplaySession? RoleplaySession { get; set; }
    }
}
