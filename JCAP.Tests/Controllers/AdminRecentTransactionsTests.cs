using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using JCAP.Controllers;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Credit;
using JCAP.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace JCAP.Tests.Controllers
{
    public class AdminRecentTransactionsTests
    {
        private AppDbContext CreateInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase(databaseName: $"JCAP_AdminRecentTx_Test_{Guid.NewGuid()}")
                .Options;

            return new AppDbContext(options);
        }

        private Mock<ILogger<AdminCreditPackagesController>> CreateLoggerMock()
        {
            return new Mock<ILogger<AdminCreditPackagesController>>();
        }

        [Fact]
        public async Task GetRecentTransactions_ReturnsOnlyPurchases_WithCorrectMappingAndOrdering()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var user = new ApplicationUser
            {
                Id = "user-real-01",
                FullName = "Nguyễn Văn A",
                Email = "nguyenvana@gmail.com"
            };
            context.Users.Add(user);

            var pkg = new CreditPackage
            {
                Id = 1,
                Name = "Gói Tiêu Chuẩn",
                Credits = 150,
                Price = 50000m,
                IsActive = true
            };
            context.CreditPackages.Add(pkg);

            // Giao dịch 1: Deduct (không được xuất hiện trong luồng nạp/mua gói)
            context.CreditTransactions.Add(new CreditTransaction
            {
                Id = 1,
                UserId = "user-real-01",
                Amount = -5,
                Type = "Deduct",
                Description = "Luyện tập hội thoại",
                Status = "Paid",
                CreatedAt = DateTime.UtcNow.AddMinutes(-30)
            });

            // Giao dịch 2: TopUp
            context.CreditTransactions.Add(new CreditTransaction
            {
                Id = 2,
                UserId = "user-real-01",
                Amount = 150,
                Type = "TopUp",
                Description = "Nạp Gói Tiêu Chuẩn (150 credits)",
                PayOsOrderCode = "12345678",
                Status = "Paid",
                CreatedAt = DateTime.UtcNow.AddMinutes(-20)
            });

            // Giao dịch 3: Subscription đã thanh toán thành công (Paid) -> được xuất hiện
            context.CreditTransactions.Add(new CreditTransaction
            {
                Id = 3,
                UserId = "user-real-01",
                Amount = 1000,
                Type = "Subscription",
                Description = "Đăng ký Gói Tháng Pro",
                PayOsOrderCode = "87654321",
                Status = "Paid",
                CreatedAt = DateTime.UtcNow.AddMinutes(-5)
            });

            // Giao dịch 4: Đơn Pending / Cancelled -> KHÔNG được xuất hiện trong dòng giao dịch thành công của Admin
            context.CreditTransactions.Add(new CreditTransaction
            {
                Id = 4,
                UserId = "user-real-01",
                Amount = 500,
                Type = "TopUp",
                Description = "Nạp Gói Bị Hủy",
                PayOsOrderCode = "99999999",
                Status = "Cancelled",
                CreatedAt = DateTime.UtcNow.AddMinutes(-1)
            });

            await context.SaveChangesAsync();

            // Act
            var actionResult = await controller.GetRecentTransactions(10);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<IEnumerable<AdminRecentTransactionDto>>>(okResult.Value);
            Assert.True(apiResponse.Success);
            Assert.NotNull(apiResponse.Data);

            var list = apiResponse.Data.ToList();
            Assert.Equal(2, list.Count); // Chỉ lấy TopUp và Subscription có Status == "Paid", loại bỏ Deduct & Cancelled/Pending

            // Giao dịch mới nhất phải đứng đầu (Id 3)
            var txSub = list[0];
            Assert.Equal("TX-00003", txSub.Id);
            Assert.Equal("Nguyễn Văn A", txSub.User);
            Assert.Equal("nguyenvana@gmail.com", txSub.Email);
            Assert.Equal("subscription", txSub.Type);
            Assert.Equal("Gói Tháng Pro", txSub.PackageName);
            Assert.Equal("Paid", txSub.Status);
            Assert.Equal(199000, txSub.Amount);

            // Giao dịch thứ hai (Id 2)
            var txTopUp = list[1];
            Assert.Equal("TX-00002", txTopUp.Id);
            Assert.Equal("credit", txTopUp.Type);
            Assert.Equal("Gói Tiêu Chuẩn (150 credits)", txTopUp.PackageName);
            Assert.Equal("Paid", txTopUp.Status);
            Assert.Equal(50000m, txTopUp.Amount);
        }
    }
}
