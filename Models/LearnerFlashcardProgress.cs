using System;

namespace JCAP.Models
{
    public static class FlashcardRating
    {
        public const string Again = "Again";
        public const string Good = "Good";
        public const string Easy = "Easy";
    }

    public class LearnerFlashcardProgress
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public int? VocabularyId { get; set; }
        public int? GrammarId { get; set; }
        public int Repetitions { get; set; } = 0;
        public int IntervalDays { get; set; } = 0;
        public double EaseFactor { get; set; } = 2.5;
        public DateTime NextReviewAt { get; set; } = DateTime.UtcNow;
        public DateTime LastReviewedAt { get; set; } = DateTime.UtcNow;
        public string LastRating { get; set; } = FlashcardRating.Good;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public ApplicationUser User { get; set; } = null!;
        public Vocabulary? Vocabulary { get; set; }
        public Grammar? Grammar { get; set; }
    }
}
