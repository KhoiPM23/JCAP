using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds
{
    public static class CreditPackageSeeder
    {
        public static async Task SeedAsync(IServiceProvider serviceProvider)
        {
            var dbContext = serviceProvider.GetRequiredService<AppDbContext>();

            if (!await dbContext.CreditPackages.AnyAsync())
            {
                var defaultPackages = new List<CreditPackage>
                {
                    new()
                    {
                        Name = "Gói Trải Nghiệm",
                        Credits = 50,
                        Price = 20000m,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    },
                    new()
                    {
                        Name = "Gói Tiêu Chuẩn",
                        Credits = 150,
                        Price = 50000m,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    },
                    new()
                    {
                        Name = "Gói Tiết Kiệm",
                        Credits = 350,
                        Price = 100000m,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    },
                    new()
                    {
                        Name = "Gói Chuyên Sâu",
                        Credits = 1000,
                        Price = 250000m,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    }
                };

                await dbContext.CreditPackages.AddRangeAsync(defaultPackages);
                await dbContext.SaveChangesAsync();
            }
        }
    }
}
