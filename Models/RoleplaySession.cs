namespace JCAP.Models
{
    public class RoleplaySession
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public int ScenarioLevelConfigurationId { get; set; }
        public string Status { get; set; } = "Active"; // Active, Completed, Abandoned
        public int CreditDeducted { get; set; } = 0;
        public bool IsNaturallyConcluded { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAt { get; set; }
        public DateTime? CompletedAt { get; set; }

        // Navigation properties
        public ApplicationUser? User { get; set; }
        public ScenarioLevelConfiguration? ScenarioLevelConfiguration { get; set; }
        public ICollection<RoleplayMessage> Messages { get; set; } = new List<RoleplayMessage>();
        public ICollection<RoleplaySessionMission> SessionMissions { get; set; } = new List<RoleplaySessionMission>();
    }
}
