namespace JCAP.Models;

/// <summary>Written only when the complete bundled learning seed commits successfully.</summary>
public class LearningContentSeedState
{
    public string Key { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public DateTime CompletedAtUtc { get; set; }
}
