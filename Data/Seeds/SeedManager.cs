using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds
{
    public static class SeedManager
    {
        public static async Task SeedAllAsync(WebApplication app)
        {
            using var scope = app.Services.CreateScope();
            var services = scope.ServiceProvider;

            try
            {
                // 0. Tự động áp dụng tất cả migrations chưa chạy khi khởi động ứng dụng
                var context = services.GetRequiredService<AppDbContext>();
                await context.Database.MigrateAsync();

                // 1. Seed tài khoản và vai trò
                await UserSeeder.SeedAsync(services);

                // 2. Seed các gói credit mặc định
                await CreditPackageSeeder.SeedAsync(services);

                // 3. Seed các kịch bản mẫu (Scenarios)
                await ScenarioSeeder.SeedAsync(services);
            }
            catch (Exception ex)
            {
                var logger = services.GetRequiredService<ILogger<WebApplication>>();
                logger.LogError(ex, "Đã xảy ra lỗi trong quá trình nạp dữ liệu Seed.");
            }
        }
    }
}
