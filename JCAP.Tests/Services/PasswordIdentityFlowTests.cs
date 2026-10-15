using System.ComponentModel.DataAnnotations;
using System.Net;
using System.Text.RegularExpressions;
using JCAP.Data;
using JCAP.DTOs.Auth;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Moq;

namespace JCAP.Tests.Services;

// Exercise real Identity password hashes and reset tokens against an isolated store.
// No SMTP server, Google account, production database or secrets are used here.
public sealed class PasswordIdentityFlowTests : IDisposable
{
    private readonly ServiceProvider _services;
    private readonly UserManager<ApplicationUser> _users;
    private readonly AuthService _auth;
    private readonly Mock<IEmailService> _email = new();

    public PasswordIdentityFlowTests()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(Guid.NewGuid().ToString()));
        services.AddSingleton<IDataProtectionProvider>(new EphemeralDataProtectionProvider());
        services.AddIdentityCore<ApplicationUser>(options =>
        {
            options.Password.RequireDigit = false;
            options.Password.RequireLowercase = false;
            options.Password.RequireUppercase = false;
            options.Password.RequireNonAlphanumeric = false;
            options.Password.RequiredLength = 6;
        }).AddRoles<IdentityRole>().AddEntityFrameworkStores<AppDbContext>().AddDefaultTokenProviders();
        _services = services.BuildServiceProvider();
        _users = _services.GetRequiredService<UserManager<ApplicationUser>>();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = "Isolated_password_flow_test_key_at_least_32_characters",
            ["Jwt:Issuer"] = "JCAP_TEST", ["Jwt:Audience"] = "JCAP_TEST",
            ["FrontendUrl"] = "https://jcap.example.test"
        }).Build();
        _auth = new AuthService(_users, _services.GetRequiredService<RoleManager<IdentityRole>>(),
            config, Mock.Of<IHttpClientFactory>(), _email.Object);
    }

    private async Task<ApplicationUser> CreateUser(bool google = true, bool verified = true, string? password = null)
    {
        var user = new ApplicationUser
        {
            UserName = $"{Guid.NewGuid():N}@example.test", EmailConfirmed = verified, IsActive = true
        };
        user.Email = user.UserName;
        var created = password == null ? await _users.CreateAsync(user) : await _users.CreateAsync(user, password);
        Assert.True(created.Succeeded);
        if (google) Assert.True((await _users.AddLoginAsync(user, new UserLoginInfo("Google", user.Id, "Google"))).Succeeded);
        return user;
    }

    private static ChangePasswordDto Change(string? current = null, string password = "NewPass123") => new()
    {
        CurrentPassword = current, NewPassword = password, ConfirmPassword = password
    };

    [Fact]
    public async Task GoogleAccount_CreatesFirstPassword_ThenRequiresCurrentPassword_AndKeepsGoogleLogin()
    {
        var user = await CreateUser();
        Assert.False((await _auth.GetCurrentUserAsync(user.Id)).Data!.HasPassword);
        Assert.True((await _auth.ChangePasswordAsync(user.Id, Change())).Success);
        Assert.True(await _users.CheckPasswordAsync(user, "NewPass123"));
        Assert.True((await _auth.GetCurrentUserAsync(user.Id)).Data!.HasPassword);
        Assert.True((await _auth.LoginAsync(new LoginDto { Email = user.Email!, Password = "NewPass123" })).Success);
        Assert.Equal(user.Id, (await _users.FindByLoginAsync("Google", user.Id))!.Id);

        Assert.False((await _auth.ChangePasswordAsync(user.Id, Change(password: "Overwrite123"))).Success);
        Assert.False((await _auth.ChangePasswordAsync(user.Id, Change("WrongPass123"))).Success);
        Assert.True(await _users.CheckPasswordAsync(user, "NewPass123"));
        Assert.True((await _auth.ChangePasswordAsync(user.Id, Change("NewPass123", "Changed123"))).Success);
        Assert.True(await _users.CheckPasswordAsync(user, "Changed123"));
        Assert.False(await _users.CheckPasswordAsync(user, "NewPass123"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ExistingPassword_CannotBeBypassed_EvenWhenGoogleIsLinked(bool google)
    {
        var user = await CreateUser(google: google, password: "Existing123");
        Assert.False((await _auth.ChangePasswordAsync(user.Id, Change())).Success);
        Assert.True(await _users.CheckPasswordAsync(user, "Existing123"));
        Assert.False(await _users.CheckPasswordAsync(user, "NewPass123"));
    }

    [Theory]
    [InlineData(false, true, true)]
    [InlineData(true, false, true)]
    [InlineData(true, true, false)]
    public async Task FirstPassword_RejectsMissingGoogle_UnverifiedOrInactiveAccount(bool google, bool verified, bool active)
    {
        var user = await CreateUser(google, verified);
        user.IsActive = active;
        await _users.UpdateAsync(user);
        Assert.False((await _auth.ChangePasswordAsync(user.Id, Change())).Success);
        Assert.False(await _users.HasPasswordAsync(user));
    }

    [Fact]
    public async Task FirstPassword_RejectsWeakPasswordAndConfirmationMismatch()
    {
        var user = await CreateUser();
        Assert.False((await _auth.ChangePasswordAsync(user.Id, Change(password: "short"))).Success);
        var mismatch = Change();
        mismatch.ConfirmPassword = "Different123";
        Assert.False((await _auth.ChangePasswordAsync(user.Id, mismatch)).Success);
        Assert.False(await _users.HasPasswordAsync(user));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("Existing123")]
    public async Task ForgotAndResetPassword_WorksForGoogleAccounts_WithOrWithoutAnExistingPassword(string? password)
    {
        var user = await CreateUser(password: password);
        string? body = null;
        _email.Setup(service => service.SendAsync(user.Email!, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Callback<string, string, string, CancellationToken>((_, _, html, _) => body = html)
            .Returns(Task.CompletedTask);
        var response = await _auth.ForgotPasswordAsync(new ForgotPasswordDto { Email = user.Email! });
        Assert.True(response.Success);
        Assert.NotNull(body);
        var link = WebUtility.HtmlDecode(Regex.Match(body, "href=\"([^\"]+)\"").Groups[1].Value);
        var query = QueryHelpers.ParseQuery(new Uri(link).Query);
        var dto = new ResetPasswordDto
        {
            Email = query["email"].ToString(), Token = query["token"].ToString(),
            NewPassword = "ResetPass123", ConfirmPassword = "ResetPass123"
        };
        Assert.True((await _auth.ResetPasswordAsync(dto)).Success);
        Assert.True(await _users.CheckPasswordAsync(user, "ResetPass123"));
        Assert.True((await _auth.LoginAsync(new LoginDto { Email = user.Email!, Password = "ResetPass123" })).Success);
        Assert.False((await _auth.ResetPasswordAsync(dto)).Success); // Token is single-use after security stamp update.
        Assert.Equal(user.Id, (await _users.FindByLoginAsync("Google", user.Id))!.Id);
    }

    [Fact]
    public async Task ResetPassword_RejectsTamperedWrongAccountAndExpiredTokens()
    {
        var user = await CreateUser();
        var other = await CreateUser();
        var token = await _users.GeneratePasswordResetTokenAsync(user);
        var dto = new ResetPasswordDto { Email = user.Email!, Token = token + "tampered", NewPassword = "Reset123", ConfirmPassword = "Reset123" };
        Assert.False((await _auth.ResetPasswordAsync(dto)).Success);
        dto.Token = token;
        dto.Email = other.Email!;
        Assert.False((await _auth.ResetPasswordAsync(dto)).Success);
        dto.Email = user.Email!;
        _services.GetRequiredService<IOptions<DataProtectionTokenProviderOptions>>().Value.TokenLifespan = TimeSpan.FromHours(-1);
        Assert.False((await _auth.ResetPasswordAsync(dto)).Success);
        Assert.False(await _users.HasPasswordAsync(user));
        Assert.False(await _users.HasPasswordAsync(other));
    }

    [Fact]
    public async Task ForgotPassword_DoesNotExposeUnknownAccountsOrSmtpFailures()
    {
        var user = await CreateUser();
        _email.Setup(service => service.SendAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("SMTP unavailable"));
        var known = await _auth.ForgotPasswordAsync(new ForgotPasswordDto { Email = user.Email! });
        var unknown = await _auth.ForgotPasswordAsync(new ForgotPasswordDto { Email = "unknown@example.test" });
        Assert.True(known.Success);
        Assert.Equal(known.Message, unknown.Message);
        Assert.Equal(known.Data, unknown.Data);
    }

    [Fact]
    public void ChangePasswordDto_AllowsOmittedCurrentPassword_ButStillValidatesNewPassword()
    {
        var valid = Change();
        Assert.True(Validator.TryValidateObject(valid, new ValidationContext(valid), [], true));
        var invalid = Change(password: "short");
        Assert.False(Validator.TryValidateObject(invalid, new ValidationContext(invalid), [], true));
    }

    public void Dispose() => _services.Dispose();
}
