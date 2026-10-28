namespace JCAP.Models;

/// <summary>Dataset provenance shared by content and example references.</summary>
public class LearningContentSource
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Version { get; set; } = "unversioned";
    public string SourceUrl { get; set; } = string.Empty;
    public string License { get; set; } = string.Empty;
    public string LicenseUrl { get; set; } = string.Empty;
    public string Attribution { get; set; } = string.Empty;

    public ICollection<VocabularySource> VocabularySources { get; set; } = new List<VocabularySource>();
    public ICollection<GrammarSource> GrammarSources { get; set; } = new List<GrammarSource>();
}
