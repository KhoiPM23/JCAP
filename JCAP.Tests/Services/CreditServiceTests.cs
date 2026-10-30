using JCAP.Data;
using JCAP.DTOs.Credit;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;

namespace JCAP.Tests.Services
{
    public class CreditServiceTests
    {
        private AppDbContext CreateInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase(databaseName: $"JCAP_Test_DB_{Guid.NewGuid()}")
                .Options;

            return new AppDbContext(options);
        }

        private Mock<UserManager<ApplicationUser>> CreateUserManagerMock()
        {
            var store = new Mock<IUserStore<ApplicationUser>>();
            return new Mock<UserManager<ApplicationUser>>(
                store.Object, null!, null!, null!, null!, null!, null!, null!, null!);
        }

        [Fact]
        public async Task GetActivePackagesAsync_ReturnsOnlyActivePackagesOrderedByPrice()
        {
            // Arrange
            using var dbContext = CreateInMemoryDbContext();
            dbContext.CreditPackages.AddRange(
                new CreditPackage { Id = 1, Name = "Gói Đắt", Credits = 500, Price = 200000m, IsActive = true, CreatedAt = DateTime.UtcNow },
                new CreditPackage { Id = 2, Name = "Gói Tắt", Credits = 100, Price = 10000m, IsActive = false, CreatedAt = DateTime.UtcNow },
                new CreditPackage { Id = 3, Name = "Gói Rẻ", Credits = 50, Price = 20000m, IsActive = true, CreatedAt = DateTime.UtcNow }
            );
            await dbContext.SaveChangesAsync();

            var userManagerMock = CreateUserManagerMock();
            var payOsOptions = Options.Create(new PayOsSettings());
            var configMock = new Mock<IConfiguration>();
            var loggerMock = new Mock<ILogger<CreditService>>();

            var service = new CreditService(dbContext, userManagerMock.Object, payOsOptions, configMock.Object, loggerMock.Object);

            // Act
            var result = await service.GetActivePackagesAsync();

            // Assert
            Assert.True(result.Success);
            Assert.NotNull(result.Data);
            Assert.Equal(2, result.Data.Count);
            Assert.Equal("Gói Rẻ", result.Data[0].Name);
            Assert.Equal("Gói Đắt", result.Data[1].Name);
        }

