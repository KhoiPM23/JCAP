namespace JCAP.Models
{
    public class TargetVocabulary
    {
        public int Id { get; set; }
        public int ScenarioId { get; set; }
        public string Word { get; set; } = string.Empty;
        public string? Reading { get; set; }
        public string Meaning { get; set; } = string.Empty;

        // Navigation property
        public Scenario? Scenario { get; set; }
    }
}
