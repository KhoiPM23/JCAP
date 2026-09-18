using JCAP.DTOs.Auth;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Moq;
using System.Timers;

namespace JCAP.Tests.Services;

public class AuthServiceTests
{
    [Fact]
    public async Task LoginAsync_WithValidCredentials_ReturnsSuccessAndJwtToken()
    {
        // Arrange
        var user = new ApplicationUser
        {
            Id = "user-001",
            UserName = "learner@example.com",
            Email = "learner@example.com",
            FullName = "Nguyen Van A",
            Role = "Learner",
            IsActive = true,
            EmailConfirmed = true
        };

        var userManagerMock = CreateUserManagerMock();

        userManagerMock
            .Setup(x => x.FindByEmailAsync("learner@example.com"))
            .ReturnsAsync(user);

        userManagerMock
            .Setup(x => x.CheckPasswordAsync(user, "Password123"))
            .ReturnsAsync(true);

        userManagerMock
            .Setup(x => x.GetRolesAsync(user))
            .ReturnsAsync(new List<string> { "Learner" });

        var roleManagerMock = CreateRoleManagerMock();

        var configuration = CreateConfiguration();

        var httpClientFactoryMock = new Mock<IHttpClientFactory>();
        var emailServiceMock = new Mock<IEmailService>();

        var authService = new AuthService(
            userManagerMock.Object,
            roleManagerMock.Object,
            configuration,
            httpClientFactoryMock.Object,
            emailServiceMock.Object);

        var loginDto = new LoginDto
        {
            Email = "learner@example.com",
            Password = "Password123"
        };

        // Act
        var result = await authService.LoginAsync(loginDto);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);

        Assert.False(string.IsNullOrWhiteSpace(result.Data!.Token));
        Assert.Equal("user-001", result.Data.UserId);
        Assert.Equal("learner@example.com", result.Data.Email);
        Assert.Equal("Nguyen Van A", result.Data.FullName);
        Assert.Equal("Learner", result.Data.Role);

        userManagerMock.Verify(
            x => x.FindByEmailAsync("learner@example.com"),
            Times.Once);

        userManagerMock.Verify(
            x => x.CheckPasswordAsync(user, "Password123"),
            Times.Once);

