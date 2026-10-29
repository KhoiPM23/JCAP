using JCAP.Data;
using JCAP.Data.Seeds;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Tests.Models;

public class LearningContentSampleImporterTests
{
    private static AppDbContext CreateContext() => new(new DbContextOptionsBuilder<AppDbContext>()
        .UseInMemoryDatabase($"LearningSample_{Guid.NewGuid()}").Options);

    [Fact]
    public void BundledSample_HasBalancedLevelsAndTraceableBilingualExamples()
    {
        var data = LearningContentSampleData.Load();
        Assert.Equal(15, data.Vocabularies.Length);
        Assert.Equal(6, data.Grammars.Length);
        Assert.Equal(3, data.Sources.Length);
        foreach (var level in new[] { "N5", "N4", "N3" })
        {
            Assert.Equal(5, data.Vocabularies.Count(v => v.JLPTLevel == level));
            Assert.Equal(2, data.Grammars.Count(g => g.JLPTLevel == level));
        }
        var examples = data.Vocabularies.SelectMany(v => v.Examples)
            .Concat(data.Grammars.SelectMany(g => g.Examples)).ToArray();
        Assert.Equal(42, examples.Length);
        Assert.All(examples, example =>
        {
            Assert.False(string.IsNullOrWhiteSpace(example.JapaneseText));
            Assert.False(string.IsNullOrWhiteSpace(example.VietnameseTranslation));
            Assert.False(string.IsNullOrWhiteSpace(example.ExternalId));
            if (example.Furigana is not null)
            {
                Assert.DoesNotContain("｜", example.Furigana);
                var plain = System.Text.RegularExpressions.Regex.Replace(example.Furigana,
                    @"\{([^{}|]+)\|[^{}|]+\}", "$1");
                Assert.Equal(example.JapaneseText, plain);
            }
        });
        Assert.Contains(data.Vocabularies, v => v.UsageNotes is null);
        Assert.Contains(data.Vocabularies, v => v.UsageNotes is not null);
        Assert.All(data.Sources, s => Assert.False(string.IsNullOrWhiteSpace(s.Attribution)));
    }

    [Fact]
    public async Task Import_StoresSampleWithStableLinks_AndSecondRunAddsNothing()
    {
        await using var db = CreateContext();
        var data = LearningContentSampleData.Load();
        var first = await LearningContentSampleImporter.ImportAsync(db, data);
        Assert.Equal(15, first.AddedVocabularies);
        Assert.Equal(6, first.AddedGrammars);
        Assert.Equal(30, first.AddedVocabularyExamples);
        Assert.Equal(12, first.AddedGrammarExamples);
        Assert.Equal(15, first.AddedVocabularySources);
        Assert.Equal(6, first.AddedGrammarSources);
        Assert.Equal(3, first.AddedSources);
        db.ChangeTracker.Clear();

        var second = await LearningContentSampleImporter.ImportAsync(db, data);
        AssertNoAdds(second);
        Assert.Equal(first.VocabularyIds, second.VocabularyIds);
        Assert.Equal(first.GrammarIds, second.GrammarIds);
        Assert.Equal(15, await db.Vocabularies.CountAsync());
        Assert.Equal(6, await db.Grammars.CountAsync());
        Assert.Equal(30, await db.VocabularyExamples.CountAsync());
        Assert.Equal(12, await db.GrammarExamples.CountAsync());
        Assert.All(await db.Vocabularies.ToListAsync(), v => Assert.Null(v.AudioUrl));
        Assert.All(await db.Grammars.Include(g => g.Examples).ToListAsync(), g =>
            Assert.Equal(g.Examples.OrderBy(e => e.OrderIndex).First().JapaneseText, g.ExampleSentence));
        Assert.Empty(await db.LearningTopics.ToListAsync());
        Assert.Empty(await db.TopicVocabularies.ToListAsync());
        Assert.Empty(await db.TopicGrammars.ToListAsync());
        Assert.Empty(await db.ShadowingDialogueVocabularies.ToListAsync());
        Assert.Empty(await db.ShadowingDialogueGrammars.ToListAsync());
        Assert.Empty(await db.Scenarios.ToListAsync());
    }

