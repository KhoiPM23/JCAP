using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Flashcard;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations
{
    public class FlashcardQuizService : IFlashcardQuizService
    {
        private readonly AppDbContext _db;
        private readonly ILearningTopicLookup _topicLookup;

        public FlashcardQuizService(AppDbContext db, ILearningTopicLookup topicLookup)
        {
            _db = db;
            _topicLookup = topicLookup;
        }

        public async Task<ApiResponse<FlashcardQuizHistoryItemDto>> SubmitAttemptAsync(
            string userId,
            SubmitFlashcardQuizAttemptRequestDto request)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return ApiResponse<FlashcardQuizHistoryItemDto>.Fail("Chưa xác thực người dùng.");
            }

            if (request == null || request.Items == null || request.Items.Count == 0)
            {
                return ApiResponse<FlashcardQuizHistoryItemDto>.Fail("Danh sách câu trả lời bài tự đánh giá không được để trống.");
            }

            var rawItems = request.Items.Take(200).ToList();

            var vocabIds = rawItems
                .Where(i => !string.Equals(i.ItemType, FlashcardContentType.Grammar, StringComparison.OrdinalIgnoreCase) && i.ItemId > 0)
                .Select(i => i.ItemId)
                .Distinct()
                .ToList();

            var grammarIds = rawItems
                .Where(i => string.Equals(i.ItemType, FlashcardContentType.Grammar, StringComparison.OrdinalIgnoreCase) && i.ItemId > 0)
                .Select(i => i.ItemId)
                .Distinct()
                .ToList();

            var vocabMap = vocabIds.Count > 0
                ? await _db.Vocabularies
                    .AsNoTracking()
                    .Where(v => v.IsActive && vocabIds.Contains(v.Id))
                    .ToDictionaryAsync(v => v.Id)
                : new Dictionary<int, Vocabulary>();

            var grammarMap = grammarIds.Count > 0
                ? await _db.Grammars
                    .AsNoTracking()
                    .Where(g => g.IsActive && grammarIds.Contains(g.Id))
                    .ToDictionaryAsync(g => g.Id)
                : new Dictionary<int, Grammar>();

            var nowUtc = DateTime.UtcNow;
            var entities = new List<FlashcardQuizAttemptItem>();
            int correctCount = 0;
            int wrongCount = 0;
            int skippedCount = 0;
            bool hasVocab = false;
            bool hasGrammar = false;

            int fallbackIndex = 1;
            foreach (var item in rawItems)
            {
                bool isGrammar = string.Equals(item.ItemType, FlashcardContentType.Grammar, StringComparison.OrdinalIgnoreCase);
                string normalizedQType = NormalizeQuestionType(item.QuestionType);
                string normalizedItemDir = string.Equals(item.Direction, "vi_to_ja", StringComparison.OrdinalIgnoreCase)
                    ? "vi_to_ja"
                    : "ja_to_vi";

                string frontSnapshot;
                string meaningSnapshot;
                int? vocabId = null;
                int? grammarId = null;

                if (isGrammar)
                {
                    if (!grammarMap.TryGetValue(item.ItemId, out var g)) continue;
                    hasGrammar = true;
                    grammarId = g.Id;
                    frontSnapshot = Truncate(g.Pattern, 200);
                    meaningSnapshot = g.Meaning;
                }
                else
                {
                    if (!vocabMap.TryGetValue(item.ItemId, out var v)) continue;
                    hasVocab = true;
                    vocabId = v.Id;
                    frontSnapshot = Truncate(v.Word, 200);
                    meaningSnapshot = v.Meaning;
                }

                bool isSkipped = item.IsSkipped || (!item.IsCorrect && string.IsNullOrWhiteSpace(item.UserAnswer));
                bool isCorrect = !isSkipped && item.IsCorrect;

                if (isCorrect) correctCount++;
                else if (isSkipped) skippedCount++;
                else wrongCount++;

                string promptText = string.IsNullOrWhiteSpace(item.PromptText)
                    ? (normalizedItemDir == "ja_to_vi" ? frontSnapshot : meaningSnapshot)
                    : item.PromptText.Trim();

                string correctAnswer = string.IsNullOrWhiteSpace(item.CorrectAnswer)
                    ? (normalizedItemDir == "ja_to_vi" ? meaningSnapshot : frontSnapshot)
                    : item.CorrectAnswer.Trim();

                entities.Add(new FlashcardQuizAttemptItem
                {
                    UserId = userId,
                    QuestionIndex = item.QuestionIndex > 0 ? item.QuestionIndex : fallbackIndex,
                    QuestionType = normalizedQType,
                    Direction = normalizedItemDir,
                    VocabularyId = vocabId,
                    GrammarId = grammarId,
                    FrontTextSnapshot = frontSnapshot,
                    MeaningSnapshot = meaningSnapshot,
                    PromptText = Truncate(promptText, 500),
                    CorrectAnswer = Truncate(correctAnswer, 500),
                    UserAnswer = string.IsNullOrWhiteSpace(item.UserAnswer) ? null : Truncate(item.UserAnswer.Trim(), 500),
                    IsCorrect = isCorrect,
                    IsSkipped = isSkipped,
                    AnsweredAt = nowUtc
                });

                fallbackIndex++;
            }

            if (entities.Count == 0)
            {
                return ApiResponse<FlashcardQuizHistoryItemDto>.Fail("Không tìm thấy thẻ hợp lệ để lưu kết quả tự đánh giá.");
            }

            string contentType = hasVocab && hasGrammar
                ? FlashcardContentType.Mixed
                : (hasGrammar ? FlashcardContentType.Grammar : FlashcardContentType.Vocabulary);

            bool isBookmarkSource = string.Equals(request.SourceType, FlashcardSessionSource.Bookmark, StringComparison.OrdinalIgnoreCase);
            string resolvedSourceType = isBookmarkSource ? FlashcardSessionSource.Bookmark : FlashcardSessionSource.TopicSet;
            int? resolvedTopicId = null;
            string resolvedTitle;

            if (isBookmarkSource)
            {
                resolvedTitle = "Kho thẻ đã lưu (Bookmarks)";
            }
            else if (request.TopicId.HasValue && request.TopicId.Value > 0)
            {
                var topic = await _topicLookup.GetActiveTopicByIdAsync(request.TopicId.Value);
                if (topic != null)
                {
                    resolvedTopicId = topic.TopicId;
                    resolvedTitle = contentType == FlashcardContentType.Grammar
                        ? $"Ngữ pháp – {topic.Title}"
                        : (contentType == FlashcardContentType.Mixed ? $"Hỗn hợp – {topic.Title}" : $"Từ vựng – {topic.Title}");
                }
                else
                {
                    resolvedTitle = string.IsNullOrWhiteSpace(request.SetTitle)
                        ? "Kiểm tra kiến thức Flashcard"
                        : request.SetTitle.Trim();
                }
            }
            else
            {
                resolvedTitle = string.IsNullOrWhiteSpace(request.SetTitle)
                    ? "Kiểm tra kiến thức Flashcard"
                    : request.SetTitle.Trim();
            }

            int durationSeconds = Math.Clamp(request.DurationSeconds, 1, 86400);
            int totalQuestions = entities.Count;
            int scorePercent = (int)Math.Round((double)correctCount / totalQuestions * 100, MidpointRounding.AwayFromZero);

            var attempt = new FlashcardQuizAttempt
            {
                UserId = userId,
                SourceType = resolvedSourceType,
                TopicId = resolvedTopicId,
                SetTitleSnapshot = Truncate(resolvedTitle, 200),
                ContentType = contentType,
                Direction = NormalizeDirection(request.Direction),
                CardScope = NormalizeCardScope(request.CardScope),
                InstantFeedback = request.InstantFeedback,
                TotalQuestions = totalQuestions,
                CorrectCount = correctCount,
                WrongCount = wrongCount,
                SkippedCount = skippedCount,
                ScorePercent = scorePercent,
                DurationSeconds = durationSeconds,
                StartedAt = nowUtc.AddSeconds(-durationSeconds),
                CompletedAt = nowUtc,
                Items = entities
            };

            _db.FlashcardQuizAttempts.Add(attempt);
            await _db.SaveChangesAsync();

            return ApiResponse<FlashcardQuizHistoryItemDto>.Ok(
                MapHistoryItemDto(attempt),
                "Đã lưu kết quả tự đánh giá thành công.");
        }

        public async Task<ApiResponse<List<FlashcardQuizHistoryItemDto>>> GetHistoryAsync(
            string userId,
            string? contentType = null,
            int? topicId = null)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return ApiResponse<List<FlashcardQuizHistoryItemDto>>.Fail("Chưa xác thực người dùng.");
            }

            var query = _db.FlashcardQuizAttempts
                .AsNoTracking()
                .Where(a => a.UserId == userId);

            if (!string.IsNullOrWhiteSpace(contentType) && !string.Equals(contentType, "All", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(a => a.ContentType.ToLower() == contentType.ToLower());
            }

            if (topicId.HasValue && topicId.Value > 0)
            {
                query = query.Where(a => a.TopicId == topicId.Value);
            }

            var attempts = await query
                .OrderByDescending(a => a.CompletedAt)
                .Take(100)
                .ToListAsync();

            var items = attempts.Select(MapHistoryItemDto).ToList();
            return ApiResponse<List<FlashcardQuizHistoryItemDto>>.Ok(items);
        }

        public async Task<ApiResponse<FlashcardQuizHistoryDetailDto>> GetHistoryDetailAsync(
            string userId,
            int attemptId)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return ApiResponse<FlashcardQuizHistoryDetailDto>.Fail("Chưa xác thực người dùng.");
            }

            var attempt = await _db.FlashcardQuizAttempts
                .AsNoTracking()
                .Include(a => a.Items)
                .FirstOrDefaultAsync(a => a.Id == attemptId && a.UserId == userId);

            if (attempt == null)
            {
                return ApiResponse<FlashcardQuizHistoryDetailDto>.Fail("Không tìm thấy kết quả bài tự đánh giá.");
            }

            var itemDtos = attempt.Items
                .OrderBy(i => i.QuestionIndex)
                .ThenBy(i => i.Id)
                .Select(i => new FlashcardQuizAttemptItemDetailDto
                {
                    ItemLogId = i.Id,
                    QuestionIndex = i.QuestionIndex,
                    QuestionType = i.QuestionType,
                    Direction = i.Direction,
                    ItemType = i.VocabularyId.HasValue ? FlashcardContentType.Vocabulary : FlashcardContentType.Grammar,
                    ItemId = i.VocabularyId ?? i.GrammarId ?? 0,
                    FrontText = i.FrontTextSnapshot,
                    Meaning = i.MeaningSnapshot,
                    PromptText = i.PromptText,
                    CorrectAnswer = i.CorrectAnswer,
                    UserAnswer = i.UserAnswer,
                    IsCorrect = i.IsCorrect,
                    IsSkipped = i.IsSkipped,
                    AnsweredAt = DateTime.SpecifyKind(i.AnsweredAt, DateTimeKind.Utc)
                })
                .ToList();

            return ApiResponse<FlashcardQuizHistoryDetailDto>.Ok(new FlashcardQuizHistoryDetailDto
            {
                Attempt = MapHistoryItemDto(attempt),
                Items = itemDtos
            });
        }

        private static FlashcardQuizHistoryItemDto MapHistoryItemDto(FlashcardQuizAttempt a) => new()
        {
            AttemptId = a.Id,
            SourceType = a.SourceType,
            TopicId = a.TopicId,
            SetTitle = a.SetTitleSnapshot,
            ContentType = a.ContentType,
            Direction = a.Direction,
            CardScope = a.CardScope,
            InstantFeedback = a.InstantFeedback,
            TotalQuestions = a.TotalQuestions,
            CorrectCount = a.CorrectCount,
            WrongCount = a.WrongCount,
            SkippedCount = a.SkippedCount,
            ScorePercent = a.ScorePercent,
            DurationSeconds = a.DurationSeconds,
            StartedAt = DateTime.SpecifyKind(a.StartedAt, DateTimeKind.Utc),
            CompletedAt = DateTime.SpecifyKind(a.CompletedAt, DateTimeKind.Utc)
        };

        private static string NormalizeQuestionType(string? type)
        {
            if (string.Equals(type, "true_false", StringComparison.OrdinalIgnoreCase)) return "true_false";
            if (string.Equals(type, "matching", StringComparison.OrdinalIgnoreCase)) return "matching";
            if (string.Equals(type, "written", StringComparison.OrdinalIgnoreCase)) return "written";
            return "multiple_choice";
        }

        private static string NormalizeDirection(string? direction)
        {
            if (string.Equals(direction, "vi_to_ja", StringComparison.OrdinalIgnoreCase)) return "vi_to_ja";
            if (string.Equals(direction, "mixed", StringComparison.OrdinalIgnoreCase)) return "mixed";
            return "ja_to_vi";
        }

        private static string NormalizeCardScope(string? scope)
        {
            if (string.Equals(scope, "learned", StringComparison.OrdinalIgnoreCase)) return "learned";
            if (string.Equals(scope, "due", StringComparison.OrdinalIgnoreCase)) return "due";
            if (string.Equals(scope, "bookmarked", StringComparison.OrdinalIgnoreCase)) return "bookmarked";
            return "all";
        }

        private static string Truncate(string value, int maxLength)
        {
            if (string.IsNullOrEmpty(value)) return string.Empty;
            return value.Length <= maxLength ? value : value[..maxLength];
        }
    }
}
