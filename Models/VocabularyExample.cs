namespace JCAP.Models;

public class VocabularyExample
{
    public int Id { get; set; }
    public int VocabularyId { get; set; }
    public string JapaneseText { get; set; } = string.Empty;
    // Nullable while translations are being prepared; never substitute a word gloss.
    public string? VietnameseTranslation { get; set; }
    public string? Furigana { get; set; }
    public int OrderIndex { get; set; }
    public int? SourceId { get; set; }
    public string? ExternalId { get; set; }

    public Vocabulary Vocabulary { get; set; } = null!;
    public LearningContentSource? Source { get; set; }
}
