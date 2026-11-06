using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds
{
    public static class ScenarioSeeder
    {
        public static async Task SeedAsync(IServiceProvider serviceProvider)
        {
            var dbContext = serviceProvider.GetRequiredService<AppDbContext>();

            // 1. Tự động dọn dẹp các kịch bản trùng lặp nếu có do lỗi nhân bản seed trước đây
            await CleanupDuplicatesAsync(dbContext);

            if (!await dbContext.Scenarios.AnyAsync())
            {
                var initialScenarios = ScenarioSeedData.GetInitialScenarios();
                await dbContext.Scenarios.AddRangeAsync(initialScenarios);
                await dbContext.SaveChangesAsync();
                return;
            }

            // 2. Đồng bộ cập nhật kịch bản mẫu: Tìm theo cả ScenarioCode lẫn Title để chống duplicate
            var initialScenariosList = ScenarioSeedData.GetInitialScenarios();
            foreach (var seedScenario in initialScenariosList)
            {
                var existingScenario = await dbContext.Scenarios
                    .Include(s => s.LevelConfigurations)
                        .ThenInclude(lc => lc.Missions)
                    .Include(s => s.LevelConfigurations)
                        .ThenInclude(lc => lc.TargetVocabularies)
                    .Include(s => s.LevelConfigurations)
                        .ThenInclude(lc => lc.TargetGrammars)
                    .FirstOrDefaultAsync(s =>
                        (!string.IsNullOrEmpty(s.ScenarioCode) && s.ScenarioCode == seedScenario.ScenarioCode) ||
                        s.Title.Trim().ToLower() == seedScenario.Title.Trim().ToLower());

                if (existingScenario != null)
                {
                    // Khôi phục mã kịch bản chuẩn ngữ nghĩa
                    if (existingScenario.ScenarioCode != seedScenario.ScenarioCode)
                    {
                        existingScenario.ScenarioCode = seedScenario.ScenarioCode;
                    }
                    existingScenario.Description = seedScenario.Description;
                    existingScenario.Thumbnail = seedScenario.Thumbnail;
                    existingScenario.IsActive = true;

                    foreach (var seedLevel in seedScenario.LevelConfigurations)
                    {
                        var existingLevel = existingScenario.LevelConfigurations
                            .FirstOrDefault(lc => lc.JLPTLevel == seedLevel.JLPTLevel);

                        if (existingLevel != null)
                        {
                            existingLevel.Title = seedLevel.Title;
                            existingLevel.Description = seedLevel.Description;
                            existingLevel.AiPersona = seedLevel.AiPersona;
                            existingLevel.CreditCost = seedLevel.CreditCost;
                            existingLevel.Status = seedLevel.Status;

                            // Đồng bộ Missions
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
                        else
                        {
                            existingScenario.LevelConfigurations.Add(seedLevel);
                        }
                    }
                }
                else
                {
                    await dbContext.Scenarios.AddAsync(seedScenario);
                }
            }
            await dbContext.SaveChangesAsync();
        }

        private static async Task CleanupDuplicatesAsync(AppDbContext dbContext)
        {
            var allScenarios = await dbContext.Scenarios
                .Include(s => s.LevelConfigurations)
                .ToListAsync();

            if (!allScenarios.Any()) return;

            // Nhóm theo Title đã chuẩn hoá (loại trừ khoảng trắng và chữ hoa chữ thường)
            var duplicateGroups = allScenarios
                .GroupBy(s => s.Title.Trim().ToLowerInvariant())
                .Where(g => g.Count() > 1)
                .ToList();

            bool hasChanges = false;
            foreach (var group in duplicateGroups)
            {
                // Ưu tiên giữ lại bản ghi có ScenarioCode chuẩn (dạng SCN_XXX_01) hoặc có Id nhỏ nhất
                var primary = group
                    .OrderByDescending(s => !string.IsNullOrEmpty(s.ScenarioCode) && !s.ScenarioCode.StartsWith("SCN_") || (s.ScenarioCode != null && s.ScenarioCode.Length > 6 && !char.IsDigit(s.ScenarioCode.Replace("SCN_", "")[0])))
                    .ThenBy(s => s.Id)
                    .First();

                var duplicates = group.Where(s => s.Id != primary.Id).ToList();
                foreach (var dup in duplicates)
                {
                    var hasSessions = await dbContext.RoleplaySessions
                        .AnyAsync(rs => rs.ScenarioLevelConfiguration != null && rs.ScenarioLevelConfiguration.ScenarioId == dup.Id);

                    if (!hasSessions)
                    {
                        dbContext.Scenarios.Remove(dup);
                        hasChanges = true;
                    }
                    else if (dup.IsActive)
                    {
                        // Nếu đã có session lịch sử người dùng, chỉ tắt IsActive để không làm vỡ liên kết DB
                        dup.IsActive = false;
                        hasChanges = true;
                    }
                }
            }

            if (hasChanges)
            {
                await dbContext.SaveChangesAsync();
            }
        }
    }
}