        [Fact]
        public async Task PurchasePackageAsync_WhenPayOsNotConfigured_ReturnsFailureAndDoesNotUpdateBalance()
        {
            // Arrange
            using var dbContext = CreateInMemoryDbContext();
            var package = new CreditPackage
            {
                Id = 10,
                Name = "Gói Thử Nghiệm",
                Credits = 100,
                Price = 50000m,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            dbContext.CreditPackages.Add(package);
            await dbContext.SaveChangesAsync();

            var user = new ApplicationUser
            {
                Id = "user-test-1",
                UserName = "learner@test.com",
                Email = "learner@test.com",
                CreditBalance = 20
            };

            var userManagerMock = CreateUserManagerMock();
            userManagerMock.Setup(x => x.FindByIdAsync("user-test-1")).ReturnsAsync(user);
            userManagerMock.Setup(x => x.UpdateAsync(user)).ReturnsAsync(IdentityResult.Success);

            var payOsOptions = Options.Create(new PayOsSettings()); // Not configured -> Should reject
            var configMock = new Mock<IConfiguration>();
            var loggerMock = new Mock<ILogger<CreditService>>();

            var service = new CreditService(dbContext, userManagerMock.Object, payOsOptions, configMock.Object, loggerMock.Object);

            // Act
            var result = await service.PurchasePackageAsync("user-test-1", 10);

            // Assert
            Assert.False(result.Success);
            Assert.Null(result.Data);
            Assert.Contains("chưa được cấu hình", result.Message);
            Assert.Equal(20, user.CreditBalance);

            // Verify no transaction was saved in DB
            var tx = await dbContext.CreditTransactions.FirstOrDefaultAsync(t => t.UserId == "user-test-1");
            Assert.Null(tx);
        }

        [Fact]
        public async Task ContinuePaymentAsync_WhenPayOsNotConfigured_ReturnsFailureAndDoesNotUpdateBalance()
        {
            // Arrange
            using var dbContext = CreateInMemoryDbContext();
            var pendingTx = new CreditTransaction
            {
                Id = 99,
                UserId = "user-test-1",
                Amount = 100,
                Type = "TopUp",
                PayOsOrderCode = "123456789",
                Status = "Pending",
                CreatedAt = DateTime.UtcNow
            };
            dbContext.CreditTransactions.Add(pendingTx);
            await dbContext.SaveChangesAsync();

            var user = new ApplicationUser
            {
                Id = "user-test-1",
                CreditBalance = 20
            };

            var userManagerMock = CreateUserManagerMock();
            userManagerMock.Setup(x => x.FindByIdAsync("user-test-1")).ReturnsAsync(user);

            var payOsOptions = Options.Create(new PayOsSettings()); // Not configured -> Should reject
            var configMock = new Mock<IConfiguration>();
            var loggerMock = new Mock<ILogger<CreditService>>();

            var service = new CreditService(dbContext, userManagerMock.Object, payOsOptions, configMock.Object, loggerMock.Object);

            // Act
            var result = await service.ContinuePaymentAsync("user-test-1", 123456789L);

            // Assert
            Assert.False(result.Success);
            Assert.Null(result.Data);
            Assert.Contains("chưa được cấu hình", result.Message);
            Assert.Equal(20, user.CreditBalance);

            var txInDb = await dbContext.CreditTransactions.FindAsync(99);
            Assert.NotNull(txInDb);
            Assert.Equal("Pending", txInDb.Status);
        }

        [Fact]
        public async Task PurchasePackageAsync_InactivePackage_ReturnsFailure()
        {
            // Arrange
            using var dbContext = CreateInMemoryDbContext();
            var package = new CreditPackage
            {
                Id = 20,
                Name = "Gói Vô Hiệu",
                Credits = 100,
                Price = 50000m,
                IsActive = false,
                CreatedAt = DateTime.UtcNow
            };
            dbContext.CreditPackages.Add(package);
            await dbContext.SaveChangesAsync();

            var userManagerMock = CreateUserManagerMock();
            var payOsOptions = Options.Create(new PayOsSettings());
            var configMock = new Mock<IConfiguration>();
            var loggerMock = new Mock<ILogger<CreditService>>();

            var service = new CreditService(dbContext, userManagerMock.Object, payOsOptions, configMock.Object, loggerMock.Object);

            // Act
            var result = await service.PurchasePackageAsync("user-test-1", 20);

            // Assert
            Assert.False(result.Success);
            Assert.Contains("không tồn tại hoặc đã ngừng hoạt động", result.Message);
        }

        [Fact]
        public async Task GetHistoryAsync_ReturnsPagedUserTransactions()
        {
            // Arrange
            using var dbContext = CreateInMemoryDbContext();
            var user = new ApplicationUser
            {
                Id = "user-test-hist",
                CreditBalance = 500
            };

            dbContext.CreditTransactions.AddRange(
                new CreditTransaction { Id = 1, UserId = "user-test-hist", Amount = 100, Type = "TopUp", Status = "Paid", CreatedAt = DateTime.UtcNow.AddMinutes(-10) },
                new CreditTransaction { Id = 2, UserId = "user-test-hist", Amount = -20, Type = "Deduct", Status = "Paid", CreatedAt = DateTime.UtcNow.AddMinutes(-5) },
                new CreditTransaction { Id = 3, UserId = "another-user", Amount = 300, Type = "TopUp", Status = "Paid", CreatedAt = DateTime.UtcNow }
            );
            await dbContext.SaveChangesAsync();

            var userManagerMock = CreateUserManagerMock();
            userManagerMock.Setup(x => x.FindByIdAsync("user-test-hist")).ReturnsAsync(user);

            var payOsOptions = Options.Create(new PayOsSettings());
            var configMock = new Mock<IConfiguration>();
            var loggerMock = new Mock<ILogger<CreditService>>();

            var service = new CreditService(dbContext, userManagerMock.Object, payOsOptions, configMock.Object, loggerMock.Object);

            // Act
            var result = await service.GetHistoryAsync("user-test-hist", page: 1, pageSize: 10);

            // Assert
            Assert.True(result.Success);
            Assert.NotNull(result.Data);
            Assert.Equal(2, result.Data.TotalCount);
            Assert.Equal(2, result.Data.Transactions.Count);
            Assert.Equal(500, result.Data.CurrentCreditBalance);
            // Sắp xếp giảm dần theo CreatedAt: Id 2 mới hơn Id 1
            Assert.Equal(2, result.Data.Transactions[0].Id);
            Assert.Equal(1, result.Data.Transactions[1].Id);
        }

        [Fact]
        public async Task GetUserQuotaAsync_CountsOnlySubscriptionDeducts_AndReflectsUserPlanTier()
        {
            // Arrange
            using var dbContext = CreateInMemoryDbContext();
            var user = new ApplicationUser
            {
                Id = "user-quota-test",
                CreditBalance = 80,
                SubscriptionPlanId = "plan-promax",
                SubscriptionExpiresAt = DateTime.UtcNow.AddDays(20)
            };

            dbContext.CreditTransactions.AddRange(
                // Lượt trừ gói tháng -> phải được tính vào quota
                new CreditTransaction
                {
                    Id = 1,
                    UserId = "user-quota-test",
                    Amount = -15,
                    Type = "Deduct",
                    Status = "Paid",
                    CoveredBySubscription = true,
                    Description = "[Gói tháng] Lượt hội thoại AI",
                    CreatedAt = DateTime.UtcNow.AddHours(-1)
                },
                // Lượt trừ từ số dư nạp lẻ (pay-as-you-go) -> KHÔNG được tính lẫn vào quota gói tháng
                new CreditTransaction
                {
                    Id = 2,
                    UserId = "user-quota-test",
                    Amount = -25,
                    Type = "Deduct",
                    Status = "Paid",
                    CoveredBySubscription = false,
                    Description = "Lượt hội thoại AI lẻ",
                    CreatedAt = DateTime.UtcNow.AddHours(-2)
                }
            );
            await dbContext.SaveChangesAsync();

            var userManagerMock = CreateUserManagerMock();
            userManagerMock.Setup(x => x.FindByIdAsync("user-quota-test")).ReturnsAsync(user);

            var payOsOptions = Options.Create(new PayOsSettings());
            var configMock = new Mock<IConfiguration>();
            var loggerMock = new Mock<ILogger<CreditService>>();

            var service = new CreditService(dbContext, userManagerMock.Object, payOsOptions, configMock.Object, loggerMock.Object);

            // Act
            var result = await service.GetUserQuotaAsync("user-quota-test");

            // Assert
            Assert.True(result.Success);
            Assert.NotNull(result.Data);
            Assert.Equal("ProMax", result.Data.PlanTier);
            Assert.Equal(150, result.Data.FiveHourTotalCredits);
            Assert.Equal(2500, result.Data.WeeklyTotalCredits);
            Assert.Equal(15, result.Data.FiveHourUsedCredits); // Chỉ đếm 15, bỏ qua 25 của pay-as-you-go
            Assert.Equal(135, result.Data.FiveHourRemainingCredits);
            Assert.Equal(15, result.Data.WeeklyUsedCredits);
            Assert.Equal(2485, result.Data.WeeklyRemainingCredits);
        }

        [Fact]
        public async Task GetHistoryAsync_AutomaticallyCancelsPendingTransactionsOlderThan10Minutes()
        {
            // Arrange
            using var dbContext = CreateInMemoryDbContext();
            var user = new ApplicationUser
            {
                Id = "user-timeout-test",
                CreditBalance = 100
            };

            dbContext.CreditTransactions.AddRange(
                // Quá 10 phút -> phải tự động chuyển thành Cancelled
                new CreditTransaction
                {
                    Id = 10,
                    UserId = "user-timeout-test",
                    Amount = 50,
                    Type = "TopUp",
                    PayOsOrderCode = "100001",
                    Status = "Pending",
                    CreatedAt = DateTime.UtcNow.AddMinutes(-11)
                },
                // Mới tạo 3 phút -> vẫn giữ nguyên trạng thái Pending
                new CreditTransaction
                {
                    Id = 11,
                    UserId = "user-timeout-test",
                    Amount = 150,
                    Type = "TopUp",
                    PayOsOrderCode = "100002",
                    Status = "Pending",
                    CreatedAt = DateTime.UtcNow.AddMinutes(-3)
                }
            );
            await dbContext.SaveChangesAsync();

            var userManagerMock = CreateUserManagerMock();
            userManagerMock.Setup(x => x.FindByIdAsync("user-timeout-test")).ReturnsAsync(user);

            var payOsOptions = Options.Create(new PayOsSettings());
            var configMock = new Mock<IConfiguration>();
            var loggerMock = new Mock<ILogger<CreditService>>();

            var service = new CreditService(dbContext, userManagerMock.Object, payOsOptions, configMock.Object, loggerMock.Object);

            // Act
            var result = await service.GetHistoryAsync("user-timeout-test", page: 1, pageSize: 10);

            // Assert
            Assert.True(result.Success);
            Assert.NotNull(result.Data);

            var newerTx = result.Data.Transactions.First(t => t.Id == 11);
            var expiredTx = result.Data.Transactions.First(t => t.Id == 10);

            Assert.Equal("Pending", newerTx.Status);
            Assert.Equal("Cancelled", expiredTx.Status);
        }
    }
}
