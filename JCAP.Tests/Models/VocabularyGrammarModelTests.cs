using JCAP.Data;
using JCAP.Migrations;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations.Operations;

namespace JCAP.Tests.Models;

public class VocabularyGrammarModelTests
{
    // Only inspects SQL Server metadata; these tests never open a database connection.
    private static AppDbContext CreateSqlServerModelContext() => new(
        new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer("Server=localhost;Database=JCAP_ModelTests;Integrated Security=True;TrustServerCertificate=True")
            .Options);

    [Fact]
    public void NewContent_DefaultsToActiveWithUtcCreationTimeAndOptionalDetails()
    {
        var before = DateTime.UtcNow;
        var vocabulary = new Vocabulary();
        var grammar = new Grammar();
        var after = DateTime.UtcNow;

        Assert.True(vocabulary.IsActive);
        Assert.True(grammar.IsActive);
        Assert.Equal(DateTimeKind.Utc, vocabulary.CreatedAt.Kind);
        Assert.Equal(DateTimeKind.Utc, grammar.CreatedAt.Kind);
        Assert.InRange(vocabulary.CreatedAt, before, after);
        Assert.InRange(grammar.CreatedAt, before, after);
        Assert.Null(vocabulary.PartOfSpeech);
        Assert.Null(vocabulary.Explanation);
        Assert.Null(vocabulary.AudioUrl);
        Assert.Null(vocabulary.UpdatedAt);
        Assert.Null(grammar.Formation);
        Assert.Null(grammar.Explanation);
        Assert.Null(grammar.UpdatedAt);
    }

    [Theory]
    [InlineData(typeof(Vocabulary), nameof(Vocabulary.PartOfSpeech), "nvarchar(100)", 100)]
    [InlineData(typeof(Vocabulary), nameof(Vocabulary.AudioUrl), "nvarchar(1000)", 1000)]
    [InlineData(typeof(Vocabulary), nameof(Vocabulary.Explanation), "nvarchar(max)", null)]
    [InlineData(typeof(Grammar), nameof(Grammar.Formation), "nvarchar(1000)", 1000)]
    [InlineData(typeof(Grammar), nameof(Grammar.Explanation), "nvarchar(max)", null)]
    public void DetailFields_AreOptionalUnicodeColumns(
        Type entityType, string propertyName, string columnType, int? maxLength)
    {
        using var context = CreateSqlServerModelContext();
        var property = context.GetService<IDesignTimeModel>().Model
            .FindEntityType(entityType)!.FindProperty(propertyName)!;

        Assert.True(property.IsNullable);
        Assert.Equal(columnType, property.GetColumnType());
        Assert.Equal(maxLength, property.GetMaxLength());
    }

