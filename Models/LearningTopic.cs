namespace JCAP.Models;

/// <summary>A flat topic containing only vocabulary and grammar at its JLPT level.</summary>
public class LearningTopic
{
    public int Id { get; set; }
    // Stable key for Excel mappings; changing the display name does not break imports.
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string JLPTLevel { get; set; } = "N5";
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ICollection<TopicVocabulary> TopicVocabularies { get; set; } = new List<TopicVocabulary>();
    public ICollection<TopicGrammar> TopicGrammars { get; set; } = new List<TopicGrammar>();
}
