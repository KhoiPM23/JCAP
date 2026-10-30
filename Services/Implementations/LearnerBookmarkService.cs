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
    public class LearnerBookmarkService : ILearnerBookmarkService
    {
        private readonly AppDbContext _db;

        public LearnerBookmarkService(AppDbContext db)
        {
            _db = db;
        }

        public async Task<ApiResponse<ToggleBookmarkResponseDto>> ToggleBookmarkAsync(string userId, ToggleBookmarkRequestDto request)
        {
            bool hasVocab = request.VocabularyId.HasValue && request.VocabularyId.Value > 0;
            bool hasGrammar = request.GrammarId.HasValue && request.GrammarId.Value > 0;

            if (hasVocab == hasGrammar)
            {
                return ApiResponse<ToggleBookmarkResponseDto>.Fail(
                    "Vui lòng chỉ định đúng một trong hai: VocabularyId hoặc GrammarId.");
            }

            if (hasVocab)
            {
                int vocabId = request.VocabularyId!.Value;
                var existing = await _db.LearnerBookmarks
                    .FirstOrDefaultAsync(b => b.UserId == userId && b.VocabularyId == vocabId);

                if (existing != null)
                {
                    _db.LearnerBookmarks.Remove(existing);
                    await _db.SaveChangesAsync();

                    return ApiResponse<ToggleBookmarkResponseDto>.Ok(new ToggleBookmarkResponseDto
                    {
                        IsBookmarked = false,
                        VocabularyId = vocabId
                    }, "Đã bỏ lưu từ vựng.");
                }

                var vocab = await _db.Vocabularies.AsNoTracking().FirstOrDefaultAsync(v => v.Id == vocabId && v.IsActive);
                if (vocab == null)
                {
                    return ApiResponse<ToggleBookmarkResponseDto>.Fail("Không tìm thấy từ vựng khả dụng.");
                }

                _db.LearnerBookmarks.Add(new LearnerBookmark
                {
                    UserId = userId,
                    VocabularyId = vocabId,
                    CreatedAt = DateTime.UtcNow
                });
                await _db.SaveChangesAsync();

                return ApiResponse<ToggleBookmarkResponseDto>.Ok(new ToggleBookmarkResponseDto
                {
                    IsBookmarked = true,
                    VocabularyId = vocabId
                }, "Đã lưu từ vựng vào danh sách.");
            }
            else
            {
                int grammarId = request.GrammarId!.Value;
                var existing = await _db.LearnerBookmarks
                    .FirstOrDefaultAsync(b => b.UserId == userId && b.GrammarId == grammarId);

                if (existing != null)
                {
                    _db.LearnerBookmarks.Remove(existing);
                    await _db.SaveChangesAsync();

                    return ApiResponse<ToggleBookmarkResponseDto>.Ok(new ToggleBookmarkResponseDto
                    {
                        IsBookmarked = false,
                        GrammarId = grammarId
                    }, "Đã bỏ lưu mẫu ngữ pháp.");
                }

                var grammar = await _db.Grammars.AsNoTracking().FirstOrDefaultAsync(g => g.Id == grammarId && g.IsActive);
                if (grammar == null)
                {
                    return ApiResponse<ToggleBookmarkResponseDto>.Fail("Không tìm thấy mẫu ngữ pháp khả dụng.");
                }

                _db.LearnerBookmarks.Add(new LearnerBookmark
                {
                    UserId = userId,
                    GrammarId = grammarId,
                    CreatedAt = DateTime.UtcNow
                });
                await _db.SaveChangesAsync();

                return ApiResponse<ToggleBookmarkResponseDto>.Ok(new ToggleBookmarkResponseDto
                {
                    IsBookmarked = true,
                    GrammarId = grammarId
                }, "Đã lưu mẫu ngữ pháp vào danh sách.");
            }
        }

        public async Task<ApiResponse<BookmarkListResponseDto>> GetBookmarksAsync(
            string userId,
            string? itemType = null,
            string? jlptLevel = null,
            string? keyword = null)
        {
            var nowUtc = DateTime.UtcNow;

            var bookmarks = await _db.LearnerBookmarks
                .AsNoTracking()
                .Include(b => b.Vocabulary)
                .Include(b => b.Grammar)
                .Where(b => b.UserId == userId &&
                    ((b.Vocabulary != null && b.Vocabulary.IsActive) || (b.Grammar != null && b.Grammar.IsActive)))
                .OrderByDescending(b => b.CreatedAt)
                .ToListAsync();

            var progresses = await _db.LearnerFlashcardProgresses
                .AsNoTracking()
                .Where(p => p.UserId == userId)
                .ToListAsync();

            var vocabProgressMap = progresses
                .Where(p => p.VocabularyId.HasValue)
                .ToDictionary(p => p.VocabularyId!.Value, p => p);

            var grammarProgressMap = progresses
                .Where(p => p.GrammarId.HasValue)
                .ToDictionary(p => p.GrammarId!.Value, p => p);

            var items = new List<BookmarkItemDto>();

            foreach (var b in bookmarks)
            {
                if (b.VocabularyId.HasValue && b.Vocabulary != null)
                {
                    var v = b.Vocabulary;
                    vocabProgressMap.TryGetValue(v.Id, out var prog);
                    string srsState = prog == null ? "New" : (prog.NextReviewAt <= nowUtc ? "Due" : "Learning");

                    items.Add(new BookmarkItemDto
                    {
                        BookmarkId = b.Id,
                        ItemType = FlashcardContentType.Vocabulary,
                        ItemId = v.Id,
                        FrontText = v.Word,
                        ReadingOrFormation = v.Reading,
                        Meaning = v.Meaning,
                        PartOfSpeech = v.PartOfSpeech,
                        Explanation = v.Explanation,
                        AudioUrl = v.AudioUrl,
                        JLPTLevel = v.JLPTLevel ?? "N5",
                        IsAvailable = v.IsActive,
                        SrsState = srsState,
                        IntervalDays = prog?.IntervalDays ?? 0,
                        NextReviewAt = prog?.NextReviewAt,
                        BookmarkedAt = b.CreatedAt
                    });
                }
                else if (b.GrammarId.HasValue && b.Grammar != null)
                {
                    var g = b.Grammar;
                    grammarProgressMap.TryGetValue(g.Id, out var prog);
                    string srsState = prog == null ? "New" : (prog.NextReviewAt <= nowUtc ? "Due" : "Learning");

                    items.Add(new BookmarkItemDto
                    {
                        BookmarkId = b.Id,
                        ItemType = FlashcardContentType.Grammar,
                        ItemId = g.Id,
                        FrontText = g.Pattern,
                        ReadingOrFormation = g.Formation,
                        Meaning = g.Meaning,
                        Explanation = g.Explanation,
                        ExampleSentence = g.ExampleSentence,
                        JLPTLevel = g.JLPTLevel ?? "N5",
                        IsAvailable = g.IsActive,
                        SrsState = srsState,
                        IntervalDays = prog?.IntervalDays ?? 0,
                        NextReviewAt = prog?.NextReviewAt,
                        BookmarkedAt = b.CreatedAt
                    });
                }
            }

            if (!string.IsNullOrWhiteSpace(itemType) &&
                !string.Equals(itemType, "All", StringComparison.OrdinalIgnoreCase))
            {
                items = items
                    .Where(i => string.Equals(i.ItemType, itemType.Trim(), StringComparison.OrdinalIgnoreCase))
                    .ToList();
            }

            if (!string.IsNullOrWhiteSpace(jlptLevel) &&
                !string.Equals(jlptLevel, "All", StringComparison.OrdinalIgnoreCase))
            {
                items = items
                    .Where(i => string.Equals(i.JLPTLevel, jlptLevel.Trim(), StringComparison.OrdinalIgnoreCase))
                    .ToList();
            }

            if (!string.IsNullOrWhiteSpace(keyword))
            {
                string kw = keyword.Trim();
                items = items
                    .Where(i =>
                        i.FrontText.Contains(kw, StringComparison.OrdinalIgnoreCase) ||
                        i.Meaning.Contains(kw, StringComparison.OrdinalIgnoreCase) ||
                        (i.ReadingOrFormation != null && i.ReadingOrFormation.Contains(kw, StringComparison.OrdinalIgnoreCase)))
                    .ToList();
            }

            // Sắp xếp nội dung còn khả dụng lên trên, nội dung bị ẩn xuống dưới
            items = items
                .OrderByDescending(i => i.IsAvailable)
                .ThenByDescending(i => i.BookmarkedAt)
                .ToList();

            int dueCount = items.Count(i => i.IsAvailable && i.SrsState == "Due");
            int newCount = items.Count(i => i.IsAvailable && i.SrsState == "New");

            return ApiResponse<BookmarkListResponseDto>.Ok(new BookmarkListResponseDto
            {
                Items = items,
                TotalCount = items.Count,
                DueCount = dueCount,
                NewCount = newCount
            });
        }
    }
}
