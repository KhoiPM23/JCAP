namespace JCAP.DTOs.Roleplay;

public class SendRoleplayMessageRequestDto
{
    public string Message { get; set; } = string.Empty;
    public double? SpeakingDurationSeconds { get; set; }
    public double? ResponseLatencySeconds { get; set; }
    public double? SpeechConfidence { get; set; }
    public string? AudioUrl { get; set; }

    // Telemetry fields (TikTok-style S1..S12)
    public int HintLevelUsed { get; set; } = 0;
    public int TranslationPeekCount { get; set; } = 0;
    public int RetryCount { get; set; } = 0;
    public bool FallbackToTextInput { get; set; } = false;
    public bool BargeInInterrupted { get; set; } = false;
    public double? MoraRate { get; set; }
    public double? PauseRatio { get; set; }
}