        userManagerMock.Verify(
            x => x.GetRolesAsync(user),
            Times.Once);
    }

    private static Mock<UserManager<ApplicationUser>> CreateUserManagerMock()
    {
        var storeMock = new Mock<IUserStore<ApplicationUser>>();

        return new Mock<UserManager<ApplicationUser>>(
            storeMock.Object,
            null!,
            null!,
            null!,
            null!,
            null!,
            null!,
            null!,
            null!);
    }

    private static Mock<RoleManager<IdentityRole>> CreateRoleManagerMock()
    {
        var roleStoreMock = new Mock<IRoleStore<IdentityRole>>();

        return new Mock<RoleManager<IdentityRole>>(
            roleStoreMock.Object,
            null!,
            null!,
            null!,
            null!);
    }

    private static IConfiguration CreateConfiguration()
    {
        var settings = new Dictionary<string, string?>
        {
            ["Jwt:Key"] = "This_Is_A_Test_Jwt_Key_At_Least_32_Characters_Long",
            ["Jwt:Issuer"] = "JCAP_TEST",
            ["Jwt:Audience"] = "JCAP_TEST_CLIENT",
            ["Jwt:DurationInMinutes"] = "60"
        };

        return new ConfigurationBuilder()
            .AddInMemoryCollection(settings)
            .Build();
    }

    [Fact]
    public async Task LoginAsync_WithUnknownEmail_ReturnsFailure()
    {
        // Arrange
        var userManagerMock = CreateUserManagerMock();

        userManagerMock
            .Setup(x => x.FindByEmailAsync("unknown@example.com"))
            .ReturnsAsync((ApplicationUser?)null);

        var roleManagerMock = CreateRoleManagerMock();
        var configuration = CreateConfiguration();
        var httpClientFactoryMock = new Mock<IHttpClientFactory>();
        var emailServiceMock = new Mock<IEmailService>();

        var authService = new AuthService(
            userManagerMock.Object,
            roleManagerMock.Object,
            configuration,
            httpClientFactoryMock.Object,
            emailServiceMock.Object);

        var loginDto = new LoginDto
        {
            Email = "unknown@example.com",
            Password = "Password123"
        };

        // Act
        var result = await authService.LoginAsync(loginDto);

        // Assert
        Assert.False(result.Success);
        Assert.Equal("Email hoặc mật khẩu không chính xác.", result.Message);
        Assert.Null(result.Data);

        userManagerMock.Verify(
            x => x.CheckPasswordAsync(
                It.IsAny<ApplicationUser>(),
                It.IsAny<string>()),
            Times.Never);
    }

    [Fact]
    public async Task LoginAsync_WithInvalidPassword_ReturnsFailure()
    {
        // Arrange
        var user = new ApplicationUser
        {
            Id = "user-001",
            UserName = "learner@example.com",
            Email = "learner@example.com",
            FullName = "Nguyen Van A",
            Role = "Learner",
            IsActive = true,
            EmailConfirmed = true
        };

        var userManagerMock = CreateUserManagerMock();

        userManagerMock
            .Setup(x => x.FindByEmailAsync("learner@example.com"))
            .ReturnsAsync(user);

        userManagerMock
            .Setup(x => x.CheckPasswordAsync(user, "WrongPassword"))
            .ReturnsAsync(false);

        var roleManagerMock = CreateRoleManagerMock();
        var configuration = CreateConfiguration();
        var httpClientFactoryMock = new Mock<IHttpClientFactory>();
        var emailServiceMock = new Mock<IEmailService>();

        var authService = new AuthService(
            userManagerMock.Object,
            roleManagerMock.Object,
            configuration,
            httpClientFactoryMock.Object,
            emailServiceMock.Object);

        var loginDto = new LoginDto
        {
            Email = "learner@example.com",
            Password = "WrongPassword"
        };

        // Act
        var result = await authService.LoginAsync(loginDto);

        // Assert
        Assert.False(result.Success);
        Assert.Equal("Email hoặc mật khẩu không chính xác.", result.Message);
        Assert.Null(result.Data);

        userManagerMock.Verify(
            x => x.GetRolesAsync(It.IsAny<ApplicationUser>()),
            Times.Never);
    }

    [Fact]
    public async Task LoginAsync_WithInactiveUser_ReturnsFailure()
    {
        // Arrange
        var user = new ApplicationUser
        {
            Id = "user-001",
            UserName = "learner@example.com",
            Email = "learner@example.com",
            FullName = "Nguyen Van A",
            Role = "Learner",
            IsActive = false
        };

        var userManagerMock = CreateUserManagerMock();

        userManagerMock
            .Setup(x => x.FindByEmailAsync("learner@example.com"))
            .ReturnsAsync(user);

        var roleManagerMock = CreateRoleManagerMock();
        var configuration = CreateConfiguration();
        var httpClientFactoryMock = new Mock<IHttpClientFactory>();
        var emailServiceMock = new Mock<IEmailService>();

        var authService = new AuthService(
            userManagerMock.Object,
            roleManagerMock.Object,
            configuration,
            httpClientFactoryMock.Object,
            emailServiceMock.Object);

        var loginDto = new LoginDto
        {
            Email = "learner@example.com",
            Password = "Password123"
        };

        // Act
        var result = await authService.LoginAsync(loginDto);

        // Assert
        Assert.False(result.Success);
        Assert.Equal("Tài khoản của bạn đã bị khóa.", result.Message);

        userManagerMock.Verify(
            x => x.CheckPasswordAsync(
                It.IsAny<ApplicationUser>(),
                It.IsAny<string>()),
            Times.Never);
    }

    [Fact]
    public async Task ForgotPasswordAsync_WithExistingUser_SendsResetEmail()
    {
        var user = new ApplicationUser
        {
            Id = "user-001",
            Email = "learner@example.com",
            FullName = "Nguyen Van A",
            IsActive = true
        };
        var userManagerMock = CreateUserManagerMock();
        userManagerMock.Setup(x => x.FindByEmailAsync(user.Email)).ReturnsAsync(user);
        userManagerMock.Setup(x => x.GeneratePasswordResetTokenAsync(user)).ReturnsAsync("reset token");
        var emailServiceMock = new Mock<IEmailService>();
        var authService = new AuthService(
            userManagerMock.Object,
            CreateRoleManagerMock().Object,
            CreateConfiguration(),
            new Mock<IHttpClientFactory>().Object,
            emailServiceMock.Object);

        var result = await authService.ForgotPasswordAsync(new ForgotPasswordDto { Email = user.Email });

        Assert.True(result.Success);
        emailServiceMock.Verify(
            x => x.SendAsync(
                user.Email,
                "Đặt lại mật khẩu tài khoản JCAP",
                It.Is<string>(body => body.Contains("reset-password") && body.Contains("reset%20token")),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task ForgotPasswordAsync_WithUnknownEmail_ReturnsGenericSuccessWithoutSendingEmail()
    {
        var userManagerMock = CreateUserManagerMock();
        userManagerMock
            .Setup(x => x.FindByEmailAsync("unknown@example.com"))
            .ReturnsAsync((ApplicationUser?)null);
        var emailServiceMock = new Mock<IEmailService>();
        var authService = new AuthService(
            userManagerMock.Object,
            CreateRoleManagerMock().Object,
            CreateConfiguration(),
            new Mock<IHttpClientFactory>().Object,
            emailServiceMock.Object);

        var result = await authService.ForgotPasswordAsync(
            new ForgotPasswordDto { Email = "unknown@example.com" });

        Assert.True(result.Success);
        emailServiceMock.Verify(
            x => x.SendAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task ResetPasswordAsync_WithValidToken_ResetsPassword()
    {
        var user = new ApplicationUser { Id = "user-001", Email = "learner@example.com", IsActive = true };
        var userManagerMock = CreateUserManagerMock();
        userManagerMock.Setup(x => x.FindByEmailAsync(user.Email)).ReturnsAsync(user);
        userManagerMock
            .Setup(x => x.ResetPasswordAsync(user, "valid-token", "NewPassword123"))
            .ReturnsAsync(IdentityResult.Success);
        var authService = new AuthService(
            userManagerMock.Object,
            CreateRoleManagerMock().Object,
            CreateConfiguration(),
            new Mock<IHttpClientFactory>().Object,
            new Mock<IEmailService>().Object);

        var result = await authService.ResetPasswordAsync(new ResetPasswordDto
        {
            Email = user.Email,
            Token = "valid-token",
            NewPassword = "NewPassword123",
            ConfirmPassword = "NewPassword123"
        });

        Assert.True(result.Success);
        userManagerMock.Verify(
            x => x.ResetPasswordAsync(user, "valid-token", "NewPassword123"),
            Times.Once);
    }

    [Fact]
    public async Task ChangePasswordAsync_WithValidCurrentPassword_ChangesPassword()
    {
        var user = new ApplicationUser { Id = "user-001", Email = "learner@example.com", IsActive = true };
        var userManagerMock = CreateUserManagerMock();
        userManagerMock.Setup(x => x.FindByIdAsync(user.Id)).ReturnsAsync(user);
        userManagerMock
            .Setup(x => x.ChangePasswordAsync(user, "OldPassword123", "NewPassword123"))
            .ReturnsAsync(IdentityResult.Success);
        var authService = new AuthService(
            userManagerMock.Object,
            CreateRoleManagerMock().Object,
            CreateConfiguration(),
            new Mock<IHttpClientFactory>().Object,
            new Mock<IEmailService>().Object);

        var result = await authService.ChangePasswordAsync(user.Id, new ChangePasswordDto
        {
            CurrentPassword = "OldPassword123",
            NewPassword = "NewPassword123",
            ConfirmPassword = "NewPassword123"
        });

        Assert.True(result.Success);
        userManagerMock.Verify(
            x => x.ChangePasswordAsync(user, "OldPassword123", "NewPassword123"),
            Times.Once);
    }
}
