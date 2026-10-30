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
using Microsoft.Extensions.Options;

namespace JCAP.Services.Implementations
{
    public class LearnerFlashcardService : ILearnerFlashcardService
    {
        private static readonly TimeSpan VietnamOffset = TimeSpan.FromHours(7);

        private readonly AppDbContext _db;
        private readonly ISrsCalculationService _srs;
        private readonly ILearningTopicLookup _topicLookup;
        private readonly FlashcardQuotaOptions _options;

        public LearnerFlashcardService(
            AppDbContext db,
            ISrsCalculationService srs,
            ILearningTopicLookup topicLookup,
            IOptions<FlashcardQuotaOptions> options)
        {
            _db = db;
            _srs = srs;
            _topicLookup = topicLookup;
            _options = options.Value;
        }

        public static (DateOnly DateVn, DateTime StartUtc, DateTime EndUtc) GetVietnamDayWindow(DateTime nowUtc)
        {
            var vnNow = nowUtc.Add(VietnamOffset);
            var dateVn = DateOnly.FromDateTime(vnNow);
            var startVn = dateVn.ToDateTime(TimeOnly.MinValue);
            var startUtc = DateTime.SpecifyKind(startVn.Subtract(VietnamOffset), DateTimeKind.Utc);
            var endUtc = startUtc.AddDays(1);
            return (dateVn, startUtc, endUtc);
        }

        public async Task<ApiResponse<FlashcardQuotaDto>> GetDailyQuotaAsync(string userId)
        {
            var quota = await BuildQuotaDtoAsync(userId, DateTime.UtcNow);
            if (quota == null)
            {
                return ApiResponse<FlashcardQuotaDto>.Fail("Không tìm thấy thông tin người dùng.");
            }
            return ApiResponse<FlashcardQuotaDto>.Ok(quota);
        }

        public async Task<ApiResponse<FlashcardQuotaDto>> UnlockExtraQuotaAsync(string userId)
        {
            var nowUtc = DateTime.UtcNow;
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null)
            {
                return ApiResponse<FlashcardQuotaDto>.Fail("Không tìm thấy tài khoản học viên.");
            }

            int cost = _options.UnlockCreditCost;
            int batchSize = _options.UnlockBatchSize;
            bool hasActiveSub = user.SubscriptionExpiresAt.HasValue && user.SubscriptionExpiresAt.Value > nowUtc;

            if (user.CreditBalance < cost)
            {
                return ApiResponse<FlashcardQuotaDto>.Fail(
                    $"Số dư Credit không đủ ({user.CreditBalance}/{cost} Credits). Vui lòng nạp thêm Credit để mở khóa thêm {batchSize} thẻ mới.");
            }

            user.CreditBalance -= cost;

            _db.CreditTransactions.Add(new CreditTransaction
            {
                UserId = userId,
                Amount = -cost,
                Type = "Deduct",
                Status = "Paid",
                Description = hasActiveSub
                    ? $"[Gói tháng] Mở thêm {batchSize} thẻ Flashcard mới trong ngày"
                    : $"Mở thêm {batchSize} thẻ Flashcard mới trong ngày",
                CreatedAt = nowUtc
            });

            var (dateVn, _, _) = GetVietnamDayWindow(nowUtc);
            var dailyQuota = await _db.LearnerDailyFlashcardQuotas
                .FirstOrDefaultAsync(q => q.UserId == userId && q.DateVn == dateVn);

            if (dailyQuota == null)
            {
                dailyQuota = new LearnerDailyFlashcardQuota
                {
                    UserId = userId,
                    DateVn = dateVn,
                    ExtraUnlockedCards = batchSize,
                    UpdatedAt = nowUtc
                };
                _db.LearnerDailyFlashcardQuotas.Add(dailyQuota);
            }
            else
            {
                dailyQuota.ExtraUnlockedCards += batchSize;
                dailyQuota.UpdatedAt = nowUtc;
            }

            await _db.SaveChangesAsync();

            var updatedQuota = await BuildQuotaDtoAsync(userId, nowUtc);
            return ApiResponse<FlashcardQuotaDto>.Ok(
                updatedQuota!,
                $"Đã mở thêm {batchSize} thẻ mới hôm nay (-{cost} Credits).");
        }

