namespace JCAP.Models;

public class TopicGrammar
{
    public int TopicId { get; set; }
    public int GrammarId { get; set; }
    public int OrderIndex { get; set; }

    public LearningTopic Topic { get; set; } = null!;
    public Grammar Grammar { get; set; } = null!;
}
