namespace JCAP.Models
{
    public class TargetGrammar
    {
        public int Id { get; set; }
        public int ScenarioLevelConfigurationId { get; set; }
        public string Pattern { get; set; } = string.Empty;
        public string Meaning { get; set; } = string.Empty;
        public string? ExampleSentence { get; set; }
        public ScenarioLevelConfiguration? ScenarioLevelConfiguration { get; set; }
    }
}
