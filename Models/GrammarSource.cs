namespace JCAP.Models;

public class GrammarSource
{
    public int GrammarId { get; set; }
    public int SourceId { get; set; }
    public string ExternalId { get; set; } = string.Empty;

    public Grammar Grammar { get; set; } = null!;
    public LearningContentSource Source { get; set; } = null!;
}