        public async Task<ApiResponse<List<FlashcardSetSummaryDto>>> GetFlashcardSetsAsync(
            string userId,
            string? contentType = null,
            string? jlptLevel = null,
            string? keyword = null)
        {
            var nowUtc = DateTime.UtcNow;
            var topics = await _topicLookup.GetActiveTopicsAsync(jlptLevel, keyword);

            var progresses = await _db.LearnerFlashcardProgresses
                .AsNoTracking()
                .Where(p => p.UserId == userId)
                .ToListAsync();

            var vocabProgMap = progresses
                .Where(p => p.VocabularyId.HasValue)
                .ToDictionary(p => p.VocabularyId!.Value, p => p);

            var grammarProgMap = progresses
                .Where(p => p.GrammarId.HasValue)
                .ToDictionary(p => p.GrammarId!.Value, p => p);

            bool includeVocab = string.IsNullOrWhiteSpace(contentType) ||
                                string.Equals(contentType, "All", StringComparison.OrdinalIgnoreCase) ||
                                string.Equals(contentType, FlashcardContentType.Vocabulary, StringComparison.OrdinalIgnoreCase);

            bool includeGrammar = string.IsNullOrWhiteSpace(contentType) ||
                                 string.Equals(contentType, "All", StringComparison.OrdinalIgnoreCase) ||
                                 string.Equals(contentType, FlashcardContentType.Grammar, StringComparison.OrdinalIgnoreCase);

            var sets = new List<FlashcardSetSummaryDto>();

            foreach (var topic in topics)
            {
                if (includeVocab && topic.Vocabularies.Count > 0)
                {
                    int learned = 0;
                    int due = 0;
                    DateTime? nextDue = null;

                    foreach (var v in topic.Vocabularies)
                    {
                        if (vocabProgMap.TryGetValue(v.Id, out var p))
                        {
                            learned++;
                            if (p.NextReviewAt <= nowUtc)
                            {
                                due++;
                            }
                            else if (!nextDue.HasValue || p.NextReviewAt < nextDue.Value)
                            {
                                nextDue = p.NextReviewAt;
                            }
                        }
                    }

                    sets.Add(new FlashcardSetSummaryDto
                    {
                        TopicId = topic.TopicId,
                        TopicTitle = topic.Title,
                        TopicDescription = topic.Description,
                        JLPTLevel = topic.JLPTLevel,
                        ContentType = FlashcardContentType.Vocabulary,
                        SetTitle = $"Từ vựng – {topic.Title}",
                        TotalCards = topic.Vocabularies.Count,
                        LearnedCards = learned,
                        DueCards = due,
                        NewCards = topic.Vocabularies.Count - learned,
                        NextDueAt = nextDue
                    });
                }

                if (includeGrammar && topic.Grammars.Count > 0)
                {
                    int learned = 0;
                    int due = 0;
                    DateTime? nextDue = null;

                    foreach (var g in topic.Grammars)
                    {
                        if (grammarProgMap.TryGetValue(g.Id, out var p))
                        {
                            learned++;
                            if (p.NextReviewAt <= nowUtc)
                            {
                                due++;
                            }
                            else if (!nextDue.HasValue || p.NextReviewAt < nextDue.Value)
                            {
                                nextDue = p.NextReviewAt;
                            }
                        }
                    }

                    sets.Add(new FlashcardSetSummaryDto
                    {
                        TopicId = topic.TopicId,
                        TopicTitle = topic.Title,
                        TopicDescription = topic.Description,
                        JLPTLevel = topic.JLPTLevel,
                        ContentType = FlashcardContentType.Grammar,
                        SetTitle = $"Ngữ pháp – {topic.Title}",
                        TotalCards = topic.Grammars.Count,
                        LearnedCards = learned,
                        DueCards = due,
                        NewCards = topic.Grammars.Count - learned,
                        NextDueAt = nextDue
                    });
                }
            }

            return ApiResponse<List<FlashcardSetSummaryDto>>.Ok(sets);
        }

