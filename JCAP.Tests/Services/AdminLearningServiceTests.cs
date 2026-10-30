using JCAP.Data;
using JCAP.Data.Seeds;
using JCAP.DTOs.Flashcard;
using JCAP.DTOs.Learning;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace JCAP.Tests.Services;

public class AdminLearningServiceTests
{
    private static AppDbContext Db() => new(new DbContextOptionsBuilder<AppDbContext>()
        .UseInMemoryDatabase($"AdminLearning_{Guid.NewGuid()}").Options);
    private static SaveContentRequest Word(string level = "N5", string text = "猫") => new()
    {
        Text = text, Reading = "ねこ", Meaning = "Con mèo", JLPTLevel = level,
        Examples = [new() { JapaneseText = "猫がいます。", VietnameseTranslation = "Có một con mèo." }]
    };

    [Fact]
    public async Task Topics_AllowSameNameAcrossLevels_ButRejectDuplicateCodeAndLevelName()
    {
        await using var db = Db(); var service = new AdminLearningService(db);
        var first = await service.SaveTopicAsync(null, new() { Code = "LIFE_N5", Name = "Đời sống", JLPTLevel = "N5" });
        var second = await service.SaveTopicAsync(null, new() { Code = "LIFE_N4", Name = "Đời sống", JLPTLevel = "N4" });
        Assert.NotEqual(first.Topic.Id, second.Topic.Id);
        var sameCode = await Assert.ThrowsAsync<LearningRequestException>(() => service.SaveTopicAsync(null, new() { Code = "LIFE_N5", Name = "Khác", JLPTLevel = "N3" }));
        Assert.Equal(409, sameCode.Status);
        await Assert.ThrowsAsync<LearningRequestException>(() => service.SaveTopicAsync(null, new() { Code = "LIFE_OTHER", Name = "Đời sống", JLPTLevel = "N5" }));
        Assert.Equal(2, await db.LearningTopics.CountAsync());
    }

    [Fact]
    public async Task CrossLevelAssignment_IsRejectedWithoutRemovingCurrentLinks()
    {
        await using var db = Db(); var service = new AdminLearningService(db);
        var topic = await service.SaveTopicAsync(null, new() { Code = "PETS", Name = "Thú cưng", JLPTLevel = "N5" });
        var first = await service.SaveContentAsync("vocabularies", null, Word());
        var second = await service.SaveContentAsync("vocabularies", null, Word("N4", "犬"));
        await service.SetTopicContentsAsync(topic.Topic.Id, new() { VocabularyIds = [first.Item.Id] });
        await Assert.ThrowsAsync<LearningRequestException>(() => service.SetTopicContentsAsync(topic.Topic.Id,
            new() { VocabularyIds = [first.Item.Id, second.Item.Id] }));
        Assert.Equal(first.Item.Id, (await db.TopicVocabularies.SingleAsync()).VocabularyId);
    }

    [Fact]
    public async Task TopicLevelChange_IsBlockedUntilMismatchingLinksAreRemoved()
    {
        await using var db = Db(); var service = new AdminLearningService(db);
        var topic = await service.SaveTopicAsync(null, new() { Code = "PETS", Name = "Thú cưng", JLPTLevel = "N5" });
        var word = await service.SaveContentAsync("vocabularies", null, Word());
        await service.SetTopicContentsAsync(topic.Topic.Id, new() { VocabularyIds = [word.Item.Id] });
        await Assert.ThrowsAsync<LearningRequestException>(() => service.SaveTopicAsync(topic.Topic.Id,
            new() { Code = "PETS", Name = "Thú cưng", JLPTLevel = "N4" }));
        await service.SetTopicContentsAsync(topic.Topic.Id, new());
        var updated = await service.SaveTopicAsync(topic.Topic.Id, new() { Code = "PETS", Name = "Thú cưng", JLPTLevel = "N4" });
        Assert.Equal("N4", updated.Topic.JLPTLevel);
        Assert.Single(await db.Vocabularies.ToListAsync());
    }

