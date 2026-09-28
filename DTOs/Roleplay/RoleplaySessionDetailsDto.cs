using JCAP.DTOs.Scenario;

namespace JCAP.DTOs.Roleplay;

public class RoleplaySessionDetailsDto
{
    public int SessionId { get; set; }
    public int Id { get => SessionId; set => SessionId = value; }

    public int ScenarioId { get; set; }
    public string ScenarioTitle { get; set; } = string.Empty;
    public string ScenarioCode { get; set; } = string.Empty;

    public string JLPTLevel { get; set; } = string.Empty;
    public string Level { get => JLPTLevel; set => JLPTLevel = value; }

    public string AiPersona { get; set; } = string.Empty;
    public string ScenarioContext { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public int CreditDeducted { get; set; }
    public int CreditBalance { get; set; }
    public bool IsNaturallyConcluded { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<RoleplayMissionDto> Missions { get; set; } = [];
    public List<RoleplayMessageDto> Messages { get; set; } = [];
    public List<TargetVocabularyDto> TargetVocabularies { get; set; } = [];
    public List<TargetGrammarDto> TargetGrammars { get; set; } = [];
}
