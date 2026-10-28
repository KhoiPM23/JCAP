namespace JCAP.DTOs.Roleplay;

public class SendRoleplayMessageRequestDto
{
    public string Message { get; set; } = string.Empty;
    public double? SpeakingDurationSeconds { get; set; }
    public double? ResponseLatencySeconds { get; set; }
    public double? SpeechConfidence { get; set; }
    public string? AudioUrl { get; set; }
}
