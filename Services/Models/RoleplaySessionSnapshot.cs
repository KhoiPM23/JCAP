namespace JCAP.Services.Models
{
    public class RoleplaySessionSnapshot
    {
        public int SessionId { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string ScenarioTitle { get; set; } = string.Empty;
        public string JLPTLevel { get; set; } = string.Empty;
        public List<CompletedMissionSnapshot> CompletedMissions { get; set; } = [];
    }

    public class CompletedMissionSnapshot
    {
        public int MissionId { get; set; }
        public string Title { get; set; } = string.Empty;
    }
}
