using System.Data.Common;
using System.Diagnostics;
using JCAP.Data;
using JCAP.Data.Seeds;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Xunit.Abstractions;

namespace JCAP.Tests.Integration;

public sealed class LearningSeedSqlFactAttribute : FactAttribute
{
    public LearningSeedSqlFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("JCAP_SEED_SQL_TEST") != "1")
            Skip = "Set JCAP_SEED_SQL_TEST=1 and JCAP_TEST_REPO_ROOT to run against an isolated temporary local SQL Server database.";
    }
}

public class LearningContentSeedSqlServerTests(ITestOutputHelper output)
{
    [LearningSeedSqlFact]
    public async Task FullSeed_IsAtomicVersionedAndFastOnRestart_WithTimeoutRestored()
    {
        var root = Environment.GetEnvironmentVariable("JCAP_TEST_REPO_ROOT")
            ?? throw new InvalidOperationException("JCAP_TEST_REPO_ROOT is required for this explicit integration test.");
        var config = new ConfigurationBuilder().SetBasePath(root).AddJsonFile("appsettings.json")
            .AddJsonFile("appsettings.Local.json", optional: true).Build();
        var database = "JCAP_LearningSeedQa_" + Guid.NewGuid().ToString("N");
        var connection = new SqlConnectionStringBuilder(config.GetConnectionString("DefaultConnection")) { InitialCatalog = database };
        var recorder = new SeedCommandRecorder();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(connection.ConnectionString, sql => sql.CommandTimeout(600)).AddInterceptors(recorder).Options);
        try
        {
            await db.Database.MigrateAsync();
            db.Database.SetCommandTimeout(17);
            recorder.TimeoutReviewedSql = true;
            var timeout = await Assert.ThrowsAsync<SqlException>(() => LearningContentSeeder.SeedAsync(db));
            Assert.Equal(-2, timeout.Number);
            Assert.Equal(17, db.Database.GetCommandTimeout());
            Assert.Empty(await db.LearningContentSeedStates.ToListAsync());
            Assert.Empty(await db.Vocabularies.ToListAsync());
            Assert.Empty(await db.Grammars.ToListAsync());
            Assert.Empty(await db.LearningTopics.ToListAsync());
            output.WriteLine("Actual SQL command timeout rolled back content, examples, topics and completion state.");

            recorder.TimeoutReviewedSql = false;
            var elapsed = Stopwatch.StartNew();
            Assert.Equal(LearningContentSeedStatus.Applied, await LearningContentSeeder.SeedAsync(db));
            output.WriteLine($"First successful full seed: {elapsed.Elapsed.TotalSeconds:F2}s.");
            Assert.Equal(600, recorder.ReviewedTimeout);
            Assert.Equal(17, db.Database.GetCommandTimeout());
            Assert.Equal(2963, await db.Vocabularies.CountAsync());
            Assert.Equal(556, await db.Grammars.CountAsync());
            Assert.Equal(124, await db.LearningTopics.CountAsync());
            Assert.Equal(1112, await db.GrammarExamples.CountAsync());
            Assert.True(await db.VocabularyExamples.CountAsync() >= 5776);
            var state = await db.LearningContentSeedStates.SingleAsync();
            Assert.Equal(LearningContentSeeder.CurrentVersion, state.Version);
            var completed = state.CompletedAtUtc;

            var word = await db.Vocabularies.FirstAsync();
            word.Meaning = "Nghĩa riêng do admin kiểm thử";
            var link = await db.TopicVocabularies.FirstAsync();
            var topicId = link.TopicId; var vocabularyId = link.VocabularyId;
            db.TopicVocabularies.Remove(link);
            await db.SaveChangesAsync(); db.ChangeTracker.Clear();

            recorder.StampQueriesOnly = true;
            recorder.QueryCount = 0;
            elapsed.Restart();
            Assert.Equal(LearningContentSeedStatus.UpToDate, await LearningContentSeeder.SeedAsync(db));
            output.WriteLine($"Same-version restart: {elapsed.Elapsed.TotalMilliseconds:F2}ms; {recorder.QueryCount} state query.");
            Assert.Equal(1, recorder.QueryCount);
            recorder.StampQueriesOnly = false;
            Assert.Equal(17, db.Database.GetCommandTimeout());
            Assert.Equal(completed, (await db.LearningContentSeedStates.SingleAsync()).CompletedAtUtc);
            Assert.Equal("Nghĩa riêng do admin kiểm thử", (await db.Vocabularies.SingleAsync(item => item.Id == word.Id)).Meaning);
            Assert.False(await db.TopicVocabularies.AnyAsync(item => item.TopicId == topicId && item.VocabularyId == vocabularyId));

            elapsed.Restart();
            Assert.Equal(LearningContentSeedStatus.Applied, await LearningContentSeeder.SeedAsync(db, force: true));
            output.WriteLine($"Explicit force rerun: {elapsed.Elapsed.TotalSeconds:F2}s.");
            Assert.Equal("Nghĩa riêng do admin kiểm thử", (await db.Vocabularies.SingleAsync(item => item.Id == word.Id)).Meaning);
            Assert.Equal(2963, await db.Vocabularies.CountAsync());
            Assert.Equal(124, await db.LearningTopics.CountAsync());

            state = await db.LearningContentSeedStates.SingleAsync();
            state.Version = new string('0', 64);
            await db.SaveChangesAsync();
            Assert.Equal(LearningContentSeedStatus.Applied, await LearningContentSeeder.SeedAsync(db));
            Assert.Equal(LearningContentSeeder.CurrentVersion, (await db.LearningContentSeedStates.SingleAsync()).Version);
            Assert.Equal(17, db.Database.GetCommandTimeout());
            output.WriteLine("Changed seed version applied, without replacing admin edits or duplicating content.");
        }
        finally
        {
            recorder.TimeoutReviewedSql = false; recorder.StampQueriesOnly = false;
            if (connection.InitialCatalog != database || !database.StartsWith("JCAP_LearningSeedQa_", StringComparison.Ordinal))
                throw new InvalidOperationException("Refusing cleanup outside the owned temporary database.");
            await db.Database.EnsureDeletedAsync();
        }
    }

    private sealed class SeedCommandRecorder : DbCommandInterceptor
    {
        public bool TimeoutReviewedSql { get; set; }
        public bool StampQueriesOnly { get; set; }
        public int ReviewedTimeout { get; private set; }
        public int QueryCount { get; set; }
        private void Inspect(DbCommand command)
        {
            if (StampQueriesOnly)
            {
                Assert.Contains("LearningContentSeedStates", command.CommandText);
                QueryCount++;
            }
            if (!command.CommandText.StartsWith("-- Generated by Translations/build.mjs.", StringComparison.Ordinal)) return;
            ReviewedTimeout = command.CommandTimeout;
            if (TimeoutReviewedSql)
            {
                command.CommandText = "WAITFOR DELAY '00:00:05';";
                command.CommandTimeout = 1;
            }
        }
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        { Inspect(command); return ValueTask.FromResult(result); }
        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        { Inspect(command); return ValueTask.FromResult(result); }
    }
}