    [Theory]
    [InlineData(typeof(Vocabulary))]
    [InlineData(typeof(Grammar))]
    public void LifecycleFields_PreserveActiveDefaultAndAllowExplicitInactiveContent(Type entityType)
    {
        using var context = CreateSqlServerModelContext();
        var entity = context.GetService<IDesignTimeModel>().Model.FindEntityType(entityType)!;
        var active = entity.FindProperty("IsActive")!;
        var updatedAt = entity.FindProperty("UpdatedAt")!;

        Assert.False(active.IsNullable);
        Assert.Equal(true, active.GetDefaultValue());
        // true is the "use default" sentinel, so an explicitly assigned false is sent to SQL.
        Assert.Equal(true, active.Sentinel);
        Assert.True(updatedAt.IsNullable);
        Assert.Equal("datetime2", updatedAt.GetColumnType());
        Assert.Equal(ValueGenerated.Never, updatedAt.ValueGenerated);
        Assert.Equal("GETUTCDATE()", entity.FindProperty("CreatedAt")!.GetDefaultValueSql());
        Assert.Null(entity.FindProperty("UsageNotes"));
        Assert.Null(entity.FindProperty("ContentCode"));
        Assert.Null(entity.FindProperty("Status"));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task DetailFields_RoundTripWithoutLosingLegacyContent(bool isActive)
    {
        using var context = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"VocabularyGrammar_{Guid.NewGuid()}")
            .Options);
        var updatedAt = new DateTime(2026, 10, 22, 8, 0, 0, DateTimeKind.Utc);
        var vocabulary = new Vocabulary
        {
            Word = "食べる",
            Reading = "たべる",
            Meaning = "Ăn",
            PartOfSpeech = "Động từ nhóm 2",
            JLPTLevel = "N5",
            Explanation = "Diễn tả hành động ăn.\nLưu ý: giải thích và lưu ý dùng chung trường.",
            AudioUrl = "/audio/vocabulary/taberu.mp3",
            IsActive = isActive,
            UpdatedAt = updatedAt
        };
        var grammar = new Grammar
        {
            Pattern = "〜てもいい",
            Meaning = "Được phép làm gì",
            Formation = "Vて + もいい",
            Explanation = "Dùng để xin hoặc cho phép thực hiện một hành động.",
            ExampleSentence = "ここで食べてもいいですか。",
            JLPTLevel = "N5",
            IsActive = isActive,
            UpdatedAt = updatedAt
        };
        context.AddRange(vocabulary, grammar);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var savedVocabulary = await context.Vocabularies.SingleAsync();
        var savedGrammar = await context.Grammars.SingleAsync();
        Assert.Equal(vocabulary.Word, savedVocabulary.Word);
        Assert.Equal(vocabulary.Reading, savedVocabulary.Reading);
        Assert.Equal(vocabulary.Meaning, savedVocabulary.Meaning);
        Assert.Equal(vocabulary.PartOfSpeech, savedVocabulary.PartOfSpeech);
        Assert.Equal(vocabulary.Explanation, savedVocabulary.Explanation);
        Assert.Equal(vocabulary.AudioUrl, savedVocabulary.AudioUrl);
        Assert.Equal(grammar.Pattern, savedGrammar.Pattern);
        Assert.Equal(grammar.Meaning, savedGrammar.Meaning);
        Assert.Equal(grammar.Formation, savedGrammar.Formation);
        Assert.Equal(grammar.Explanation, savedGrammar.Explanation);
        Assert.Equal(grammar.ExampleSentence, savedGrammar.ExampleSentence);
        Assert.Equal(isActive, savedVocabulary.IsActive);
        Assert.Equal(isActive, savedGrammar.IsActive);
        Assert.Equal(updatedAt, savedVocabulary.UpdatedAt);
        Assert.Equal(updatedAt, savedGrammar.UpdatedAt);
    }

    [Fact]
    public void ShadowingRelationships_AndLegacyGrammarExampleArePreserved()
    {
        using var context = CreateSqlServerModelContext();
        var model = context.GetService<IDesignTimeModel>().Model;
        var vocabularyLink = model.FindEntityType(typeof(ShadowingDialogueVocabulary))!;
        var grammarLink = model.FindEntityType(typeof(ShadowingDialogueGrammar))!;

        Assert.Contains(vocabularyLink.GetForeignKeys(), fk =>
            fk.PrincipalEntityType.ClrType == typeof(Vocabulary)
            && fk.Properties.Single().Name == "VocabularyId");
        Assert.Contains(grammarLink.GetForeignKeys(), fk =>
            fk.PrincipalEntityType.ClrType == typeof(Grammar)
            && fk.Properties.Single().Name == "GrammarId");
        Assert.Equal(500, model.FindEntityType(typeof(Grammar))!
            .FindProperty(nameof(Grammar.ExampleSentence))!.GetMaxLength());
    }

    [Fact]
    public void Migration_OnlyAddsNineColumnsToTheTwoExistingTables()
    {
        var migration = new AddVocabularyAndGrammarDetails();
        var columns = migration.UpOperations.Select(operation =>
            Assert.IsType<AddColumnOperation>(operation)).ToArray();
        var expectedColumns = new[]
        {
            "Grammars.Explanation", "Grammars.Formation", "Grammars.IsActive", "Grammars.UpdatedAt",
            "Vocabularies.AudioUrl", "Vocabularies.Explanation", "Vocabularies.IsActive",
            "Vocabularies.PartOfSpeech", "Vocabularies.UpdatedAt"
        };
        Assert.Equal(expectedColumns.OrderBy(name => name),
            columns.Select(column => $"{column.Table}.{column.Name}").OrderBy(name => name));

        foreach (var column in columns)
        {
            if (column.Name == "IsActive")
            {
                Assert.False(column.IsNullable);
                Assert.Equal(true, column.DefaultValue);
            }
            else
            {
                Assert.True(column.IsNullable);
                Assert.Null(column.DefaultValue);
            }
        }

        var rollbackColumns = migration.DownOperations.Select(operation =>
            Assert.IsType<DropColumnOperation>(operation));
        Assert.Equal(expectedColumns.OrderBy(name => name),
            rollbackColumns.Select(column => $"{column.Table}.{column.Name}").OrderBy(name => name));
    }
}
