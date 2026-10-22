using JCAP.DTOs.Profile;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.AspNetCore.Identity;
using Moq;
using Xunit;

namespace JCAP.Tests.Services;

public class ProfileServiceTests
{
    private static Mock<UserManager<ApplicationUser>> CreateUserManagerMock()
    {
        var store = new Mock<IUserStore<ApplicationUser>>();
        return new Mock<UserManager<ApplicationUser>>(
            store.Object, null!, null!, null!, null!, null!, null!, null!, null!);
    }

    [Fact]
    public async Task GetProfileAsync_WithValidUserId_ReturnsLearnerProfile()
    {
        // Arrange
        var user = new ApplicationUser
        {
            Id = "learner-01",
            FullName = "Nguyen Van A",
            Email = "learner@example.com",
            PhoneNumber = "0987654321",
            ProfilePictureUrl = "https://example.com/avatar.png",
            JLPTLevel = "N4",
            Role = "Learner",
            CreditBalance = 150,
            CreatedAt = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc)
        };

        var userManagerMock = CreateUserManagerMock();
        userManagerMock.Setup(m => m.FindByIdAsync("learner-01")).ReturnsAsync(user);

        var service = new ProfileService(userManagerMock.Object);

        // Act
        var result = await service.GetProfileAsync("learner-01");

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal("learner-01", result.Data.Id);
        Assert.Equal("Nguyen Van A", result.Data.FullName);
        Assert.Equal("learner@example.com", result.Data.Email);
        Assert.Equal("0987654321", result.Data.PhoneNumber);
        Assert.Equal("https://example.com/avatar.png", result.Data.ProfilePictureUrl);
        Assert.Equal("N4", result.Data.JLPTLevel);
        Assert.Equal("Learner", result.Data.Role);
        Assert.Equal(150, result.Data.CreditBalance);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task GetProfileAsync_WithInvalidUserId_ReturnsFailure(string? invalidUserId)
    {
        // Arrange
        var userManagerMock = CreateUserManagerMock();
        var service = new ProfileService(userManagerMock.Object);

        // Act
        var result = await service.GetProfileAsync(invalidUserId!);

        // Assert
        Assert.False(result.Success);
        Assert.Equal("Mã định danh người dùng không hợp lệ.", result.Message);
    }

    [Fact]
    public async Task GetProfileAsync_WhenUserNotFound_ReturnsFailure()
    {
        // Arrange
        var userManagerMock = CreateUserManagerMock();
        userManagerMock.Setup(m => m.FindByIdAsync("non-existent")).ReturnsAsync((ApplicationUser?)null);

        var service = new ProfileService(userManagerMock.Object);

        // Act
        var result = await service.GetProfileAsync("non-existent");

        // Assert
        Assert.False(result.Success);
        Assert.Equal("Không tìm thấy thông tin học viên.", result.Message);
    }

    [Fact]
    public async Task GetProfileAsync_WhenJlptLevelOrRoleEmpty_AppliesDefaultValues()
    {
        // Arrange
        var user = new ApplicationUser
        {
            Id = "learner-02",
            FullName = "Default User",
            Email = "default@example.com",
            JLPTLevel = "",
            Role = null!
        };

        var userManagerMock = CreateUserManagerMock();
        userManagerMock.Setup(m => m.FindByIdAsync("learner-02")).ReturnsAsync(user);

        var service = new ProfileService(userManagerMock.Object);

        // Act
        var result = await service.GetProfileAsync("learner-02");

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal("N5", result.Data.JLPTLevel);
        Assert.Equal("Learner", result.Data.Role);
    }

    [Fact]
    public async Task UpdateProfileAsync_WithValidDto_UpdatesAllowedFieldsOnly()
    {
        // Arrange
        var user = new ApplicationUser
        {
            Id = "learner-03",
            FullName = "Old Name",
            Email = "protected@example.com",
            PhoneNumber = "0123456789",
            ProfilePictureUrl = "https://example.com/old.png",
            JLPTLevel = "N5",
            Role = "Learner",
            CreditBalance = 50,
            IsActive = true,
            CreatedAt = new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc)
        };

