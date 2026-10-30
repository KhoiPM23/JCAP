using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Learning;

public class LearningQuery
{
    [StringLength(200)] public string? Keyword { get; set; }
    [RegularExpression("N[1-5]")] public string? JLPTLevel { get; set; }
    public int? TopicId { get; set; }
    public bool Untopiced { get; set; }
    public bool? IsActive { get; set; }
    [StringLength(100)] public string? PartOfSpeech { get; set; }
    [Range(1, 1000000)] public int Page { get; set; } = 1;
    [Range(1, 100)] public int PageSize { get; set; } = 20;
}

public record LearningPage<T>(List<T> Items, int Total, int Page, int PageSize);
public record TopicOption(int Id, string Code, string Name, string JLPTLevel, bool IsActive);
public record TopicRow(int Id, string Code, string Name, string JLPTLevel, string? Description,
    bool IsActive, int VocabularyCount, int GrammarCount);
public record ContentRow(int Id, string Text, string? Reading, string Meaning, string JLPTLevel,
    string? PartOfSpeech, bool IsActive, int ExampleCount, List<TopicOption> Topics);
public record SourceInfo(string Name, string Version, string SourceUrl, string License,
    string LicenseUrl, string Attribution, string ExternalId);
public record ExampleInfo(int Id, string JapaneseText, string? VietnameseTranslation,
    string? Furigana, int OrderIndex, string? SourceName, string? ExternalId);
public record ContentDetail(ContentRow Item, string? Formation, string? Explanation,
    string? UsageNotes, List<ExampleInfo> Examples, List<SourceInfo> Sources,
    int ShadowingUses, int ExploreUses);
public record TopicDetail(TopicRow Topic, List<ContentRow> Vocabularies, List<ContentRow> Grammars);

public class SaveTopicRequest
{
    [Required, StringLength(50), RegularExpression("[A-Za-z0-9_-]+")]
    public string Code { get; set; } = "";
    [Required, StringLength(200)] public string Name { get; set; } = "";
    [Required, RegularExpression("N[1-5]")] public string JLPTLevel { get; set; } = "N5";
    [StringLength(1000)] public string? Description { get; set; }
}
public class SaveExampleRequest
{
    public int? Id { get; set; }
    [Required, StringLength(2000)] public string JapaneseText { get; set; } = "";
    [StringLength(2000)] public string? VietnameseTranslation { get; set; }
    [StringLength(4000)] public string? Furigana { get; set; }
}
public class SaveContentRequest
{
    [Required, StringLength(100)] public string Text { get; set; } = "";
    [StringLength(200)] public string? Reading { get; set; }
    [Required, StringLength(1000)] public string Meaning { get; set; } = "";
    [Required, RegularExpression("N[1-5]")] public string JLPTLevel { get; set; } = "N5";
    [StringLength(100)] public string? PartOfSpeech { get; set; }
    [StringLength(1000)] public string? Formation { get; set; }
    [StringLength(20000)] public string? Explanation { get; set; }
    [StringLength(20000)] public string? UsageNotes { get; set; }
    [MaxLength(100)] public List<int> TopicIds { get; set; } = [];
    [MaxLength(50)] public List<SaveExampleRequest> Examples { get; set; } = [];
    public bool AllowSimilar { get; set; }
}
public class LearningStatusRequest { public bool IsActive { get; set; } }
public class BulkLearningStatusRequest
{
    [Required, RegularExpression("vocabularies|grammars")] public string Kind { get; set; } = "vocabularies";
    [MinLength(1), MaxLength(100)] public List<int> ItemIds { get; set; } = [];
    public bool IsActive { get; set; }
}
public class TopicContentsRequest
{
    [MaxLength(1000)] public List<int> VocabularyIds { get; set; } = [];
    [MaxLength(1000)] public List<int> GrammarIds { get; set; } = [];
}
public class AssignTopicsRequest
{
    [Required, RegularExpression("vocabularies|grammars")] public string Kind { get; set; } = "vocabularies";
    [MinLength(1), MaxLength(100)] public List<int> ItemIds { get; set; } = [];
    [MinLength(1), MaxLength(100)] public List<int> TopicIds { get; set; } = [];
}