    [Fact]
    public async Task Reimport_PreservesAdminEditsIncludingRenamedContentAndInactiveFlags()
    {
        await using var db = CreateContext();
        var data = LearningContentSampleData.Load();
        var first = await LearningContentSampleImporter.ImportAsync(db, data);
        var vocabulary = await db.Vocabularies.Include(v => v.Examples).SingleAsync(v => v.Id == first.VocabularyIds[0]);
        var grammar = await db.Grammars.Include(g => g.Examples).SingleAsync(g => g.Id == first.GrammarIds[0]);
        vocabulary.Word = "admin-edited-word";
        vocabulary.Meaning = "Nghĩa do admin chỉnh sửa";
        vocabulary.UsageNotes = "Lưu ý mới";
        vocabulary.AudioUrl = "/audio/custom.mp3";
        vocabulary.IsActive = false;
        grammar.Pattern = "admin-edited-pattern";
        grammar.Explanation = "Giải thích đã được hiệu đính";
        grammar.IsActive = false;
        var example = vocabulary.Examples.First();
        example.VietnameseTranslation = "Bản dịch do admin chỉnh sửa";
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var second = await LearningContentSampleImporter.ImportAsync(db, data);
        AssertNoAdds(second);
        Assert.Equal(first.VocabularyIds, second.VocabularyIds);
        vocabulary = await db.Vocabularies.Include(v => v.Examples).SingleAsync(v => v.Id == vocabulary.Id);
        grammar = await db.Grammars.SingleAsync(g => g.Id == grammar.Id);
        Assert.Equal("Nghĩa do admin chỉnh sửa", vocabulary.Meaning);
        Assert.Equal("Lưu ý mới", vocabulary.UsageNotes);
        Assert.Equal("/audio/custom.mp3", vocabulary.AudioUrl);
        Assert.False(vocabulary.IsActive);
        Assert.False(grammar.IsActive);
        Assert.Equal("Giải thích đã được hiệu đính", grammar.Explanation);
        Assert.Contains(vocabulary.Examples, e => e.VietnameseTranslation == "Bản dịch do admin chỉnh sửa");
    }

    [Fact]
    public async Task Import_ReusesExactExistingSense_ButDoesNotOverwriteOrMergeAnotherSense()
    {
        await using var db = CreateContext();
        var data = LearningContentSampleData.Load();
        var row = data.Vocabularies[0];
        var existing = new Vocabulary
        {
            Word = row.Word, Reading = row.Reading, Meaning = row.Meaning,
            PartOfSpeech = row.PartOfSpeech, JLPTLevel = row.JLPTLevel,
            Explanation = "Giải thích cũ cần giữ", IsActive = false
        };
        var anotherSense = new Vocabulary
        {
            Word = row.Word, Reading = row.Reading, Meaning = "Một nghĩa khác",
            PartOfSpeech = row.PartOfSpeech, JLPTLevel = row.JLPTLevel
        };
        var topic = new LearningTopic { Code = "EXISTING", Name = "Chủ đề đã có" };
        topic.TopicVocabularies.Add(new TopicVocabulary { Vocabulary = anotherSense });
        db.LearningTopics.Add(topic);
        db.Vocabularies.Add(existing);
        await db.SaveChangesAsync();
        var result = await LearningContentSampleImporter.ImportAsync(db, data);
        Assert.Equal(14, result.AddedVocabularies);
        Assert.Equal(existing.Id, result.VocabularyIds[0]);
        Assert.Equal("Giải thích cũ cần giữ", existing.Explanation);
        Assert.False(existing.IsActive);
        Assert.Empty(anotherSense.Sources);
        Assert.Equal(16, await db.Vocabularies.CountAsync());
        Assert.Equal(1, await db.LearningTopics.CountAsync());
        Assert.Equal(anotherSense.Id, (await db.TopicVocabularies.SingleAsync()).VocabularyId);
    }

    [Fact]
    public async Task InvalidSourceReference_IsRejectedBeforeAnyWrite()
    {
        await using var db = CreateContext();
        var data = LearningContentSampleData.Load();
        var first = data.Vocabularies[0] with { SourceKey = "missing-source" };
        var invalid = data with { Vocabularies = [first, .. data.Vocabularies.Skip(1)] };
        await Assert.ThrowsAsync<InvalidOperationException>(() => LearningContentSampleImporter.ImportAsync(db, invalid));
        Assert.Empty(db.ChangeTracker.Entries());
        Assert.Equal(0, await db.LearningContentSources.CountAsync());
        Assert.Equal(0, await db.Vocabularies.CountAsync());
    }

    private static void AssertNoAdds(SampleImportResult result)
    {
        Assert.Equal(0, result.AddedSources);
        Assert.Equal(0, result.AddedVocabularies);
        Assert.Equal(0, result.AddedGrammars);
        Assert.Equal(0, result.AddedVocabularyExamples);
        Assert.Equal(0, result.AddedGrammarExamples);
        Assert.Equal(0, result.AddedVocabularySources);
        Assert.Equal(0, result.AddedGrammarSources);
    }
}
