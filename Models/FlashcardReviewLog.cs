using System;

namespace JCAP.Models
{
    public class FlashcardReviewLog
    {
        public int Id { get; set; }
        public int SessionId { get; set; }
        public string UserId { get; set; } = string.Empty;
        public int? VocabularyId { get; set; }
        public int? GrammarId { get; set; }
        public string FrontTextSnapshot { get; set; } = string.Empty;
        public string MeaningSnapshot { get; set; } = string.Empty;
        public string Rating { get; set; } = FlashcardRating.Good;
        public bool IsNewCard { get; set; } = false;
        public int IntervalBefore { get; set; } = 0;
        public int IntervalAfter { get; set; } = 0;
        public DateTime ReviewedAt { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public FlashcardStudySession Session { get; set; } = null!;
        public ApplicationUser User { get; set; } = null!;
        public Vocabulary? Vocabulary { get; set; }
        public Grammar? Grammar { get; set; }
    }
}
