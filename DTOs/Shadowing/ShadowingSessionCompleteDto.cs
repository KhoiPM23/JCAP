using System.Collections.Generic;

namespace JCAP.DTOs.Shadowing
{
    public class ShadowingSessionCompleteDto
    {
        public int DialogueId { get; set; }
        public string LearnerRole { get; set; } = "A";
        public int OverallContentMatchScore { get; set; }
        public int OverallAccuracyScore { get; set; }
        public int OverallFluencyScore { get; set; }
        public int OverallIntonationScore { get; set; }
        public int OverallAudioQualityScore { get; set; }
        public string AudioQualityStatus { get; set; } = "clear";
        public string OverallAudioGateStatus { get; set; } = "good";
        public string AudioGateLabel { get; set; } = "Tốt";
        public int WeightedOverallScore { get; set; }
        public int DurationSeconds { get; set; }
        public int SentencesPracticed { get; set; }
        public int TotalGreenSentences { get; set; }
        public int TotalYellowSentences { get; set; }
        public int TotalRedSentences { get; set; }
        public List<ShadowingSentencePracticeResultDto> SentenceResults { get; set; } = new List<ShadowingSentencePracticeResultDto>();
    }

    public class ShadowingSentencePracticeResultDto
    {
        public int SentenceId { get; set; }
        public int OrderIndex { get; set; }
        public string TargetText { get; set; } = string.Empty;
        public string RecognizedText { get; set; } = string.Empty;
        public int ContentMatchScore { get; set; }
        public int AccuracyScore { get; set; }
        public int FluencyScore { get; set; }
        public int IntonationScore { get; set; }
        public int OverallScore { get; set; }
        public string AudioGateStatus { get; set; } = "good";
        public string AudioGateLabel { get; set; } = string.Empty;
        public bool IsValidForBestAttempt { get; set; } = true;
        public int AttemptsCount { get; set; } = 1;
        public string EvaluationTier { get; set; } = "green"; // green, yellow, red
    }

    public class ShadowingSessionCompleteResponseDto
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public int DialogueId { get; set; }
        public string DialogueTitle { get; set; } = string.Empty;
        public int OverallAccuracyScore { get; set; }
        public int OverallFluencyScore { get; set; }
        public int OverallIntonationScore { get; set; }
        public int OverallAudioQualityScore { get; set; }
        public string AudioQualityStatus { get; set; } = "clear";
        public int WeightedOverallScore { get; set; }
        public string RankTitle { get; set; } = string.Empty;
        public string SummaryFeedback { get; set; } = string.Empty;
    }
}

