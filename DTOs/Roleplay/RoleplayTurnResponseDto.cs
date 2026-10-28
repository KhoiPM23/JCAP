using System.Collections.Generic;
using JCAP.Services.Interfaces;

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

    /// <summary>
    /// Các lỗi ngữ pháp / trợ từ phát hiện tức thì bằng C# Rule Engine (E01-E10)
    /// </summary>
    public List<DetectedGrammarIssue> DetectedIssues { get; set; } = [];

    /// <summary>
    /// Hệ số điều chỉnh tốc độ giọng AI theo nhịp độ người học (DDA: 0.85 chậm, 1.0 chuẩn, 1.05 nhanh)
    /// </summary>
    public double SpeedScale { get; set; } = 1.0;

    /// <summary>
    /// Trạng thái khích lệ nếu người học đang gặp khó khăn
    /// </summary>
    public bool ShouldOfferEncouragement { get; set; }
}
