using System.Data;
using System.Security.Cryptography;
using System.Text;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds;

public static class LearningContentSeeder
{
    public const string SeedKey = "LearningContent:N5-N3";
    private static readonly string[] Resources =
    [
        "learning-n5-n3.json", "localize-n5-food-permission.sql", "Translations.reviewed.sql",
        "tango-n5-topics.json", "learning-topic-catalog-n5-n3.json"
    ];
    private static readonly Lazy<string> Version = new(ComputeVersion);
    public static string CurrentVersion => Version.Value;

    public static async Task<LearningContentSeedStatus> SeedAsync(AppDbContext db,
        LearningContentSeedOptions? options = null, bool force = false, CancellationToken ct = default)
    {
        options ??= new();
        if (!options.Enabled) return LearningContentSeedStatus.Disabled;
        ArgumentOutOfRangeException.ThrowIfLessThan(options.CommandTimeoutSeconds, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(options.CommandTimeoutSeconds, 3600);

        // The small state lookup precedes JSON deserialization and both large SQL batches.
        if (!force && await IsCurrentAsync(db, ct)) return LearningContentSeedStatus.UpToDate;

        var previousTimeout = db.Database.GetCommandTimeout();
        db.Database.SetCommandTimeout(options.CommandTimeoutSeconds);
        try
        {
            return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
                try
                {
                    // Share the importer's transaction lock; another startup waits, then checks the stamp again.
                    var lockTimeout = options.CommandTimeoutSeconds * 1000;
                    await db.Database.ExecuteSqlInterpolatedAsync($"""
                        DECLARE @result int;
                        EXEC @result = sys.sp_getapplock
                            @Resource = 'JCAP:LearningContentSampleImport', @LockMode = 'Exclusive',
                            @LockOwner = 'Transaction', @LockTimeout = {lockTimeout};
                        IF @result < 0 THROW 51000, 'Learning content seed lock could not be acquired.', 1;
                        """, ct);
                    if (!force && await IsCurrentAsync(db, ct))
                    {
                        await transaction.CommitAsync(ct);
                        return LearningContentSeedStatus.UpToDate;
                    }

                    await using var content = OpenResource("learning-n5-n3.json");
                    var dataset = await LearningContentFullCommand.ReadDatasetAsync(content);
                    using var localization = new StreamReader(OpenResource("localize-n5-food-permission.sql"));
                    var sql = await localization.ReadToEndAsync(ct);
                    using var reviewedLocalization = new StreamReader(OpenResource("Translations.reviewed.sql"));
                    var reviewedSql = await reviewedLocalization.ReadToEndAsync(ct);

                    await LearningContentSampleImporter.ImportAsync(db, dataset, full: true);
                    await db.Database.ExecuteSqlRawAsync(sql, ct);
                    await db.Database.ExecuteSqlRawAsync(reviewedSql, ct);
                    await using var tangoTopics = OpenResource("tango-n5-topics.json");
                    await LearningCatalogTopicSeeder.SeedAsync(db, dataset, tangoTopics);
                    await using var catalogTopics = OpenResource("learning-topic-catalog-n5-n3.json");
                    await LearningCatalogTopicSeeder.SeedAsync(db, dataset, catalogTopics);

                    var state = await db.LearningContentSeedStates.SingleOrDefaultAsync(item => item.Key == SeedKey, ct);
                    if (state is null) { state = new() { Key = SeedKey }; db.LearningContentSeedStates.Add(state); }
                    state.Version = CurrentVersion;
                    state.CompletedAtUtc = DateTime.UtcNow;
                    await db.SaveChangesAsync(ct);
                    await transaction.CommitAsync(ct);
                    return LearningContentSeedStatus.Applied;
                }
                catch
                {
                    await transaction.RollbackAsync(CancellationToken.None);
                    db.ChangeTracker.Clear();
                    throw;
                }
            });
        }
        finally { db.Database.SetCommandTimeout(previousTimeout); }
    }

    private static Task<bool> IsCurrentAsync(AppDbContext db, CancellationToken ct) =>
        db.LearningContentSeedStates.AsNoTracking().AnyAsync(state => state.Key == SeedKey && state.Version == CurrentVersion, ct);

    private static string ComputeVersion()
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        hash.AppendData(Encoding.UTF8.GetBytes("LearningContentSeed:v1"));
        var buffer = new byte[64 * 1024];
        foreach (var name in Resources)
        {
            hash.AppendData(Encoding.UTF8.GetBytes(name));
            using var input = OpenResource(name);
            int count;
            while ((count = input.Read(buffer)) > 0) hash.AppendData(buffer.AsSpan(0, count));
        }
        return Convert.ToHexString(hash.GetHashAndReset());
    }

    private static Stream OpenResource(string fileName) =>
        typeof(LearningContentSeeder).Assembly.GetManifestResourceStream(
            $"JCAP.Data.Seeds.LearningContentSample.{fileName}")
        ?? throw new InvalidOperationException($"Missing learning seed resource: {fileName}.");
}
