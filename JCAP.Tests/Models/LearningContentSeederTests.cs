using JCAP.Data;
using JCAP.Data.Seeds;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Tests.Models;

public class LearningContentSeederTests
{
    [Fact]
    public async Task Disabled_DoesNotNeedDatabaseConnectionOrReadSeedState()
    {
        // No provider is configured: any database access would fail this test.
        await using var db = new AppDbContext(new DbContextOptions<AppDbContext>());
        Assert.Equal(LearningContentSeedStatus.Disabled,
            await LearningContentSeeder.SeedAsync(db, new() { Enabled = false }));
    }

    [Fact]
    public async Task MatchingVersion_SkipsRelationalImportAndPreservesAdminChanges()
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var completed = DateTime.UtcNow.AddDays(-1);
        db.LearningContentSeedStates.Add(new()
        {
            Key = LearningContentSeeder.SeedKey, Version = LearningContentSeeder.CurrentVersion, CompletedAtUtc = completed
        });
        db.Vocabularies.Add(new() { Word = "ね", Meaning = "Bản admin tự sửa", JLPTLevel = "N5" });
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        // InMemory cannot run relational SQL; success proves the fast path exits before importing.
        Assert.Equal(LearningContentSeedStatus.UpToDate, await LearningContentSeeder.SeedAsync(db));
        Assert.Equal("Bản admin tự sửa", (await db.Vocabularies.SingleAsync()).Meaning);
        Assert.Equal(completed, (await db.LearningContentSeedStates.SingleAsync()).CompletedAtUtc);
        Assert.Empty(await db.LearningTopics.ToListAsync());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(3601)]
    public async Task InvalidTimeout_IsRejectedBeforeDatabaseAccess(int timeout)
    {
        await using var db = new AppDbContext(new DbContextOptions<AppDbContext>());
        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() =>
            LearningContentSeeder.SeedAsync(db, new() { CommandTimeoutSeconds = timeout }));
    }

    [Fact]
    public void BundledVersion_IsStableSha256()
    {
        Assert.Matches("^[A-F0-9]{64}$", LearningContentSeeder.CurrentVersion);
        Assert.Equal(LearningContentSeeder.CurrentVersion, LearningContentSeeder.CurrentVersion);
    }
}
