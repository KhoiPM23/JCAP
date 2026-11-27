using System;

namespace JCAP.Models
{
    public class FlashcardQuizAttemptItem
    {
        public int Id { get; set; }
        public int AttemptId { get; set; }
        public string UserId { get; set; } = string.Empty;
        public int QuestionIndex { get; set; }
        public string QuestionType { get; set; } = "multiple_choice"; // "true_false" | "multiple_choice" | "matching" | "written"
        public string Direction { get; set; } = "ja_to_vi"; // "ja_to_vi" | "vi_to_ja"
        public int? VocabularyId { get; set; }
        public int? GrammarId { get; set; }
        public string FrontTextSnapshot { get; set; } = string.Empty;
        public string MeaningSnapshot { get; set; } = string.Empty;
        public string PromptText { get; set; } = string.Empty;
        public string CorrectAnswer { get; set; } = string.Empty;
        public string? UserAnswer { get; set; }
        public bool IsCorrect { get; set; }
        public bool IsSkipped { get; set; }
        public DateTime AnsweredAt { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public FlashcardQuizAttempt Attempt { get; set; } = null!;
        public ApplicationUser User { get; set; } = null!;
        public Vocabulary? Vocabulary { get; set; }
        public Grammar? Grammar { get; set; }
    }
}
