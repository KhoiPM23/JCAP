using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds;

public static class LearningContentSampleCommand
{
    public static async Task<int> RunAsync(AppDbContext db, bool dryRun)
    {
        try
        {
            var data = LearningContentSampleData.Load();
            var connection = new SqlConnectionStringBuilder(db.Database.GetConnectionString());
            // This command intentionally only targets the team's local development database.
            var host = connection.DataSource.Split('\\')[0].Split(',')[0];
            if (!new[] { ".", "(local)", "(localdb)", "localhost", "127.0.0.1", Environment.MachineName }
                .Contains(host, StringComparer.OrdinalIgnoreCase))
                throw new InvalidOperationException("Sample import requires a local SQL Server connection.");
            Console.WriteLine($"Local database: {connection.DataSource} / {connection.InitialCatalog}");
            var pending = (await db.Database.GetPendingMigrationsAsync()).ToArray();
            Console.WriteLine("Pending migrations: " + JsonSerializer.Serialize(pending));
            Console.WriteLine($"Sample: {data.Vocabularies.Length} vocabularies, {data.Grammars.Length} grammars, {LearningTopicSeedData.Topics.Count} flat topics; no audio.");
            if (dryRun)
            {
                if (!await db.Database.CanConnectAsync())
                {
                    Console.WriteLine("Local application database does not exist or is unavailable; import will create it through migrations if SQL Server is accessible.");
                    return 0;
                }
                var words = data.Vocabularies.Select(v => v.Word).ToArray();
                var patterns = data.Grammars.Select(g => g.Pattern).ToArray();
                // Project only legacy columns, so preview also works before the additive migrations.
                Console.WriteLine("Existing matching words: " + JsonSerializer.Serialize(await db.Vocabularies
                    .Where(v => words.Contains(v.Word)).Select(v => new { v.Id, v.Word, v.Reading, v.Meaning, v.PartOfSpeech, v.JLPTLevel })
                    .ToListAsync(), JsonOptions));
                Console.WriteLine("Existing matching patterns: " + JsonSerializer.Serialize(await db.Grammars
                    .Where(g => patterns.Contains(g.Pattern)).Select(g => new { g.Id, g.Pattern, g.Meaning, g.JLPTLevel })
                    .ToListAsync(), JsonOptions));
                return 0;
            }

            if (pending.Length > 0) await db.Database.MigrateAsync();
            var result = await LearningContentSampleImporter.ImportAsync(db, data);
            Console.WriteLine(JsonSerializer.Serialize(result, JsonOptions));
            var topicResult = await LearningTopicSeeder.SeedAsync(db);
            Console.WriteLine("Topic seed: " + JsonSerializer.Serialize(topicResult, JsonOptions));
            Console.WriteLine(JsonSerializer.Serialize(await db.LearningTopics.AsNoTracking()
                .Where(t => topicResult.TopicIds.Contains(t.Id)).OrderBy(t => t.Id)
                .Select(t => new { t.Id, t.Code, t.Name, VocabularyCount = t.TopicVocabularies.Count,
                    GrammarCount = t.TopicGrammars.Count }).ToListAsync(), JsonOptions));
            Console.WriteLine("Sample content in database:");
            Console.WriteLine(JsonSerializer.Serialize(await db.Vocabularies.AsNoTracking()
                .Where(v => result.VocabularyIds.Contains(v.Id)).OrderBy(v => v.Id)
                .Select(v => new { v.Id, v.Word, v.Reading, v.JLPTLevel, v.Meaning, Examples = v.Examples.Count })
                .ToListAsync(), JsonOptions));
            Console.WriteLine(JsonSerializer.Serialize(await db.Grammars.AsNoTracking()
                .Where(g => result.GrammarIds.Contains(g.Id)).OrderBy(g => g.Id)
                .Select(g => new { g.Id, g.Pattern, g.JLPTLevel, g.Meaning, Examples = g.Examples.Count })
                .ToListAsync(), JsonOptions));
            return 0;
        }
        catch (Exception error)
        {
            // Do not echo configuration or connection strings, including provider exception text.
            Console.Error.WriteLine($"Learning sample import failed ({error.GetType().Name}). No success is reported.");
            if (error is InvalidOperationException && error.InnerException is null)
                Console.Error.WriteLine(error.Message);
            return 1;
        }
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };
}
