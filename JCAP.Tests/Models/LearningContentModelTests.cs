using JCAP.Data;
using JCAP.Migrations;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;

namespace JCAP.Tests.Models;

public class LearningContentModelTests
{
    private static AppDbContext CreateSqlModelContext() => new(
        new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer("Server=localhost;Database=JCAP_ModelTests;Integrated Security=True;TrustServerCertificate=True")
            .Options);

    private static AppDbContext CreateMemoryContext() => new(
        new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"LearningContent_{Guid.NewGuid()}")
            .Options);

    [Fact]
    public void Topic_IsFlatAndIndependentOfOtherModuleModels()
    {
        using var context = CreateSqlModelContext();
        var model = context.GetService<IDesignTimeModel>().Model;
        var topic = model.FindEntityType(typeof(LearningTopic))!;
        Assert.Null(topic.FindProperty("ParentTopicId"));
        Assert.NotNull(topic.FindProperty("JLPTLevel"));
        Assert.False(topic.FindProperty("JLPTLevel")!.IsNullable);
        Assert.Empty(topic.GetForeignKeys());
        Assert.Equal(new[] { typeof(TopicGrammar), typeof(TopicVocabulary) }.OrderBy(t => t.Name),
            model.GetEntityTypes().SelectMany(e => e.GetForeignKeys())
                .Where(fk => fk.PrincipalEntityType == topic)
                .Select(fk => fk.DeclaringEntityType.ClrType).OrderBy(t => t.Name));
        Assert.Equal(true, topic.FindProperty(nameof(LearningTopic.IsActive))!.GetDefaultValue());
        Assert.Equal(true, topic.FindProperty(nameof(LearningTopic.IsActive))!.Sentinel);
        Assert.Contains(topic.GetIndexes(), index => index.IsUnique
            && index.Properties.Select(p => p.Name).SequenceEqual(new[] { "Code" }));
        Assert.Contains(topic.GetIndexes(), index => index.IsUnique
            && index.Properties.Select(p => p.Name).SequenceEqual(new[] { "Name", "JLPTLevel" }));
    }

    [Theory]
    [InlineData(typeof(TopicVocabulary), "VocabularyId")]
    [InlineData(typeof(TopicGrammar), "GrammarId")]
    public void TopicLinks_RejectDuplicatePairsWithoutDuplicatingMasterContent(Type type, string contentId)
    {
        using var context = CreateSqlModelContext();
        var entity = context.GetService<IDesignTimeModel>().Model.FindEntityType(type)!;
        Assert.Equal(new[] { "TopicId", contentId }, entity.FindPrimaryKey()!.Properties.Select(p => p.Name));
        Assert.All(entity.GetForeignKeys(), fk => Assert.Equal(DeleteBehavior.Cascade, fk.DeleteBehavior));
        Assert.Contains(entity.GetCheckConstraints(), check => check.Sql == "[OrderIndex] >= 0");
    }

    [Fact]
    public async Task OneContent_CanBelongToMultipleTopicsAtItsOwnLevel()
    {
        using var context = CreateMemoryContext();
        var eating = new LearningTopic { Code = "DINING", Name = "Ăn uống" };
        var daily = new LearningTopic { Code = "DAILY_LIFE", Name = "Sinh hoạt hằng ngày" };
        var advancedTopic = new LearningTopic { Code = "DINING_N3", Name = "Ăn uống", JLPTLevel = "N3" };
        var vocabulary = new Vocabulary { Word = "食べる", Reading = "たべる", Meaning = "Ăn", JLPTLevel = "N5" };
        var grammar = new Grammar { Pattern = "〜てもいい", Reading = "てもいい", Meaning = "Được phép", JLPTLevel = "N5" };
        var advanced = new Vocabulary { Word = "食欲", Reading = "しょくよく", Meaning = "Sự thèm ăn", JLPTLevel = "N3" };
        eating.TopicVocabularies.Add(new() { Vocabulary = vocabulary });
        daily.TopicVocabularies.Add(new() { Vocabulary = vocabulary });
        advancedTopic.TopicVocabularies.Add(new() { Vocabulary = advanced });
        eating.TopicGrammars.Add(new() { Grammar = grammar });
        daily.TopicGrammars.Add(new() { Grammar = grammar });
        context.LearningTopics.AddRange(eating, daily, advancedTopic);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var topicIds = new[] { eating.Id, daily.Id };
        var vocabularies = await context.Vocabularies
            .Where(v => v.TopicVocabularies.Any(link => topicIds.Contains(link.TopicId)))
            .ToListAsync();
        var grammars = await context.Grammars
            .Where(g => g.TopicGrammars.Any(link => topicIds.Contains(link.TopicId)))
            .ToListAsync();
        Assert.Single(vocabularies);
        Assert.Single(grammars);
        Assert.Equal(3, await context.TopicVocabularies.CountAsync());
        Assert.Equal(2, await context.TopicGrammars.CountAsync());
        Assert.Single(await context.Vocabularies.Where(v => v.JLPTLevel == "N5"
            && v.TopicVocabularies.Any(link => link.TopicId == eating.Id)).ToListAsync());

        vocabulary = await context.Vocabularies.SingleAsync(v => v.Id == vocabulary.Id);
        vocabulary.Meaning = "Ăn; dùng thức ăn";
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        var linkedMeanings = await context.TopicVocabularies
            .Where(link => link.VocabularyId == vocabulary.Id)
            .Select(link => link.Vocabulary.Meaning).ToListAsync();
        Assert.Equal(2, linkedMeanings.Count);
        Assert.All(linkedMeanings, meaning => Assert.Equal("Ăn; dùng thức ăn", meaning));
    }

    [Fact]
    public async Task Content_SupportsMultipleExamplesAndSeveralTraceableSources()
    {
        using var context = CreateMemoryContext();
        var dictionary = NewSource("OpenJLPT", "CC BY-SA 4.0");
        var explanation = NewSource("Tomoshi", "CC BY-SA 4.0");
        var sentences = NewSource("Tatoeba", "CC BY 2.0 FR");
        var grammarSource = NewSource("Nihongo Mono", "MIT");
        var vocabulary = new Vocabulary
        {
            Word = "食べる", Meaning = new string('あ', 900), PartOfSpeech = "Động từ nhóm 2; tha động từ",
            Explanation = "Giải thích nghĩa, cách dùng và ngữ cảnh.",
            UsageNotes = "Lưu ý sử dụng và các lỗi thường gặp.",
            Sources = new List<VocabularySource>
            {
                new() { Source = dictionary, ExternalId = "vocab-taberu" },
                new() { Source = explanation, ExternalId = "1358280" }
            },
            Examples = new List<VocabularyExample>
            {
                new() { JapaneseText = "パンを食べます。", VietnameseTranslation = "Tôi ăn bánh mì.",
                    Furigana = "パンを{食|た}べます。", Source = sentences, ExternalId = "sentence-1" },
                new() { JapaneseText = "一緒に食べませんか。", VietnameseTranslation = "Cùng ăn nhé?", OrderIndex = 1 }
            }
        };
        var grammar = new Grammar
        {
            Pattern = "〜てもいい", Reading = "てもいい", Meaning = "Được phép",
            Formation = "Vて + もいい\nNでもいい", Explanation = "Giải thích ý nghĩa và cách dùng.",
            UsageNotes = "Các lỗi thường gặp khi xin phép.",
            ExampleSentence = "ここで食べてもいいですか。",
            Sources = new List<GrammarSource> { new() { Source = grammarSource, ExternalId = "te-mo-ii" } },
            Examples = new List<GrammarExample>
            {
                new() { JapaneseText = "この辞書を使ってもいいですか。", VietnameseTranslation = "Tôi dùng từ điển này được không?",
                    Source = grammarSource, ExternalId = "te-mo-ii:1" },
                new() { JapaneseText = "ここで食べてもいいですか。", OrderIndex = 1 }
            }
        };
        context.AddRange(vocabulary, grammar);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var savedVocabulary = await context.Vocabularies.Include(v => v.Examples)
            .Include(v => v.Sources).ThenInclude(link => link.Source).SingleAsync();
        var savedGrammar = await context.Grammars.Include(g => g.Examples)
            .Include(g => g.Sources).SingleAsync();
        Assert.Equal(2, savedVocabulary.Examples.Count);
        Assert.Equal(2, savedVocabulary.Sources.Count);
        Assert.Equal(900, savedVocabulary.Meaning.Length);
        Assert.Equal(vocabulary.Explanation, savedVocabulary.Explanation);
        Assert.Equal(vocabulary.UsageNotes, savedVocabulary.UsageNotes);
        Assert.Contains(savedVocabulary.Sources, link => link.Source.Name == "Tomoshi");
        Assert.Equal("パンを{食|た}べます。", savedVocabulary.Examples.Single(e => e.OrderIndex == 0).Furigana);
        Assert.Equal(2, savedGrammar.Examples.Count);
        Assert.Equal("てもいい", savedGrammar.Reading);
        Assert.Equal(grammar.Explanation, savedGrammar.Explanation);
        Assert.Equal(grammar.UsageNotes, savedGrammar.UsageNotes);
        Assert.Equal("ここで食べてもいいですか。", savedGrammar.ExampleSentence);
        Assert.Null(savedGrammar.Examples.Single(e => e.OrderIndex == 1).VietnameseTranslation);
    }

    [Fact]
    public void ExistingModuleForeignKeys_AreUnchanged()
    {
        using var context = CreateSqlModelContext();
        var before = new AddLearnerFlashcardAndBookmarkEntities().TargetModel;
        var current = context.GetService<IDesignTimeModel>().Model;
        var masters = new[] { typeof(Vocabulary).FullName!, typeof(Grammar).FullName! };
        var previousReferences = before.GetEntityTypes().SelectMany(entity => entity.GetForeignKeys())
            .Where(fk => masters.Contains(fk.PrincipalEntityType.Name)).ToArray();
        Assert.NotEmpty(previousReferences);
        foreach (var previousReference in previousReferences)
        {
            var currentEntity = current.FindEntityType(previousReference.DeclaringEntityType.Name)!;
            Assert.Contains(currentEntity.GetForeignKeys(), fk =>
                fk.PrincipalEntityType.Name == previousReference.PrincipalEntityType.Name
                && fk.Properties.Select(p => p.Name).SequenceEqual(previousReference.Properties.Select(p => p.Name))
                && fk.DeleteBehavior == previousReference.DeleteBehavior);
        }
    }

    [Fact]
    public void LongerMeanings_FitFlashcardHistoryAndSqlServerIndexKeys()
    {
        using var context = CreateSqlModelContext();
        var model = context.GetService<IDesignTimeModel>().Model;
        var vocabulary = model.FindEntityType(typeof(Vocabulary))!;
        var grammar = model.FindEntityType(typeof(Grammar))!;
        var history = model.FindEntityType(typeof(FlashcardReviewLog))!;
        var historyLimit = history.FindProperty(nameof(FlashcardReviewLog.MeaningSnapshot))!.GetMaxLength();
        Assert.Equal(1000, vocabulary.FindProperty(nameof(Vocabulary.Meaning))!.GetMaxLength());
        Assert.Equal(1000, grammar.FindProperty(nameof(Grammar.Meaning))!.GetMaxLength());
        Assert.True(historyLimit >= vocabulary.FindProperty(nameof(Vocabulary.Meaning))!.GetMaxLength());
        Assert.True(historyLimit >= grammar.FindProperty(nameof(Grammar.Meaning))!.GetMaxLength());
        foreach (var entity in new[] { vocabulary, grammar })
        {
            Assert.DoesNotContain(entity.GetIndexes(), index => index.Properties.Any(p => p.Name == "Meaning"));
            Assert.All(entity.GetIndexes(), index =>
                Assert.True(index.Properties.Sum(property => (property.GetMaxLength() ?? 4) * 2) <= 1700));
        }
    }

    [Theory]
    [InlineData(typeof(VocabularyExample))]
    [InlineData(typeof(GrammarExample))]
    public void Examples_AreUnicodeAndProtectSourceAttribution(Type type)
    {
        using var context = CreateSqlModelContext();
        var example = context.GetService<IDesignTimeModel>().Model.FindEntityType(type)!;
        Assert.False(example.FindProperty("JapaneseText")!.IsNullable);
        Assert.Equal("nvarchar(2000)", example.FindProperty("JapaneseText")!.GetColumnType());
        Assert.Equal("nvarchar(4000)", example.FindProperty("Furigana")!.GetColumnType());
        Assert.True(example.FindProperty("VietnameseTranslation")!.IsNullable);
        Assert.Contains(example.GetForeignKeys(), fk => fk.PrincipalEntityType.ClrType == typeof(LearningContentSource)
            && fk.DeleteBehavior == DeleteBehavior.Restrict);
        Assert.Contains(example.GetCheckConstraints(), check => check.Sql == "[OrderIndex] >= 0");
        Assert.Contains(example.GetCheckConstraints(), check => check.Sql == "[ExternalId] IS NULL OR [SourceId] IS NOT NULL");
    }

    [Fact]
    public void Sources_PreserveMultipleUpstreamIdsAndProtectDatasetMetadata()
    {
        using var context = CreateSqlModelContext();
        var model = context.GetService<IDesignTimeModel>().Model;
        var source = model.FindEntityType(typeof(LearningContentSource))!;
        Assert.Contains(source.GetIndexes(), index => index.IsUnique
            && index.Properties.Select(p => p.Name).SequenceEqual(new[] { "Name", "Version" }));
        foreach (var (type, masterId) in new[] { (typeof(VocabularySource), "VocabularyId"), (typeof(GrammarSource), "GrammarId") })
        {
            var link = model.FindEntityType(type)!;
            Assert.Equal(new[] { masterId, "SourceId", "ExternalId" }, link.FindPrimaryKey()!.Properties.Select(p => p.Name));
            Assert.Contains(link.GetForeignKeys(), fk => fk.PrincipalEntityType == source
                && fk.DeleteBehavior == DeleteBehavior.Restrict);
        }
    }

    [Fact]
    public void Migration_IsAdditiveAndBackfillsLegacyExamplesWithoutOverwritingOldContent()
    {
        var migration = new AddSelfStudyTopicsExamplesAndSources();
        Assert.DoesNotContain(migration.UpOperations, op => op is DropTableOperation or DropColumnOperation
            or DropForeignKeyOperation or DeleteDataOperation or UpdateDataOperation or RenameTableOperation);
        var expectedTables = new[] { "LearningTopics", "TopicVocabularies", "TopicGrammars", "VocabularyExamples",
            "GrammarExamples", "LearningContentSources", "VocabularySources", "GrammarSources" };
        Assert.Equal(expectedTables.Order(), migration.UpOperations.OfType<CreateTableOperation>().Select(t => t.Name).Order());
        var changes = migration.UpOperations.OfType<AlterColumnOperation>().ToArray();
        Assert.Equal(3, changes.Length);
        Assert.All(changes, column => Assert.True(column.MaxLength > column.OldColumn.MaxLength));
        var reading = Assert.Single(migration.UpOperations.OfType<AddColumnOperation>());
        Assert.Equal(("Grammars", "Reading", true), (reading.Table, reading.Name, reading.IsNullable));
        var backfill = Assert.Single(migration.UpOperations.OfType<SqlOperation>()).Sql;
        Assert.Contains("INSERT INTO [GrammarExamples]", backfill);
        Assert.Contains("[g].[ExampleSentence], NULL, NULL, 0, NULL, NULL", backfill);
        Assert.Contains("NOT EXISTS", backfill);
        Assert.DoesNotContain("UPDATE", backfill, StringComparison.OrdinalIgnoreCase);
        Assert.All(migration.DownOperations.OfType<DropTableOperation>(), table => Assert.Contains(table.Name, expectedTables));
    }

    [Fact]
    public void LatestMigrationAndSnapshot_MatchCurrentModel()
    {
        using var context = CreateSqlModelContext();
        var assembly = context.GetService<IMigrationsAssembly>();
        var latestType = assembly.Migrations.OrderBy(migration => migration.Key).Last().Value;
        var latest = assembly.CreateMigration(latestType, context.Database.ProviderName!);
        var initializer = context.GetService<IModelRuntimeInitializer>();
        var differ = context.GetService<IMigrationsModelDiffer>();
        var current = context.GetService<IDesignTimeModel>().Model.GetRelationalModel();
        var migrationModel = initializer.Initialize(latest.TargetModel, designTime: true).GetRelationalModel();
        var snapshot = initializer.Initialize(assembly.ModelSnapshot!.Model, designTime: true).GetRelationalModel();
        Assert.Empty(differ.GetDifferences(migrationModel, current));
        Assert.Empty(differ.GetDifferences(snapshot, current));
    }

    private static LearningContentSource NewSource(string name, string license) => new()
    {
        Name = name, Version = "2026-10", SourceUrl = $"https://example.test/{name.Replace(' ', '-')}",
        License = license, LicenseUrl = "https://example.test/license", Attribution = $"Data from {name}"
    };
}
