using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds;

public static class LearningContentFullCommand
{
    public static async Task<int> RunAsync(AppDbContext db, string datasetPath, bool dryRun)
    {
        try
        {
            var connection = LearningContentSampleCommand.RequireLocalConnection(db);
            await using var file = File.OpenRead(datasetPath);
            var bundle = await JsonSerializer.DeserializeAsync<Bundle>(file)
                ?? throw new InvalidOperationException("Learning dataset is empty.");
            bundle.Dataset.Validate(full: true);

            Console.WriteLine($"Local database: {connection.DataSource} / {connection.InitialCatalog}");
            foreach (var level in new[] { "N5", "N4", "N3" })
                Console.WriteLine($"{level}: {bundle.Dataset.Vocabularies.Count(v => v.JLPTLevel == level)} vocabulary, "
                    + $"{bundle.Dataset.Grammars.Count(g => g.JLPTLevel == level)} grammar.");
            var pending = (await db.Database.GetPendingMigrationsAsync()).ToArray();
            Console.WriteLine("Pending migrations: " + JsonSerializer.Serialize(pending));
            if (dryRun) return 0;
            if (pending.Length > 0) await db.Database.MigrateAsync();

            var result = await LearningContentSampleImporter.ImportAsync(db, bundle.Dataset, full: true);
            Console.WriteLine(JsonSerializer.Serialize(new
            {
                result.AddedSources, result.AddedVocabularies, result.AddedGrammars,
                result.AddedVocabularyExamples, result.AddedGrammarExamples,
                result.AddedVocabularySources, result.AddedGrammarSources
            }));
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Full learning import failed ({error.GetType().Name}).");
            if (error is InvalidOperationException && error.InnerException is null)
                Console.Error.WriteLine(error.Message);
            if (error is DbUpdateException { InnerException: Microsoft.Data.SqlClient.SqlException sqlError })
                Console.Error.WriteLine($"SQL Server error number: {sqlError.Number}.");
            return 1;
        }
    }

    private sealed record Bundle(LearningContentSampleData Dataset);
}
