namespace JCAP.Models
{
    public class ScenarioLevelConfiguration
    {
        public int Id { get; set; }
        public int ScenarioId { get; set; }
        public string JLPTLevel { get; set; } = string.Empty; // N5, N4, N3
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string AiPersona { get; set; } = string.Empty;
        public int CreditCost { get; set; } = 5;
        public string Status { get; set; } = "Draft"; // Draft, Published, Archived
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAt { get; set; }

        // Navigation properties
        public Scenario? Scenario { get; set; }
        public ICollection<Mission> Missions { get; set; } = new List<Mission>();
        public ICollection<TargetVocabulary> TargetVocabularies { get; set; } = new List<TargetVocabulary>();
        public ICollection<TargetGrammar> TargetGrammars { get; set; } = new List<TargetGrammar>();
    }
}
