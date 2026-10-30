namespace JCAP.Models;

public class TopicVocabulary
{
    public int TopicId { get; set; }
    public int VocabularyId { get; set; }
    public int OrderIndex { get; set; }

    public LearningTopic Topic { get; set; } = null!;
    public Vocabulary Vocabulary { get; set; } = null!;
}
