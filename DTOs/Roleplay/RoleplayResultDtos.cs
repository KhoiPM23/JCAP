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
        public int AutonomyScore { get; set; } = 100;
        public int PronunciationScore { get; set; } = 85;
        public double AverageResponseLatencySeconds { get; set; }
        public double AverageSpeechPace { get; set; }
        public string GeneralFeedbackText { get; set; } = string.Empty;
        public List<CompletedMissionResultDto> CompletedMissions { get; set; } = [];
        public List<RoleplayMissionProgressDto> AllMissions { get; set; } = [];
        public List<TargetVocabularyDto> TargetVocabularies { get; set; } = [];
        public List<TargetGrammarDto> TargetGrammars { get; set; } = [];
        public List<WeakVocabularyDto> WeakVocabularies { get; set; } = [];
        public List<WeakGrammarDto> WeakGrammars { get; set; } = [];
        public List<RecommendedShadowingDialogueDto> RecommendedShadowingDialogues { get; set; } = [];
        public List<RoleplayMessageDto> Messages { get; set; } = [];
        public RoleplayAttemptComparisonDto? AttemptComparison { get; set; }
        public string? AwardedEkiStampName { get; set; }
        public int? ExploreSpotId { get; set; }
        public int? ExplorePrefectureId { get; set; }
        public ScoreBreakdownDto? ScoreBreakdown { get; set; }
        public string? AiPersona { get; set; }
        public int NpcAffinityScore { get; set; } = 20;
        public string? NpcRelationshipTitle { get; set; }
        public int? NextRecommendedScenarioId { get; set; }
        public string? NextRecommendedScenarioTitle { get; set; }
        public string? NextRecommendedReason { get; set; }
        public double? PredictedSuccessRateNextScenario { get; set; }
        public string? HankoStampType { get; set; }
        public string? KanjiRank { get; set; }
        public string? HankoStampText { get; set; }
        public List<string> CompetencyBadges { get; set; } = [];
        public string? TopicCode { get; set; }
        public string? TopicName { get; set; }
        public int? TopicId { get; set; }
        public List<WeakVocabularyDto> TopicRecommendedVocabularies { get; set; } = [];
        public List<WeakGrammarDto> TopicRecommendedGrammars { get; set; } = [];
    }

    public class ScoreBreakdownDto
    {
        public int MissionCompletionPoints { get; set; }
        public int MissionCount { get; set; }
        public int TotalMissionCount { get; set; }
        public int LinguisticPoints { get; set; }
        public int FluencyReflexPoints { get; set; }
        public int AutonomyPoints { get; set; }
        public int GrammarPoints { get; set; }
        public int GrammarBaseScore { get; set; }
        public int VocabularyPoints { get; set; }
        public int VocabularyBaseScore { get; set; }
        public int ImpressionPoints { get; set; }
        public int ImpressionBaseScore { get; set; }
        public bool NaturalConclusionBonus { get; set; }
        public int AutonomyScore { get; set; } = 100;
        public int FluencyScore { get; set; } = 85;
        public double AverageLatencySeconds { get; set; }
        public double AveragePace { get; set; }
        public bool IsCappedDueToIncomplete { get; set; }
        public int FinalOverallScore { get; set; }
        public List<ScoreAdjustmentItemDto> Adjustments { get; set; } = [];
    }

    public class ScoreAdjustmentItemDto
    {
        public string Category { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public int DeltaPoints { get; set; }
        public bool IsPositive => DeltaPoints >= 0;
    }

    public class RoleplayAttemptComparisonDto
    {
        public int AttemptNumber { get; set; }
        public bool IsPersonalBest { get; set; }
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

    public class WeakVocabularyDto
    {
        public int Id { get; set; }
        public string Word { get; set; } = string.Empty;
        public string? Reading { get; set; }
        public string Meaning { get; set; } = string.Empty;
        public int MasteryScore { get; set; }
        public string Status { get; set; } = string.Empty; // "NeedsPractice" | "NotAttempted"
        public string Reason { get; set; } = string.Empty;
    }

    public class WeakGrammarDto
    {
        public int Id { get; set; }
        public string Pattern { get; set; } = string.Empty;
        public string Meaning { get; set; } = string.Empty;
        public string? ExampleSentence { get; set; }
        public int MasteryScore { get; set; }
        public string Status { get; set; } = string.Empty; // "NeedsPractice" | "NotAttempted"
        public string Reason { get; set; } = string.Empty;
    }

    public class RecommendedShadowingDialogueDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string JLPTLevel { get; set; } = "N5";
        public int? ScenarioId { get; set; }
        public string MatchReason { get; set; } = string.Empty;
        public int Score { get; set; }
        public int SentencesCount { get; set; }
    }
}
