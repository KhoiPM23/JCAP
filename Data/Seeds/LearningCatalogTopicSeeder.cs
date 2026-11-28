using System.Text.Json;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds;

internal static class LearningCatalogTopicSeeder
{
    public static async Task SeedAsync(AppDbContext db, LearningContentSampleData dataset, Stream mapping)
    {
        var seeds = await JsonSerializer.DeserializeAsync<TopicSeed[]>(mapping)
            ?? throw new InvalidDataException("The learning topic mapping is empty.");
        var codes = seeds.Select(seed => seed.Code).ToArray();
        var names = seeds.Select(seed => seed.Name).ToArray();
        var existingTopics = await db.LearningTopics.AsNoTracking()
            .Where(topic => codes.Contains(topic.Code) || names.Contains(topic.Name))
            .Select(topic => new { topic.Code, topic.Name, topic.JLPTLevel })
            .ToListAsync();

        var newTopics = seeds.Where(seed => !existingTopics.Any(topic =>
            string.Equals(topic.Code, seed.Code, StringComparison.OrdinalIgnoreCase)
            || (topic.JLPTLevel == seed.Level
                && string.Equals(topic.Name, seed.Name, StringComparison.OrdinalIgnoreCase)))).ToArray();
        if (newTopics.Length == 0)
            return;

        var vocabularySource = dataset.Sources.Single(source => source.Key == "openjlpt");
        var grammarSource = dataset.Sources.Single(source => source.Key == "nihongo-mono");
        var vocabularyLinks = await db.VocabularySources.AsNoTracking()
            .Where(link => link.Source.Name == vocabularySource.Name && link.Source.Version == vocabularySource.Version)
            .Select(link => new { link.ExternalId, Id = link.VocabularyId, link.Vocabulary.JLPTLevel }).ToListAsync();
        var grammarLinks = await db.GrammarSources.AsNoTracking()
            .Where(link => link.Source.Name == grammarSource.Name && link.Source.Version == grammarSource.Version)
            .Select(link => new { link.ExternalId, Id = link.GrammarId, link.Grammar.JLPTLevel }).ToListAsync();
        var vocabularyIds = vocabularyLinks.ToDictionary(link => (link.JLPTLevel, link.ExternalId), link => link.Id);
        var grammarIds = grammarLinks.ToDictionary(link => (link.JLPTLevel, link.ExternalId), link => link.Id);

        foreach (var seed in newTopics)
        {
            var vocabulary = seed.VocabularyExternalIds.Select(id => vocabularyIds.GetValueOrDefault((seed.Level, id)))
                .Where(id => id != 0).Distinct().ToArray();
            var grammar = seed.GrammarExternalIds.Select(id => grammarIds.GetValueOrDefault((seed.Level, id)))
                .Where(id => id != 0).Distinct().ToArray();
            if (vocabulary.Length + grammar.Length == 0)
                continue;

            db.LearningTopics.Add(new LearningTopic
            {
                Code = seed.Code,
                Name = seed.Name,
                Description = seed.Description,
                JLPTLevel = seed.Level,
                TopicVocabularies = vocabulary.Select((id, index) => new TopicVocabulary
                {
                    VocabularyId = id,
                    OrderIndex = index
                }).ToList(),
                TopicGrammars = grammar.Select((id, index) => new TopicGrammar
                {
                    GrammarId = id,
                    OrderIndex = index
                }).ToList()
            });
        }

        await db.SaveChangesAsync();
    }

    private sealed record TopicSeed(string Code, string Name, string? Description)
    {
        public string Level { get; init; } = "N5";
        public string[] VocabularyExternalIds { get; init; } = [];
        public string[] GrammarExternalIds { get; init; } = [];
    }
}
