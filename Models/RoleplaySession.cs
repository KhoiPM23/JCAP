using System.ComponentModel.DataAnnotations;

namespace JCAP.Models
{
    public class RoleplaySession
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public int? ScenarioLevelConfigurationId { get; set; }
        public string Status { get; set; } = "Active"; // Active, Completed, Abandoned, TerminatedEarly, InsufficientEvidence
        public int CreditDeducted { get; set; } = 0;
        public bool IsNaturallyConcluded { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAt { get; set; }
        public DateTime? CompletedAt { get; set; }

        /// <summary>
        /// Phân loại phiên: "Standard" (Luyện tập kịch bản thường) | "PlacementTest" (Kiểm tra xếp lớp đầu vào)
        /// </summary>
        [MaxLength(30)]
        public string SessionType { get; set; } = "Standard";

        /// <summary>
        /// Lưu trữ trạng thái điều phối thích ứng của Placement Test (PlacementAssessmentState JSON).
        /// Chỉ sử dụng khi SessionType == "PlacementTest".
        /// </summary>
        public string? AssessmentStateJson { get; set; }

        // Navigation properties
        public ApplicationUser? User { get; set; }
        public ScenarioLevelConfiguration? ScenarioLevelConfiguration { get; set; }
        public ICollection<RoleplayMessage> Messages { get; set; } = new List<RoleplayMessage>();
        public ICollection<RoleplaySessionMission> SessionMissions { get; set; } = new List<RoleplaySessionMission>();
        public RoleplayResult? Result { get; set; }
    }
}
