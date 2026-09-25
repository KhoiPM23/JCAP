using JCAP.DTOs.Roleplay;
using JCAP.Models;

namespace JCAP.Services.Interfaces;

public class AiOpeningMessageResult
{
    public string JapaneseText { get; set; } = string.Empty;
    public string VietnameseMeaning { get; set; } = string.Empty;
    public string? FuriganaHtml { get; set; }
}

public class AiTurnResult
{
    public string JapaneseReply { get; set; } = string.Empty;
    public string VietnameseMeaning { get; set; } = string.Empty;
    public string? FuriganaHtml { get; set; }
    public List<int> CompletedMissionIds { get; set; } = [];
    public bool IsNaturallyConcluded { get; set; }
    public LinguisticFeedbackDto? LinguisticFeedback { get; set; }
}

public interface IAiRoleplayService
{
    /// <summary>
    /// Sinh câu chào mở đầu của AI dựa trên bối cảnh và Persona.
    /// </summary>
    Task<AiOpeningMessageResult> GenerateOpeningMessageAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Xử lý một lượt đối thoại: AI phản hồi hội thoại, đồng thời phân tích mission và phát hiện kết thúc tự nhiên.
    /// </summary>
    Task<AiTurnResult> ProcessTurnAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        List<RoleplayMessage> conversationHistory,
        string userMessage,
        List<Mission> pendingMissions,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Sinh gợi ý câu nói tiếp theo cho học viên khi bị bí từ (On-demand Hint).
    /// </summary>
    Task<RoleplayHintDto> GenerateHintAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        List<RoleplayMessage> conversationHistory,
        List<Mission> pendingMissions,
        CancellationToken cancellationToken = default);
}
