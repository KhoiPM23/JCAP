namespace JCAP.DTOs.Scenario;

public class ScenarioDetailsDto
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? Thumbnail { get; set; }
    public bool IsActive { get; set; }
    public string? ScenarioCode { get; set; }
    public List<ScenarioLevelConfigurationDto> LevelConfigurations { get; set; } = [];
}

public class ScenarioLevelConfigurationDto
{
    public int Id { get; set; }
    public int ScenarioId { get; set; }
    public string JLPTLevel { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string AiPersona { get; set; } = string.Empty;
    public int CreditCost { get; set; }
    public string Status { get; set; } = string.Empty;
    public List<MissionDto> Missions { get; set; } = [];
    public List<TargetVocabularyDto> TargetVocabularies { get; set; } = [];
    public List<TargetGrammarDto> TargetGrammars { get; set; } = [];
}

public class MissionDto
{
    public int Id { get; set; }
    public string Content { get; set; } = string.Empty;
    public int Order { get; set; }
    public MissionCompletionCriteriaDto CompletionCriteria { get; set; } = new();
}

public class MissionCompletionCriteriaDto
{
    public string Intent { get; set; } = string.Empty;
    public string Target { get; set; } = string.Empty;
    public List<string> Conditions { get; set; } = [];
}

public class TargetVocabularyDto
{
    public int Id { get; set; }
    public string Word { get; set; } = string.Empty;
    public string? Reading { get; set; }
    public string Meaning { get; set; } = string.Empty;
}

public class TargetGrammarDto
{
    public int Id { get; set; }
    public string Pattern { get; set; } = string.Empty;
    public string Meaning { get; set; } = string.Empty;
    public string? ExampleSentence { get; set; }
}
