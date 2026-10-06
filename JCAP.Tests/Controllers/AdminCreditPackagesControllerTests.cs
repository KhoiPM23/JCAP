using System.ComponentModel.DataAnnotations;
using JCAP.Controllers;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.CreditPackage;
using JCAP.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace JCAP.Tests.Controllers
{
    public class AdminCreditPackagesControllerTests
    {
        private AppDbContext CreateInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase(databaseName: $"JCAP_AdminCredit_Test_{Guid.NewGuid()}")
                .Options;

            return new AppDbContext(options);
        }

        private Mock<ILogger<AdminCreditPackagesController>> CreateLoggerMock()
        {
            return new Mock<ILogger<AdminCreditPackagesController>>();
        }

        private void ValidateModel(object model, ControllerBase controller)
        {
            var validationContext = new ValidationContext(model, null, null);
            var validationResults = new List<ValidationResult>();
            Validator.TryValidateObject(model, validationContext, validationResults, true);
            foreach (var result in validationResults)
            {
                controller.ModelState.AddModelError(result.MemberNames.FirstOrDefault() ?? "Error", result.ErrorMessage ?? "Validation error");
            }
        }

        #region UC13: Add Credit Package (Create)

        [Fact]
        public async Task Create_ValidDto_ReturnsCreatedAtActionWithPackage()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new CreateCreditPackageDto
            {
                Name = "Gói Cơ Bản",
                Credits = 100,
                Price = 50000m
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Create(dto);

            // Assert
            var createdResult = Assert.IsType<CreatedAtActionResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(createdResult.Value);
            Assert.True(apiResponse.Success);
            Assert.NotNull(apiResponse.Data);
            Assert.Equal("Gói Cơ Bản", apiResponse.Data.Name);
            Assert.Equal(100, apiResponse.Data.Credits);
            Assert.Equal(50000m, apiResponse.Data.Price);
            Assert.True(apiResponse.Data.IsActive);

            var inDb = await context.CreditPackages.FirstOrDefaultAsync(p => p.Name == "Gói Cơ Bản");
            Assert.NotNull(inDb);
        }

        [Fact]
        public async Task Create_PriceZero_ReturnsCreatedAtActionWithPackage()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new CreateCreditPackageDto
            {
                Name = "Gói Quà Tặng Miễn Phí",
                Credits = 20,
                Price = 0m
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Create(dto);

            // Assert
            var createdResult = Assert.IsType<CreatedAtActionResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(createdResult.Value);
            Assert.True(apiResponse.Success);
            Assert.Equal(0m, apiResponse.Data!.Price);
        }

        [Fact]
        public async Task Create_EmptyName_ReturnsBadRequest()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new CreateCreditPackageDto
            {
                Name = "",
                Credits = 100,
                Price = 50000m
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Create(dto);

            // Assert
            var badRequestResult = Assert.IsType<BadRequestObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(badRequestResult.Value);
            Assert.False(apiResponse.Success);
        }

        [Fact]
        public async Task Create_NameTooShort_ReturnsBadRequest()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new CreateCreditPackageDto
            {
                Name = "A", // Chỉ có 1 ký tự, tối thiểu là 2
                Credits = 50,
                Price = 20000m
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Create(dto);

            // Assert
            var badRequestResult = Assert.IsType<BadRequestObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(badRequestResult.Value);
            Assert.False(apiResponse.Success);
        }

        [Fact]
        public async Task Create_NameTooLong_ReturnsBadRequest()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new CreateCreditPackageDto
            {
                Name = new string('X', 101), // 101 ký tự, tối đa là 100
                Credits = 50,
                Price = 20000m
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Create(dto);

            // Assert
            var badRequestResult = Assert.IsType<BadRequestObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(badRequestResult.Value);
            Assert.False(apiResponse.Success);
        }

        [Fact]
        public async Task Create_ZeroOrNegativeCredits_ReturnsBadRequest()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new CreateCreditPackageDto
            {
                Name = "Gói Lỗi Credit",
                Credits = 0, // Phải lớn hơn 0
                Price = 20000m
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Create(dto);

            // Assert
            var badRequestResult = Assert.IsType<BadRequestObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(badRequestResult.Value);
            Assert.False(apiResponse.Success);
        }

        [Fact]
        public async Task Create_NegativePrice_ReturnsBadRequest()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new CreateCreditPackageDto
            {
                Name = "Gói Giá Âm",
                Credits = 50,
                Price = -5000m // Không được âm
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Create(dto);

            // Assert
            var badRequestResult = Assert.IsType<BadRequestObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(badRequestResult.Value);
            Assert.False(apiResponse.Success);
        }

        [Fact]
        public async Task Create_BoundaryNameTwoChars_ReturnsCreatedAtAction()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new CreateCreditPackageDto
            {
                Name = "AB", // Đúng 2 ký tự (biên dưới)
                Credits = 10,
                Price = 10000m
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Create(dto);

            // Assert
            var createdResult = Assert.IsType<CreatedAtActionResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(createdResult.Value);
            Assert.True(apiResponse.Success);
            Assert.Equal("AB", apiResponse.Data!.Name);
        }

        [Fact]
        public async Task Create_BoundaryNameOneHundredChars_ReturnsCreatedAtAction()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new CreateCreditPackageDto
            {
                Name = new string('Z', 100), // Đúng 100 ký tự (biên trên)
                Credits = 10,
                Price = 10000m
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Create(dto);

            // Assert
            var createdResult = Assert.IsType<CreatedAtActionResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(createdResult.Value);
            Assert.True(apiResponse.Success);
        }

        [Fact]
        public async Task Create_BoundaryCreditsOne_ReturnsCreatedAtAction()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new CreateCreditPackageDto
            {
                Name = "Gói 1 Credit",
                Credits = 1, // Biên dưới hợp lệ
                Price = 1000m
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Create(dto);

            // Assert
            var createdResult = Assert.IsType<CreatedAtActionResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(createdResult.Value);
            Assert.True(apiResponse.Success);
            Assert.Equal(1, apiResponse.Data!.Credits);
        }

        #endregion

        #region UC14: Edit Credit Package (Update)

        [Fact]
        public async Task Update_ExistingPackage_UpdatesAllFieldsAndReturnsOk()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var package = new CreditPackage
            {
                Id = 1,
                Name = "Tên Cũ",
                Credits = 50,
                Price = 25000m,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            context.CreditPackages.Add(package);
            await context.SaveChangesAsync();

            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new UpdateCreditPackageDto
            {
                Name = "Tên Mới Sau Khi Sửa",
                Credits = 80,
                Price = 40000m,
                IsActive = true
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Update(1, dto);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(okResult.Value);
            Assert.True(apiResponse.Success);
            Assert.Equal("Tên Mới Sau Khi Sửa", apiResponse.Data!.Name);
            Assert.Equal(80, apiResponse.Data.Credits);
            Assert.Equal(40000m, apiResponse.Data.Price);

            var inDb = await context.CreditPackages.FindAsync(1);
            Assert.Equal("Tên Mới Sau Khi Sửa", inDb!.Name);
        }

        [Fact]
        public async Task Update_DeactivatePackage_SetsIsActiveFalseAndReturnsOk()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var package = new CreditPackage
            {
                Id = 2,
                Name = "Gói Sắp Dừng",
                Credits = 100,
                Price = 50000m,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            context.CreditPackages.Add(package);
            await context.SaveChangesAsync();

            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new UpdateCreditPackageDto
            {
                Name = "Gói Sắp Dừng",
                Credits = 100,
                Price = 50000m,
                IsActive = false // Vô hiệu hóa
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Update(2, dto);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(okResult.Value);
            Assert.True(apiResponse.Success);
            Assert.False(apiResponse.Data!.IsActive);

            var inDb = await context.CreditPackages.FindAsync(2);
            Assert.False(inDb!.IsActive);
        }

        [Fact]
        public async Task Update_NonExistentId_ReturnsNotFound()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new UpdateCreditPackageDto
            {
                Name = "Gói Không Tồn Tại",
                Credits = 100,
                Price = 50000m,
                IsActive = true
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Update(9999, dto);

            // Assert
            var notFoundResult = Assert.IsType<NotFoundObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(notFoundResult.Value);
            Assert.False(apiResponse.Success);
        }

        [Fact]
        public async Task Update_InvalidDto_ReturnsBadRequest()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var package = new CreditPackage
            {
                Id = 3,
                Name = "Gói Đang Chạy",
                Credits = 50,
                Price = 25000m,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            context.CreditPackages.Add(package);
            await context.SaveChangesAsync();

            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new UpdateCreditPackageDto
            {
                Name = "", // Lỗi: Tên rỗng
                Credits = -10, // Lỗi: Credits âm
                Price = -5000m, // Lỗi: Price âm
                IsActive = true
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Update(3, dto);

            // Assert
            var badRequestResult = Assert.IsType<BadRequestObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(badRequestResult.Value);
            Assert.False(apiResponse.Success);
        }

        [Fact]
        public async Task Update_BoundaryValidData_ReturnsOk()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var package = new CreditPackage
            {
                Id = 4,
                Name = "Gói Gốc",
                Credits = 10,
                Price = 5000m,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            context.CreditPackages.Add(package);
            await context.SaveChangesAsync();

            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            var dto = new UpdateCreditPackageDto
            {
                Name = "XY", // Biên dưới 2 ký tự
                Credits = 1, // Biên dưới credits
                Price = 0m, // Biên dưới giá tiền
                IsActive = true
            };
            ValidateModel(dto, controller);

            // Act
            var actionResult = await controller.Update(4, dto);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(okResult.Value);
            Assert.True(apiResponse.Success);
            Assert.Equal("XY", apiResponse.Data!.Name);
            Assert.Equal(1, apiResponse.Data.Credits);
            Assert.Equal(0m, apiResponse.Data.Price);
        }

        #endregion

        #region UC15: Delete Credit Package (Delete)

        [Fact]
        public async Task Delete_ExistingPackage_PerformsSoftDeleteAndReturnsOk()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var package = new CreditPackage
            {
                Id = 10,
                Name = "Gói Muốn Xóa",
                Credits = 100,
                Price = 50000m,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            context.CreditPackages.Add(package);
            await context.SaveChangesAsync();

            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            // Act
            var actionResult = await controller.Delete(10);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(okResult.Value);
            Assert.True(apiResponse.Success);
            Assert.False(apiResponse.Data!.IsActive);

            // Xác nhận Soft delete: Bản ghi vẫn còn trong database nhưng IsActive = false
            var inDb = await context.CreditPackages.FindAsync(10);
            Assert.NotNull(inDb);
            Assert.False(inDb.IsActive);
        }

        [Fact]
        public async Task Delete_NonExistentId_ReturnsNotFound()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            // Act
            var actionResult = await controller.Delete(9999);

            // Assert
            var notFoundResult = Assert.IsType<NotFoundObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(notFoundResult.Value);
            Assert.False(apiResponse.Success);
        }

        [Fact]
        public async Task Delete_AlreadyInactivePackage_ReturnsOk()
        {
            // Arrange
            using var context = CreateInMemoryDbContext();
            var package = new CreditPackage
            {
                Id = 11,
                Name = "Gói Đã Bị Vô Hiệu Hóa Trước Đó",
                Credits = 50,
                Price = 25000m,
                IsActive = false,
                CreatedAt = DateTime.UtcNow
            };
            context.CreditPackages.Add(package);
            await context.SaveChangesAsync();

            var logger = CreateLoggerMock();
            var controller = new AdminCreditPackagesController(context, logger.Object);

            // Act
            var actionResult = await controller.Delete(11);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<CreditPackage>>(okResult.Value);
            Assert.True(apiResponse.Success);
            Assert.False(apiResponse.Data!.IsActive);

            var inDb = await context.CreditPackages.FindAsync(11);
            Assert.NotNull(inDb);
            Assert.False(inDb.IsActive);
        }

        #endregion
    }
}

