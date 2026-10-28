using System;
using System.Collections.Generic;

namespace JCAP.DTOs.Flashcard
{
    public class FlashcardQuotaOptions
    {
        public const string SectionName = "FlashcardQuota";
        public int FreeNewCardsPerDay { get; set; } = 20;
        public int UnlockBatchSize { get; set; } = 10;
        public int UnlockCreditCost { get; set; } = 5;
        public int MaxCardsPerSession { get; set; } = 20;
    }

    public class SrsIntervalPreviewDto
    {
        public int AgainIntervalDays { get; set; } = 1;
        public int GoodIntervalDays { get; set; } = 1;
        public int EasyIntervalDays { get; set; } = 3;
    }

    // ==================== BOOKMARK DTOs (UC-52, UC-53) ====================

    public class ToggleBookmarkRequestDto
    {
        public int? VocabularyId { get; set; }
        public int? GrammarId { get; set; }
    }

    public class ToggleBookmarkResponseDto
    {
        public bool IsBookmarked { get; set; }
        public int? VocabularyId { get; set; }
        public int? GrammarId { get; set; }
    }

    public class BookmarkItemDto
    {
        public int BookmarkId { get; set; }
        public string ItemType { get; set; } = string.Empty; // "Vocabulary" | "Grammar"
        public int ItemId { get; set; }
        public string FrontText { get; set; } = string.Empty; // Word or Pattern
        public string? ReadingOrFormation { get; set; }
        public string Meaning { get; set; } = string.Empty;
        public string? PartOfSpeech { get; set; }
        public string? Explanation { get; set; }
        public string? ExampleSentence { get; set; }
        public string? AudioUrl { get; set; }
        public string JLPTLevel { get; set; } = "N5";
        public bool IsAvailable { get; set; } = true;
        public string SrsState { get; set; } = "New"; // "New" | "Learning" | "Due"
        public int IntervalDays { get; set; }
        public DateTime? NextReviewAt { get; set; }
        public DateTime BookmarkedAt { get; set; }
    }

    public class BookmarkListResponseDto
    {
        public List<BookmarkItemDto> Items { get; set; } = new();
        public int TotalCount { get; set; }
        public int DueCount { get; set; }
        public int NewCount { get; set; }
    }

    // ==================== QUOTA DTOs ====================

    public class FlashcardQuotaDto
    {
        public int FreeNewCardsLimit { get; set; }
        public int ExtraUnlockedToday { get; set; }
        public int TotalAllowedNewCardsToday { get; set; }
        public int StudiedNewCardsToday { get; set; }
        public int RemainingNewCardsToday { get; set; }
        public int UnlockBatchSize { get; set; }
        public int UnlockCreditCost { get; set; }
        public int UserCreditBalance { get; set; }
        public bool HasActiveSubscription { get; set; }
    }

    // ==================== FLASHCARD SET DTOs (UC-55, UC-56) ====================

    public class FlashcardSetSummaryDto
    {
        public int TopicId { get; set; }
        public string TopicTitle { get; set; } = string.Empty;
        public string? TopicDescription { get; set; }
        public string JLPTLevel { get; set; } = "N5";
        public string ContentType { get; set; } = "Vocabulary"; // "Vocabulary" | "Grammar"
        public string SetTitle { get; set; } = string.Empty;
        public int TotalCards { get; set; }
        public int LearnedCards { get; set; }
        public int DueCards { get; set; }
        public int NewCards { get; set; }
        public DateTime? NextDueAt { get; set; }
    }

    public class FlashcardCardItemDto
    {
        public string ItemType { get; set; } = string.Empty; // "Vocabulary" | "Grammar"
        public int ItemId { get; set; }
        public string FrontText { get; set; } = string.Empty;
        public string? ReadingOrFormation { get; set; }
        public string Meaning { get; set; } = string.Empty;
        public string? PartOfSpeech { get; set; }
        public string? Explanation { get; set; }
        public string? ExampleSentence { get; set; }
        public string? AudioUrl { get; set; }
        public string JLPTLevel { get; set; } = "N5";
        public bool IsBookmarked { get; set; }
        public string SrsState { get; set; } = "New"; // "New" | "Learning" | "Due"
        public int Repetitions { get; set; }
        public int IntervalDays { get; set; }
        public double EaseFactor { get; set; } = 2.5;
        public DateTime? NextReviewAt { get; set; }
        public SrsIntervalPreviewDto IntervalPreview { get; set; } = new();
    }

