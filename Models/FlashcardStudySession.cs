using System;
using System.Collections.Generic;

namespace JCAP.Models
{
    public static class FlashcardSessionSource
    {
        public const string TopicSet = "TopicSet";
        public const string Bookmark = "Bookmark";
    }

    public static class FlashcardContentType
    {
        public const string Vocabulary = "Vocabulary";
        public const string Grammar = "Grammar";
        public const string Mixed = "Mixed";
    }

    public class FlashcardStudySession
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string SourceType { get; set; } = FlashcardSessionSource.TopicSet;
        public int? TopicId { get; set; }
        public string SetTitleSnapshot { get; set; } = string.Empty;
        public string ContentType { get; set; } = FlashcardContentType.Vocabulary;
        public bool IsExtraPractice { get; set; } = false;
        public DateTime StartedAt { get; set; } = DateTime.UtcNow;
        public DateTime? EndedAt { get; set; }
        public int TotalCards { get; set; } = 0;
        public int AgainCount { get; set; } = 0;
        public int GoodCount { get; set; } = 0;
        public int EasyCount { get; set; } = 0;

        // Navigation properties
        public ApplicationUser User { get; set; } = null!;
        public ICollection<FlashcardReviewLog> ReviewLogs { get; set; } = new List<FlashcardReviewLog>();
    }
}
