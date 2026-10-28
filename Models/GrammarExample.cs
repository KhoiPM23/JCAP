namespace JCAP.Models;

public class GrammarExample
{
    public int Id { get; set; }
    public int GrammarId { get; set; }
    public string JapaneseText { get; set; } = string.Empty;
    public string? VietnameseTranslation { get; set; }
    public string? Furigana { get; set; }
    public int OrderIndex { get; set; }
    public int? SourceId { get; set; }
    public string? ExternalId { get; set; }

    public Grammar Grammar { get; set; } = null!;
    public LearningContentSource? Source { get; set; }
}
