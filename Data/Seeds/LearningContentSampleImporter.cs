using System.Data;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds;

/// <summary>Explicit, insert-only sample import. Existing content and admin edits are preserved.</summary>
public static class LearningContentSampleImporter
{
    public static async Task<SampleImportResult> ImportAsync(AppDbContext db, LearningContentSampleData data)
    {
        data.Validate();
        // Serialize runs of this importer; all seven target tables commit atomically.
        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable) : null;
        if (db.Database.IsSqlServer())
        {
            await db.Database.ExecuteSqlRawAsync("""
                DECLARE @result int;
                EXEC @result = sys.sp_getapplock
                    @Resource = 'JCAP:LearningContentSampleImport', @LockMode = 'Exclusive',
                    @LockOwner = 'Transaction', @LockTimeout = 10000;
                IF @result < 0 THROW 51000, 'Learning sample import is already running.', 1;
                """);
        }

        var sources = await db.LearningContentSources.ToListAsync();
        var sourceByKey = new Dictionary<string, LearningContentSource>();
        var newSources = 0;
        foreach (var row in data.Sources)
        {
            var source = sources.SingleOrDefault(s => s.Name == row.Name && s.Version == row.Version);
            if (source is null)
            {
                source = new LearningContentSource
                {
                    Name = row.Name, Version = row.Version, SourceUrl = row.SourceUrl,
                    License = row.License, LicenseUrl = row.LicenseUrl, Attribution = row.Attribution
                };
                db.LearningContentSources.Add(source);
                sources.Add(source);
                newSources++;
            }
            sourceByKey.Add(row.Key, source);
        }

        var words = data.Vocabularies.Select(v => v.Word).ToArray();
        var vocabularyExternalIds = data.Vocabularies.Select(v => v.ExternalId).ToArray();
        var vocabularies = await db.Vocabularies
            .Include(v => v.Sources).ThenInclude(s => s.Source).Include(v => v.Examples)
            .AsSplitQuery()
            .Where(v => words.Contains(v.Word) || v.Sources.Any(s => vocabularyExternalIds.Contains(s.ExternalId)))
            .ToListAsync();
        var patterns = data.Grammars.Select(g => g.Pattern).ToArray();
        var grammarExternalIds = data.Grammars.Select(g => g.ExternalId).ToArray();
        var grammars = await db.Grammars
            .Include(g => g.Sources).ThenInclude(s => s.Source).Include(g => g.Examples)
            .AsSplitQuery()
            .Where(g => patterns.Contains(g.Pattern) || g.Sources.Any(s => grammarExternalIds.Contains(s.ExternalId)))
            .ToListAsync();

        var addedVocabulary = 0;
        var addedGrammar = 0;
        var addedVocabularyExamples = 0;
        var addedGrammarExamples = 0;
        var addedVocabularySources = 0;
        var addedGrammarSources = 0;
        var matchedVocabulary = new List<Vocabulary>();
        var matchedGrammar = new List<Grammar>();

