using JCAP.Data;
using JCAP.Data.Seeds;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Tests.Models;

public class LearningTopicSeederTests
{
    private static AppDbContext CreateContext() => new(new DbContextOptionsBuilder<AppDbContext>()
        .UseInMemoryDatabase($"LearningTopics_{Guid.NewGuid()}").Options);

    [Fact]
    public async Task Seed_LinksAllSampleContentAcrossFlatTopics_WithoutDuplicatingMasters()
    {
        await using var db = CreateContext();
        await LearningContentSampleImporter.ImportAsync(db, LearningContentSampleData.Load());
        var result = await LearningTopicSeeder.SeedAsync(db);

        Assert.Equal(15, result.AddedTopics);
        Assert.Equal(28, result.AddedVocabularyLinks);
        Assert.Equal(20, result.AddedGrammarLinks);
        Assert.Empty(result.SkippedTopicCodes);
        Assert.Equal(15, await db.Vocabularies.CountAsync());
        Assert.Equal(6, await db.Grammars.CountAsync());
        Assert.Equal(15, await db.TopicVocabularies.Select(t => t.VocabularyId).Distinct().CountAsync());
        Assert.Equal(6, await db.TopicGrammars.Select(t => t.GrammarId).Distinct().CountAsync());
        Assert.Empty(await db.Scenarios.ToListAsync());
        Assert.Empty(await db.ShadowingDialogueVocabularies.ToListAsync());
        Assert.Empty(await db.ShadowingDialogueGrammars.ToListAsync());

        var eatingId = (await db.Vocabularies.SingleAsync(v => v.Word == "食べる")).Id;
        Assert.Equal(2, await db.TopicVocabularies.CountAsync(link => link.VocabularyId == eatingId));
        foreach (var topic in await db.LearningTopics.Include(t => t.TopicVocabularies)
                     .Include(t => t.TopicGrammars).ToListAsync())
        {
            Assert.Equal(Enumerable.Range(0, topic.TopicVocabularies.Count),
                topic.TopicVocabularies.OrderBy(t => t.OrderIndex).Select(t => t.OrderIndex));
            Assert.Equal(Enumerable.Range(0, topic.TopicGrammars.Count),
                topic.TopicGrammars.OrderBy(t => t.OrderIndex).Select(t => t.OrderIndex));
        }
    }

    [Fact]
    public async Task RepeatedSeed_PreservesAdminMetadataInactiveFlagsAndRemovedLinks()
    {
        await using var db = CreateContext();
        await LearningContentSampleImporter.ImportAsync(db, LearningContentSampleData.Load());
        var first = await LearningTopicSeeder.SeedAsync(db);
        var dining = await db.LearningTopics.Include(t => t.TopicVocabularies)
            .Include(t => t.TopicGrammars).SingleAsync(t => t.Code == "DINING");
        dining.Name = "Tên do admin sửa";
        dining.Description = "Mô tả đã hiệu đính";
        dining.IsActive = false;
        dining.UpdatedAt = new DateTime(2026, 10, 30, 1, 0, 0, DateTimeKind.Utc);
        var link = dining.TopicVocabularies.First();
        db.TopicVocabularies.Remove(link);
        dining.TopicGrammars.First().OrderIndex = 99;
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var second = await LearningTopicSeeder.SeedAsync(db);
        Assert.Equal(0, second.AddedTopics);
        Assert.Equal(0, second.AddedVocabularyLinks);
        Assert.Equal(0, second.AddedGrammarLinks);
        Assert.Equal(first.TopicIds, second.TopicIds);
        dining = await db.LearningTopics.SingleAsync(t => t.Code == "DINING");
        Assert.Equal("Tên do admin sửa", dining.Name);
        Assert.Equal("Mô tả đã hiệu đính", dining.Description);
        Assert.False(dining.IsActive);
        Assert.NotNull(dining.UpdatedAt);
        Assert.Equal(27, await db.TopicVocabularies.CountAsync());
        Assert.Contains(await db.TopicGrammars.Where(t => t.TopicId == dining.Id).ToListAsync(), t => t.OrderIndex == 99);
    }

