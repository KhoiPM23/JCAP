using JCAP.DTOs.Scenario;

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
        public int ScenarioId { get; set; }
        public string ScenarioTitle { get; set; } = string.Empty;
        public string JLPTLevel { get; set; } = string.Empty;
        public int OverallScore { get; set; }
        public bool PassStatus { get; set; }
        public DateTime CompletedAt { get; set; }
    }

    public class RoleplayMissionProgressDto
    {
        public int MissionId { get; set; }
        public string Content { get; set; } = string.Empty;
        public string? Target { get; set; }
        public int Order { get; set; }
        public bool IsCompleted { get; set; }
        public DateTime? CompletedAt { get; set; }
    }

    public class RoleplayResultDetailDto : RoleplayResultSummaryDto
    {
        public int GrammarScore { get; set; }
        public int VocabularyScore { get; set; }
        public int ImpressionScore { get; set; }
        public int FluencyScore { get; set; }
        public int SpeechConfidenceScore { get; set; }
        public double AverageResponseLatencySeconds { get; set; }
        public double AverageSpeechPace { get; set; }
        public string GeneralFeedbackText { get; set; } = string.Empty;
        public List<CompletedMissionResultDto> CompletedMissions { get; set; } = [];
        public List<RoleplayMissionProgressDto> AllMissions { get; set; } = [];
        public List<TargetVocabularyDto> TargetVocabularies { get; set; } = [];
        public List<TargetGrammarDto> TargetGrammars { get; set; } = [];
        public List<RoleplayMessageDto> Messages { get; set; } = [];
        public RoleplayAttemptComparisonDto? AttemptComparison { get; set; }
    }

    public class RoleplayAttemptComparisonDto
    {
        public int AttemptNumber { get; set; }
        public int? PreviousOverallScore { get; set; }
        public int ScoreDelta => PreviousOverallScore.HasValue ? OverallScore - PreviousOverallScore.Value : 0;
        public int OverallScore { get; set; }
        public double? PreviousLatencySeconds { get; set; }
        public double? LatencyDeltaSeconds => PreviousLatencySeconds.HasValue ? Math.Round(CurrentLatencySeconds - PreviousLatencySeconds.Value, 1) : null;
        public double CurrentLatencySeconds { get; set; }
        public double? PreviousPace { get; set; }
        public double? PaceDelta => PreviousPace.HasValue ? Math.Round(CurrentPace - PreviousPace.Value, 1) : null;
        public double CurrentPace { get; set; }
        public string ProgressSummary { get; set; } = string.Empty;
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