        foreach (var row in data.Vocabularies)
        {
            var source = sourceByKey[row.SourceKey];
            var vocabulary = vocabularies.SingleOrDefault(v => v.Sources.Any(s =>
                SameSource(s.Source, source) && s.ExternalId == row.ExternalId));
            // Never merge homographs or senses on word/reading alone.
            vocabulary ??= vocabularies.SingleOrDefault(v => v.Word == row.Word
                && v.Reading == row.Reading && v.Meaning == row.Meaning
                && v.JLPTLevel == row.JLPTLevel && v.PartOfSpeech == row.PartOfSpeech);
            if (vocabulary is null)
            {
                vocabulary = new Vocabulary
                {
                    Word = row.Word, Reading = row.Reading, Meaning = row.Meaning,
                    PartOfSpeech = row.PartOfSpeech, JLPTLevel = row.JLPTLevel,
                    Explanation = row.Explanation, UsageNotes = row.UsageNotes,
                    AudioUrl = null, IsActive = true, CreatedAt = DateTime.UtcNow
                };
                db.Vocabularies.Add(vocabulary);
                vocabularies.Add(vocabulary);
                addedVocabulary++;
            }
            if (!vocabulary.Sources.Any(s => SameSource(s.Source, source) && s.ExternalId == row.ExternalId))
            {
                vocabulary.Sources.Add(new VocabularySource { Source = source, ExternalId = row.ExternalId });
                addedVocabularySources++;
            }
            foreach (var (example, index) in row.Examples.Select((e, i) => (e, i)))
            {
                var exampleSource = sourceByKey[example.SourceKey];
                if (vocabulary.Examples.Any(e => SameSource(e.Source, exampleSource)
                    && e.ExternalId == example.ExternalId)) continue;
                vocabulary.Examples.Add(new VocabularyExample
                {
                    JapaneseText = example.JapaneseText, VietnameseTranslation = example.VietnameseTranslation,
                    Furigana = example.Furigana, Source = exampleSource, ExternalId = example.ExternalId,
                    OrderIndex = vocabulary.Examples.Count == 0 ? index : vocabulary.Examples.Max(e => e.OrderIndex) + 1
                });
                addedVocabularyExamples++;
            }
            matchedVocabulary.Add(vocabulary);
        }

        foreach (var row in data.Grammars)
        {
            var source = sourceByKey[row.SourceKey];
            var grammar = grammars.SingleOrDefault(g => g.Sources.Any(s =>
                SameSource(s.Source, source) && s.ExternalId == row.ExternalId));
            grammar ??= grammars.SingleOrDefault(g => g.Pattern == row.Pattern && g.Reading == row.Reading
                && g.Meaning == row.Meaning && g.JLPTLevel == row.JLPTLevel && g.Formation == row.Formation);
            if (grammar is null)
            {
                grammar = new Grammar
                {
                    Pattern = row.Pattern, Reading = row.Reading, Meaning = row.Meaning,
                    Formation = row.Formation, JLPTLevel = row.JLPTLevel, Explanation = row.Explanation,
                    UsageNotes = row.UsageNotes, ExampleSentence = row.Examples[0].JapaneseText,
                    IsActive = true, CreatedAt = DateTime.UtcNow
                };
                db.Grammars.Add(grammar);
                grammars.Add(grammar);
                addedGrammar++;
            }
            if (!grammar.Sources.Any(s => SameSource(s.Source, source) && s.ExternalId == row.ExternalId))
            {
                grammar.Sources.Add(new GrammarSource { Source = source, ExternalId = row.ExternalId });
                addedGrammarSources++;
            }
            foreach (var (example, index) in row.Examples.Select((e, i) => (e, i)))
            {
                var exampleSource = sourceByKey[example.SourceKey];
                if (grammar.Examples.Any(e => SameSource(e.Source, exampleSource)
                    && e.ExternalId == example.ExternalId)) continue;
                grammar.Examples.Add(new GrammarExample
                {
                    JapaneseText = example.JapaneseText, VietnameseTranslation = example.VietnameseTranslation,
                    Furigana = example.Furigana, Source = exampleSource, ExternalId = example.ExternalId,
                    OrderIndex = grammar.Examples.Count == 0 ? index : grammar.Examples.Max(e => e.OrderIndex) + 1
                });
                addedGrammarExamples++;
            }
            matchedGrammar.Add(grammar);
        }

        await db.SaveChangesAsync();
        if (transaction is not null) await transaction.CommitAsync();
        return new SampleImportResult(newSources, addedVocabulary, addedGrammar, addedVocabularyExamples,
            addedGrammarExamples, addedVocabularySources, addedGrammarSources,
            matchedVocabulary.Select(v => v.Id).ToArray(), matchedGrammar.Select(g => g.Id).ToArray());
    }

    private static bool SameSource(LearningContentSource? left, LearningContentSource right) =>
        left is not null && left.Name == right.Name && left.Version == right.Version;
}

public sealed record SampleImportResult(int AddedSources, int AddedVocabularies, int AddedGrammars,
    int AddedVocabularyExamples, int AddedGrammarExamples, int AddedVocabularySources, int AddedGrammarSources,
    int[] VocabularyIds, int[] GrammarIds);
