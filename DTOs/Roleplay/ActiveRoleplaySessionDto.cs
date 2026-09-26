namespace JCAP.DTOs.Roleplay;

public class ActiveRoleplaySessionDto
{
    public int SessionId { get; set; }
    public int ScenarioId { get; set; }
    public string ScenarioTitle { get; set; } = string.Empty;
    public string ScenarioCode { get; set; } = string.Empty;
    public string JLPTLevel { get; set; } = string.Empty;
    public string AiPersona { get; set; } = string.Empty;
    public int CompletedMissionsCount { get; set; }
    public int TotalMissionsCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
