using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds
{
    public static class ScenarioSeeder
    {
        public static async Task SeedAsync(IServiceProvider serviceProvider)
        {
            var dbContext = serviceProvider.GetRequiredService<AppDbContext>();

            if (!await dbContext.Scenarios.AnyAsync())
            {
                var initialScenarios = ScenarioSeedData.GetInitialScenarios();
                await dbContext.Scenarios.AddRangeAsync(initialScenarios);
                await dbContext.SaveChangesAsync();
            }
        }
    }
}
