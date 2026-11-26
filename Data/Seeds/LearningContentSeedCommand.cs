using System.Diagnostics;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds;

public static class LearningContentSeedCommand
{
    public static async Task<int> RunAsync(AppDbContext db, LearningContentSeedOptions options, bool force, bool dryRun)
    {
        try
        {
            LearningContentSampleCommand.RequireLocalConnection(db);
            var pending = (await db.Database.GetPendingMigrationsAsync()).ToArray();
            Console.WriteLine($"Bundled learning seed: {LearningContentSeeder.CurrentVersion}");
            Console.WriteLine($"Pending migrations: {pending.Length}; force: {force}; timeout: {options.CommandTimeoutSeconds}s.");
            if (dryRun) return 0;

            await db.Database.MigrateAsync();
            // This explicit command runs even if automatic startup seeding is disabled.
            options.Enabled = true;
            var elapsed = Stopwatch.StartNew();
            var result = await LearningContentSeeder.SeedAsync(db, options, force);
            Console.WriteLine($"Learning content seed: {result}; elapsed: {elapsed.Elapsed.TotalSeconds:F2}s.");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Bundled learning seed failed ({error.GetType().Name}). No completed version is recorded for a failed run.");
            return 1;
        }
    }
}
