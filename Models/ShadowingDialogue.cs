namespace JCAP.Models
{
    public class ShadowingDialogue
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public int ScenarioId { get; set; }
        public string JLPTLevel { get; set; } = "N5"; // Restricted to N5, N4, N3
        public string? SourceDescription { get; set; }
        public string SpeakerRoleA_Name { get; set; } = string.Empty;
        public string SpeakerRoleB_Name { get; set; } = string.Empty;
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public Scenario Scenario { get; set; } = null!;
        public ICollection<ShadowingSentence> Sentences { get; set; } = new List<ShadowingSentence>();
    }
}
