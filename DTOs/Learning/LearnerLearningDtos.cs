using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Learning;

public class LearnerTopicQuery
{
    [StringLength(200)] public string? Keyword { get; set; }
    [RegularExpression("N[1-5]")] public string? JLPTLevel { get; set; }
    [Range(1, 1000000)] public int Page { get; set; } = 1;
    [Range(1, 100)] public int PageSize { get; set; } = 12;
}
public class LearnerContentQuery
{
    [StringLength(200)] public string? Keyword { get; set; }
    [Range(1, 1000000)] public int Page { get; set; } = 1;
    [Range(1, 100)] public int PageSize { get; set; } = 20;
}
public record LearnerTopic(int Id, string Name, string JLPTLevel, string? Description, int VocabularyCount, int GrammarCount);
public record LearnerContentRow(int Id, string Text, string? Reading, string Meaning, string JLPTLevel,
    string? PartOfSpeech, string? Formation, int ExampleCount);
public record LearnerContentPage(LearnerTopic Topic, LearningPage<LearnerContentRow> Contents);
public record LearnerExample(int Id, string JapaneseText, string? VietnameseTranslation, string? Furigana,
    string? ExternalId, LearnerSource? Source);
public record LearnerSource(string Name, string Version, string SourceUrl, string License, string LicenseUrl, string Attribution, string? ExternalId);
public record LearnerContentDetail(LearnerTopic Topic, LearnerContentRow Item, string? Explanation, string? UsageNotes,
    List<LearnerExample> Examples, List<LearnerSource> Sources, List<LearnerTopic> Topics,
    int? PreviousId, int? NextId, int PreviousPage, int NextPage);