        public async Task<ApiResponse<FlashcardSetDetailDto>> GetFlashcardSetDetailAsync(
            string userId,
            int topicId,
            string contentType)
        {
            var nowUtc = DateTime.UtcNow;
            var topic = await _topicLookup.GetActiveTopicByIdAsync(topicId);
            if (topic == null)
            {
                return ApiResponse<FlashcardSetDetailDto>.Fail("Không tìm thấy chủ đề bộ thẻ.");
            }

            bool isGrammar = string.Equals(contentType, FlashcardContentType.Grammar, StringComparison.OrdinalIgnoreCase);
            string normalizedType = isGrammar ? FlashcardContentType.Grammar : FlashcardContentType.Vocabulary;

            var bookmarks = await _db.LearnerBookmarks
                .AsNoTracking()
                .Where(b => b.UserId == userId)
                .ToListAsync();

            var bookmarkedVocabIds = bookmarks.Where(b => b.VocabularyId.HasValue).Select(b => b.VocabularyId!.Value).ToHashSet();
            var bookmarkedGrammarIds = bookmarks.Where(b => b.GrammarId.HasValue).Select(b => b.GrammarId!.Value).ToHashSet();

            var progresses = await _db.LearnerFlashcardProgresses
                .AsNoTracking()
                .Where(p => p.UserId == userId)
                .ToListAsync();

            var vocabProgMap = progresses.Where(p => p.VocabularyId.HasValue).ToDictionary(p => p.VocabularyId!.Value, p => p);
            var grammarProgMap = progresses.Where(p => p.GrammarId.HasValue).ToDictionary(p => p.GrammarId!.Value, p => p);

            var cards = new List<FlashcardCardItemDto>();
            DateTime? nextDue = null;

            if (!isGrammar)
            {
                foreach (var v in topic.Vocabularies)
                {
                    vocabProgMap.TryGetValue(v.Id, out var prog);
                    if (prog != null && prog.NextReviewAt > nowUtc && (!nextDue.HasValue || prog.NextReviewAt < nextDue.Value))
                    {
                        nextDue = prog.NextReviewAt;
                    }
                    cards.Add(MapVocabularyCard(v, prog, bookmarkedVocabIds.Contains(v.Id), nowUtc));
                }
            }
            else
            {
                foreach (var g in topic.Grammars)
                {
                    grammarProgMap.TryGetValue(g.Id, out var prog);
                    if (prog != null && prog.NextReviewAt > nowUtc && (!nextDue.HasValue || prog.NextReviewAt < nextDue.Value))
                    {
                        nextDue = prog.NextReviewAt;
                    }
                    cards.Add(MapGrammarCard(g, prog, bookmarkedGrammarIds.Contains(g.Id), nowUtc));
                }
            }

            int learnedCount = cards.Count(c => c.SrsState != "New");
            int dueCount = cards.Count(c => c.SrsState == "Due");

            var detail = new FlashcardSetDetailDto
            {
                Summary = new FlashcardSetSummaryDto
                {
                    TopicId = topic.TopicId,
                    TopicTitle = topic.Title,
                    TopicDescription = topic.Description,
                    JLPTLevel = topic.JLPTLevel,
                    ContentType = normalizedType,
                    SetTitle = isGrammar ? $"Ngữ pháp – {topic.Title}" : $"Từ vựng – {topic.Title}",
                    TotalCards = cards.Count,
                    LearnedCards = learnedCount,
                    DueCards = dueCount,
                    NewCards = cards.Count - learnedCount,
                    NextDueAt = nextDue
                },
                Cards = cards
            };

            return ApiResponse<FlashcardSetDetailDto>.Ok(detail);
        }