    [Fact]
    public async Task SaveContent_RequiresMatchingTopicLevels_AndAllowsExplicitRemovalWhenChangingLevel()
    {
        await using var db = Db(); var service = new AdminLearningService(db);
        var topic = await service.SaveTopicAsync(null, new() { Code = "PETS", Name = "Thú cưng", JLPTLevel = "N5" });
        var input = Word(); input.TopicIds = [topic.Topic.Id];
        var created = await service.SaveContentAsync("vocabularies", null, input);
        var edit = Word("N4"); edit.TopicIds = [topic.Topic.Id]; edit.Examples = [];
        await Assert.ThrowsAsync<LearningRequestException>(() => service.SaveContentAsync("vocabularies", created.Item.Id, edit));
        Assert.Equal("N5", (await db.Vocabularies.SingleAsync()).JLPTLevel);
        edit.TopicIds = [];
        var updated = await service.SaveContentAsync("vocabularies", created.Item.Id, edit);
        Assert.Equal("N4", updated.Item.JLPTLevel);
        Assert.Empty(await db.TopicVocabularies.ToListAsync());
    }

    [Fact]
    public async Task TopicContents_PreserveRequestedOrder_AndUnlinkWithoutDeletingContent()
    {
        await using var db = Db(); var service = new AdminLearningService(db);
        var topic = await service.SaveTopicAsync(null, new() { Code = "PETS", Name = "Thú cưng" });
        var first = await service.SaveContentAsync("vocabularies", null, Word());
        var second = await service.SaveContentAsync("vocabularies", null, Word(text: "犬"));
        var result = await service.SetTopicContentsAsync(topic.Topic.Id, new() { VocabularyIds = [second.Item.Id, first.Item.Id] });
        Assert.Equal(new[] { second.Item.Id, first.Item.Id }, result.Vocabularies.Select(v => v.Id));
        await service.SetTopicContentsAsync(topic.Topic.Id, new() { VocabularyIds = [first.Item.Id] });
        Assert.Equal(2, await db.Vocabularies.CountAsync());
        Assert.Equal(first.Item.Id, (await db.TopicVocabularies.SingleAsync()).VocabularyId);
    }

    [Fact]
    public async Task BulkAssign_RejectsMixedLevels_AndDoesNotDuplicateExistingLinks()
    {
        await using var db = Db(); var service = new AdminLearningService(db);
        var topic = await service.SaveTopicAsync(null, new() { Code = "PETS", Name = "Thú cưng" });
        var first = await service.SaveContentAsync("vocabularies", null, Word());
        var second = await service.SaveContentAsync("vocabularies", null, Word("N4", "犬"));
        await Assert.ThrowsAsync<LearningRequestException>(() => service.AssignTopicsAsync(new() { ItemIds = [first.Item.Id, second.Item.Id], TopicIds = [topic.Topic.Id] }));
        Assert.Empty(await db.TopicVocabularies.ToListAsync());
        var request = new AssignTopicsRequest { ItemIds = [first.Item.Id], TopicIds = [topic.Topic.Id] };
        await service.AssignTopicsAsync(request); await service.AssignTopicsAsync(request);
        Assert.Single(await db.TopicVocabularies.ToListAsync());
    }

    [Theory]
    [InlineData("vocabularies")]
    [InlineData("grammars")]
    public async Task SimilarContent_RequiresExplicitConfirmation(string kind)
    {
        await using var db = Db(); var service = new AdminLearningService(db);
        var request = Word(); await service.SaveContentAsync(kind, null, request);
        var error = await Assert.ThrowsAsync<LearningRequestException>(() => service.SaveContentAsync(kind, null, request));
        Assert.Equal(409, error.Status);
        request.AllowSimilar = true; request.Meaning = "Mục nghĩa riêng";
        var separate = await service.SaveContentAsync(kind, null, request);
        Assert.Equal("Mục nghĩa riêng", separate.Item.Meaning);
    }

