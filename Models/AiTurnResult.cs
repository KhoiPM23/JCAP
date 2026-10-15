using JCAP.DTOs.Roleplay;

namespace JCAP.Models;

public class AiTurnResult
{
    public string JapaneseReply { get; set; } = string.Empty;
    public string VietnameseMeaning { get; set; } = string.Empty;
    public string? FuriganaHtml { get; set; }
    public List<int> CompletedMissionIds { get; set; } = [];
    public bool IsNaturallyConcluded { get; set; }
    public LinguisticFeedbackDto? LinguisticFeedback { get; set; }
}
