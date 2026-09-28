namespace JCAP.DTOs.Roleplay;

public class RoleplayTurnResponseDto
{
    public RoleplayMessageDto UserMessage { get; set; } = new();
    public RoleplayMessageDto AiMessage { get; set; } = new();
    public List<int> NewlyCompletedMissionIds { get; set; } = [];
    public List<RoleplayMissionDto> UpdatedMissions { get; set; } = [];
    public bool IsNaturallyConcluded { get; set; }
    public string SessionStatus { get; set; } = string.Empty;
    public int CreditBalance { get; set; }
}
