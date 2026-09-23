namespace JCAP.Models
{
    public class TargetGrammar
    {
        public int Id { get; set; }
        public int ScenarioId { get; set; }
        public string Pattern { get; set; } = string.Empty;
        public string Meaning { get; set; } = string.Empty;
        public string? ExampleSentence { get; set; }

        // Navigation property
        public Scenario? Scenario { get; set; }
    }
}