    [Fact]
    public async Task EditingImportedExamples_PreservesIdsAndProvenance_AndLeavesOtherContentUntouched()
    {
        await using var db = Db(); var service = new AdminLearningService(db);
        await LearningContentSampleImporter.ImportAsync(db, LearningContentSampleData.Load());
        var word = await db.Vocabularies.Include(v => v.Examples).SingleAsync(v => v.Word == "食べる");
        var original = word.Examples.OrderBy(e => e.OrderIndex).First(); var sourceId = original.SourceId;
        var exampleId = original.Id;
        var input = Word(text: "食べる"); input.Reading = "たべる";
        input.Examples = [new() { Id = exampleId, JapaneseText = original.JapaneseText, VietnameseTranslation = "Bản dịch đã sửa" }, new() { JapaneseText = "パンを食べます。", VietnameseTranslation = "Tôi ăn bánh mì." }];
        var updated = await service.SaveContentAsync("vocabularies", word.Id, input);
        Assert.Equal(2, updated.Examples.Count);
        var retained = await db.VocabularyExamples.SingleAsync(e => e.Id == exampleId);
        Assert.Equal(sourceId, retained.SourceId);
        Assert.Equal("Bản dịch đã sửa", retained.VietnameseTranslation);
        Assert.NotEmpty(updated.Sources);
        Assert.Equal(15, await db.Vocabularies.CountAsync());
        Assert.Equal(6, await db.Grammars.CountAsync());
        Assert.NotNull(word.UpdatedAt);
    }

    [Fact]
    public async Task ForeignExampleId_IsRejectedBeforeOverwritingAnything()
    {
        await using var db = Db(); var service = new AdminLearningService(db);
        var first = await service.SaveContentAsync("vocabularies", null, Word());
        var second = await service.SaveContentAsync("vocabularies", null, Word(text: "犬"));
        var edit = Word(); edit.Examples[0].Id = second.Examples[0].Id;
        await Assert.ThrowsAsync<LearningRequestException>(() => service.SaveContentAsync("vocabularies", first.Item.Id, edit));
        Assert.Equal(2, await db.VocabularyExamples.CountAsync());
    }

    [Fact]
    public async Task Filters_CombineLevelTopicStatusAndKeyword_AndFindUntopicedContent()
    {
        await using var db = Db(); var service = new AdminLearningService(db);
        await LearningContentSampleImporter.ImportAsync(db, LearningContentSampleData.Load());
        await LearningTopicSeeder.SeedAsync(db);
        var dining = await db.LearningTopics.SingleAsync(t => t.Code == "DINING");
        var filtered = await service.ContentsAsync("vocabularies", new() { TopicId = dining.Id, JLPTLevel = "N5", Keyword = "食", IsActive = true });
        Assert.Single(filtered.Items); Assert.Equal("食べる", filtered.Items[0].Text);
        await service.SaveContentAsync("vocabularies", null, Word());
        Assert.Single((await service.ContentsAsync("vocabularies", new() { Untopiced = true })).Items);
    }

    [Fact]
    public async Task HidingContent_RemovesItFromLearnerLookupAndBookmarks_WithoutDeletingLinksOrProgress()
    {
        await using var db = Db(); var service = new AdminLearningService(db);
        await LearningContentSampleImporter.ImportAsync(db, LearningContentSampleData.Load()); await LearningTopicSeeder.SeedAsync(db);
        var word = await db.Vocabularies.SingleAsync(v => v.Word == "食べる");
        db.Users.Add(new() { Id = "learner", UserName = "learner@test.local" });
        db.LearnerBookmarks.Add(new() { UserId = "learner", VocabularyId = word.Id });
        await db.SaveChangesAsync();
        var linkCount = await db.TopicVocabularies.CountAsync();
        await service.SetStatusAsync("vocabularies", word.Id, false);
        var topics = await new DefaultLearningTopicLookup(db).GetActiveTopicsAsync();
        Assert.DoesNotContain(topics.SelectMany(t => t.Vocabularies), v => v.Id == word.Id);
        Assert.Empty((await new LearnerBookmarkService(db).GetBookmarksAsync("learner")).Data!.Items);
        Assert.Equal(linkCount, await db.TopicVocabularies.CountAsync());
        Assert.Single(await db.LearnerBookmarks.ToListAsync());
        await service.SetStatusAsync("vocabularies", word.Id, true);
        Assert.Single((await new LearnerBookmarkService(db).GetBookmarksAsync("learner")).Data!.Items);
    }

