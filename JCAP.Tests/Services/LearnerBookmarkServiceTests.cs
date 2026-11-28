using System;
using System.Linq;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Flashcard;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace JCAP.Tests.Services;

public class LearnerBookmarkServiceTests
{
    private static AppDbContext CreateInMemoryContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"BookmarkTests_{Guid.NewGuid()}")
            .Options);

    private static ApplicationUser CreateUser(string id, string email = "learner1@jcap.test") =>
        new()
        {
            Id = id,
            UserName = email,
            Email = email,
            Role = "Learner",
            JLPTLevel = "N5",
            IsActive = true
        };

    private static async Task<(Vocabulary Vocab1, Vocabulary VocabInactive, Grammar Grammar1, Grammar GrammarInactive)> SeedBasicAsync(AppDbContext db)
    {
        var user1 = CreateUser("learner-1", "learner1@jcap.test");
        var user2 = CreateUser("learner-2", "learner2@jcap.test");

        var vocab1 = new Vocabulary
        {
            Id = 101,
            Word = "注文",
            Reading = "ちゅうもん",
            Meaning = "Gọi món, đặt hàng",
            PartOfSpeech = "Danh từ",
            JLPTLevel = "N5",
            IsActive = true
        };

        var vocabInactive = new Vocabulary
        {
            Id = 102,
            Word = "会計",
            Reading = "かいけい",
            Meaning = "Thanh toán",
            JLPTLevel = "N5",
            IsActive = false
        };

        var grammar1 = new Grammar
        {
            Id = 201,
            Pattern = "〜てもいいですか",
            Formation = "Vて + もいいですか",
            Meaning = "Tôi làm ... có được không?",
            ExampleSentence = "ここで写真を撮ってもいいですか。",
            JLPTLevel = "N5",
            IsActive = true
        };

        var grammarInactive = new Grammar
        {
            Id = 202,
            Pattern = "〜てはいけません",
            Formation = "Vて + はいけません",
            Meaning = "Không được phép làm ...",
            JLPTLevel = "N5",
            IsActive = false
        };

        db.Users.AddRange(user1, user2);
        db.Vocabularies.AddRange(vocab1, vocabInactive);
        db.Grammars.AddRange(grammar1, grammarInactive);
        await db.SaveChangesAsync();

        return (vocab1, vocabInactive, grammar1, grammarInactive);
    }

    #region UC-52: Add Learning Content to Bookmarks (ToggleBookmarkAsync)

    [Fact]
    public async Task UC52_UTCID01_AddBookmark_ValidActiveVocabularyId_SavesBookmark()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, _, _, _) = await SeedBasicAsync(db);
        var service = new LearnerBookmarkService(db);

        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            VocabularyId = vocab1.Id
        });

        Assert.True(res.Success);
        Assert.NotNull(res.Data);
        Assert.True(res.Data!.IsBookmarked);
        Assert.Equal(vocab1.Id, res.Data.VocabularyId);
        Assert.Equal("Đã lưu từ vựng vào danh sách.", res.Message);
        Assert.Equal(1, await db.LearnerBookmarks.CountAsync());
    }

    [Fact]
    public async Task UC52_UTCID02_AddBookmark_ValidActiveGrammarId_SavesBookmark()
    {
        using var db = CreateInMemoryContext();
        var (_, _, grammar1, _) = await SeedBasicAsync(db);
        var service = new LearnerBookmarkService(db);

        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            GrammarId = grammar1.Id
        });

        Assert.True(res.Success);
        Assert.NotNull(res.Data);
        Assert.True(res.Data!.IsBookmarked);
        Assert.Equal(grammar1.Id, res.Data.GrammarId);
        Assert.Equal("Đã lưu mẫu ngữ pháp vào danh sách.", res.Message);
        Assert.Equal(1, await db.LearnerBookmarks.CountAsync());
    }

    [Fact]
    public async Task UC52_UTCID03_AddBookmark_ExistingWordWithWhitespace_ReusesExistingVocabulary()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, _, _, _) = await SeedBasicAsync(db);
        var service = new LearnerBookmarkService(db);

        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            Word = "  注文  "
        });

        Assert.True(res.Success);
        Assert.True(res.Data!.IsBookmarked);
        Assert.Equal(vocab1.Id, res.Data.VocabularyId);
        Assert.Equal(2, await db.Vocabularies.CountAsync());
        Assert.Equal("Đã lưu từ vựng vào danh sách.", res.Message);
    }

    [Fact]
    public async Task UC52_UTCID04_AddBookmark_NewWord_CreatesVocabularyAndSavesBookmark()
    {
        using var db = CreateInMemoryContext();
        await SeedBasicAsync(db);
        var service = new LearnerBookmarkService(db);

        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            Word = " 予約 ",
            Reading = " よやく ",
            Meaning = " Đặt chỗ ",
            JlptLevel = " N4 "
        });

        Assert.True(res.Success);
        Assert.True(res.Data!.IsBookmarked);
        var created = await db.Vocabularies.FirstOrDefaultAsync(v => v.Word == "予約");
        Assert.NotNull(created);
        Assert.Equal("よやく", created!.Reading);
        Assert.Equal("Đặt chỗ", created.Meaning);
        Assert.Equal("N4", created.JLPTLevel);
        Assert.Equal(created.Id, res.Data.VocabularyId);
        Assert.Equal("Đã lưu từ vựng vào danh sách.", res.Message);
    }

    [Fact]
    public async Task UC52_UTCID05_AddBookmark_NewPattern_CreatesGrammarAndSavesBookmark()
    {
        using var db = CreateInMemoryContext();
        await SeedBasicAsync(db);
        var service = new LearnerBookmarkService(db);

        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            Pattern = " 〜てみる ",
            Meaning = " Thử làm gì đó ",
            ExampleSentence = " 日本料理を食べてみます。 ",
            JlptLevel = " N4 "
        });

        Assert.True(res.Success);
        Assert.True(res.Data!.IsBookmarked);
        var created = await db.Grammars.FirstOrDefaultAsync(g => g.Pattern == "〜てみる");
        Assert.NotNull(created);
        Assert.Equal("Thử làm gì đó", created!.Meaning);
        Assert.Equal("日本料理を食べてみます。", created.ExampleSentence);
        Assert.Equal("N4", created.JLPTLevel);
        Assert.Equal(created.Id, res.Data.GrammarId);
        Assert.Equal("Đã lưu mẫu ngữ pháp vào danh sách.", res.Message);
    }

    [Fact]
    public async Task UC52_UTCID06_AddBookmark_TargetVocabularyId_AutoProvisionsVocabularyWithLevel()
    {
        using var db = CreateInMemoryContext();
        await SeedBasicAsync(db);

        var levelConfig = new ScenarioLevelConfiguration
        {
            Id = 50,
            ScenarioId = 1,
            JLPTLevel = "N4",
            Title = "Nhà hàng N4"
        };
        var targetVocab = new TargetVocabulary
        {
            Id = 7001,
            ScenarioLevelConfigurationId = 50,
            ScenarioLevelConfiguration = levelConfig,
            Word = "おすすめ",
            Reading = "おすすめ",
            Meaning = "Món gợi ý"
        };
        db.ScenarioLevelConfigurations.Add(levelConfig);
        db.TargetVocabularies.Add(targetVocab);
        await db.SaveChangesAsync();

        var service = new LearnerBookmarkService(db);
        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            VocabularyId = targetVocab.Id
        });

        Assert.True(res.Success);
        Assert.True(res.Data!.IsBookmarked);
        var provisioned = await db.Vocabularies.FirstOrDefaultAsync(v => v.Word == "おすすめ");
        Assert.NotNull(provisioned);
        Assert.Equal("N4", provisioned!.JLPTLevel);
        Assert.Equal(provisioned.Id, res.Data.VocabularyId);
        Assert.Equal("Đã lưu từ vựng vào danh sách.", res.Message);
    }

    [Fact]
    public async Task UC52_UTCID07_AddBookmark_NewWordWithBlankJlptAndNullMeaning_DefaultsToN5AndEmpty()
    {
        using var db = CreateInMemoryContext();
        await SeedBasicAsync(db);
        var service = new LearnerBookmarkService(db);

        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            Word = "お会計",
            Meaning = null,
            JlptLevel = "   "
        });

        Assert.True(res.Success);
        var created = await db.Vocabularies.FirstOrDefaultAsync(v => v.Word == "お会計");
        Assert.NotNull(created);
        Assert.Equal("N5", created!.JLPTLevel);
        Assert.Equal(string.Empty, created.Meaning);
    }

    [Fact]
    public async Task UC52_UTCID08_AddBookmark_NewPatternWithNullJlptAndNullMeaning_DefaultsToN5AndEmpty()
    {
        using var db = CreateInMemoryContext();
        await SeedBasicAsync(db);
        var service = new LearnerBookmarkService(db);

        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            Pattern = "〜ながら",
            Meaning = null,
            JlptLevel = null
        });

        Assert.True(res.Success);
        var created = await db.Grammars.FirstOrDefaultAsync(g => g.Pattern == "〜ながら");
        Assert.NotNull(created);
        Assert.Equal("N5", created!.JLPTLevel);
        Assert.Equal(string.Empty, created.Meaning);
    }

    [Fact]
    public async Task UC52_UTCID09_AddBookmark_ZeroVocabularyIdWithEmptyTexts_ReturnsValidationFail()
    {
        using var db = CreateInMemoryContext();
        await SeedBasicAsync(db);
        var service = new LearnerBookmarkService(db);

        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            VocabularyId = 0,
            Word = "",
            Pattern = ""
        });

        Assert.False(res.Success);
        Assert.Equal("Vui lòng chỉ định đúng một trong hai: VocabularyId hoặc GrammarId.", res.Message);
        Assert.Equal(0, await db.LearnerBookmarks.CountAsync());
    }

    [Fact]
    public async Task UC52_UTCID10_AddBookmark_AnotherUserAlreadyBookmarked_SavesIndependentRow()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, _, _, _) = await SeedBasicAsync(db);
        db.LearnerBookmarks.Add(new LearnerBookmark
        {
            UserId = "learner-2",
            VocabularyId = vocab1.Id,
            CreatedAt = DateTime.UtcNow.AddMinutes(-5)
        });
        await db.SaveChangesAsync();

        var service = new LearnerBookmarkService(db);
        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            VocabularyId = vocab1.Id
        });

        Assert.True(res.Success);
        Assert.True(res.Data!.IsBookmarked);
        Assert.Equal(2, await db.LearnerBookmarks.CountAsync());
    }

    [Fact]
    public async Task UC52_UTCID11_AddBookmark_AllIdentifiersNullOrWhitespace_ReturnsValidationFail()
    {
        using var db = CreateInMemoryContext();
        await SeedBasicAsync(db);
        var service = new LearnerBookmarkService(db);

        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            Word = "   ",
            Pattern = "   "
        });

        Assert.False(res.Success);
        Assert.Equal("Vui lòng chỉ định đúng một trong hai: VocabularyId hoặc GrammarId.", res.Message);
    }

    [Fact]
    public async Task UC52_UTCID12_AddBookmark_BothVocabularyIdAndGrammarIdSpecified_ReturnsValidationFail()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, _, grammar1, _) = await SeedBasicAsync(db);
        var service = new LearnerBookmarkService(db);

        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            VocabularyId = vocab1.Id,
            GrammarId = grammar1.Id
        });

        Assert.False(res.Success);
        Assert.Equal("Vui lòng chỉ định đúng một trong hai: VocabularyId hoặc GrammarId.", res.Message);
    }

    [Fact]
    public async Task UC52_UTCID13_AddBookmark_NonExistentVocabularyId_ReturnsNotFoundFail()
    {
        using var db = CreateInMemoryContext();
        await SeedBasicAsync(db);
        var service = new LearnerBookmarkService(db);

        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            VocabularyId = 999999
        });

        Assert.False(res.Success);
        Assert.Equal("Không tìm thấy từ vựng khả dụng để lưu.", res.Message);
    }

    [Fact]
    public async Task UC52_UTCID14_AddBookmark_InactiveVocabularyId_ReturnsNotFoundFail()
    {
        using var db = CreateInMemoryContext();
        var (_, vocabInactive, _, _) = await SeedBasicAsync(db);
        var service = new LearnerBookmarkService(db);

        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            VocabularyId = vocabInactive.Id
        });

        Assert.False(res.Success);
        Assert.Equal("Không tìm thấy từ vựng khả dụng để lưu.", res.Message);
    }

    [Fact]
    public async Task UC52_UTCID15_AddBookmark_InactiveOrMissingGrammarId_ReturnsNotFoundFail()
    {
        using var db = CreateInMemoryContext();
        var (_, _, _, grammarInactive) = await SeedBasicAsync(db);
        var service = new LearnerBookmarkService(db);

        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            GrammarId = grammarInactive.Id
        });

        Assert.False(res.Success);
        Assert.Equal("Không tìm thấy mẫu ngữ pháp khả dụng để lưu.", res.Message);
    }

    #endregion

    #region UC-53: View Bookmarked Learning Contents (GetBookmarksAsync)

    private static async Task SeedRichBookmarksAsync(AppDbContext db, DateTime nowUtc)
    {
        var user1 = CreateUser("learner-1", "learner1@jcap.test");
        var user2 = CreateUser("learner-2", "learner2@jcap.test");
        db.Users.AddRange(user1, user2);

        var vN5New = new Vocabulary { Id = 1, Word = "駅", Reading = "えき", Meaning = "Nhà ga", JLPTLevel = "N5", IsActive = true };
        var vN4Due = new Vocabulary { Id = 2, Word = "準備", Reading = "じゅんび", Meaning = "Chuẩn bị", JLPTLevel = "N4", IsActive = true };
        var vHidden = new Vocabulary { Id = 3, Word = "秘密", Reading = "ひみつ", Meaning = "Bí mật", JLPTLevel = "N5", IsActive = false };
        var gN4Learn = new Grammar { Id = 4, Pattern = "〜ておく", Formation = "Vて + おく", Meaning = "Làm sẵn trước", JLPTLevel = "N4", IsActive = true };
        var vOtherUser = new Vocabulary { Id = 5, Word = "空港", Reading = "くうこう", Meaning = "Sân bay", JLPTLevel = "N5", IsActive = true };

        db.Vocabularies.AddRange(vN5New, vN4Due, vHidden, vOtherUser);
        db.Grammars.Add(gN4Learn);

        db.LearnerBookmarks.AddRange(
            new LearnerBookmark { Id = 1, UserId = "learner-1", VocabularyId = 1, CreatedAt = nowUtc.AddHours(-3) },
            new LearnerBookmark { Id = 2, UserId = "learner-1", VocabularyId = 2, CreatedAt = nowUtc.AddHours(-1) },
            new LearnerBookmark { Id = 3, UserId = "learner-1", VocabularyId = 3, CreatedAt = nowUtc.AddHours(-2) },
            new LearnerBookmark { Id = 4, UserId = "learner-1", GrammarId = 4, CreatedAt = nowUtc.AddMinutes(-10) },
            new LearnerBookmark { Id = 5, UserId = "learner-2", VocabularyId = 5, CreatedAt = nowUtc }
        );

        db.LearnerFlashcardProgresses.AddRange(
            new LearnerFlashcardProgress
            {
                Id = 1,
                UserId = "learner-1",
                VocabularyId = 2,
                IntervalDays = 3,
                NextReviewAt = nowUtc.AddHours(-1),
                LastReviewedAt = nowUtc.AddDays(-3)
            },
            new LearnerFlashcardProgress
            {
                Id = 2,
                UserId = "learner-1",
                GrammarId = 4,
                IntervalDays = 7,
                NextReviewAt = nowUtc.AddDays(5),
                LastReviewedAt = nowUtc.AddDays(-2)
            }
        );

        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task UC53_UTCID01_GetBookmarks_NoFilters_ReturnsActiveItemsOrderedByBookmarkedAtDesc()
    {
        using var db = CreateInMemoryContext();
        var now = DateTime.UtcNow;
        await SeedRichBookmarksAsync(db, now);
        var service = new LearnerBookmarkService(db);

        var res = await service.GetBookmarksAsync("learner-1");

        Assert.True(res.Success);
        Assert.Equal(3, res.Data!.TotalCount);
        Assert.Equal(new[] { "〜ておく", "準備", "駅" }, res.Data.Items.Select(i => i.FrontText).ToArray());
    }

    [Fact]
    public async Task UC53_UTCID02_GetBookmarks_ComputesSrsStatesAndSummaryCountsAccurately()
    {
        using var db = CreateInMemoryContext();
        var now = DateTime.UtcNow;
        await SeedRichBookmarksAsync(db, now);
        var service = new LearnerBookmarkService(db);

        var res = await service.GetBookmarksAsync("learner-1");

        Assert.True(res.Success);
        Assert.Equal(3, res.Data!.TotalCount);
        Assert.Equal(1, res.Data.DueCount);
        Assert.Equal(1, res.Data.NewCount);

        var grammarLearn = res.Data.Items.Single(i => i.FrontText == "〜ておく");
        var vocabDue = res.Data.Items.Single(i => i.FrontText == "準備");
        var vocabNew = res.Data.Items.Single(i => i.FrontText == "駅");

        Assert.Equal("Learning", grammarLearn.SrsState);
        Assert.Equal(7, grammarLearn.IntervalDays);
        Assert.Equal("Due", vocabDue.SrsState);
        Assert.Equal(3, vocabDue.IntervalDays);
        Assert.Equal("New", vocabNew.SrsState);
        Assert.Equal(0, vocabNew.IntervalDays);
    }

    [Fact]
    public async Task UC53_UTCID03_GetBookmarks_FilterByItemTypeCaseInsensitive_ReturnsOnlyMatchingType()
    {
        using var db = CreateInMemoryContext();
        await SeedRichBookmarksAsync(db, DateTime.UtcNow);
        var service = new LearnerBookmarkService(db);

        var res = await service.GetBookmarksAsync("learner-1", itemType: "vocabulary");

        Assert.True(res.Success);
        Assert.Equal(2, res.Data!.TotalCount);
        Assert.All(res.Data.Items, i => Assert.Equal(FlashcardContentType.Vocabulary, i.ItemType));
    }

    [Fact]
    public async Task UC53_UTCID04_GetBookmarks_FilterByJlptLevelWithTrimAndCase_ReturnsMatchingLevel()
    {
        using var db = CreateInMemoryContext();
        await SeedRichBookmarksAsync(db, DateTime.UtcNow);
        var service = new LearnerBookmarkService(db);

        var res = await service.GetBookmarksAsync("learner-1", jlptLevel: " n4 ");

        Assert.True(res.Success);
        Assert.Equal(2, res.Data!.TotalCount);
        Assert.All(res.Data.Items, i => Assert.Equal("N4", i.JLPTLevel));
    }

    [Fact]
    public async Task UC53_UTCID05_GetBookmarks_FilterByKeyword_MatchesFrontTextMeaningAndReadingOrFormation()
    {
        using var db = CreateInMemoryContext();
        await SeedRichBookmarksAsync(db, DateTime.UtcNow);
        var service = new LearnerBookmarkService(db);

        var byReading = await service.GetBookmarksAsync("learner-1", keyword: "じゅん");
        var byMeaning = await service.GetBookmarksAsync("learner-1", keyword: "nhà ga");
        var byFormation = await service.GetBookmarksAsync("learner-1", keyword: "Vて + おく");

        Assert.Single(byReading.Data!.Items);
        Assert.Equal("準備", byReading.Data.Items[0].FrontText);

        Assert.Single(byMeaning.Data!.Items);
        Assert.Equal("駅", byMeaning.Data.Items[0].FrontText);

        Assert.Single(byFormation.Data!.Items);
        Assert.Equal("〜ておく", byFormation.Data.Items[0].FrontText);
    }

    [Fact]
    public async Task UC53_UTCID06_GetBookmarks_CombinedFilters_ReturnsIntersectionAndRecomputesCounts()
    {
        using var db = CreateInMemoryContext();
        await SeedRichBookmarksAsync(db, DateTime.UtcNow);
        var service = new LearnerBookmarkService(db);

        var res = await service.GetBookmarksAsync("learner-1", itemType: "Grammar", jlptLevel: "N4", keyword: "sẵn");

        Assert.True(res.Success);
        Assert.Equal(1, res.Data!.TotalCount);
        Assert.Equal(0, res.Data.DueCount);
        Assert.Equal(0, res.Data.NewCount);
        Assert.Equal("〜ておく", Assert.Single(res.Data.Items).FrontText);
    }

    [Fact]
    public async Task UC53_UTCID07_GetBookmarks_LearnerHasNoBookmarks_ReturnsEmptySuccessDto()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("empty-user", "empty@jcap.test"));
        await db.SaveChangesAsync();
        var service = new LearnerBookmarkService(db);

        var res = await service.GetBookmarksAsync("empty-user");

        Assert.True(res.Success);
        Assert.Empty(res.Data!.Items);
        Assert.Equal(0, res.Data.TotalCount);
        Assert.Equal(0, res.Data.DueCount);
        Assert.Equal(0, res.Data.NewCount);
    }

    [Fact]
    public async Task UC53_UTCID08_GetBookmarks_AllAndWhitespaceFilters_ReturnsAllActiveBookmarks()
    {
        using var db = CreateInMemoryContext();
        await SeedRichBookmarksAsync(db, DateTime.UtcNow);
        var service = new LearnerBookmarkService(db);

        var res = await service.GetBookmarksAsync("learner-1", itemType: "All", jlptLevel: "All", keyword: "   ");

        Assert.True(res.Success);
        Assert.Equal(3, res.Data!.TotalCount);
    }

    [Fact]
    public async Task UC53_UTCID09_GetBookmarks_NextReviewAtOnDueBoundary_CountsAsDue()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, _, _, _) = await SeedBasicAsync(db);
        db.LearnerBookmarks.Add(new LearnerBookmark { UserId = "learner-1", VocabularyId = vocab1.Id, CreatedAt = DateTime.UtcNow });
        db.LearnerFlashcardProgresses.Add(new LearnerFlashcardProgress
        {
            UserId = "learner-1",
            VocabularyId = vocab1.Id,
            IntervalDays = 1,
            NextReviewAt = DateTime.UtcNow.AddMilliseconds(-50),
            LastReviewedAt = DateTime.UtcNow.AddDays(-1)
        });
        await db.SaveChangesAsync();

        var service = new LearnerBookmarkService(db);
        var res = await service.GetBookmarksAsync("learner-1");

        Assert.True(res.Success);
        Assert.Equal(1, res.Data!.DueCount);
        Assert.Equal("Due", Assert.Single(res.Data.Items).SrsState);
    }

    [Fact]
    public async Task UC53_UTCID10_GetBookmarks_NullJlptLevelInEntity_DefaultsToN5InDto()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1"));
        var vocabNullLevel = new Vocabulary { Id = 301, Word = "水", Meaning = "Nước", JLPTLevel = null, IsActive = true };
        db.Vocabularies.Add(vocabNullLevel);
        db.LearnerBookmarks.Add(new LearnerBookmark { UserId = "learner-1", VocabularyId = 301, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var service = new LearnerBookmarkService(db);
        var res = await service.GetBookmarksAsync("learner-1");

        Assert.True(res.Success);
        Assert.Equal("N5", Assert.Single(res.Data!.Items).JLPTLevel);
    }

    [Fact]
    public async Task UC53_UTCID11_GetBookmarks_ExcludesOtherUsersAndInactiveItemsWithoutDeletingRows()
    {
        using var db = CreateInMemoryContext();
        await SeedRichBookmarksAsync(db, DateTime.UtcNow);
        var service = new LearnerBookmarkService(db);

        var res = await service.GetBookmarksAsync("learner-1");

        Assert.True(res.Success);
        Assert.DoesNotContain(res.Data!.Items, i => i.FrontText == "秘密" || i.FrontText == "空港");
        Assert.Equal(5, await db.LearnerBookmarks.CountAsync());
    }

    [Fact]
    public async Task UC53_UTCID12_GetBookmarks_UnknownItemTypeOrJlptLevel_ReturnsEmptyList()
    {
        using var db = CreateInMemoryContext();
        await SeedRichBookmarksAsync(db, DateTime.UtcNow);
        var service = new LearnerBookmarkService(db);

        var unknownType = await service.GetBookmarksAsync("learner-1", itemType: "Kanji");
        var unknownLevel = await service.GetBookmarksAsync("learner-1", jlptLevel: "N0");

        Assert.True(unknownType.Success);
        Assert.Empty(unknownType.Data!.Items);
        Assert.Equal(0, unknownType.Data.TotalCount);

        Assert.True(unknownLevel.Success);
        Assert.Empty(unknownLevel.Data!.Items);
        Assert.Equal(0, unknownLevel.Data.TotalCount);
    }

    [Fact]
    public async Task UC53_UTCID13_GetBookmarks_NonMatchingKeywordOrUnknownUser_ReturnsEmptyList()
    {
        using var db = CreateInMemoryContext();
        await SeedRichBookmarksAsync(db, DateTime.UtcNow);
        var service = new LearnerBookmarkService(db);

        var noKeywordMatch = await service.GetBookmarksAsync("learner-1", keyword: "khong-ton-tai");
        var unknownUser = await service.GetBookmarksAsync("unknown-user");

        Assert.True(noKeywordMatch.Success);
        Assert.Empty(noKeywordMatch.Data!.Items);
        Assert.Equal(0, noKeywordMatch.Data.TotalCount);

        Assert.True(unknownUser.Success);
        Assert.Empty(unknownUser.Data!.Items);
        Assert.Equal(0, unknownUser.Data.TotalCount);
    }

    #endregion

    #region UC-54: Remove Learning Content from Bookmarks (ToggleBookmarkAsync)

    [Fact]
    public async Task UC54_UTCID01_RemoveBookmark_ExistingVocabularyId_HardDeletesBookmark()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, _, _, _) = await SeedBasicAsync(db);
        db.LearnerBookmarks.Add(new LearnerBookmark { UserId = "learner-1", VocabularyId = vocab1.Id });
        await db.SaveChangesAsync();

        var service = new LearnerBookmarkService(db);
        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            VocabularyId = vocab1.Id
        });

        Assert.True(res.Success);
        Assert.False(res.Data!.IsBookmarked);
        Assert.Equal(vocab1.Id, res.Data.VocabularyId);
        Assert.Equal("Đã bỏ lưu từ vựng.", res.Message);
        Assert.Equal(0, await db.LearnerBookmarks.CountAsync());
    }

    [Fact]
    public async Task UC54_UTCID02_RemoveBookmark_ExistingGrammarId_HardDeletesBookmark()
    {
        using var db = CreateInMemoryContext();
        var (_, _, grammar1, _) = await SeedBasicAsync(db);
        db.LearnerBookmarks.Add(new LearnerBookmark { UserId = "learner-1", GrammarId = grammar1.Id });
        await db.SaveChangesAsync();

        var service = new LearnerBookmarkService(db);
        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            GrammarId = grammar1.Id
        });

        Assert.True(res.Success);
        Assert.False(res.Data!.IsBookmarked);
        Assert.Equal(grammar1.Id, res.Data.GrammarId);
        Assert.Equal("Đã bỏ lưu mẫu ngữ pháp.", res.Message);
        Assert.Equal(0, await db.LearnerBookmarks.CountAsync());
    }

    [Fact]
    public async Task UC54_UTCID03_RemoveBookmark_TrimmedWord_HardDeletesBookmark()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, _, _, _) = await SeedBasicAsync(db);
        db.LearnerBookmarks.Add(new LearnerBookmark { UserId = "learner-1", VocabularyId = vocab1.Id });
        await db.SaveChangesAsync();

        var service = new LearnerBookmarkService(db);
        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            Word = "  注文  "
        });

        Assert.True(res.Success);
        Assert.False(res.Data!.IsBookmarked);
        Assert.Equal(vocab1.Id, res.Data.VocabularyId);
        Assert.Equal("Đã bỏ lưu từ vựng.", res.Message);
        Assert.Equal(0, await db.LearnerBookmarks.CountAsync());
    }

    [Fact]
    public async Task UC54_UTCID04_RemoveBookmark_TrimmedPattern_HardDeletesBookmark()
    {
        using var db = CreateInMemoryContext();
        var (_, _, grammar1, _) = await SeedBasicAsync(db);
        db.LearnerBookmarks.Add(new LearnerBookmark { UserId = "learner-1", GrammarId = grammar1.Id });
        await db.SaveChangesAsync();

        var service = new LearnerBookmarkService(db);
        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            Pattern = " 〜てもいいですか "
        });

        Assert.True(res.Success);
        Assert.False(res.Data!.IsBookmarked);
        Assert.Equal(grammar1.Id, res.Data.GrammarId);
        Assert.Equal("Đã bỏ lưu mẫu ngữ pháp.", res.Message);
        Assert.Equal(0, await db.LearnerBookmarks.CountAsync());
    }

    [Fact]
    public async Task UC54_UTCID05_RemoveBookmark_DeletesOnlyCurrentUserBookmarkAndKeepsOtherUsers()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, _, _, _) = await SeedBasicAsync(db);
        db.LearnerBookmarks.AddRange(
            new LearnerBookmark { UserId = "learner-1", VocabularyId = vocab1.Id },
            new LearnerBookmark { UserId = "learner-2", VocabularyId = vocab1.Id }
        );
        await db.SaveChangesAsync();

        var service = new LearnerBookmarkService(db);
        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            VocabularyId = vocab1.Id
        });

        Assert.True(res.Success);
        Assert.False(res.Data!.IsBookmarked);
        var remaining = await db.LearnerBookmarks.SingleAsync();
        Assert.Equal("learner-2", remaining.UserId);
    }

    [Fact]
    public async Task UC54_UTCID06_RemoveBookmark_ZeroVocabularyId_ReturnsFailWithoutMutatingBookmarks()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, _, _, _) = await SeedBasicAsync(db);
        db.LearnerBookmarks.Add(new LearnerBookmark { UserId = "learner-1", VocabularyId = vocab1.Id });
        await db.SaveChangesAsync();

        var service = new LearnerBookmarkService(db);
        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            VocabularyId = 0
        });

        Assert.False(res.Success);
        Assert.Equal("Vui lòng chỉ định đúng một trong hai: VocabularyId hoặc GrammarId.", res.Message);
        Assert.Equal(1, await db.LearnerBookmarks.CountAsync());
    }

    [Fact]
    public async Task UC54_UTCID07_RemoveBookmark_AllIdentifiersNull_ReturnsFailWithoutMutatingBookmarks()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, _, _, _) = await SeedBasicAsync(db);
        db.LearnerBookmarks.Add(new LearnerBookmark { UserId = "learner-1", VocabularyId = vocab1.Id });
        await db.SaveChangesAsync();

        var service = new LearnerBookmarkService(db);
        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto());

        Assert.False(res.Success);
        Assert.Equal("Vui lòng chỉ định đúng một trong hai: VocabularyId hoặc GrammarId.", res.Message);
        Assert.Equal(1, await db.LearnerBookmarks.CountAsync());
    }

    [Fact]
    public async Task UC54_UTCID08_RemoveBookmark_BothVocabularyIdAndGrammarIdProvided_ReturnsFail()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, _, grammar1, _) = await SeedBasicAsync(db);
        db.LearnerBookmarks.Add(new LearnerBookmark { UserId = "learner-1", VocabularyId = vocab1.Id });
        await db.SaveChangesAsync();

        var service = new LearnerBookmarkService(db);
        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            VocabularyId = vocab1.Id,
            GrammarId = grammar1.Id
        });

        Assert.False(res.Success);
        Assert.Equal("Vui lòng chỉ định đúng một trong hai: VocabularyId hoặc GrammarId.", res.Message);
        Assert.Equal(1, await db.LearnerBookmarks.CountAsync());
    }

    [Fact]
    public async Task UC54_UTCID09_RemoveBookmark_InactiveVocabularyId_ReturnsNotFoundWithoutMutatingBookmarks()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, vocabInactive, _, _) = await SeedBasicAsync(db);
        db.LearnerBookmarks.Add(new LearnerBookmark { UserId = "learner-1", VocabularyId = vocab1.Id });
        await db.SaveChangesAsync();

        var service = new LearnerBookmarkService(db);
        var res = await service.ToggleBookmarkAsync("learner-1", new ToggleBookmarkRequestDto
        {
            VocabularyId = vocabInactive.Id
        });

        Assert.False(res.Success);
        Assert.Equal("Không tìm thấy từ vựng khả dụng để lưu.", res.Message);
        Assert.Equal(1, await db.LearnerBookmarks.CountAsync());
    }

    #endregion
}
