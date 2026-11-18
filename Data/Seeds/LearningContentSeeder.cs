using System.Data;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds;

public static class LearningContentSeeder
{
    public static async Task SeedAsync(AppDbContext db)
    {
        await using var content = OpenResource("learning-n5-n3.json");
        var dataset = await LearningContentFullCommand.ReadDatasetAsync(content);
        using var localization = new StreamReader(OpenResource("localize-n5-food-permission.sql"));
        var sql = await localization.ReadToEndAsync();
        using var reviewedLocalization = new StreamReader(OpenResource("Translations.reviewed.sql"));
        var reviewedSql = await reviewedLocalization.ReadToEndAsync();

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LearningContentSampleImporter.ImportAsync(db, dataset, full: true);
        await db.Database.ExecuteSqlRawAsync(sql);
        await db.Database.ExecuteSqlRawAsync(reviewedSql);
        await using var tangoTopics = OpenResource("tango-n5-topics.json");
        await LearningCatalogTopicSeeder.SeedAsync(db, dataset, tangoTopics);
        await using var catalogTopics = OpenResource("learning-topic-catalog-n5-n3.json");
        await LearningCatalogTopicSeeder.SeedAsync(db, dataset, catalogTopics);
        await transaction.CommitAsync();
    }

    private static Stream OpenResource(string fileName) =>
        typeof(LearningContentSeeder).Assembly.GetManifestResourceStream(
            $"JCAP.Data.Seeds.LearningContentSample.{fileName}")
        ?? throw new InvalidOperationException($"Missing learning seed resource: {fileName}.");
}
