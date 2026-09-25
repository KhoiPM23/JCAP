namespace JCAP.Models
{
    public class RoleplayResult
    {
        public int Id { get; set; }
        public int RoleplaySessionId { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string ScenarioTitle { get; set; } = string.Empty;
        public string JLPTLevel { get; set; } = string.Empty;
        public int OverallScore { get; set; }
        public int GrammarScore { get; set; }
        public int VocabularyScore { get; set; }
        public int ImpressionScore { get; set; }
        public bool PassStatus { get; set; }
        public string GeneralFeedbackText { get; set; } = string.Empty;
        public string CompletedMissionsSummaryJson { get; set; } = "[]";
        public DateTime CompletedAt { get; set; } = DateTime.UtcNow;
        public ApplicationUser? User { get; set; }
    }
}
