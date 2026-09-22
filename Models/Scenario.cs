namespace JCAP.Models
{
    public class Scenario
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string? Thumbnail { get; set; }
        public bool IsActive { get; set; } = true;
        public string? ScenarioCode { get; set; }

        // Navigation properties
        public ICollection<ScenarioLevelConfiguration> LevelConfigurations { get; set; } = new List<ScenarioLevelConfiguration>();
        public ICollection<TargetVocabulary> TargetVocabularies { get; set; } = new List<TargetVocabulary>();
        public ICollection<TargetGrammar> TargetGrammars { get; set; } = new List<TargetGrammar>();
    }
}
