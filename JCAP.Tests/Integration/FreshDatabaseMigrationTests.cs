using JCAP.Data;
using JCAP.Models;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
using Xunit.Abstractions;

namespace JCAP.Tests.Integration;

public class FreshDatabaseMigrationTests(ITestOutputHelper output)
{
    [LearningSeedSqlFact]
    public async Task MigrateFromEmptyDatabase_CreatesCompleteSchema_AndRerunPreservesData()
    {
        var root = Environment.GetEnvironmentVariable("JCAP_TEST_REPO_ROOT")!;
        var config = new ConfigurationBuilder().SetBasePath(root).AddJsonFile("appsettings.json")
            .AddJsonFile("appsettings.Local.json", optional: true).Build();
        var database = "JCAP_FreshMigrationsQa_" + Guid.NewGuid().ToString("N");
        var connection = new SqlConnectionStringBuilder(config.GetConnectionString("DefaultConnection")) { InitialCatalog = database };
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(connection.ConnectionString, sql => sql.CommandTimeout(600)).Options);
        try
        {
            await db.Database.MigrateAsync();
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
            // Query every mapped entity, including modules outside learning, to find missing tables/columns.
            foreach (var type in db.Model.GetEntityTypes().Where(type => type.BaseType is null))
            {
                var table = type.GetTableName()!;
                var schema = type.GetSchema() ?? "dbo";
                var identifiers = db.GetService<ISqlGenerationHelper>();
                var store = StoreObjectIdentifier.Table(table, type.GetSchema());
                var columns = string.Join(", ", type.GetProperties().Select(property => property.GetColumnName(store))
                    .Where(name => name is not null).Distinct().Select(name => identifiers.DelimitIdentifier(name!)));
                Assert.NotEmpty(columns);
                // All identifiers come from EF metadata and are quoted by the SQL Server provider.
                var query = "SELECT TOP (0) " + columns + " FROM " + identifiers.DelimitIdentifier(table, schema) + ";";
                await db.Database.ExecuteSqlRawAsync(query);
            }
            db.Scenarios.Add(new() { Title = "Migration regression", Description = "Keep existing content", IsActive = true });
            await db.SaveChangesAsync();
            var id = (await db.Scenarios.SingleAsync()).Id;
            await db.Database.MigrateAsync();
            Assert.Equal(id, (await db.Scenarios.SingleAsync()).Id);
            output.WriteLine("All mapped tables/columns exist after the complete migration chain; rerun preserves data.");
        }
        finally
        {
            if (connection.InitialCatalog != database || !database.StartsWith("JCAP_FreshMigrationsQa_", StringComparison.Ordinal))
                throw new InvalidOperationException("Refusing cleanup outside owned QA database.");
            await db.Database.EnsureDeletedAsync();
        }
    }

    [LearningSeedSqlFact]
    public async Task UpgradeExistingSchema_AddsOnlySeedState_AndPreservesContentAndRelationships()
    {
        var root = Environment.GetEnvironmentVariable("JCAP_TEST_REPO_ROOT")!;
        var config = new ConfigurationBuilder().SetBasePath(root).AddJsonFile("appsettings.json")
            .AddJsonFile("appsettings.Local.json", optional: true).Build();
        var database = "JCAP_FreshMigrationsQa_" + Guid.NewGuid().ToString("N");
        var connection = new SqlConnectionStringBuilder(config.GetConnectionString("DefaultConnection")) { InitialCatalog = database };
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(connection.ConnectionString, sql => sql.CommandTimeout(600)).Options);
        try
        {
            await db.GetService<IMigrator>().MigrateAsync("20261113104800_ReconcileCommunityFeedbackSafetyConstraints");
            var word = new Vocabulary { Word = "既存", Reading = "きそん", Meaning = "Nội dung admin đã sửa", JLPTLevel = "N5" };
            var topic = new LearningTopic { Code = "QA_KEEP", Name = "Chủ đề cần giữ", JLPTLevel = "N5" };
            topic.TopicVocabularies.Add(new() { Vocabulary = word, OrderIndex = 3 });
            word.Examples.Add(new() { JapaneseText = "既存のデータです。", VietnameseTranslation = "Đây là dữ liệu sẵn có." });
            db.LearningTopics.Add(topic);
            db.Scenarios.Add(new() { Title = "Keep scenario", Description = "Existing module data", IsActive = true });
            await db.SaveChangesAsync(); db.ChangeTracker.Clear();
            var previous = (await db.Database.GetAppliedMigrationsAsync()).ToArray();
            await db.Database.MigrateAsync();
            var added = (await db.Database.GetAppliedMigrationsAsync()).Except(previous).ToArray();
            Assert.Equal("20261118052838_TrackLearningContentSeedVersion", Assert.Single(added));
            Assert.Equal("Nội dung admin đã sửa", (await db.Vocabularies.SingleAsync()).Meaning);
            Assert.Equal("Chủ đề cần giữ", (await db.LearningTopics.SingleAsync()).Name);
            Assert.Equal(3, (await db.TopicVocabularies.SingleAsync()).OrderIndex);
            Assert.Equal("Đây là dữ liệu sẵn có.", (await db.VocabularyExamples.SingleAsync()).VietnameseTranslation);
            Assert.Equal("Keep scenario", (await db.Scenarios.SingleAsync()).Title);
            Assert.Empty(await db.LearningContentSeedStates.ToListAsync());
            output.WriteLine("Upgrading the previous schema adds only the seed state table; existing content and IDs/links remain intact.");
        }
        finally
        {
            if (connection.InitialCatalog != database || !database.StartsWith("JCAP_FreshMigrationsQa_", StringComparison.Ordinal))
                throw new InvalidOperationException("Refusing cleanup outside owned QA database.");
            await db.Database.EnsureDeletedAsync();
        }
    }
}