        var updateDto = new UpdateLearnerProfileDto
        {
            FullName = "  New Full Name  ",
            PhoneNumber = " 0988776655 ",
            ProfilePictureUrl = " https://example.com/new.png ",
            JLPTLevel = "N3"
        };

        var userManagerMock = CreateUserManagerMock();
        userManagerMock.Setup(m => m.FindByIdAsync("learner-03")).ReturnsAsync(user);
        userManagerMock.Setup(m => m.UpdateAsync(user)).ReturnsAsync(IdentityResult.Success);

        var service = new ProfileService(userManagerMock.Object);

        // Act
        var result = await service.UpdateProfileAsync("learner-03", updateDto);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal("New Full Name", user.FullName);
        Assert.Equal("0988776655", user.PhoneNumber);
        Assert.Equal("https://example.com/new.png", user.ProfilePictureUrl);
        Assert.Equal("N3", user.JLPTLevel);

        // Verify protected fields remained unchanged
        Assert.Equal("protected@example.com", user.Email);
        Assert.Equal("Learner", user.Role);
        Assert.Equal(50, user.CreditBalance);
        Assert.True(user.IsActive);
    }

    [Theory]
    [InlineData("N2")]
    [InlineData("N1")]
    [InlineData("B2")]
    [InlineData("")]
    [InlineData(null)]
    public async Task UpdateProfileAsync_WithInvalidJlptLevel_ReturnsFailure(string? invalidJlpt)
    {
        // Arrange
        var updateDto = new UpdateLearnerProfileDto
        {
            FullName = "Nguyen Van B",
            JLPTLevel = invalidJlpt!
        };

        var userManagerMock = CreateUserManagerMock();
        var service = new ProfileService(userManagerMock.Object);

        // Act
        var result = await service.UpdateProfileAsync("learner-01", updateDto);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("Trình độ JLPT không hợp lệ", result.Message);
    }

    [Fact]
    public async Task UpdateProfileAsync_WhenUserNotFound_ReturnsFailure()
    {
        // Arrange
        var updateDto = new UpdateLearnerProfileDto
        {
            FullName = "Nguyen Van B",
            JLPTLevel = "N4"
        };

        var userManagerMock = CreateUserManagerMock();
        userManagerMock.Setup(m => m.FindByIdAsync("unknown-id")).ReturnsAsync((ApplicationUser?)null);

        var service = new ProfileService(userManagerMock.Object);

        // Act
        var result = await service.UpdateProfileAsync("unknown-id", updateDto);

        // Assert
        Assert.False(result.Success);
        Assert.Equal("Không tìm thấy thông tin học viên.", result.Message);
    }

    [Fact]
    public async Task UpdateProfileAsync_WhenIdentityUpdateFails_ReturnsErrorDetails()
    {
        // Arrange
        var user = new ApplicationUser { Id = "learner-04", FullName = "Name", JLPTLevel = "N5" };
        var updateDto = new UpdateLearnerProfileDto { FullName = "Valid Name", JLPTLevel = "N4" };

        var userManagerMock = CreateUserManagerMock();
        userManagerMock.Setup(m => m.FindByIdAsync("learner-04")).ReturnsAsync(user);
        userManagerMock.Setup(m => m.UpdateAsync(user)).ReturnsAsync(IdentityResult.Failed(
            new IdentityError { Code = "ConcurrencyFailure", Description = "Optimistic concurrency failure." }
        ));

        var service = new ProfileService(userManagerMock.Object);

        // Act
        var result = await service.UpdateProfileAsync("learner-04", updateDto);

        // Assert
        Assert.False(result.Success);
        Assert.Equal("Cập nhật hồ sơ thất bại.", result.Message);
        Assert.NotNull(result.Errors);
        Assert.Contains("Optimistic concurrency failure.", result.Errors);
    }
}
