using JCAP.Data;
using JCAP.DTOs.Learning;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Tests.Services;

public class LearnerLearningServiceTests
{
    private static AppDbContext Db() => new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase($"LearnerLearning_{Guid.NewGuid()}").Options);
    private static LearningTopic Topic(string name = "Topic", string level = "N5", bool active = true) => new() { Code = Guid.NewGuid().ToString("N"), Name = name, JLPTLevel = level, IsActive = active };
    private static void Link(AppDbContext db, LearningTopic topic, string kind, string text, int order, bool active = true, string? level = "N5")
    {
        if (kind == "vocabularies") db.TopicVocabularies.Add(new() { Topic = topic, Vocabulary = new() { Word = text, Meaning = "Nghĩa " + text, JLPTLevel = level, IsActive = active }, OrderIndex = order });
        else db.TopicGrammars.Add(new() { Topic = topic, Grammar = new() { Pattern = text, Meaning = "Nghĩa " + text, JLPTLevel = level, IsActive = active, Formation = "V + " + text }, OrderIndex = order });
    }

    [Fact]
    public async Task Topics_DefaultPageSize12_SearchAndLevelApplyBeforePaging_AndHiddenTopicsAreExcluded()
    {
        await using var db = Db();
        for (var i = 0; i < 15; i++) db.LearningTopics.Add(Topic($"Topic {i:D2}"));
        db.LearningTopics.Add(Topic("Other", "N4")); db.LearningTopics.Add(Topic("Hidden", active: false)); await db.SaveChangesAsync();
        var service = new LearnerLearningService(db);
        var first = await service.TopicsAsync(new()); var second = await service.TopicsAsync(new() { Page = 2 });
        Assert.Equal(16, first.Total); Assert.Equal(12, first.Items.Count); Assert.Equal(4, second.Items.Count);
        Assert.Empty(first.Items.Select(t => t.Id).Intersect(second.Items.Select(t => t.Id)));
        var search = await service.TopicsAsync(new() { Keyword = "Topic 14", JLPTLevel = "N5", Page = 100 });
        Assert.Single(search.Items); Assert.Equal(1, search.Page); Assert.Equal("Topic 14", search.Items[0].Name);
        Assert.Empty((await service.TopicsAsync(new() { JLPTLevel = "N4", Keyword = "Topic" })).Items);
    }

    [Theory]
    [InlineData("vocabularies")]
    [InlineData("grammars")]
    public async Task Contents_Page20_StableAdminOrder_SearchAcrossPages_AndClampStalePage(string kind)
    {
        await using var db = Db(); var topic = Topic();
        for (var i = 0; i < 25; i++) Link(db, topic, kind, $"Item {i:D2}", 24 - i);
        Link(db, topic, kind, "Hidden", 0, active: false); Link(db, topic, kind, "Wrong level", 0, level: "N4");
        await db.SaveChangesAsync(); var service = new LearnerLearningService(db);
        var first = await service.ContentsAsync(topic.Id, kind, new()); var second = await service.ContentsAsync(topic.Id, kind, new() { Page = 2 });
        Assert.Equal(25, first.Contents.Total); Assert.Equal(20, first.Contents.Items.Count); Assert.Equal(5, second.Contents.Items.Count);
        Assert.Equal("Item 24", first.Contents.Items[0].Text); Assert.Equal("Item 00", second.Contents.Items[^1].Text);
        var search = await service.ContentsAsync(topic.Id, kind, new() { Keyword = "Item 00", Page = 10 });
        Assert.Single(search.Contents.Items); Assert.Equal(1, search.Contents.Page);
        Assert.Equal(25, kind == "vocabularies" ? search.Topic.VocabularyCount : search.Topic.GrammarCount);
    }

    [Theory]
    [InlineData("vocabularies")]
    [InlineData("grammars")]
    public async Task DirectDetails_RejectHiddenUnlinkedWrongLevelAndHiddenTopic_WithoutDeletingMaster(string kind)
    {
        await using var db = Db(); var topic = Topic(); var hiddenTopic = Topic(active: false); var unrelated = Topic("Other");
        Link(db, topic, kind, "Hidden item", 0, active: false); Link(db, topic, kind, "Wrong level", 1, level: "N4");
        Link(db, hiddenTopic, kind, "Hidden topic item", 0); Link(db, unrelated, kind, "Unlinked", 0);
        await db.SaveChangesAsync(); var service = new LearnerLearningService(db);
        var ids = kind == "vocabularies" ? await db.Vocabularies.Select(v => v.Id).ToArrayAsync() : await db.Grammars.Select(g => g.Id).ToArrayAsync();
        foreach (var id in ids) Assert.Equal(404, (await Assert.ThrowsAsync<LearningRequestException>(() => service.DetailAsync(topic.Id, kind, id, new()))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<LearningRequestException>(() => service.ContentsAsync(hiddenTopic.Id, kind, new()))).Status);
        Assert.Equal(4, kind == "vocabularies" ? await db.Vocabularies.CountAsync() : await db.Grammars.CountAsync());
    }

    [Theory]
    [InlineData("vocabularies")]
    [InlineData("grammars")]
    public async Task Neighbors_CrossPageBoundaryRespectKeywordAndHideState_WithStableTieBreak(string kind)
    {
        await using var db = Db(); var topic = Topic();
        for (var i = 0; i < 23; i++) Link(db, topic, kind, $"Keep {i:D2}", 0);
        Link(db, topic, kind, "Hidden Keep", 0, active: false); Link(db, topic, kind, "Different", 0);
        await db.SaveChangesAsync(); var service = new LearnerLearningService(db); var query = new LearnerContentQuery { Keyword = "Keep" };
        var second = await service.ContentsAsync(topic.Id, kind, new() { Page = 2, Keyword = "Keep" });
        var detail = await service.DetailAsync(topic.Id, kind, second.Contents.Items[0].Id, query);
        Assert.Equal(1, detail.PreviousPage); Assert.Equal(2, detail.NextPage);
        var before = await service.DetailAsync(topic.Id, kind, detail.PreviousId!.Value, query);
        Assert.Equal(detail.Item.Id, before.NextId); Assert.Equal(2, before.NextPage);
        Assert.Null((await service.DetailAsync(topic.Id, kind, (await service.ContentsAsync(topic.Id, kind, query)).Contents.Items[0].Id, query)).PreviousId);
        Assert.Null((await service.DetailAsync(topic.Id, kind, second.Contents.Items[^1].Id, query)).NextId);
    }

    [Fact]
    public async Task VocabularyDetail_PreservesFullInformation_ExampleOrderAndBothKindsOfProvenance_OnlyVisibleSameLevelTopics()
    {
        await using var db = Db(); var topic = Topic(); var hidden = Topic("Hidden", active: false); var wrong = Topic("Wrong", "N4");
        var source = new LearningContentSource { Name = "Data", Version = "v1", SourceUrl = "https://example.org", License = "MIT", LicenseUrl = "https://example.org/license", Attribution = "Full credit" };
        var word = new Vocabulary { Word = "食べる", Reading = "たべる", Meaning = "Ăn", JLPTLevel = "N5", Explanation = "Explanation", UsageNotes = "Notes", PartOfSpeech = "Verb", Examples = [new() { JapaneseText = "Second", OrderIndex = 2 }, new() { JapaneseText = "First", VietnameseTranslation = "Đầu tiên", Furigana = "{First|reading}", OrderIndex = 0, Source = source, ExternalId = "sentence-id" }], Sources = [new() { Source = source, ExternalId = "word-id" }] };
        foreach (var t in new[] { topic, hidden, wrong }) db.TopicVocabularies.Add(new() { Topic = t, Vocabulary = word });
        await db.SaveChangesAsync(); var detail = await new LearnerLearningService(db).DetailAsync(topic.Id, "vocabularies", word.Id, new());
        Assert.Equal("Explanation", detail.Explanation); Assert.Equal("Notes", detail.UsageNotes); Assert.Equal("Verb", detail.Item.PartOfSpeech);
        Assert.Equal(new[] { "First", "Second" }, detail.Examples.Select(e => e.JapaneseText));
        Assert.Equal("sentence-id", detail.Examples[0].Source!.ExternalId); Assert.Equal("word-id", detail.Sources[0].ExternalId);
        Assert.Equal("Full credit", detail.Sources[0].Attribution); Assert.Single(detail.Topics); Assert.Equal(topic.Id, detail.Topics[0].Id);
    }

    [Fact]
    public async Task GrammarDetails_ExposeFormation_AndLegacyExampleOnlyWhenStructuredExamplesMissing()
    {
        await using var db = Db(); var topic = Topic();
        var grammar = new Grammar { Pattern = "〜てください", Meaning = "Hãy…", JLPTLevel = "N5", Formation = "Vて + ください", ExampleSentence = "Legacy sentence" };
        db.TopicGrammars.Add(new() { Topic = topic, Grammar = grammar }); await db.SaveChangesAsync(); var service = new LearnerLearningService(db);
        var legacy = await service.DetailAsync(topic.Id, "grammars", grammar.Id, new());
        Assert.Equal("Vて + ください", legacy.Item.Formation); Assert.Equal("Legacy sentence", Assert.Single(legacy.Examples).JapaneseText);
        grammar.Examples.Add(new() { JapaneseText = "Structured example" }); await db.SaveChangesAsync();
        var structured = await service.DetailAsync(topic.Id, "grammars", grammar.Id, new()); Assert.Equal("Structured example", Assert.Single(structured.Examples).JapaneseText);
    }

    [Fact]
    public async Task LegacyNullLevel_IsCountedAsN5_AndEmptyActiveTopicRemainsBrowsable()
    {
        await using var db = Db(); var topic = Topic(); var empty = Topic("Empty");
        db.LearningTopics.Add(empty); Link(db, topic, "vocabularies", "Legacy", 0, level: null); await db.SaveChangesAsync(); var service = new LearnerLearningService(db);
        Assert.Single((await service.ContentsAsync(topic.Id, "vocabularies", new())).Contents.Items);
        var result = await service.ContentsAsync(empty.Id, "grammars", new() { Page = 100 }); Assert.Empty(result.Contents.Items); Assert.Equal(1, result.Contents.Page);
    }

    [Fact]
    public async Task CatalogValidation_RejectsUnboundedParameters_AndReadsDoNotModifyData()
    {
        await using var db = Db(); var topic = Topic(); Link(db, topic, "vocabularies", "Word", 0); await db.SaveChangesAsync();
        var service = new LearnerLearningService(db);
        await Assert.ThrowsAsync<LearningRequestException>(() => service.TopicsAsync(new() { Page = -1 }));
        await Assert.ThrowsAsync<LearningRequestException>(() => service.ContentsAsync(topic.Id, "vocabularies", new() { PageSize = 101 }));
        await Assert.ThrowsAsync<LearningRequestException>(() => service.ContentsAsync(topic.Id, "invalid", new()));
        db.ChangeTracker.Clear(); await service.TopicsAsync(new()); var page = await service.ContentsAsync(topic.Id, "vocabularies", new()); await service.DetailAsync(topic.Id, "vocabularies", page.Contents.Items[0].Id, new());
        Assert.Empty(db.ChangeTracker.Entries());
    }
}
