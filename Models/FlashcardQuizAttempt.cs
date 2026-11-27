using System;
using System.Collections.Generic;

namespace JCAP.Models
{
    public class FlashcardQuizAttempt
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string SourceType { get; set; } = FlashcardSessionSource.TopicSet; // "TopicSet" | "Bookmark"
        public int? TopicId { get; set; }
        public string SetTitleSnapshot { get; set; } = string.Empty;
        public string ContentType { get; set; } = FlashcardContentType.Vocabulary; // "Vocabulary" | "Grammar" | "Mixed"
        public string Direction { get; set; } = "ja_to_vi"; // "ja_to_vi" | "vi_to_ja" | "mixed"
        public string CardScope { get; set; } = "all"; // "all" | "learned" | "due" | "bookmarked"
        public bool InstantFeedback { get; set; }
        public int TotalQuestions { get; set; }
        public int CorrectCount { get; set; }
        public int WrongCount { get; set; }
        public int SkippedCount { get; set; }
        public int ScorePercent { get; set; }
        public int DurationSeconds { get; set; }
        public DateTime StartedAt { get; set; } = DateTime.UtcNow;
        public DateTime CompletedAt { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public ApplicationUser User { get; set; } = null!;
        public ICollection<FlashcardQuizAttemptItem> Items { get; set; } = new List<FlashcardQuizAttemptItem>();
    }
}
