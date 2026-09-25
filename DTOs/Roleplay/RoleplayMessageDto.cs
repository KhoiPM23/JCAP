namespace JCAP.DTOs.Roleplay;

public class RoleplayMessageDto
{
    public int Id { get; set; }
    public string Sender { get; set; } = string.Empty; // "Ai" | "User"
    public string JapaneseText { get; set; } = string.Empty;
    public string? VietnameseMeaning { get; set; }
    public string? FuriganaHtml { get; set; }
    public LinguisticFeedbackDto? LinguisticFeedback { get; set; }
    public DateTime CreatedAt { get; set; }
}
