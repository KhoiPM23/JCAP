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
                return;
            }

            // Đồng bộ cập nhật nội dung Mission cho các kịch bản mẫu ban đầu nếu đã tồn tại
            var initialScenariosList = ScenarioSeedData.GetInitialScenarios();
            foreach (var seedScenario in initialScenariosList)
            {
                var existingScenario = await dbContext.Scenarios
                    .Include(s => s.LevelConfigurations)
                        .ThenInclude(lc => lc.Missions)
                    .FirstOrDefaultAsync(s => s.ScenarioCode == seedScenario.ScenarioCode);

                if (existingScenario != null)
                {
                    foreach (var seedLevel in seedScenario.LevelConfigurations)
                    {
                        var existingLevel = existingScenario.LevelConfigurations
                            .FirstOrDefault(lc => lc.JLPTLevel == seedLevel.JLPTLevel);

                        if (existingLevel != null)
                        {
                            foreach (var seedMission in seedLevel.Missions)
                            {
                                var existingMission = existingLevel.Missions
                                    .FirstOrDefault(m => m.Order == seedMission.Order);

                                if (existingMission != null)
                                {
                                    existingMission.Content = seedMission.Content;
                                    existingMission.CompletionCriteriaJson = seedMission.CompletionCriteriaJson;
                                }
                                else
                                {
                                    existingLevel.Missions.Add(new Mission
                                    {
                                        Content = seedMission.Content,
                                        Order = seedMission.Order,
                                        CompletionCriteriaJson = seedMission.CompletionCriteriaJson,
                                        IsActive = true
                                    });
                                }
                            }
                        }
                    }
                }
            }
            await dbContext.SaveChangesAsync();
        }
    }
}
