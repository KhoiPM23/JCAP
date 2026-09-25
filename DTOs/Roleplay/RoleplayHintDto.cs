namespace JCAP.DTOs.Roleplay;

public class RoleplayHintDto
{
    public string JapaneseSuggestion { get; set; } = string.Empty;
    public string SuggestedJapaneseText { get => JapaneseSuggestion; set => JapaneseSuggestion = value; }

    public string RomajiOrReading { get; set; } = string.Empty;

    public string VietnameseMeaning { get; set; } = string.Empty;
    public string SuggestedVietnameseMeaning { get => VietnameseMeaning; set => VietnameseMeaning = value; }

    public string? ContextExplanation { get; set; }
    public string Explanation { get => ContextExplanation ?? string.Empty; set => ContextExplanation = value; }
}
