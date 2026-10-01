namespace JCAP.DTOs.Roleplay;

public class ActiveRoleplaySessionDto
{
    public int SessionId { get; set; }
    public int ScenarioId { get; set; }
    public string ScenarioTitle { get; set; } = string.Empty;
    public string ScenarioCode { get; set; } = string.Empty;
    public string JLPTLevel { get; set; } = string.Empty;
    public string Level => JLPTLevel;
    public string AiPersona { get; set; } = string.Empty;
    public bool HasActiveSession => SessionId > 0;
    public int ActiveSessionId => SessionId;
    public int CompletedMissionsCount { get; set; }
    public int TotalMissionsCount { get; set; }
    public int MessageCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