    [Fact]
    public async Task HiddenWord_IsRedactedFromFlashcardHistory_WithoutDeletingHistoricalLog()
    {
        await using var db = Db(); var admin = new AdminLearningService(db);
        var word = await admin.SaveContentAsync("vocabularies", null, Word());
        var user = new ApplicationUser { Id = "learner", UserName = "learner@test.local" };
        var session = new FlashcardStudySession { UserId = user.Id, User = user, SetTitleSnapshot = "Thú cưng", EndedAt = DateTime.UtcNow };
        session.ReviewLogs.Add(new FlashcardReviewLog
        {
            User = user, UserId = user.Id, VocabularyId = word.Item.Id,
            FrontTextSnapshot = "猫", MeaningSnapshot = "Con mèo", Rating = FlashcardRating.Again
        });
        db.FlashcardStudySessions.Add(session); await db.SaveChangesAsync();
        var flashcards = new LearnerFlashcardService(db, new SrsCalculationService(),
            new DefaultLearningTopicLookup(db), Options.Create(new FlashcardQuotaOptions()));
        await admin.SetStatusAsync("vocabularies", word.Item.Id, false);
        var hidden = await flashcards.GetSessionHistoryDetailAsync(user.Id, session.Id);
        Assert.True(hidden.Success);
        Assert.Empty(hidden.Data!.Logs);
        Assert.Single(await db.FlashcardReviewLogs.ToListAsync());
        await admin.SetStatusAsync("vocabularies", word.Item.Id, true);
        var restored = await flashcards.GetSessionHistoryDetailAsync(user.Id, session.Id);
        Assert.Single(restored.Data!.Logs);
    }

    [Theory]
    [InlineData("vocabularies")]
    [InlineData("grammars")]
    public async Task BulkStatus_RejectsMissingIdBeforeChangingAnything_AndRestoresAll(string kind)
    {
        await using var db = Db(); var service = new AdminLearningService(db);
        var first = await service.SaveContentAsync(kind, null, Word());
        var second = await service.SaveContentAsync(kind, null, Word(text: "犬"));
        await Assert.ThrowsAsync<LearningRequestException>(() => service.BulkStatusAsync(new()
        {
            Kind = kind, ItemIds = [first.Item.Id, 99999], IsActive = false
        }));
        Assert.True((await service.ContentAsync(kind, first.Item.Id)).Item.IsActive);
        var request = new BulkLearningStatusRequest { Kind = kind, ItemIds = [first.Item.Id, second.Item.Id], IsActive = false };
        await service.BulkStatusAsync(request);
        Assert.False((await service.ContentAsync(kind, first.Item.Id)).Item.IsActive);
        Assert.False((await service.ContentAsync(kind, second.Item.Id)).Item.IsActive);
        request.IsActive = true; await service.BulkStatusAsync(request);
        Assert.True((await service.ContentAsync(kind, second.Item.Id)).Item.IsActive);
    }

    [Fact]
    public async Task HiddenSharedContent_IsAbsentFromShadowingDetail_AndRestoresWithoutRelinking()
    {
        await using var db = Db();
        var scenario = new Scenario { Title = "Kịch bản test", IsActive = true };
        var word = new Vocabulary { Word = "猫", Meaning = "Con mèo", JLPTLevel = "N5", IsActive = false };
        var grammar = new Grammar { Pattern = "です", Meaning = "Là", JLPTLevel = "N5", IsActive = false };
        var dialogue = new ShadowingDialogue
        {
            Scenario = scenario, Title = "Hội thoại test", IsActive = true,
            DialogueVocabularies = [new() { Vocabulary = word }],
            DialogueGrammars = [new() { Grammar = grammar }]
        };
        db.ShadowingDialogues.Add(dialogue); await db.SaveChangesAsync();
        var service = new ShadowingService(db);
        var hidden = await service.GetLearnerDetailAsync(dialogue.Id);
        Assert.True(hidden.Success);
        Assert.Empty(hidden.Data!.TargetVocabularies);
        Assert.Empty(hidden.Data.TargetGrammars);
        word.IsActive = true; grammar.IsActive = true; await db.SaveChangesAsync();
        var restored = await service.GetLearnerDetailAsync(dialogue.Id);
        Assert.Single(restored.Data!.TargetVocabularies);
        Assert.Single(restored.Data.TargetGrammars);
    }
}
