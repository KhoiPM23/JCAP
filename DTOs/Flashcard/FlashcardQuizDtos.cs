using System;
using System.Collections.Generic;

namespace JCAP.DTOs.Flashcard
{
    public class SubmitFlashcardQuizAttemptItemDto
    {
        public int QuestionIndex { get; set; }
        public string QuestionType { get; set; } = "multiple_choice"; // "true_false" | "multiple_choice" | "matching" | "written"
        public string Direction { get; set; } = "ja_to_vi"; // "ja_to_vi" | "vi_to_ja"
        public string ItemType { get; set; } = "Vocabulary"; // "Vocabulary" | "Grammar"
        public int ItemId { get; set; }
        public string PromptText { get; set; } = string.Empty;
        public string CorrectAnswer { get; set; } = string.Empty;
        public string? UserAnswer { get; set; }
        public bool IsCorrect { get; set; }
        public bool IsSkipped { get; set; }
    }

    public class SubmitFlashcardQuizAttemptRequestDto
    {
        public string SourceType { get; set; } = "TopicSet"; // "TopicSet" | "Bookmark"
        public int? TopicId { get; set; }
        public string ContentType { get; set; } = "Vocabulary"; // "Vocabulary" | "Grammar" | "Mixed"
        public string? SetTitle { get; set; }
        public string Direction { get; set; } = "ja_to_vi"; // "ja_to_vi" | "vi_to_ja" | "mixed"
        public string CardScope { get; set; } = "all"; // "all" | "learned" | "due" | "bookmarked"
        public bool InstantFeedback { get; set; }
        public int DurationSeconds { get; set; } = 1;
        public List<SubmitFlashcardQuizAttemptItemDto> Items { get; set; } = new();
    }

    public class FlashcardQuizHistoryItemDto
    {
        public int AttemptId { get; set; }
        public string SourceType { get; set; } = string.Empty;
        public int? TopicId { get; set; }
        public string SetTitle { get; set; } = string.Empty;
        public string ContentType { get; set; } = string.Empty;
        public string Direction { get; set; } = string.Empty;
        public string CardScope { get; set; } = string.Empty;
        public bool InstantFeedback { get; set; }
        public int TotalQuestions { get; set; }
        public int CorrectCount { get; set; }
        public int WrongCount { get; set; }
        public int SkippedCount { get; set; }
        public int ScorePercent { get; set; }
        public int DurationSeconds { get; set; }
        public DateTime StartedAt { get; set; }
        public DateTime CompletedAt { get; set; }
    }

    public class FlashcardQuizAttemptItemDetailDto
    {
        public int ItemLogId { get; set; }
        public int QuestionIndex { get; set; }
        public string QuestionType { get; set; } = string.Empty;
        public string Direction { get; set; } = string.Empty;
        public string ItemType { get; set; } = string.Empty;
        public int ItemId { get; set; }
        public string FrontText { get; set; } = string.Empty;
        public string Meaning { get; set; } = string.Empty;
        public string PromptText { get; set; } = string.Empty;
        public string CorrectAnswer { get; set; } = string.Empty;
        public string? UserAnswer { get; set; }
        public bool IsCorrect { get; set; }
        public bool IsSkipped { get; set; }
        public DateTime AnsweredAt { get; set; }
    }

    public class FlashcardQuizHistoryDetailDto
    {
        public FlashcardQuizHistoryItemDto Attempt { get; set; } = new();
        public List<FlashcardQuizAttemptItemDetailDto> Items { get; set; } = new();
    }
}
