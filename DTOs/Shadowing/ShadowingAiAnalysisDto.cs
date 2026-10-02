using System.Collections.Generic;

namespace JCAP.DTOs.Shadowing
{
    public class ShadowingAiAnalysisRequestDto
    {
        public int DialogueId { get; set; }
        public string LearnerRole { get; set; } = "A";
        public int OverallAccuracyScore { get; set; }
        public int DurationSeconds { get; set; }
        public List<ShadowingSentencePracticeResultDto> SentenceResults { get; set; } = new List<ShadowingSentencePracticeResultDto>();
    }

    public class ShadowingAiAnalysisResponseDto
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public int CreditsDeducted { get; set; } = 15;
        public int RemainingCreditBalance { get; set; }
        
        // Radar metrics (0 - 100)
        public int TokyoIntonationScore { get; set; }
        public int VowelClarityScore { get; set; }
        public int RhythmTempoScore { get; set; }
        public int PitchAccentScore { get; set; }
        public int LongVowelPrecisionScore { get; set; }

        public string OverallDiagnosis { get; set; } = string.Empty;
        public List<string> KeyStrengths { get; set; } = new List<string>();
        public List<string> ImprovementActionItems { get; set; } = new List<string>();
    }
}

