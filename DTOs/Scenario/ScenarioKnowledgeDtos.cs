using System.Collections.Generic;

namespace JCAP.DTOs.Scenario;

public class KnowledgeSearchItemDto
{
    public int Id { get; set; }
    public string Type { get; set; } = "vocab"; // "vocab" | "grammar"
    public string PrimaryText { get; set; } = string.Empty;
    public string? Reading { get; set; }
    public string Meaning { get; set; } = string.Empty;
    public string? ExampleSentence { get; set; }
    public string? JlptLevel { get; set; }
    public string? PartOfSpeech { get; set; }
}

public class SuggestScenarioKnowledgeRequest
{
    public string ScenarioTitle { get; set; } = string.Empty;
    public string? ScenarioDescription { get; set; }
    public string? JlptLevel { get; set; }
    public string Type { get; set; } = "vocab"; // "vocab" | "grammar"
    public string? Query { get; set; }
    public int Limit { get; set; } = 8;
    public List<int> ExcludeIds { get; set; } = [];
}

public class SuggestScenarioKnowledgeResponse
{
    public List<KnowledgeSearchItemDto> Items { get; set; } = [];
    public bool UsedAi { get; set; }
}
