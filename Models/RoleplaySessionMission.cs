namespace JCAP.Models
{
    public class RoleplaySessionMission
    {
        public int Id { get; set; }
        public int RoleplaySessionId { get; set; }
        public int MissionId { get; set; }
        public bool IsCompleted { get; set; } = false;
        public DateTime? CompletedAt { get; set; }

        // Navigation properties
        public RoleplaySession? RoleplaySession { get; set; }
        public Mission? Mission { get; set; }
    }
}
