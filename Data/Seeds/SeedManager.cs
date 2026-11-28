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

                // 2b. Nạp học liệu N5–N3 và các bản dịch đã biên soạn.
                var learningOptions = app.Configuration.GetSection(LearningContentSeedOptions.SectionName)
                    .Get<LearningContentSeedOptions>() ?? new();
                var learningStatus = await LearningContentSeeder.SeedAsync(context, learningOptions);
                services.GetRequiredService<ILoggerFactory>().CreateLogger("LearningContentSeed")
                    .LogInformation("Learning content seed: {Status}.", learningStatus);

                // 3. Seed các kịch bản mẫu (Scenarios) & đồng bộ kho học liệu khớp với Scenarios
                await ScenarioSeeder.SeedAsync(services);

                // 4. Seed bài hội thoại Shadowing mẫu (DEV SAMPLE / NON-PRODUCTION)
                await ShadowingSeeder.SeedAsync(services);

                // 4b. Seed bản đồ Khám phá: 47 tỉnh, chương, mốc học thử (Chiba/Tokyo/Kyoto/Nara)
                await ExploreSeeder.SeedAsync(services);

                // 4c. Chỉ nạp dữ liệu mẫu Diễn đàn & Hòm thư Góp ý ở môi trường Development
                if (app.Environment.IsDevelopment())
                {
                    await FeedbackSeeder.SeedAsync(services);
                }

                // 5. Chuẩn hóa diễn giải các giao dịch đã tạo trước đây trong DB
                var oldTransactions = await context.CreditTransactions
                    .Where(t => t.Description != null && (t.Description.Contains("Nạp gói Gói") || t.Description.Contains("Nạp gói gói")))
                    .ToListAsync();

                if (oldTransactions.Any())
                {
                    foreach (var tx in oldTransactions)
                    {
                        tx.Description = tx.Description!
                            .Replace("Nạp gói Gói", "Nạp Gói")
                            .Replace("Nạp gói gói", "Nạp gói");
                    }
                    await context.SaveChangesAsync();
                }
            }
            catch (Exception ex)
            {
                var logger = services.GetRequiredService<ILogger<WebApplication>>();
                logger.LogError(ex, "Đã xảy ra lỗi trong quá trình nạp dữ liệu Seed.");
            }
        }
    }
}
