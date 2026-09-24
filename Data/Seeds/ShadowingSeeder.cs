using System;
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

            if (!await dbContext.ShadowingDialogues.AnyAsync())
            {
                // Dynamic lookup: tra cứu Scenario theo ScenarioCode đã xác nhận trong hệ thống
                var ramenScenario = await dbContext.Scenarios
                    .FirstOrDefaultAsync(s => s.ScenarioCode == "SCN_RAMEN_01");

                if (ramenScenario != null)
                {
                    var devSampleDialogues = ShadowingSeedData.GetDevSampleDialogues(ramenScenario.Id);
                    await dbContext.ShadowingDialogues.AddRangeAsync(devSampleDialogues);
                    await dbContext.SaveChangesAsync();
                }
            }
        }
    }
}
