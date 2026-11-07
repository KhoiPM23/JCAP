using System.Data;
using System.Text.Json;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds;

public static class LearningContentFullCommand
{
    public static async Task<int> RunAsync(AppDbContext db, string datasetPath, bool dryRun)
    {
        try
        {
            var connection = LearningContentSampleCommand.RequireLocalConnection(db);
            await using var file = File.OpenRead(datasetPath);
            var bundle = await JsonSerializer.DeserializeAsync<Bundle>(file)
                ?? throw new InvalidOperationException("Learning dataset is empty.");
            Validate(bundle);

            Console.WriteLine($"Local database: {connection.DataSource} / {connection.InitialCatalog}");
            foreach (var level in new[] { "N5", "N4", "N3" })
                Console.WriteLine($"{level}: {bundle.Dataset.Vocabularies.Count(v => v.JLPTLevel == level)} vocabulary, "
                    + $"{bundle.Dataset.Grammars.Count(g => g.JLPTLevel == level)} grammar, "
                    + $"{bundle.Topics.Count(t => t.JLPTLevel == level)} topics.");
            var pending = (await db.Database.GetPendingMigrationsAsync()).ToArray();
            Console.WriteLine("Pending migrations: " + JsonSerializer.Serialize(pending));
            if (dryRun) return 0;
            if (pending.Length > 0) await db.Database.MigrateAsync();

            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var result = await LearningContentSampleImporter.ImportAsync(db, bundle.Dataset, full: true);
            var topicResult = await AddTopicsAsync(db, bundle, result);
            await transaction.CommitAsync();

            Console.WriteLine(JsonSerializer.Serialize(new
            {
                result.AddedSources, result.AddedVocabularies, result.AddedGrammars,
                result.AddedVocabularyExamples, result.AddedGrammarExamples,
                result.AddedVocabularySources, result.AddedGrammarSources, Topics = topicResult
            }));
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Full learning import failed ({error.GetType().Name}).");
            if (error is InvalidOperationException && error.InnerException is null)
                Console.Error.WriteLine(error.Message);
            if (error is DbUpdateException { InnerException: Microsoft.Data.SqlClient.SqlException sqlError })
                Console.Error.WriteLine($"SQL Server error number: {sqlError.Number}.");
            return 1;
        }
    }

    private static void Validate(Bundle bundle)
    {
        bundle.Dataset.Validate(full: true);
        var vocab = bundle.Dataset.Vocabularies.ToDictionary(v => v.ExternalId, v => v.JLPTLevel);
        var grammar = bundle.Dataset.Grammars.ToDictionary(g => g.ExternalId, g => g.JLPTLevel);
        var assignedVocab = new HashSet<string>();
        var assignedGrammar = new HashSet<string>();
        var codes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var names = new HashSet<(string Name, string Level)>();

        foreach (var topic in bundle.Topics)
        {
            if (string.IsNullOrWhiteSpace(topic.Code) || topic.Code.Length > 50 || !codes.Add(topic.Code)
                || string.IsNullOrWhiteSpace(topic.Name) || topic.Name.Length > 200 || !names.Add((topic.Name.ToUpperInvariant(), topic.JLPTLevel))
                || string.IsNullOrWhiteSpace(topic.Description) || topic.Description.Length > 1000
                || (topic.VocabularyIds.Length == 0) == (topic.GrammarIds.Length == 0))
                throw new InvalidOperationException($"Invalid full-import topic: {topic.Code}.");

            ValidateLinks(topic.VocabularyIds, vocab, assignedVocab, topic);
            ValidateLinks(topic.GrammarIds, grammar, assignedGrammar, topic);
        }
        if (assignedVocab.Count != vocab.Count || assignedGrammar.Count != grammar.Count)
            throw new InvalidOperationException("Every source record must belong to a same-level topic.");
    }

    private static void ValidateLinks(string[] ids, Dictionary<string, string> levels, HashSet<string> assigned, TopicRow topic)
    {
        foreach (var id in ids)
            if (levels.GetValueOrDefault(id) != topic.JLPTLevel || !assigned.Add(id))
                throw new InvalidOperationException($"Invalid or repeated content assignment in {topic.Code}: {id}.");
    }

    private static async Task<TopicResult> AddTopicsAsync(AppDbContext db, Bundle bundle, SampleImportResult result)
    {
        var vocabIds = bundle.Dataset.Vocabularies.Zip(result.VocabularyIds).ToDictionary(x => x.First.ExternalId, x => x.Second);
        var grammarIds = bundle.Dataset.Grammars.Zip(result.GrammarIds).ToDictionary(x => x.First.ExternalId, x => x.Second);
        var vocabLevels = await db.Vocabularies.Where(v => v.IsActive).ToDictionaryAsync(v => v.Id, v => v.JLPTLevel ?? "N5");
        var grammarLevels = await db.Grammars.Where(g => g.IsActive).ToDictionaryAsync(g => g.Id, g => g.JLPTLevel ?? "N5");
        var existing = await db.LearningTopics.AsNoTracking().Select(t => new { t.Code, t.Name, t.JLPTLevel }).ToListAsync();
        var added = 0;
        var vocabLinks = 0;
        var grammarLinks = 0;
        var skipped = new List<string>();

        foreach (var row in bundle.Topics)
        {
            if (existing.Any(t => t.Code.Equals(row.Code, StringComparison.OrdinalIgnoreCase)
                || (t.JLPTLevel == row.JLPTLevel && t.Name.Equals(row.Name, StringComparison.OrdinalIgnoreCase))))
            {
                skipped.Add(row.Code);
                continue;
            }
            var topic = new LearningTopic { Code = row.Code, Name = row.Name, Description = row.Description, JLPTLevel = row.JLPTLevel };
            foreach (var id in row.VocabularyIds.Select(id => vocabIds[id]).Distinct().Where(id => vocabLevels.GetValueOrDefault(id) == row.JLPTLevel))
                topic.TopicVocabularies.Add(new TopicVocabulary { VocabularyId = id, OrderIndex = topic.TopicVocabularies.Count });
            foreach (var id in row.GrammarIds.Select(id => grammarIds[id]).Distinct().Where(id => grammarLevels.GetValueOrDefault(id) == row.JLPTLevel))
                topic.TopicGrammars.Add(new TopicGrammar { GrammarId = id, OrderIndex = topic.TopicGrammars.Count });
            if (topic.TopicVocabularies.Count + topic.TopicGrammars.Count == 0)
            {
                skipped.Add(row.Code);
                continue;
            }
            db.LearningTopics.Add(topic);
            added++;
            vocabLinks += topic.TopicVocabularies.Count;
            grammarLinks += topic.TopicGrammars.Count;
        }

        await db.SaveChangesAsync();
        return new(added, vocabLinks, grammarLinks, skipped);
    }

    private sealed record Bundle(LearningContentSampleData Dataset, TopicRow[] Topics);
    private sealed record TopicRow(string Code, string Name, string JLPTLevel, string Description, string[] VocabularyIds, string[] GrammarIds);
    private sealed record TopicResult(int AddedTopics, int AddedVocabularyLinks, int AddedGrammarLinks, List<string> SkippedTopicCodes);
}
