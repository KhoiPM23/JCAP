using System.Collections.Generic;

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

    /// <summary>
    /// Danh sách từ khóa trọng tâm (Tier 1 Scaffolding)
    /// </summary>
    public List<string> Keywords { get; set; } = new();

    /// <summary>
    /// Mẫu câu điền khuyết với chỗ trống [ ______ ] (Tier 2 Scaffolding)
    /// </summary>
    public string? ClozeSentence { get; set; }
}
