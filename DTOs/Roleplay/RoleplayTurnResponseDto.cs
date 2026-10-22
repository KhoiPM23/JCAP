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

    /// <summary>
    /// Số credit bị trừ trong lượt hội thoại này (dựa trên độ dài câu thoại AI).
    /// Tối thiểu 1 credit/lượt. Bằng 0 nếu người dùng là Admin.
    /// </summary>
    public int CreditsSpentThisTurn { get; set; }
}