        public async Task<ApiResponse<FlashcardSessionDto>> StartSessionAsync(
            string userId,
            StartFlashcardSessionRequestDto request)
        {
            var nowUtc = DateTime.UtcNow;
            var quota = await BuildQuotaDtoAsync(userId, nowUtc);
            if (quota == null)
            {
                return ApiResponse<FlashcardSessionDto>.Fail("Không tìm thấy thông tin người dùng.");
            }

            var bookmarks = await _db.LearnerBookmarks
                .AsNoTracking()
                .Include(b => b.Vocabulary)
                .Include(b => b.Grammar)
                .Where(b => b.UserId == userId)
                .ToListAsync();

            var bookmarkedVocabIds = bookmarks.Where(b => b.VocabularyId.HasValue).Select(b => b.VocabularyId!.Value).ToHashSet();
            var bookmarkedGrammarIds = bookmarks.Where(b => b.GrammarId.HasValue).Select(b => b.GrammarId!.Value).ToHashSet();

            var progresses = await _db.LearnerFlashcardProgresses
                .AsNoTracking()
                .Where(p => p.UserId == userId)
                .ToListAsync();

            var vocabProgMap = progresses.Where(p => p.VocabularyId.HasValue).ToDictionary(p => p.VocabularyId!.Value, p => p);
            var grammarProgMap = progresses.Where(p => p.GrammarId.HasValue).ToDictionary(p => p.GrammarId!.Value, p => p);

            var candidateCards = new List<FlashcardCardItemDto>();
            string setTitle;
            string sourceType;
            string contentType;
            int? topicId = null;

            bool isBookmarkSource = string.Equals(request.SourceType, FlashcardSessionSource.Bookmark, StringComparison.OrdinalIgnoreCase);

            if (isBookmarkSource)
            {
                sourceType = FlashcardSessionSource.Bookmark;
                contentType = string.IsNullOrWhiteSpace(request.ContentType) || string.Equals(request.ContentType, "All", StringComparison.OrdinalIgnoreCase)
                    ? FlashcardContentType.Mixed
                    : request.ContentType;
                setTitle = "Nội dung đã lưu (Bookmark)";

                foreach (var b in bookmarks)
                {
                    if (b.VocabularyId.HasValue && b.Vocabulary != null && b.Vocabulary.IsActive)
                    {
                        if (contentType == FlashcardContentType.Grammar) continue;
                        if (!string.IsNullOrWhiteSpace(request.JLPTLevelFilter) &&
                            !string.Equals(request.JLPTLevelFilter, "All", StringComparison.OrdinalIgnoreCase) &&
                            !string.Equals(b.Vocabulary.JLPTLevel ?? "N5", request.JLPTLevelFilter, StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        vocabProgMap.TryGetValue(b.Vocabulary.Id, out var prog);
                        candidateCards.Add(MapVocabularyCard(b.Vocabulary, prog, true, nowUtc));
                    }
                    else if (b.GrammarId.HasValue && b.Grammar != null && b.Grammar.IsActive)
                    {
                        if (contentType == FlashcardContentType.Vocabulary) continue;
                        if (!string.IsNullOrWhiteSpace(request.JLPTLevelFilter) &&
                            !string.Equals(request.JLPTLevelFilter, "All", StringComparison.OrdinalIgnoreCase) &&
                            !string.Equals(b.Grammar.JLPTLevel ?? "N5", request.JLPTLevelFilter, StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        grammarProgMap.TryGetValue(b.Grammar.Id, out var prog);
                        candidateCards.Add(MapGrammarCard(b.Grammar, prog, true, nowUtc));
                    }
                }
            }
            else
            {
                if (!request.TopicId.HasValue)
                {
                    return ApiResponse<FlashcardSessionDto>.Fail("Vui lòng chọn chủ đề để bắt đầu ôn tập.");
                }

                var topic = await _topicLookup.GetActiveTopicByIdAsync(request.TopicId.Value);
                if (topic == null)
                {
                    return ApiResponse<FlashcardSessionDto>.Fail("Không tìm thấy chủ đề bộ thẻ khả dụng.");
                }

                sourceType = FlashcardSessionSource.TopicSet;
                topicId = topic.TopicId;
                bool isGrammar = string.Equals(request.ContentType, FlashcardContentType.Grammar, StringComparison.OrdinalIgnoreCase);
                contentType = isGrammar ? FlashcardContentType.Grammar : FlashcardContentType.Vocabulary;
                setTitle = isGrammar ? $"Ngữ pháp – {topic.Title}" : $"Từ vựng – {topic.Title}";

                if (!isGrammar)
                {
                    foreach (var v in topic.Vocabularies)
                    {
                        vocabProgMap.TryGetValue(v.Id, out var prog);
                        candidateCards.Add(MapVocabularyCard(v, prog, bookmarkedVocabIds.Contains(v.Id), nowUtc));
                    }
                }
                else
                {
                    foreach (var g in topic.Grammars)
                    {
                        grammarProgMap.TryGetValue(g.Id, out var prog);
                        candidateCards.Add(MapGrammarCard(g, prog, bookmarkedGrammarIds.Contains(g.Id), nowUtc));
                    }
                }
            }

            if (candidateCards.Count == 0)
            {
                return ApiResponse<FlashcardSessionDto>.Fail("Không có thẻ khả dụng để ôn tập trong bộ này.");
            }

            int maxSession = Math.Max(1, _options.MaxCardsPerSession);
            var selectedCards = new List<FlashcardCardItemDto>();
            DateTime? nextDueWhenEmpty = candidateCards
                .Where(c => c.NextReviewAt.HasValue && c.NextReviewAt.Value > nowUtc)
                .OrderBy(c => c.NextReviewAt)
                .Select(c => c.NextReviewAt)
                .FirstOrDefault();

            if (request.IsExtraPractice)
            {
                // Chế độ "Ôn thêm" (luyện tự do): lấy tối đa 20 thẻ, ưu tiên thẻ có khoảng cách ngắn hơn
                selectedCards = candidateCards
                    .OrderBy(c => c.IntervalDays)
                    .ThenBy(c => c.ItemId)
                    .Take(maxSession)
                    .ToList();
            }
            else
            {
                var dueCards = candidateCards
                    .Where(c => c.SrsState == "Due")
                    .OrderBy(c => c.NextReviewAt)
                    .ToList();

                selectedCards.AddRange(dueCards.Take(maxSession));

                if (selectedCards.Count < maxSession && quota.RemainingNewCardsToday > 0)
                {
                    int remainingSlots = Math.Min(maxSession - selectedCards.Count, quota.RemainingNewCardsToday);
                    var newCards = candidateCards
                        .Where(c => c.SrsState == "New")
                        .Take(remainingSlots)
                        .ToList();

                    selectedCards.AddRange(newCards);
                }
            }

            int sessionId = 0;
            if (selectedCards.Count > 0)
            {
                var session = new FlashcardStudySession
                {
                    UserId = userId,
                    SourceType = sourceType,
                    TopicId = topicId,
                    SetTitleSnapshot = setTitle,
                    ContentType = contentType,
                    IsExtraPractice = request.IsExtraPractice,
                    StartedAt = nowUtc,
                    TotalCards = selectedCards.Count
                };
                _db.FlashcardStudySessions.Add(session);
                await _db.SaveChangesAsync();
                sessionId = session.Id;
            }

            return ApiResponse<FlashcardSessionDto>.Ok(new FlashcardSessionDto
            {
                SessionId = sessionId,
                SourceType = sourceType,
                TopicId = topicId,
                SetTitle = setTitle,
                ContentType = contentType,
                IsExtraPractice = request.IsExtraPractice,
                StartedAt = nowUtc,
                Cards = selectedCards,
                Quota = quota,
                NextDueAtWhenEmpty = nextDueWhenEmpty,
                TotalEligibleInSource = candidateCards.Count
            });
        }

        public async Task<ApiResponse<FlashcardReviewResultDto>> SubmitCardReviewAsync(
            string userId,
            int sessionId,
            SubmitFlashcardReviewRequestDto request)
        {
            var nowUtc = DateTime.UtcNow;

            var session = await _db.FlashcardStudySessions
                .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId);

            if (session == null)
            {
                return ApiResponse<FlashcardReviewResultDto>.Fail("Không tìm thấy phiên ôn tập Flashcard.");
            }

            bool hasVocab = request.VocabularyId.HasValue && request.VocabularyId.Value > 0;
            bool hasGrammar = request.GrammarId.HasValue && request.GrammarId.Value > 0;
            if (hasVocab == hasGrammar)
            {
                return ApiResponse<FlashcardReviewResultDto>.Fail("Vui lòng chỉ định đúng một trong hai: VocabularyId hoặc GrammarId.");
            }

            string normalizedRating = NormalizeRating(request.Rating);

            string itemType;
            int itemId;
            string frontSnapshot;
            string meaningSnapshot;
            LearnerFlashcardProgress? progress;

            if (hasVocab)
            {
                itemId = request.VocabularyId!.Value;
                itemType = FlashcardContentType.Vocabulary;
                var vocab = await _db.Vocabularies.AsNoTracking().FirstOrDefaultAsync(v => v.Id == itemId);
                if (vocab == null || !vocab.IsActive)
                {
                    return ApiResponse<FlashcardReviewResultDto>.Fail("Không tìm thấy từ vựng.");
                }
                frontSnapshot = vocab.Word;
                meaningSnapshot = vocab.Meaning;
                progress = await _db.LearnerFlashcardProgresses
                    .FirstOrDefaultAsync(p => p.UserId == userId && p.VocabularyId == itemId);
            }
            else
            {
                itemId = request.GrammarId!.Value;
                itemType = FlashcardContentType.Grammar;
                var grammar = await _db.Grammars.AsNoTracking().FirstOrDefaultAsync(g => g.Id == itemId);
                if (grammar == null || !grammar.IsActive)
                {
                    return ApiResponse<FlashcardReviewResultDto>.Fail("Không tìm thấy mẫu ngữ pháp.");
                }
                frontSnapshot = grammar.Pattern;
                meaningSnapshot = grammar.Meaning;
                progress = await _db.LearnerFlashcardProgresses
                    .FirstOrDefaultAsync(p => p.UserId == userId && p.GrammarId == itemId);
            }

            int intervalBefore = progress?.IntervalDays ?? 0;
            bool isNewCard = progress == null && !session.IsExtraPractice;
            int intervalAfter = intervalBefore;
            DateTime nextReviewAt = progress?.NextReviewAt ?? nowUtc;
            SrsIntervalPreviewDto nextPreview;

            if (!session.IsExtraPractice)
            {
                var calc = _srs.CalculateNextReview(
                    progress?.Repetitions ?? 0,
                    progress?.IntervalDays ?? 0,
                    progress?.EaseFactor ?? SrsCalculationService.DefaultEaseFactor,
                    normalizedRating,
                    nowUtc);

                intervalAfter = calc.IntervalDays;
                nextReviewAt = calc.NextReviewAt;

                if (progress == null)
                {
                    progress = new LearnerFlashcardProgress
                    {
                        UserId = userId,
                        VocabularyId = hasVocab ? itemId : null,
                        GrammarId = hasGrammar ? itemId : null,
                        Repetitions = calc.Repetitions,
                        IntervalDays = calc.IntervalDays,
                        EaseFactor = calc.EaseFactor,
                        NextReviewAt = calc.NextReviewAt,
                        LastReviewedAt = nowUtc,
                        LastRating = normalizedRating,
                        CreatedAt = nowUtc
                    };
                    _db.LearnerFlashcardProgresses.Add(progress);
                }
                else
                {
                    progress.Repetitions = calc.Repetitions;
                    progress.IntervalDays = calc.IntervalDays;
                    progress.EaseFactor = calc.EaseFactor;
                    progress.NextReviewAt = calc.NextReviewAt;
                    progress.LastReviewedAt = nowUtc;
                    progress.LastRating = normalizedRating;
                }

                nextPreview = _srs.PreviewIntervals(calc.Repetitions, calc.IntervalDays, calc.EaseFactor);
            }
            else
            {
                nextPreview = _srs.PreviewIntervals(
                    progress?.Repetitions ?? 0,
                    progress?.IntervalDays ?? 0,
                    progress?.EaseFactor ?? SrsCalculationService.DefaultEaseFactor);
            }

            // Kiểm tra số lần thẻ này đã bị đánh giá Again trong phiên hiện tại (tối đa 2 lần lặp lại trong phiên)
            int previousAgainInSession = 0;
            if (normalizedRating == FlashcardRating.Again)
            {
                previousAgainInSession = await _db.FlashcardReviewLogs
                    .CountAsync(l =>
                        l.SessionId == session.Id &&
                        l.Rating == FlashcardRating.Again &&
                        ((hasVocab && l.VocabularyId == itemId) || (hasGrammar && l.GrammarId == itemId)));
            }

            // Cập nhật bộ đếm của phiên
            if (normalizedRating == FlashcardRating.Again) session.AgainCount++;
            else if (normalizedRating == FlashcardRating.Easy) session.EasyCount++;
            else session.GoodCount++;

            _db.FlashcardReviewLogs.Add(new FlashcardReviewLog
            {
                SessionId = session.Id,
                UserId = userId,
                VocabularyId = hasVocab ? itemId : null,
                GrammarId = hasGrammar ? itemId : null,
                FrontTextSnapshot = frontSnapshot,
                MeaningSnapshot = meaningSnapshot,
                Rating = normalizedRating,
                IsNewCard = isNewCard,
                IntervalBefore = intervalBefore,
                IntervalAfter = intervalAfter,
                ReviewedAt = nowUtc
            });

            await _db.SaveChangesAsync();

            // Cho phép quay lại hàng đợi tối đa 2 lần (lần 1 và lần 2 chọn Again). Lần thứ 3 chọn Again sẽ đánh dấu Leech, không lặp lại nữa.
            bool shouldRequeue = normalizedRating == FlashcardRating.Again && previousAgainInSession < 2;

            return ApiResponse<FlashcardReviewResultDto>.Ok(new FlashcardReviewResultDto
            {
                SessionId = session.Id,
                ItemType = itemType,
                ItemId = itemId,
                Rating = normalizedRating,
                IntervalBefore = intervalBefore,
                IntervalAfter = intervalAfter,
                NextReviewAt = nextReviewAt,
                RequeueInSession = shouldRequeue,
                NextIntervalPreview = nextPreview
            });
        }

        public async Task<ApiResponse<CompleteFlashcardSessionResponseDto>> CompleteSessionAsync(
            string userId,
            int sessionId)
        {
            var nowUtc = DateTime.UtcNow;
            var session = await _db.FlashcardStudySessions
                .Include(s => s.ReviewLogs).ThenInclude(l => l.Vocabulary)
                .Include(s => s.ReviewLogs).ThenInclude(l => l.Grammar)
                .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId);

            if (session == null)
            {
                return ApiResponse<CompleteFlashcardSessionResponseDto>.Fail("Không tìm thấy phiên ôn tập.");
            }

            if (!session.EndedAt.HasValue)
            {
                session.EndedAt = nowUtc;
                session.TotalCards = session.ReviewLogs.Count;
                await _db.SaveChangesAsync();
            }

            var endedAt = session.EndedAt.Value;
            int durationSec = Math.Max(1, (int)(endedAt - session.StartedAt).TotalSeconds);

            var difficultItems = session.ReviewLogs
                .Where(l => (l.Vocabulary != null && l.Vocabulary.IsActive) || (l.Grammar != null && l.Grammar.IsActive))
                .Where(l => l.Rating == FlashcardRating.Again)
                .GroupBy(l => new { l.VocabularyId, l.GrammarId })
                .Select(g => g.OrderByDescending(x => x.ReviewedAt).First())
                .Select(MapReviewLogDto)
                .ToList();

            return ApiResponse<CompleteFlashcardSessionResponseDto>.Ok(new CompleteFlashcardSessionResponseDto
            {
                SessionId = session.Id,
                SetTitle = session.SetTitleSnapshot,
                StartedAt = session.StartedAt,
                EndedAt = endedAt,
                DurationSeconds = durationSec,
                TotalReviewed = session.ReviewLogs.Count,
                AgainCount = session.AgainCount,
                GoodCount = session.GoodCount,
                EasyCount = session.EasyCount,
                DifficultItems = difficultItems
            });
        }

        public async Task<ApiResponse<List<FlashcardSessionHistoryItemDto>>> GetSessionHistoryAsync(string userId)
        {
            var sessions = await _db.FlashcardStudySessions
                .AsNoTracking()
                .Where(s => s.UserId == userId && (s.AgainCount + s.GoodCount + s.EasyCount) > 0)
                .OrderByDescending(s => s.StartedAt)
                .Take(100)
                .ToListAsync();

            var items = sessions.Select(MapSessionHistoryItemDto).ToList();
            return ApiResponse<List<FlashcardSessionHistoryItemDto>>.Ok(items);
        }

        public async Task<ApiResponse<FlashcardSessionHistoryDetailDto>> GetSessionHistoryDetailAsync(string userId, int sessionId)
        {
            var session = await _db.FlashcardStudySessions
                .AsNoTracking()
                .Include(s => s.ReviewLogs).ThenInclude(l => l.Vocabulary)
                .Include(s => s.ReviewLogs).ThenInclude(l => l.Grammar)
                .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId);

            if (session == null)
            {
                return ApiResponse<FlashcardSessionHistoryDetailDto>.Fail("Không tìm thấy lịch sử phiên ôn tập.");
            }

            var logs = session.ReviewLogs
                .Where(l => (l.Vocabulary != null && l.Vocabulary.IsActive) || (l.Grammar != null && l.Grammar.IsActive))
                .OrderBy(l => l.ReviewedAt)
                .ThenBy(l => l.Id)
                .Select(MapReviewLogDto)
                .ToList();

            return ApiResponse<FlashcardSessionHistoryDetailDto>.Ok(new FlashcardSessionHistoryDetailDto
            {
                Session = MapSessionHistoryItemDto(session),
                Logs = logs
            });
        }

        private async Task<FlashcardQuotaDto?> BuildQuotaDtoAsync(string userId, DateTime nowUtc)
        {
            var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return null;

            var (dateVn, startUtc, endUtc) = GetVietnamDayWindow(nowUtc);

            int studiedNewToday = await _db.FlashcardReviewLogs
                .AsNoTracking()
                .CountAsync(l => l.UserId == userId && l.IsNewCard && l.ReviewedAt >= startUtc && l.ReviewedAt < endUtc);

            var dailyQuota = await _db.LearnerDailyFlashcardQuotas
                .AsNoTracking()
                .FirstOrDefaultAsync(q => q.UserId == userId && q.DateVn == dateVn);

            int extraUnlocked = dailyQuota?.ExtraUnlockedCards ?? 0;
            int totalAllowed = _options.FreeNewCardsPerDay + extraUnlocked;
            int remaining = Math.Max(0, totalAllowed - studiedNewToday);

            return new FlashcardQuotaDto
            {
                FreeNewCardsLimit = _options.FreeNewCardsPerDay,
                ExtraUnlockedToday = extraUnlocked,
                TotalAllowedNewCardsToday = totalAllowed,
                StudiedNewCardsToday = studiedNewToday,
                RemainingNewCardsToday = remaining,
                UnlockBatchSize = _options.UnlockBatchSize,
                UnlockCreditCost = _options.UnlockCreditCost,
                UserCreditBalance = user.CreditBalance,
                HasActiveSubscription = user.SubscriptionExpiresAt.HasValue && user.SubscriptionExpiresAt.Value > nowUtc
            };
        }

        private FlashcardCardItemDto MapVocabularyCard(
            Vocabulary v,
            LearnerFlashcardProgress? prog,
            bool isBookmarked,
            DateTime nowUtc)
        {
            string srsState = prog == null ? "New" : (prog.NextReviewAt <= nowUtc ? "Due" : "Learning");
            int reps = prog?.Repetitions ?? 0;
            int interval = prog?.IntervalDays ?? 0;
            double ease = prog?.EaseFactor ?? SrsCalculationService.DefaultEaseFactor;

            return new FlashcardCardItemDto
            {
                ItemType = FlashcardContentType.Vocabulary,
                ItemId = v.Id,
                FrontText = v.Word,
                ReadingOrFormation = v.Reading,
                Meaning = v.Meaning,
                PartOfSpeech = v.PartOfSpeech,
                Explanation = v.Explanation,
                AudioUrl = v.AudioUrl,
                JLPTLevel = v.JLPTLevel ?? "N5",
                IsBookmarked = isBookmarked,
                SrsState = srsState,
                Repetitions = reps,
                IntervalDays = interval,
                EaseFactor = ease,
                NextReviewAt = prog?.NextReviewAt,
                IntervalPreview = _srs.PreviewIntervals(reps, interval, ease)
            };
        }

        private FlashcardCardItemDto MapGrammarCard(
            Grammar g,
            LearnerFlashcardProgress? prog,
            bool isBookmarked,
            DateTime nowUtc)
        {
            string srsState = prog == null ? "New" : (prog.NextReviewAt <= nowUtc ? "Due" : "Learning");
            int reps = prog?.Repetitions ?? 0;
            int interval = prog?.IntervalDays ?? 0;
            double ease = prog?.EaseFactor ?? SrsCalculationService.DefaultEaseFactor;

            return new FlashcardCardItemDto
            {
                ItemType = FlashcardContentType.Grammar,
                ItemId = g.Id,
                FrontText = g.Pattern,
                ReadingOrFormation = g.Formation,
                Meaning = g.Meaning,
                Explanation = g.Explanation,
                ExampleSentence = g.ExampleSentence,
                JLPTLevel = g.JLPTLevel ?? "N5",
                IsBookmarked = isBookmarked,
                SrsState = srsState,
                Repetitions = reps,
                IntervalDays = interval,
                EaseFactor = ease,
                NextReviewAt = prog?.NextReviewAt,
                IntervalPreview = _srs.PreviewIntervals(reps, interval, ease)
            };
        }

        private static FlashcardSessionHistoryItemDto MapSessionHistoryItemDto(FlashcardStudySession s)
        {
            var end = s.EndedAt ?? s.StartedAt;
            int duration = Math.Max(0, (int)(end - s.StartedAt).TotalSeconds);
            return new FlashcardSessionHistoryItemDto
            {
                SessionId = s.Id,
                SourceType = s.SourceType,
                TopicId = s.TopicId,
                SetTitle = s.SetTitleSnapshot,
                ContentType = s.ContentType,
                IsExtraPractice = s.IsExtraPractice,
                StartedAt = s.StartedAt,
                EndedAt = s.EndedAt,
                DurationSeconds = duration,
                TotalCards = s.AgainCount + s.GoodCount + s.EasyCount,
                AgainCount = s.AgainCount,
                GoodCount = s.GoodCount,
                EasyCount = s.EasyCount
            };
        }

        private static FlashcardReviewLogItemDto MapReviewLogDto(FlashcardReviewLog l)
        {
            return new FlashcardReviewLogItemDto
            {
                LogId = l.Id,
                ItemType = l.VocabularyId.HasValue ? FlashcardContentType.Vocabulary : FlashcardContentType.Grammar,
                ItemId = l.VocabularyId ?? l.GrammarId ?? 0,
                FrontText = l.FrontTextSnapshot,
                Meaning = l.MeaningSnapshot,
                Rating = l.Rating,
                IsNewCard = l.IsNewCard,
                IntervalBefore = l.IntervalBefore,
                IntervalAfter = l.IntervalAfter,
                ReviewedAt = l.ReviewedAt
            };
        }

        private static string NormalizeRating(string? rating)
        {
            if (string.Equals(rating, FlashcardRating.Again, StringComparison.OrdinalIgnoreCase))
                return FlashcardRating.Again;
            if (string.Equals(rating, FlashcardRating.Easy, StringComparison.OrdinalIgnoreCase))
                return FlashcardRating.Easy;
            return FlashcardRating.Good;
        }
    }
}
