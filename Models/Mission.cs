namespace JCAP.Models
{
    public class Mission
    {
        public int Id { get; set; }
        public int ScenarioLevelConfigurationId { get; set; }
        public string Content { get; set; } = string.Empty;
        public int Order { get; set; } = 1;

        // JSON column storing structured MissionCompletionCriteria (Intent, Target, Conditions)
        public string CompletionCriteriaJson { get; set; } = "{}";

        // Navigation property
        public ScenarioLevelConfiguration? ScenarioLevelConfiguration { get; set; }
        public ICollection<RoleplaySessionMission> SessionMissions { get; set; } = new List<RoleplaySessionMission>();
    }
}
