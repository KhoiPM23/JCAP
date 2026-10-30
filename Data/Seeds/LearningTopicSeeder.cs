using System.Data;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds;

/// <summary>
/// Links the existing, attributed sample content to flat topics. Never imports another copy
/// of a word/grammar and never resets existing topics or admin-managed associations.
/// </summary>
public static class LearningTopicSeeder
{
    public static async Task SeedAsync(IServiceProvider services)
    {
        await SeedAsync(services.GetRequiredService<AppDbContext>());
    }

    public static async Task<LearningTopicSeedResult> SeedAsync(AppDbContext db)
    {
        var data = LearningContentSampleData.Load();
        var vocabularySource = data.Sources.Single(s => s.Key == "openjlpt");
        var grammarSource = data.Sources.Single(s => s.Key == "nihongo-mono");

        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable) : null;
        if (db.Database.IsSqlServer())
        {
            await db.Database.ExecuteSqlRawAsync("""
                DECLARE @result int;
                EXEC @result = sys.sp_getapplock
                    @Resource = 'JCAP:LearningTopicSampleSeed', @LockMode = 'Exclusive',
                    @LockOwner = 'Transaction', @LockTimeout = 10000;
                IF @result < 0 THROW 51000, 'Learning topic seed is already running.', 1;
                """);
        }

        // Match stable source IDs, not DB identity values or mutable display text.
        var vocabularyLinks = await db.VocabularySources.AsNoTracking()
            .Where(s => s.Source.Name == vocabularySource.Name && s.Source.Version == vocabularySource.Version)
            .Select(s => new { s.ExternalId, s.VocabularyId }).ToListAsync();
        var grammarLinks = await db.GrammarSources.AsNoTracking()
            .Where(s => s.Source.Name == grammarSource.Name && s.Source.Version == grammarSource.Version)
            .Select(s => new { s.ExternalId, s.GrammarId }).ToListAsync();
        var vocabulariesByWord = data.Vocabularies.ToDictionary(v => v.Word,
            v => vocabularyLinks.Where(s => s.ExternalId == v.ExternalId)
                .Select(s => (int?)s.VocabularyId).SingleOrDefault());
        var grammarsByExternalId = data.Grammars.ToDictionary(g => g.ExternalId,
            g => grammarLinks.Where(s => s.ExternalId == g.ExternalId)
                .Select(s => (int?)s.GrammarId).SingleOrDefault());

        var seeds = LearningTopicSeedData.Topics;
        var codes = seeds.Select(s => s.Code).ToArray();
        var names = seeds.Select(s => s.Name).ToArray();
        var existingTopics = await db.LearningTopics
            .Where(t => codes.Contains(t.Code) || names.Contains(t.Name)).ToListAsync();
        var addedTopics = 0;
        var addedVocabularyLinks = 0;
        var addedGrammarLinks = 0;
        var matchedTopics = new List<LearningTopic>();
        var skippedTopics = new List<string>();
        foreach (var seed in seeds)
        {
            var existing = existingTopics.SingleOrDefault(t => t.Code == seed.Code);
            if (existing is not null)
            {
                // A topic already handed to admin is not reseeded, even if links were removed.
                matchedTopics.Add(existing);
                continue;
            }
            if (existingTopics.Any(t => t.Name == seed.Name && t.JLPTLevel == seed.JLPTLevel))
                throw new InvalidOperationException($"Topic name is already used by another code: {seed.Name}");
            if (seed.VocabularyWords.Any(w => !vocabulariesByWord.GetValueOrDefault(w).HasValue)
                || seed.GrammarExternalIds.Any(id => !grammarsByExternalId.GetValueOrDefault(id).HasValue))
            {
                // Normal startup must not silently import the sample dataset or make empty topics.
                skippedTopics.Add(seed.Code);
                continue;
            }

            var topic = new LearningTopic
            {
                Code = seed.Code, Name = seed.Name, Description = seed.Description, JLPTLevel = seed.JLPTLevel,
                IsActive = true, CreatedAt = DateTime.UtcNow
            };
            foreach (var (word, index) in seed.VocabularyWords.Select((word, index) => (word, index)))
                topic.TopicVocabularies.Add(new TopicVocabulary
                {
                    VocabularyId = vocabulariesByWord[word]!.Value, OrderIndex = index
                });
            foreach (var (externalId, index) in seed.GrammarExternalIds.Select((id, index) => (id, index)))
                topic.TopicGrammars.Add(new TopicGrammar
                {
                    GrammarId = grammarsByExternalId[externalId]!.Value, OrderIndex = index
                });
            db.LearningTopics.Add(topic);
            matchedTopics.Add(topic);
            addedTopics++;
            addedVocabularyLinks += topic.TopicVocabularies.Count;
            addedGrammarLinks += topic.TopicGrammars.Count;
        }

        await db.SaveChangesAsync();
        if (transaction is not null) await transaction.CommitAsync();
        return new LearningTopicSeedResult(addedTopics, addedVocabularyLinks, addedGrammarLinks,
            matchedTopics.Select(t => t.Id).ToArray(), skippedTopics.ToArray());
    }
}

public sealed record LearningTopicSeedResult(int AddedTopics, int AddedVocabularyLinks,
    int AddedGrammarLinks, int[] TopicIds, string[] SkippedTopicCodes);
