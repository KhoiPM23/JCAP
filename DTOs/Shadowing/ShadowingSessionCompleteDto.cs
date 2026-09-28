using System.Collections.Generic;

namespace JCAP.DTOs.Shadowing
{
    public class ShadowingSessionCompleteDto
    {
        public int DialogueId { get; set; }
        public string LearnerRole { get; set; } = "A";
        public int OverallAccuracyScore { get; set; }
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
        public int AccuracyScore { get; set; }
        public string EvaluationTier { get; set; } = "green"; // green, yellow, red
    }

    public class ShadowingSessionCompleteResponseDto
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public int DialogueId { get; set; }
        public string DialogueTitle { get; set; } = string.Empty;
        public int OverallAccuracyScore { get; set; }
        public string SummaryFeedback { get; set; } = string.Empty;
    }
}

