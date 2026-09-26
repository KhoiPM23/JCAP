namespace JCAP.DTOs.Roleplay
{
    public class CompleteRoleplaySessionResponseDto
    {
        public int ResultId { get; set; }
        public bool IsExistingResult { get; set; }
        public bool IsMockEvaluation { get; set; }
    }

    public class CompletedMissionResultDto
    {
        public int MissionId { get; set; }
        public string Title { get; set; } = string.Empty;
    }

    public class RoleplayResultSummaryDto
    {
        public int Id { get; set; }
        public int RoleplaySessionId { get; set; }
        public string ScenarioTitle { get; set; } = string.Empty;
        public string JLPTLevel { get; set; } = string.Empty;
        public int OverallScore { get; set; }
        public bool PassStatus { get; set; }
        public DateTime CompletedAt { get; set; }
    }

    public class RoleplayResultDetailDto : RoleplayResultSummaryDto
    {
        public int GrammarScore { get; set; }
        public int VocabularyScore { get; set; }
        public int ImpressionScore { get; set; }
        public string GeneralFeedbackText { get; set; } = string.Empty;
        public List<CompletedMissionResultDto> CompletedMissions { get; set; } = [];
    }

    public class RoleplayResultHistoryResponseDto
    {
        public List<RoleplayResultSummaryDto> Items { get; set; } = [];
        public int TotalCount { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalPages { get; set; }
    }
}
