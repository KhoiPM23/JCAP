namespace JCAP.Models
{
    public class TargetVocabulary
    {
        public int Id { get; set; }
        public int ScenarioLevelConfigurationId { get; set; }
        public string Word { get; set; } = string.Empty;
        public string? Reading { get; set; }
        public string Meaning { get; set; } = string.Empty;
        public ScenarioLevelConfiguration? ScenarioLevelConfiguration { get; set; }
    }
}
