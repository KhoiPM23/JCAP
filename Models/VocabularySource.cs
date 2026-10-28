namespace JCAP.Models;

/// <summary>One vocabulary can be enriched from several datasets and source records.</summary>
public class VocabularySource
{
    public int VocabularyId { get; set; }
    public int SourceId { get; set; }
    public string ExternalId { get; set; } = string.Empty;

    public Vocabulary Vocabulary { get; set; } = null!;
    public LearningContentSource Source { get; set; } = null!;
}