    public class FlashcardSetDetailDto
    {
        public FlashcardSetSummaryDto Summary { get; set; } = new();
        public List<FlashcardCardItemDto> Cards { get; set; } = new();
    }

    // ==================== STUDY SESSION DTOs (UC-54, UC-57) ====================

    public class StartFlashcardSessionRequestDto
    {
        public string SourceType { get; set; } = "TopicSet"; // "TopicSet" | "Bookmark"
        public int? TopicId { get; set; }
        public string ContentType { get; set; } = "Vocabulary"; // "Vocabulary" | "Grammar" | "Mixed"
        public string? JLPTLevelFilter { get; set; }
        public bool IsExtraPractice { get; set; } = false;
    }

    public class FlashcardSessionDto
    {
        public int SessionId { get; set; }
        public string SourceType { get; set; } = string.Empty;
        public int? TopicId { get; set; }
        public string SetTitle { get; set; } = string.Empty;
        public string ContentType { get; set; } = string.Empty;
        public bool IsExtraPractice { get; set; }
        public DateTime StartedAt { get; set; }
        public List<FlashcardCardItemDto> Cards { get; set; } = new();
        public FlashcardQuotaDto Quota { get; set; } = new();
        public DateTime? NextDueAtWhenEmpty { get; set; }
        public int TotalEligibleInSource { get; set; }
    }

    public class SubmitFlashcardReviewRequestDto
    {
        public int? VocabularyId { get; set; }
        public int? GrammarId { get; set; }
        public string Rating { get; set; } = "Good"; // "Again" | "Good" | "Easy"
    }

    public class FlashcardReviewResultDto
    {
        public int SessionId { get; set; }
        public string ItemType { get; set; } = string.Empty;
        public int ItemId { get; set; }
        public string Rating { get; set; } = string.Empty;
        public int IntervalBefore { get; set; }
        public int IntervalAfter { get; set; }
        public DateTime NextReviewAt { get; set; }
        public bool RequeueInSession { get; set; }
        public SrsIntervalPreviewDto NextIntervalPreview { get; set; } = new();
    }

    public class CompleteFlashcardSessionResponseDto
    {
        public int SessionId { get; set; }
        public string SetTitle { get; set; } = string.Empty;
        public DateTime StartedAt { get; set; }
        public DateTime EndedAt { get; set; }
        public int DurationSeconds { get; set; }
        public int TotalReviewed { get; set; }
        public int AgainCount { get; set; }
        public int GoodCount { get; set; }
        public int EasyCount { get; set; }
        public List<FlashcardReviewLogItemDto> DifficultItems { get; set; } = new();
    }

    // ==================== HISTORY DTOs (UC-58) ====================

    public class FlashcardReviewLogItemDto
    {
        public int LogId { get; set; }
        public string ItemType { get; set; } = string.Empty;
        public int ItemId { get; set; }
        public string FrontText { get; set; } = string.Empty;
        public string Meaning { get; set; } = string.Empty;
        public string Rating { get; set; } = string.Empty;
        public bool IsNewCard { get; set; }
        public int IntervalBefore { get; set; }
        public int IntervalAfter { get; set; }
        public DateTime ReviewedAt { get; set; }
    }

    public class FlashcardSessionHistoryItemDto
    {
        public int SessionId { get; set; }
        public string SourceType { get; set; } = string.Empty;
        public int? TopicId { get; set; }
        public string SetTitle { get; set; } = string.Empty;
        public string ContentType { get; set; } = string.Empty;
        public bool IsExtraPractice { get; set; }
        public DateTime StartedAt { get; set; }
        public DateTime? EndedAt { get; set; }
        public int DurationSeconds { get; set; }
        public int TotalCards { get; set; }
        public int AgainCount { get; set; }
        public int GoodCount { get; set; }
        public int EasyCount { get; set; }
    }

    public class FlashcardSessionHistoryDetailDto
    {
        public FlashcardSessionHistoryItemDto Session { get; set; } = new();
        public List<FlashcardReviewLogItemDto> Logs { get; set; } = new();
    }
}
