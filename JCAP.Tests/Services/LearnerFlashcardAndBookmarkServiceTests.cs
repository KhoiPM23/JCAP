using System;
using System.Linq;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Flashcard;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Xunit;

namespace JCAP.Tests.Services;

public class LearnerFlashcardAndBookmarkServiceTests
{
    private static AppDbContext CreateInMemoryContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"FlashcardTests_{Guid.NewGuid()}")
            .Options);

    private static async Task<(Vocabulary Vocab1, Vocabulary Vocab2, Grammar Grammar1)> SeedTestEntitiesAsync(
        AppDbContext db,
        string userId = "learner-1",
        int creditBalance = 20)
    {
        var user = new ApplicationUser
        {
            Id = userId,
            UserName = "learner1@jcap.test",
            Email = "learner1@jcap.test",
            Role = "Learner",
            JLPTLevel = "N5",
            CreditBalance = creditBalance,
            IsActive = true
        };

        var vocab1 = new Vocabulary
        {
            Id = 101,
            Word = "注文",
            Reading = "ちゅうもん",
            Meaning = "Gọi món, đặt hàng",
            PartOfSpeech = "Danh từ / Suru-verb",
            JLPTLevel = "N5",
            Explanation = "Dùng khi gọi món trong nhà hàng.",
            IsActive = true
        };

        var vocab2 = new Vocabulary
        {
            Id = 102,
            Word = "会計",
            Reading = "かいけい",
            Meaning = "Thanh toán",
            PartOfSpeech = "Danh từ",
            JLPTLevel = "N5",
            Explanation = "Tính tiền tại quầy.",
            IsActive = true
        };

        var grammar1 = new Grammar
        {
            Id = 201,
            Pattern = "〜てもいいですか",
            Meaning = "Tôi làm ... có được không?",
            Formation = "Vて + もいいですか",
            Explanation = "Dùng để xin phép lịch sự.",
            ExampleSentence = "ここで写真を撮ってもいいですか。",
            JLPTLevel = "N5",
            IsActive = true
        };

        db.Users.Add(user);
        db.Vocabularies.AddRange(vocab1, vocab2);
        db.Grammars.Add(grammar1);

        var topic1 = new LearningTopic
        {
            Id = 1,
            Code = "TOPIC_N5_BASIC",
            Name = "Chủ đề Sơ cấp N5",
            Description = "Tổng hợp từ vựng và mẫu ngữ pháp nền tảng trình độ JLPT N5.",
            IsActive = true
        };
        topic1.TopicVocabularies.Add(new TopicVocabulary { TopicId = 1, VocabularyId = vocab1.Id, Vocabulary = vocab1, OrderIndex = 1 });
        topic1.TopicVocabularies.Add(new TopicVocabulary { TopicId = 1, VocabularyId = vocab2.Id, Vocabulary = vocab2, OrderIndex = 2 });
        topic1.TopicGrammars.Add(new TopicGrammar { TopicId = 1, GrammarId = grammar1.Id, Grammar = grammar1, OrderIndex = 1 });
        db.LearningTopics.Add(topic1);
        await db.SaveChangesAsync();

        return (vocab1, vocab2, grammar1);
    }

    private static LearnerFlashcardService CreateFlashcardService(
        AppDbContext db,
        FlashcardQuotaOptions? customOptions = null)
    {
        var srs = new SrsCalculationService();
        var lookup = new DefaultLearningTopicLookup(db);
        var opts = Options.Create(customOptions ?? new FlashcardQuotaOptions
        {
            FreeNewCardsPerDay = 20,
            UnlockBatchSize = 10,
            UnlockCreditCost = 5,
            MaxCardsPerSession = 20
        });
        return new LearnerFlashcardService(db, srs, lookup, opts);
    }

    [Fact]
    public async Task ToggleBookmark_AddAndRemove_WorksAndValidatesInput()
    {
        using var db = CreateInMemoryContext();
        await SeedTestEntitiesAsync(db);
        var bookmarkService = new LearnerBookmarkService(db);

        // 1. Invalid request (both null)
        var invalidBothNull = await bookmarkService.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto());
        Assert.False(invalidBothNull.Success);

        // 2. Add bookmark for Vocabulary 101
        var addRes = await bookmarkService.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto { VocabularyId = 101 });
        Assert.True(addRes.Success);
        Assert.True(addRes.Data!.IsBookmarked);
        Assert.Equal(1, await db.LearnerBookmarks.CountAsync());

        // 3. Remove bookmark on second toggle (hard delete)
        var removeRes = await bookmarkService.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto { VocabularyId = 101 });
        Assert.True(removeRes.Success);
        Assert.False(removeRes.Data!.IsBookmarked);
        Assert.Equal(0, await db.LearnerBookmarks.CountAsync());
    }

    [Fact]
    public async Task GetBookmarks_WhenContentSoftDeleted_MarksUnavailableAndExcludesFromDueCount()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, vocab2, _) = await SeedTestEntitiesAsync(db);
        var bookmarkService = new LearnerBookmarkService(db);

        await bookmarkService.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto { VocabularyId = vocab1.Id });
        await bookmarkService.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto { VocabularyId = vocab2.Id });

        // Soft-delete vocab2 (Admin hides content)
        vocab2.IsActive = false;
        await db.SaveChangesAsync();

        var listRes = await bookmarkService.GetBookmarksAsync("learner-1");
        Assert.True(listRes.Success);
        Assert.Equal(2, listRes.Data!.TotalCount);
        Assert.Equal(1, listRes.Data.NewCount); // Only active vocab1 counts as New

        var activeItem = listRes.Data.Items.First();
        var hiddenItem = listRes.Data.Items.Last();
        Assert.True(activeItem.IsAvailable);
        Assert.False(hiddenItem.IsAvailable);
        Assert.Equal(vocab2.Id, hiddenItem.ItemId);
    }

    [Fact]
    public async Task StudySessionLifecycle_StartReviewAndComplete_UpdatesSrsAndRecordsHistory()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, vocab2, _) = await SeedTestEntitiesAsync(db);
        var flashcardService = CreateFlashcardService(db);

        // 1. Check sets generated from Topic lookup (UC-55)
        var setsRes = await flashcardService.GetFlashcardSetsAsync("learner-1");
        Assert.True(setsRes.Success);
        Assert.Equal(2, setsRes.Data!.Count); // N5 Vocabulary set & N5 Grammar set

        // 2. Start Vocabulary session on Topic 1 (N5) (UC-57)
        var startRes = await flashcardService.StartSessionAsync("learner-1", new StartFlashcardSessionRequestDto
        {
            SourceType = FlashcardSessionSource.TopicSet,
            TopicId = 1,
            ContentType = FlashcardContentType.Vocabulary
        });
        Assert.True(startRes.Success);
        int sessionId = startRes.Data!.SessionId;
        Assert.Equal(2, startRes.Data.Cards.Count);

        // 3. Rate vocab1 as Again -> RequeueInSession = true, IntervalAfter = 1
        var review1 = await flashcardService.SubmitCardReviewAsync("learner-1", sessionId, new SubmitFlashcardReviewRequestDto
        {
            VocabularyId = vocab1.Id,
            Rating = FlashcardRating.Again
        });
        Assert.True(review1.Success);
        Assert.True(review1.Data!.RequeueInSession);
        Assert.Equal(1, review1.Data.IntervalAfter);

        // 4. Rate vocab1 again in same session as Good -> RequeueInSession = false
        var review1Retry = await flashcardService.SubmitCardReviewAsync("learner-1", sessionId, new SubmitFlashcardReviewRequestDto
        {
            VocabularyId = vocab1.Id,
            Rating = FlashcardRating.Good
        });
        Assert.True(review1Retry.Success);
        Assert.False(review1Retry.Data!.RequeueInSession);

        // 5. Rate vocab2 as Easy -> IntervalAfter = 3
        var review2 = await flashcardService.SubmitCardReviewAsync("learner-1", sessionId, new SubmitFlashcardReviewRequestDto
        {
            VocabularyId = vocab2.Id,
            Rating = FlashcardRating.Easy
        });
        Assert.True(review2.Success);
        Assert.Equal(3, review2.Data!.IntervalAfter);

        // 6. Complete session
        var completeRes = await flashcardService.CompleteSessionAsync("learner-1", sessionId);
        Assert.True(completeRes.Success);
        Assert.Equal(3, completeRes.Data!.TotalReviewed);
        Assert.Equal(1, completeRes.Data.AgainCount);
        Assert.Equal(1, completeRes.Data.GoodCount);
        Assert.Equal(1, completeRes.Data.EasyCount);
        Assert.Single(completeRes.Data.DifficultItems);
        Assert.Equal("注文", completeRes.Data.DifficultItems[0].FrontText);

        // 7. Verify History (UC-58)
        var historyRes = await flashcardService.GetSessionHistoryAsync("learner-1");
        Assert.Single(historyRes.Data!);

        var detailRes = await flashcardService.GetSessionHistoryDetailAsync("learner-1", sessionId);
        Assert.Equal(3, detailRes.Data!.Logs.Count);
    }

    [Theory]
    [InlineData(FlashcardContentType.Vocabulary)]
    [InlineData(FlashcardContentType.Grammar)]
    public async Task StudySession_WithExtendedMeaning_PreservesFullHistorySnapshot(string contentType)
    {
        using var db = CreateInMemoryContext();
        var (vocabulary, _, grammar) = await SeedTestEntitiesAsync(db);
        var meaning = new string('語', 900);
        vocabulary.Meaning = meaning;
        grammar.Meaning = meaning;
        await db.SaveChangesAsync();
        var service = CreateFlashcardService(db);

        var start = await service.StartSessionAsync("learner-1", new StartFlashcardSessionRequestDto
        {
            SourceType = FlashcardSessionSource.TopicSet,
            TopicId = 1,
            ContentType = contentType
        });
        Assert.True(start.Success);
        var review = await service.SubmitCardReviewAsync("learner-1", start.Data!.SessionId,
            new SubmitFlashcardReviewRequestDto
            {
                VocabularyId = contentType == FlashcardContentType.Vocabulary ? vocabulary.Id : null,
                GrammarId = contentType == FlashcardContentType.Grammar ? grammar.Id : null,
                Rating = FlashcardRating.Good
            });

        Assert.True(review.Success);
        var log = await db.FlashcardReviewLogs.SingleAsync();
        Assert.Equal(meaning, log.MeaningSnapshot);
        var history = await service.GetSessionHistoryDetailAsync("learner-1", start.Data.SessionId);
        Assert.True(history.Success);
        Assert.Equal(meaning, Assert.Single(history.Data!.Logs).Meaning);
    }

    [Fact]
    public async Task DailyQuotaAndUnlockWithCredit_LimitsNewCardsAndUnlocksExtraBatch()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, vocab2, _) = await SeedTestEntitiesAsync(db, creditBalance: 12);

        // Configure FreeNewCardsPerDay = 1 so the second new card requires unlocking
        var service = CreateFlashcardService(db, new FlashcardQuotaOptions
        {
            FreeNewCardsPerDay = 1,
            UnlockBatchSize = 5,
            UnlockCreditCost = 5,
            MaxCardsPerSession = 20
        });

        // Start first session -> only 1 new card allowed by quota
        var session1 = await service.StartSessionAsync("learner-1", new StartFlashcardSessionRequestDto
        {
            SourceType = FlashcardSessionSource.TopicSet,
            TopicId = 1,
            ContentType = FlashcardContentType.Vocabulary
        });
        Assert.Single(session1.Data!.Cards);
        Assert.Equal(vocab1.Id, session1.Data.Cards[0].ItemId);

        // Review that 1 new card -> daily new card quota is now 0 remaining
        await service.SubmitCardReviewAsync("learner-1", session1.Data.SessionId, new SubmitFlashcardReviewRequestDto
        {
            VocabularyId = vocab1.Id,
            Rating = FlashcardRating.Good
        });

        var quotaAfter1 = await service.GetDailyQuotaAsync("learner-1");
        Assert.Equal(1, quotaAfter1.Data!.StudiedNewCardsToday);
        Assert.Equal(0, quotaAfter1.Data.RemainingNewCardsToday);

        // Starting another regular session returns 0 cards because due=0 and remainingNewQuota=0
        var sessionWhenQuotaExhausted = await service.StartSessionAsync("learner-1", new StartFlashcardSessionRequestDto
        {
            SourceType = FlashcardSessionSource.TopicSet,
            TopicId = 1,
            ContentType = FlashcardContentType.Vocabulary
        });
        Assert.Empty(sessionWhenQuotaExhausted.Data!.Cards);
        Assert.NotNull(sessionWhenQuotaExhausted.Data.NextDueAtWhenEmpty);

        // Unlock extra batch with 5 credits
        var unlockRes = await service.UnlockExtraQuotaAsync("learner-1");
        Assert.True(unlockRes.Success);
        Assert.Equal(5, unlockRes.Data!.ExtraUnlockedToday);
        Assert.Equal(5, unlockRes.Data.RemainingNewCardsToday);
        Assert.Equal(7, unlockRes.Data.UserCreditBalance); // 12 - 5 = 7
        Assert.Equal(1, await db.CreditTransactions.CountAsync());

        // Now starting a session picks up the remaining new card (vocab2)
        var sessionAfterUnlock = await service.StartSessionAsync("learner-1", new StartFlashcardSessionRequestDto
        {
            SourceType = FlashcardSessionSource.TopicSet,
            TopicId = 1,
            ContentType = FlashcardContentType.Vocabulary
        });
        Assert.Single(sessionAfterUnlock.Data!.Cards);
        Assert.Equal(vocab2.Id, sessionAfterUnlock.Data.Cards[0].ItemId);
    }

    [Fact]
    public async Task ExtraPracticeMode_DoesNotMutateSrsScheduleOrConsumeNewQuota()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, _, _) = await SeedTestEntitiesAsync(db);
        var service = CreateFlashcardService(db);

        var startExtra = await service.StartSessionAsync("learner-1", new StartFlashcardSessionRequestDto
        {
            SourceType = FlashcardSessionSource.TopicSet,
            TopicId = 1,
            ContentType = FlashcardContentType.Vocabulary,
            IsExtraPractice = true
        });
        Assert.True(startExtra.Success);
        Assert.True(startExtra.Data!.IsExtraPractice);

        await service.SubmitCardReviewAsync("learner-1", startExtra.Data.SessionId, new SubmitFlashcardReviewRequestDto
        {
            VocabularyId = vocab1.Id,
            Rating = FlashcardRating.Easy
        });

        // Verify no SRS progress was created and daily new card quota was not consumed
        Assert.Equal(0, await db.LearnerFlashcardProgresses.CountAsync());
        var quota = await service.GetDailyQuotaAsync("learner-1");
        Assert.Equal(0, quota.Data!.StudiedNewCardsToday);
    }
}
