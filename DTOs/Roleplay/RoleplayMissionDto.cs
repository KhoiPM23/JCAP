namespace JCAP.DTOs.Roleplay;

public class RoleplayMissionDto
{
    public int MissionId { get; set; }
    public int Id { get => MissionId; set => MissionId = value; }
    public string Content { get; set; } = string.Empty;
    public string Target { get; set; } = string.Empty;
    public int Order { get; set; }
    public bool IsCompleted { get; set; }
    public DateTime? CompletedAt { get; set; }
}
