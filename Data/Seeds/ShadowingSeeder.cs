using System;
using System.Linq;
using System.Threading.Tasks;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace JCAP.Data.Seeds
{
    public static class ShadowingSeeder
    {
        public static async Task SeedAsync(IServiceProvider serviceProvider)
        {
            var dbContext = serviceProvider.GetRequiredService<AppDbContext>();

            var ramenScenario = await dbContext.Scenarios
                .FirstOrDefaultAsync(s => s.ScenarioCode == "SCN_RAMEN_01");
            var baitoScenario = await dbContext.Scenarios
                .FirstOrDefaultAsync(s => s.ScenarioCode == "SCN_BAITO_01");

            int ramenId = ramenScenario?.Id ?? 1;
            int? baitoId = baitoScenario?.Id ?? ramenId;

            var devSampleDialogues = ShadowingSeedData.GetDevSampleDialogues(ramenId, baitoId);

            foreach (var dialogue in devSampleDialogues)
            {
                var existing = await dbContext.ShadowingDialogues
                    .Include(d => d.Sentences)
                    .FirstOrDefaultAsync(d => d.Title == dialogue.Title || (d.JLPTLevel == dialogue.JLPTLevel && d.Title.Contains("Hội thoại")));

                if (existing == null)
                {
                    await dbContext.ShadowingDialogues.AddAsync(dialogue);
                }
            }

            await dbContext.SaveChangesAsync();
        }
    }
}