    [Fact]
    public async Task Seed_UsesSourceIdentity_WhenAdminRenamesVocabularyAndGrammar()
    {
        await using var db = CreateContext();
        await LearningContentSampleImporter.ImportAsync(db, LearningContentSampleData.Load());
        var word = await db.Vocabularies.SingleAsync(v => v.Word == "食べる");
        var grammar = await db.Grammars.SingleAsync(g => g.Pattern == "てください");
        word.Word = "Từ đã đổi tên";
        grammar.Pattern = "Mẫu đã đổi tên";
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var result = await LearningTopicSeeder.SeedAsync(db);
        Assert.Equal(15, result.AddedTopics);
        Assert.Equal(2, await db.TopicVocabularies.CountAsync(t => t.VocabularyId == word.Id));
        Assert.Equal(5, await db.TopicGrammars.CountAsync(t => t.GrammarId == grammar.Id));
        Assert.Equal(15, await db.Vocabularies.CountAsync());
        Assert.Equal(6, await db.Grammars.CountAsync());
    }

    [Fact]
    public async Task MissingAttributedSample_DoesNotCreateEmptyTopicsOrImportContentOnStartup()
    {
        await using var db = CreateContext();
        db.Vocabularies.Add(new Vocabulary { Word = "食べる", Reading = "たべる", Meaning = "Ăn", JLPTLevel = "N5" });
        await db.SaveChangesAsync();
        var result = await LearningTopicSeeder.SeedAsync(db);
        Assert.Equal(0, result.AddedTopics);
        Assert.Equal(15, result.SkippedTopicCodes.Length);
        Assert.Empty(await db.LearningTopics.ToListAsync());
        Assert.Equal(1, await db.Vocabularies.CountAsync());
        Assert.Empty(await db.Grammars.ToListAsync());
        Assert.Empty(await db.LearningContentSources.ToListAsync());
    }

    [Fact]
    public async Task ExistingAdminTopicWithSeedCode_IsNotFilledOrOverwritten()
    {
        await using var db = CreateContext();
        await LearningContentSampleImporter.ImportAsync(db, LearningContentSampleData.Load());
        var adminTopic = new LearningTopic { Code = "DINING", Name = "Nhà hàng do admin quản lý", IsActive = false };
        db.LearningTopics.Add(adminTopic);
        await db.SaveChangesAsync();
        var result = await LearningTopicSeeder.SeedAsync(db);
        Assert.Equal(14, result.AddedTopics);
        Assert.Equal(15, await db.LearningTopics.CountAsync());
        Assert.Empty(await db.TopicVocabularies.Where(t => t.TopicId == adminTopic.Id).ToListAsync());
        Assert.Empty(await db.TopicGrammars.Where(t => t.TopicId == adminTopic.Id).ToListAsync());
        Assert.False(adminTopic.IsActive);
        Assert.Equal("Nhà hàng do admin quản lý", adminTopic.Name);
    }

    [Fact]
    public async Task SeededTopics_AreAvailableThroughRealFlashcardLookup_WithLevelAndKeywordFilters()
    {
        await using var db = CreateContext();
        await LearningContentSampleImporter.ImportAsync(db, LearningContentSampleData.Load());
        await LearningTopicSeeder.SeedAsync(db);
        var lookup = new DefaultLearningTopicLookup(db);
        var all = await lookup.GetActiveTopicsAsync();
        Assert.Equal(15, all.Count);
        foreach (var level in new[] { "N5", "N4", "N3" })
        {
            var filtered = await lookup.GetActiveTopicsAsync(level);
            Assert.NotEmpty(filtered);
            Assert.All(filtered, topic =>
            {
                Assert.All(topic.Vocabularies, v => Assert.Equal(level, v.JLPTLevel));
                Assert.All(topic.Grammars, g => Assert.Equal(level, g.JLPTLevel));
            });
        }
        var dining = Assert.Single(await lookup.GetActiveTopicsAsync("N5", keyword: "Ăn uống"));
        var detail = await lookup.GetActiveTopicByIdAsync(dining.TopicId);
        Assert.NotNull(detail);
        Assert.Equal(3, detail.Vocabularies.Count);
        Assert.Equal(2, detail.Grammars.Count);
    }
}
