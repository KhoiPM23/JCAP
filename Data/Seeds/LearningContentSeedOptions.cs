namespace JCAP.Data.Seeds;

public sealed class LearningContentSeedOptions
{
    public const string SectionName = "Seed:LearningContent";
    public bool Enabled { get; set; } = true;
    public int CommandTimeoutSeconds { get; set; } = 600;
}

public enum LearningContentSeedStatus { Disabled, UpToDate, Applied }
