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
                var uniqueVocabs = topic.Vocabularies.GroupBy(v => v.Id).Select(g => g.First()).ToList();
                if (includeVocab && uniqueVocabs.Count > 0)
                {
                    int learned = 0;
                    int due = 0;
                    DateTime? nextDue = null;

                    foreach (var v in uniqueVocabs)
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
                        TotalCards = uniqueVocabs.Count,
                        LearnedCards = learned,
                        DueCards = due,
                        NewCards = uniqueVocabs.Count - learned,
                        NextDueAt = nextDue
                    });
                }

                var uniqueGrammars = topic.Grammars.GroupBy(g => g.Id).Select(g => g.First()).ToList();
                if (includeGrammar && uniqueGrammars.Count > 0)
                {
                    int learned = 0;
                    int due = 0;
                    DateTime? nextDue = null;

                    foreach (var g in uniqueGrammars)
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
                        TotalCards = uniqueGrammars.Count,
                        LearnedCards = learned,
                        DueCards = due,
                        NewCards = uniqueGrammars.Count - learned,
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
                foreach (var v in topic.Vocabularies.GroupBy(x => x.Id).Select(g => g.First()))
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
                foreach (var g in topic.Grammars.GroupBy(x => x.Id).Select(grp => grp.First()))
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

            bool isDueReviewSource = string.Equals(request.SourceType, FlashcardSessionSource.DueReview, StringComparison.OrdinalIgnoreCase);
            bool isBookmarkSource = string.Equals(request.SourceType, FlashcardSessionSource.Bookmark, StringComparison.OrdinalIgnoreCase);

            if (isDueReviewSource)
            {
                sourceType = FlashcardSessionSource.DueReview;
                if (string.Equals(request.ContentType, FlashcardContentType.Vocabulary, StringComparison.OrdinalIgnoreCase))
                {
                    contentType = FlashcardContentType.Vocabulary;
                    setTitle = "Ôn tập thẻ đến hạn – Từ vựng";
                }
                else if (string.Equals(request.ContentType, FlashcardContentType.Grammar, StringComparison.OrdinalIgnoreCase))
                {
                    contentType = FlashcardContentType.Grammar;
                    setTitle = "Ôn tập thẻ đến hạn – Ngữ pháp";
                }
                else
                {
                    contentType = FlashcardContentType.Mixed;
                    setTitle = "Ôn tập thẻ đến hạn – Hỗn hợp";
                }

                // Khử trùng lặp 100%: mỗi VocabularyId và GrammarId đến hạn chỉ xuất hiện đúng 1 lần duy nhất
                if (contentType != FlashcardContentType.Grammar)
                {
                    var dueVocabIds = progresses
                        .Where(p => p.VocabularyId.HasValue && p.NextReviewAt <= nowUtc)
                        .Select(p => p.VocabularyId!.Value)
                        .Distinct()
                        .ToList();

                    if (dueVocabIds.Count > 0)
                    {
                        var activeDueVocabs = await _db.Vocabularies
                            .AsNoTracking()
                            .Where(v => v.IsActive && dueVocabIds.Contains(v.Id))
                            .ToListAsync();

                        foreach (var v in activeDueVocabs)
                        {
                            if (!string.IsNullOrWhiteSpace(request.JLPTLevelFilter) &&
                                !string.Equals(request.JLPTLevelFilter, "All", StringComparison.OrdinalIgnoreCase) &&
                                !string.Equals(v.JLPTLevel ?? "N5", request.JLPTLevelFilter, StringComparison.OrdinalIgnoreCase))
                            {
                                continue;
                            }

                            vocabProgMap.TryGetValue(v.Id, out var prog);
                            candidateCards.Add(MapVocabularyCard(v, prog, bookmarkedVocabIds.Contains(v.Id), nowUtc));
                        }
                    }
                }

                if (contentType != FlashcardContentType.Vocabulary)
                {
                    var dueGrammarIds = progresses
                        .Where(p => p.GrammarId.HasValue && p.NextReviewAt <= nowUtc)
                        .Select(p => p.GrammarId!.Value)
                        .Distinct()
                        .ToList();

                    if (dueGrammarIds.Count > 0)
                    {
                        var activeDueGrammars = await _db.Grammars
                            .AsNoTracking()
                            .Where(g => g.IsActive && dueGrammarIds.Contains(g.Id))
                            .ToListAsync();

                        foreach (var g in activeDueGrammars)
                        {
                            if (!string.IsNullOrWhiteSpace(request.JLPTLevelFilter) &&
                                !string.Equals(request.JLPTLevelFilter, "All", StringComparison.OrdinalIgnoreCase) &&
                                !string.Equals(g.JLPTLevel ?? "N5", request.JLPTLevelFilter, StringComparison.OrdinalIgnoreCase))
                            {
                                continue;
                            }

                            grammarProgMap.TryGetValue(g.Id, out var prog);
                            candidateCards.Add(MapGrammarCard(g, prog, bookmarkedGrammarIds.Contains(g.Id), nowUtc));
                        }
                    }
                }

                candidateCards = candidateCards
                    .OrderBy(c => c.NextReviewAt)
                    .ThenBy(c => c.ItemType)
                    .ThenBy(c => c.ItemId)
                    .ToList();
            }
            else if (isBookmarkSource)
            {
                sourceType = FlashcardSessionSource.Bookmark;
                contentType = string.IsNullOrWhiteSpace(request.ContentType) || string.Equals(request.ContentType, "All", StringComparison.OrdinalIgnoreCase)
                    ? FlashcardContentType.Mixed
                    : request.ContentType;
                setTitle = "Nội dung đã lưu (Bookmark)";

                var seenVocabIds = new HashSet<int>();
                var seenGrammarIds = new HashSet<int>();

                foreach (var b in bookmarks)
                {
                    if (b.VocabularyId.HasValue && b.Vocabulary != null && b.Vocabulary.IsActive && seenVocabIds.Add(b.Vocabulary.Id))
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
                    else if (b.GrammarId.HasValue && b.Grammar != null && b.Grammar.IsActive && seenGrammarIds.Add(b.Grammar.Id))
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
                    foreach (var v in topic.Vocabularies.GroupBy(x => x.Id).Select(g => g.First()))
                    {
                        vocabProgMap.TryGetValue(v.Id, out var prog);
                        candidateCards.Add(MapVocabularyCard(v, prog, bookmarkedVocabIds.Contains(v.Id), nowUtc));
                    }
                }
                else
                {
                    foreach (var g in topic.Grammars.GroupBy(x => x.Id).Select(grp => grp.First()))
                    {
                        grammarProgMap.TryGetValue(g.Id, out var prog);
                        candidateCards.Add(MapGrammarCard(g, prog, bookmarkedGrammarIds.Contains(g.Id), nowUtc));
                    }
                }
            }

            if (candidateCards.Count == 0 && !isDueReviewSource)
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

            if (isDueReviewSource)
            {
                // Gom tất cả các thẻ đang đến hạn vào phiên (khi qua ngày mới số thẻ đến hạn tăng lên thì phiên cũng tự động tăng theo)
                selectedCards = candidateCards
                    .Where(c => c.SrsState == "Due")
                    .OrderBy(c => c.NextReviewAt)
                    .ThenBy(c => c.ItemType)
                    .ThenBy(c => c.ItemId)
                    .ToList();
            }
            else if (request.IsExtraPractice)
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
            bool isResumedSession = false;
            int previouslyReviewedCount = 0;

            if (selectedCards.Count > 0)
            {
                FlashcardStudySession? sessionToUse = null;

                if (!request.IsExtraPractice)
                {
                    // Kiểm tra xem có phiên đang dở (chưa hoàn thành hết thẻ) của cùng chế độ/chủ đề hay không
                    var openSessions = await _db.FlashcardStudySessions
                        .Include(s => s.ReviewLogs)
                        .Where(s =>
                            s.UserId == userId &&
                            !s.IsExtraPractice &&
                            !s.EndedAt.HasValue &&
                            s.SourceType == sourceType &&
                            s.TopicId == topicId &&
                            s.ContentType == contentType)
                        .OrderByDescending(s => s.StartedAt)
                        .ToListAsync();

                    foreach (var candidateSession in openSessions)
                    {
                        var reviewedKeys = candidateSession.ReviewLogs
                            .Select(l => l.VocabularyId.HasValue ? $"v_{l.VocabularyId}" : $"g_{l.GrammarId}")
                            .Distinct()
                            .ToHashSet();

                        // Nếu phiên cũ đã đánh giá đủ toàn bộ số thẻ mục tiêu của nó -> chốt đóng phiên cũ
                        if (reviewedKeys.Count > 0 && candidateSession.TotalCards > 0 && reviewedKeys.Count >= candidateSession.TotalCards)
                        {
                            candidateSession.EndedAt = candidateSession.ReviewLogs.Max(l => l.ReviewedAt);
                            candidateSession.TotalCards = reviewedKeys.Count;
                            continue;
                        }

                        if (sessionToUse == null)
                        {
                            sessionToUse = candidateSession;
                        }
                        else if (reviewedKeys.Count == 0)
                        {
                            // Dọn dẹp phiên rỗng dư thừa (nếu có do double-mount)
                            _db.FlashcardStudySessions.Remove(candidateSession);
                        }
                    }
                }

                if (sessionToUse != null)
                {
                    var reviewedKeys = sessionToUse.ReviewLogs
                        .Select(l => l.VocabularyId.HasValue ? $"v_{l.VocabularyId}" : $"g_{l.GrammarId}")
                        .Distinct()
                        .ToHashSet();

                    var selectedKeys = selectedCards
                        .Select(c => c.ItemType == FlashcardContentType.Vocabulary ? $"v_{c.ItemId}" : $"g_{c.ItemId}")
                        .ToHashSet();

                    previouslyReviewedCount = reviewedKeys.Count(k => !selectedKeys.Contains(k));
                    isResumedSession = previouslyReviewedCount > 0;

                    // Lôi lại phiên đang dở ra và ghi đè timestamp mới + cập nhật lại quy mô thẻ (nếu qua ngày mới có thêm thẻ đến hạn)
                    sessionToUse.StartedAt = nowUtc;
                    sessionToUse.SetTitleSnapshot = setTitle;
                    sessionToUse.TotalCards = previouslyReviewedCount + selectedCards.Count;

                    await _db.SaveChangesAsync();
                    sessionId = sessionToUse.Id;
                }
                else
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
            }

            return ApiResponse<FlashcardSessionDto>.Ok(new FlashcardSessionDto
            {
                SessionId = sessionId,
                SourceType = sourceType,
                TopicId = topicId,
                SetTitle = setTitle,
                ContentType = contentType,
                IsExtraPractice = request.IsExtraPractice,
                IsResumedSession = isResumedSession,
                PreviouslyReviewedCount = previouslyReviewedCount,
                StartedAt = DateTime.SpecifyKind(nowUtc, DateTimeKind.Utc),
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

            // Đồng bộ chéo với các phiên đang dở khác của học viên (ví dụ thoát giữa chừng phiên ôn tất cả rồi sang phiên chủ đề ôn từ đó hoặc ngược lại)
            if (!session.IsExtraPractice)
            {
                await SyncOtherIncompleteSessionsOnCardReviewedAsync(
                    userId,
                    session.Id,
                    hasVocab ? itemId : null,
                    hasGrammar ? itemId : null,
                    itemType,
                    isNewCard,
                    nowUtc);
            }

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
            int sessionId,
            bool isEarlyExit = false)
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

            int uniqueCount = session.ReviewLogs
                .Select(l => l.VocabularyId.HasValue ? ("v_" + l.VocabularyId) : ("g_" + l.GrammarId))
                .Distinct()
                .Count();

            int totalReviews = session.ReviewLogs.Count;

            // Nếu người học mở phiên lên rồi bấm thoát ngay khi chưa ôn bất kỳ thẻ nào -> xóa phiên rỗng khỏi DB
            if (uniqueCount == 0 && (session.AgainCount + session.GoodCount + session.EasyCount) == 0)
            {
                int initialTotal = session.TotalCards;
                string titleSnapshot = session.SetTitleSnapshot;
                bool extra = session.IsExtraPractice;
                DateTime started = session.StartedAt;

                _db.FlashcardStudySessions.Remove(session);
                await _db.SaveChangesAsync();

                return ApiResponse<CompleteFlashcardSessionResponseDto>.Ok(new CompleteFlashcardSessionResponseDto
                {
                    SessionId = sessionId,
                    SetTitle = titleSnapshot,
                    IsExtraPractice = extra,
                    IsEarlyExit = true,
                    StartedAt = DateTime.SpecifyKind(started, DateTimeKind.Utc),
                    EndedAt = DateTime.SpecifyKind(nowUtc, DateTimeKind.Utc),
                    DurationSeconds = 1,
                    TotalCardsInSession = initialTotal,
                    ReviewedCardsCount = 0,
                    UnreviewedCardsCount = initialTotal,
                    TotalReviewed = 0,
                    AgainCount = 0,
                    GoodCount = 0,
                    EasyCount = 0,
                    DifficultItems = new List<FlashcardReviewLogItemDto>()
                });
            }

            int totalCardsInSession = Math.Max(uniqueCount, session.TotalCards);
            bool remainIncomplete = isEarlyExit && !session.IsExtraPractice && uniqueCount < totalCardsInSession;

            if (remainIncomplete)
            {
                // Thoát phiên giữa chừng khi vẫn còn thẻ chưa ôn:
                // Giữ EndedAt = null để đánh dấu phiên chưa hoàn thành, cập nhật StartedAt = nowUtc làm mốc lần ôn gần nhất
                session.EndedAt = null;
                session.StartedAt = nowUtc;
                session.TotalCards = totalCardsInSession;
                await _db.SaveChangesAsync();
            }
            else if (!session.EndedAt.HasValue)
            {
                // Hoàn thành trọn vẹn phiên học
                session.EndedAt = nowUtc;
                if (uniqueCount > 0)
                {
                    session.TotalCards = uniqueCount;
                    totalCardsInSession = uniqueCount;
                }
                await _db.SaveChangesAsync();
            }

            var endedAt = session.EndedAt ?? nowUtc;
            var earliestLogAt = session.ReviewLogs.Count > 0
                ? session.ReviewLogs.Min(l => l.ReviewedAt)
                : session.StartedAt;
            var referenceStart = earliestLogAt < session.StartedAt ? earliestLogAt : session.StartedAt;
            int durationSec = Math.Max(1, (int)(endedAt - referenceStart).TotalSeconds);

            var difficultItems = session.ReviewLogs
                .Where(l => (l.Vocabulary != null && l.Vocabulary.IsActive) || (l.Grammar != null && l.Grammar.IsActive))
                .Where(l => l.Rating == FlashcardRating.Again)
                .GroupBy(l => new { l.VocabularyId, l.GrammarId })
                .Select(g => g.OrderByDescending(x => x.ReviewedAt).First())
                .Select(MapReviewLogDto)
                .ToList();

            int unreviewedCount = remainIncomplete ? Math.Max(0, totalCardsInSession - uniqueCount) : 0;

            return ApiResponse<CompleteFlashcardSessionResponseDto>.Ok(new CompleteFlashcardSessionResponseDto
            {
                SessionId = session.Id,
                SetTitle = session.SetTitleSnapshot,
                IsExtraPractice = session.IsExtraPractice,
                IsEarlyExit = remainIncomplete,
                StartedAt = DateTime.SpecifyKind(session.StartedAt, DateTimeKind.Utc),
                EndedAt = DateTime.SpecifyKind(endedAt, DateTimeKind.Utc),
                DurationSeconds = durationSec,
                TotalCardsInSession = totalCardsInSession,
                ReviewedCardsCount = uniqueCount,
                UnreviewedCardsCount = unreviewedCount,
                TotalReviewed = totalReviews,
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
                .Include(s => s.ReviewLogs)
                .Where(s => s.UserId == userId && (s.AgainCount + s.GoodCount + s.EasyCount) > 0)
                .OrderByDescending(s => s.StartedAt)
                .Take(100)
                .ToListAsync();

            var items = sessions
                .Select(MapSessionHistoryItemDto)
                .OrderByDescending(x => x.LastActivityAt)
                .ToList();

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

        public async Task<ApiResponse<bool>> SimulateTimeAdvanceAsync(string userId, int days)
        {
            if (string.IsNullOrEmpty(userId))
            {
                return ApiResponse<bool>.Fail("Chưa xác thực người dùng.");
            }

            if (days <= 0)
            {
                return ApiResponse<bool>.Fail("Số ngày giả lập phải lớn hơn 0.");
            }

            // 1. Lùi thời gian tiến độ SRS của các thẻ (cộng thêm 1 phút đệm để đảm bảo NextReviewAt < UtcNow)
            var progresses = await _db.LearnerFlashcardProgresses
                .Where(p => p.UserId == userId)
                .ToListAsync();

            foreach (var p in progresses)
            {
                p.NextReviewAt = p.NextReviewAt.AddDays(-days).AddMinutes(-1);
                p.LastReviewedAt = p.LastReviewedAt.AddDays(-days);
            }

            // 2. Lùi thời gian các log ôn tập (để giải phóng quota thẻ mới hôm nay)
            var logs = await _db.FlashcardReviewLogs
                .Where(l => l.UserId == userId)
                .ToListAsync();

            foreach (var l in logs)
            {
                l.ReviewedAt = l.ReviewedAt.AddDays(-days);
            }

            // 3. Lùi thời gian các phiên học
            var sessions = await _db.FlashcardStudySessions
                .Where(s => s.UserId == userId)
                .ToListAsync();

            foreach (var s in sessions)
            {
                s.StartedAt = s.StartedAt.AddDays(-days);
                if (s.EndedAt.HasValue)
                {
                    s.EndedAt = s.EndedAt.Value.AddDays(-days);
                }
            }

            // 4. Lùi ngày hạn mức (Quota) đã mở khóa trước đó
            var quotas = await _db.LearnerDailyFlashcardQuotas
                .Where(q => q.UserId == userId)
                .ToListAsync();

            foreach (var q in quotas)
            {
                q.DateVn = q.DateVn.AddDays(-days);
                q.UpdatedAt = q.UpdatedAt.AddDays(-days);
            }

            await _db.SaveChangesAsync();

            return ApiResponse<bool>.Ok(true, $"Đã giả lập tua nhanh {days} ngày.");
        }
        public async Task<ApiResponse<bool>> ResetUserProgressAsync(string userId)
        {
            if (string.IsNullOrEmpty(userId))
            {
                return ApiResponse<bool>.Fail("Chưa xác thực người dùng.");
            }

            // 1. Xóa toàn bộ log ôn tập
            var logs = await _db.FlashcardReviewLogs
                .Where(l => l.UserId == userId)
                .ToListAsync();
            _db.FlashcardReviewLogs.RemoveRange(logs);

            // 2. Xóa các phiên học
            var sessions = await _db.FlashcardStudySessions
                .Where(s => s.UserId == userId)
                .ToListAsync();
            _db.FlashcardStudySessions.RemoveRange(sessions);

            // 3. Xóa toàn bộ tiến độ Flashcard của user
            var progresses = await _db.LearnerFlashcardProgresses
                .Where(p => p.UserId == userId)
                .ToListAsync();
            _db.LearnerFlashcardProgresses.RemoveRange(progresses);

            // 4. Xóa / Reset hạn mức (Quota) của user
            var quotas = await _db.LearnerDailyFlashcardQuotas
                .Where(q => q.UserId == userId)
                .ToListAsync();
            _db.LearnerDailyFlashcardQuotas.RemoveRange(quotas);

            await _db.SaveChangesAsync();

            return ApiResponse<bool>.Ok(true, "Đã xóa toàn bộ tiến độ và lịch sử Flashcard để kiểm thử lại từ đầu.");
        }

        private async Task SyncOtherIncompleteSessionsOnCardReviewedAsync(
            string userId,
            int currentSessionId,
            int? vocabId,
            int? grammarId,
            string itemType,
            bool isNewCard,
            DateTime nowUtc)
        {
            var otherIncompleteSessions = await _db.FlashcardStudySessions
                .Include(s => s.ReviewLogs)
                .Where(s =>
                    s.UserId == userId &&
                    s.Id != currentSessionId &&
                    !s.IsExtraPractice &&
                    !s.EndedAt.HasValue)
                .ToListAsync();

            if (otherIncompleteSessions.Count == 0) return;

            string itemKey = vocabId.HasValue ? $"v_{vocabId.Value}" : $"g_{grammarId!.Value}";

            HashSet<int>? topicIdsContainingItem = null;
            if (otherIncompleteSessions.Any(s => s.SourceType == FlashcardSessionSource.TopicSet && s.TopicId.HasValue))
            {
                if (vocabId.HasValue)
                {
                    var tIds = await _db.TopicVocabularies
                        .AsNoTracking()
                        .Where(tv => tv.VocabularyId == vocabId.Value)
                        .Select(tv => tv.TopicId)
                        .ToListAsync();
                    topicIdsContainingItem = tIds.ToHashSet();
                }
                else if (grammarId.HasValue)
                {
                    var tIds = await _db.TopicGrammars
                        .AsNoTracking()
                        .Where(tg => tg.GrammarId == grammarId.Value)
                        .Select(tg => tg.TopicId)
                        .ToListAsync();
                    topicIdsContainingItem = tIds.ToHashSet();
                }
            }

            foreach (var other in otherIncompleteSessions)
            {
                var reviewedInOther = other.ReviewLogs
                    .Select(l => l.VocabularyId.HasValue ? $"v_{l.VocabularyId}" : $"g_{l.GrammarId}")
                    .Distinct()
                    .ToHashSet();

                if (reviewedInOther.Count == 0)
                {
                    continue;
                }

                // Nếu thẻ này đã được ôn trong phiên kia rồi thì không giảm quy mô của phiên kia
                if (reviewedInOther.Contains(itemKey))
                {
                    continue;
                }

                bool belongsToOtherPool = false;

                if (other.SourceType == FlashcardSessionSource.DueReview && !isNewCard)
                {
                    if (other.ContentType == FlashcardContentType.Mixed ||
                        string.Equals(other.ContentType, itemType, StringComparison.OrdinalIgnoreCase))
                    {
                        belongsToOtherPool = true;
                    }
                }
                else if (other.SourceType == FlashcardSessionSource.TopicSet &&
                         other.TopicId.HasValue &&
                         string.Equals(other.ContentType, itemType, StringComparison.OrdinalIgnoreCase) &&
                         topicIdsContainingItem != null &&
                         topicIdsContainingItem.Contains(other.TopicId.Value))
                {
                    belongsToOtherPool = true;
                }

                if (belongsToOtherPool && other.TotalCards > reviewedInOther.Count)
                {
                    other.TotalCards -= 1;
                    if (other.TotalCards <= reviewedInOther.Count)
                    {
                        other.TotalCards = reviewedInOther.Count;
                        other.EndedAt = other.ReviewLogs.Max(l => l.ReviewedAt);
                    }
                }
            }
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

            // Đếm chính xác số thẻ độc nhất (Unique) đang đến hạn trên toàn hệ thống (không bị nhân bản theo số chủ đề)
            int dueVocabCount = await _db.LearnerFlashcardProgresses
                .AsNoTracking()
                .CountAsync(p =>
                    p.UserId == userId &&
                    p.VocabularyId.HasValue &&
                    p.NextReviewAt <= nowUtc &&
                    p.Vocabulary != null &&
                    p.Vocabulary.IsActive);

            int dueGrammarCount = await _db.LearnerFlashcardProgresses
                .AsNoTracking()
                .CountAsync(p =>
                    p.UserId == userId &&
                    p.GrammarId.HasValue &&
                    p.NextReviewAt <= nowUtc &&
                    p.Grammar != null &&
                    p.Grammar.IsActive);

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
                HasActiveSubscription = user.SubscriptionExpiresAt.HasValue && user.SubscriptionExpiresAt.Value > nowUtc,
                TotalDueCardsToday = dueVocabCount + dueGrammarCount,
                DueVocabularyCount = dueVocabCount,
                DueGrammarCount = dueGrammarCount
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
            int uniqueReviewed = s.ReviewLogs != null && s.ReviewLogs.Count > 0
                ? s.ReviewLogs
                    .Select(l => l.VocabularyId.HasValue ? ("v_" + l.VocabularyId) : ("g_" + l.GrammarId))
                    .Distinct()
                    .Count()
                : 0;

            int rawTotal = s.TotalCards > 0 ? s.TotalCards : (uniqueReviewed > 0 ? uniqueReviewed : (s.AgainCount + s.GoodCount + s.EasyCount));
            bool isIncomplete = !s.IsExtraPractice && !s.EndedAt.HasValue && uniqueReviewed > 0 && uniqueReviewed < rawTotal;

            int reviewedCardsCount = uniqueReviewed > 0 ? uniqueReviewed : rawTotal;
            int totalCards = isIncomplete ? rawTotal : reviewedCardsCount;
            int unreviewedCardsCount = isIncomplete ? Math.Max(0, totalCards - reviewedCardsCount) : 0;

            DateTime latestLogAt = s.ReviewLogs != null && s.ReviewLogs.Count > 0
                ? s.ReviewLogs.Max(l => l.ReviewedAt)
                : s.StartedAt;
            DateTime earliestLogAt = s.ReviewLogs != null && s.ReviewLogs.Count > 0
                ? s.ReviewLogs.Min(l => l.ReviewedAt)
                : s.StartedAt;

            DateTime lastActivityAt = s.EndedAt ?? (latestLogAt > s.StartedAt ? latestLogAt : s.StartedAt);
            DateTime refStart = earliestLogAt < s.StartedAt ? earliestLogAt : s.StartedAt;
            int duration = Math.Max(1, (int)(lastActivityAt - refStart).TotalSeconds);

            return new FlashcardSessionHistoryItemDto
            {
                SessionId = s.Id,
                SourceType = s.SourceType,
                TopicId = s.TopicId,
                SetTitle = s.SetTitleSnapshot,
                ContentType = s.ContentType,
                IsExtraPractice = s.IsExtraPractice,
                IsIncomplete = isIncomplete,
                StartedAt = DateTime.SpecifyKind(s.StartedAt, DateTimeKind.Utc),
                EndedAt = s.EndedAt.HasValue ? DateTime.SpecifyKind(s.EndedAt.Value, DateTimeKind.Utc) : null,
                LastActivityAt = DateTime.SpecifyKind(lastActivityAt, DateTimeKind.Utc),
                DurationSeconds = duration,
                TotalCards = totalCards,
                ReviewedCardsCount = reviewedCardsCount,
                UnreviewedCardsCount = unreviewedCardsCount,
                TotalReviews = s.AgainCount + s.GoodCount + s.EasyCount,
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
                ReviewedAt = DateTime.SpecifyKind(l.ReviewedAt, DateTimeKind.Utc)
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
