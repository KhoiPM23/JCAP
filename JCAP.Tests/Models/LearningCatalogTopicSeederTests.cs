using JCAP.Data;
using JCAP.Data.Seeds;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Tests.Models;

public class LearningCatalogTopicSeederTests
{
    [Fact]
    public async Task FullDataset_SeedsLevelSpecificTopicsAndPreservesAdminChangesOnRerun()
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        await using var input = OpenSeed("learning-n5-n3.json");
        var dataset = await LearningContentFullCommand.ReadDatasetAsync(input);
        await LearningContentSampleImporter.ImportAsync(db, dataset, full: true);
        await using var mapping = OpenSeed("tango-n5-topics.json");
        await LearningCatalogTopicSeeder.SeedAsync(db, dataset, mapping);
        db.ChangeTracker.Clear();

        Assert.Equal(10, await db.LearningTopics.CountAsync(topic => topic.JLPTLevel == "N5"));
        Assert.Equal(655, await db.TopicVocabularies.Select(link => link.VocabularyId).Distinct().CountAsync());
        Assert.Equal(19, await db.Vocabularies.CountAsync(word =>
            word.JLPTLevel == "N5" && !word.TopicVocabularies.Any()));
        Assert.Empty(await db.TopicGrammars.ToListAsync());

        var topic = await db.LearningTopics.Include(item => item.TopicVocabularies)
            .SingleAsync(item => item.Code == "TANGO_N5_MEALS");
        topic.Name = "Bữa ăn do quản trị viên cập nhật";
        db.TopicVocabularies.Remove(topic.TopicVocabularies.First());
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        await using var repeatedMapping = OpenSeed("tango-n5-topics.json");
        await LearningCatalogTopicSeeder.SeedAsync(db, dataset, repeatedMapping);
        Assert.Equal(10, await db.LearningTopics.CountAsync());
        Assert.Equal(654, await db.TopicVocabularies.CountAsync());
        Assert.True(await db.LearningTopics.AnyAsync(item => item.Name == "Bữa ăn do quản trị viên cập nhật"));

        await using var catalog = OpenSeed("learning-topic-catalog-n5-n3.json");
        await LearningCatalogTopicSeeder.SeedAsync(db, dataset, catalog);
        Assert.Equal(124, await db.LearningTopics.CountAsync());
        Assert.Equal(2978, await db.TopicVocabularies.CountAsync());
        Assert.Equal(2954, await db.TopicVocabularies.Select(link => link.VocabularyId).Distinct().CountAsync());
        Assert.Equal(3, await db.LearningTopics.CountAsync(topic =>
            topic.JLPTLevel == "N5" && topic.Code.StartsWith("GENERAL_V_")));
        Assert.True(await db.TopicVocabularies.AnyAsync(link =>
            link.Topic.Code == "GENERAL_V_N5_VERB" && link.Vocabulary.Word == "する"));
        Assert.True(await db.TopicVocabularies.AnyAsync(link =>
            link.Topic.Code == "GENERAL_V_N3_NOUN" &&
            link.Vocabulary.Sources.Any(source => source.ExternalId == "c2946190ea")));
        Assert.Equal(9, await db.LearningTopics.CountAsync(topic =>
            topic.JLPTLevel == "N4" && topic.Code.StartsWith("SUPPLEMENT_V_")));
        Assert.Equal(9, await db.LearningTopics.CountAsync(topic =>
            topic.JLPTLevel == "N3" && topic.Code.StartsWith("SUPPLEMENT_V_")));
        Assert.True(await db.TopicVocabularies.AnyAsync(link =>
            link.Topic.Code == "SUPPLEMENT_V_N3_CHANGE" && link.Vocabulary.Word == "改善"));
        Assert.True(await db.TopicVocabularies.AnyAsync(link =>
            link.Topic.Code == "SUPPLEMENT_V_N3_GOALS" && link.Vocabulary.Word == "目的"));
        Assert.True(await db.TopicVocabularies.AnyAsync(link =>
            link.Topic.Code == "SUPPLEMENT_V_N4_LINKERS" && link.Vocabulary.Word == "すると"));
        Assert.True(await db.TopicVocabularies.AnyAsync(link =>
            link.Topic.Code == "SHINKANZEN_V_N4_LIFE" && link.Vocabulary.Word == "ケーキ"));
        Assert.True(await db.TopicVocabularies.AnyAsync(link =>
            link.Topic.Code == "SHINKANZEN_V_N3_TRAVEL" && link.Vocabulary.Word == "パスポート"));
        var diamondTopics = await db.TopicVocabularies
            .Where(link => link.Vocabulary.Word == "ダイヤ" && link.Topic.JLPTLevel == "N3")
            .Select(link => link.Topic.Code).OrderBy(code => code).ToListAsync();
        Assert.Equal(new[] { "SHINKANZEN_V_N3_TRAVEL", "SUPPLEMENT_V_N3_COMMERCE" }, diamondTopics);
        Assert.Equal(556, await db.TopicGrammars.CountAsync());
        Assert.Equal(556, await db.TopicGrammars.Select(link => link.GrammarId).Distinct().CountAsync());
        Assert.False(await db.TopicVocabularies.AnyAsync(link => link.Topic.JLPTLevel != link.Vocabulary.JLPTLevel));
        Assert.False(await db.TopicGrammars.AnyAsync(link => link.Topic.JLPTLevel != link.Grammar.JLPTLevel));
        Assert.True(await db.TopicGrammars.AnyAsync(link =>
            link.Topic.Code == "SHINKANZEN_G_N3_PURPOSE" && link.Grammar.Sources.Any(s => s.ExternalId == "tame-ni-purpose")));
        Assert.True(await db.TopicGrammars.AnyAsync(link =>
            link.Topic.Code == "SHINKANZEN_G_N3_CAUSE" && link.Grammar.Sources.Any(s => s.ExternalId == "tame-ni")));

        await using var repeatedCatalog = OpenSeed("learning-topic-catalog-n5-n3.json");
        await LearningCatalogTopicSeeder.SeedAsync(db, dataset, repeatedCatalog);
        Assert.Equal(124, await db.LearningTopics.CountAsync());
        Assert.Equal(2978, await db.TopicVocabularies.CountAsync());
        Assert.Equal(556, await db.TopicGrammars.CountAsync());
    }

    private static Stream OpenSeed(string name) =>
        typeof(LearningContentSeeder).Assembly.GetManifestResourceStream(
            $"JCAP.Data.Seeds.LearningContentSample.{name}")!;
}
