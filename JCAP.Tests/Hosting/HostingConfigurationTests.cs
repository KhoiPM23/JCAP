using System.Net;
using JCAP.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace JCAP.Tests.Hosting;

public class HostingConfigurationTests
{
    private static IConfiguration BuildConfig(Dictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    [Fact]
    public async Task ForwardedHeaders_DefaultTrustAllProxies_UpdatesSchemeAndRemoteIp()
    {
        var services = new ServiceCollection();
        services.AddJcapForwardedHeaders(BuildConfig(new Dictionary<string, string?>()));
        using var provider = services.BuildServiceProvider();

        var options = provider.GetRequiredService<IOptions<ForwardedHeadersOptions>>();
        var middleware = new ForwardedHeadersMiddleware(
            _ => Task.CompletedTask,
            NullLoggerFactory.Instance,
            options);

        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = IPAddress.Parse("172.18.0.5");
        context.Request.Scheme = "http";
        context.Request.Headers["X-Forwarded-For"] = "203.0.113.42";
        context.Request.Headers["X-Forwarded-Proto"] = "https";

        await middleware.Invoke(context);

        Assert.Equal("https", context.Request.Scheme);
        Assert.Equal(IPAddress.Parse("203.0.113.42"), context.Connection.RemoteIpAddress);
    }

    [Fact]
    public async Task ForwardedHeaders_WithExplicitKnownProxies_OnlyTrustsConfiguredProxy()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Hosting:TrustAllProxies"] = "false",
            ["Hosting:KnownProxies:0"] = "10.0.0.10"
        });

        var services = new ServiceCollection();
        services.AddJcapForwardedHeaders(config);
        using var provider = services.BuildServiceProvider();

        var options = provider.GetRequiredService<IOptions<ForwardedHeadersOptions>>();
        var middleware = new ForwardedHeadersMiddleware(
            _ => Task.CompletedTask,
            NullLoggerFactory.Instance,
            options);

        var untrustedContext = new DefaultHttpContext();
        untrustedContext.Connection.RemoteIpAddress = IPAddress.Parse("10.0.0.99");
        untrustedContext.Request.Scheme = "http";
        untrustedContext.Request.Headers["X-Forwarded-For"] = "198.51.100.7";
        untrustedContext.Request.Headers["X-Forwarded-Proto"] = "https";

        await middleware.Invoke(untrustedContext);

        Assert.Equal("http", untrustedContext.Request.Scheme);
        Assert.Equal(IPAddress.Parse("10.0.0.99"), untrustedContext.Connection.RemoteIpAddress);

        var trustedContext = new DefaultHttpContext();
        trustedContext.Connection.RemoteIpAddress = IPAddress.Parse("10.0.0.10");
        trustedContext.Request.Scheme = "http";
        trustedContext.Request.Headers["X-Forwarded-For"] = "198.51.100.7";
        trustedContext.Request.Headers["X-Forwarded-Proto"] = "https";

        await middleware.Invoke(trustedContext);

        Assert.Equal("https", trustedContext.Request.Scheme);
        Assert.Equal(IPAddress.Parse("198.51.100.7"), trustedContext.Connection.RemoteIpAddress);
    }

    [Fact]
    public async Task ForwardedHeaders_WithExplicitKnownNetworks_TrustsProxyInsideCidr()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Hosting:TrustAllProxies"] = "false",
            ["Hosting:KnownNetworks:0"] = "172.20.0.0/16"
        });

        var services = new ServiceCollection();
        services.AddJcapForwardedHeaders(config);
        using var provider = services.BuildServiceProvider();

        var options = provider.GetRequiredService<IOptions<ForwardedHeadersOptions>>();
        var middleware = new ForwardedHeadersMiddleware(
            _ => Task.CompletedTask,
            NullLoggerFactory.Instance,
            options);

        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = IPAddress.Parse("172.20.5.12");
        context.Request.Scheme = "http";
        context.Request.Headers["X-Forwarded-For"] = "198.51.100.8";
        context.Request.Headers["X-Forwarded-Proto"] = "https";

        await middleware.Invoke(context);

        Assert.Equal("https", context.Request.Scheme);
        Assert.Equal(IPAddress.Parse("198.51.100.8"), context.Connection.RemoteIpAddress);
    }

    [Fact]
    public async Task UseJcapHttpsRedirection_WhenFalse_DoesNotRedirectHttpRequests()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Hosting:ForceHttpsRedirection"] = "false"
        });

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddHttpsRedirection(options => options.HttpsPort = 443);
        using var provider = services.BuildServiceProvider();

        var app = new ApplicationBuilder(provider);
        app.UseJcapHttpsRedirection(config);
        app.Run(ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status200OK;
            return Task.CompletedTask;
        });

        var context = new DefaultHttpContext();
        context.Request.Scheme = "http";
        context.Request.Host = new HostString("app.example.com");
        context.Request.Path = "/api/stt/health";

        await app.Build().Invoke(context);

        Assert.Equal(StatusCodes.Status200OK, context.Response.StatusCode);
        Assert.False(context.Response.Headers.ContainsKey("Location"));
    }

    [Fact]
    public async Task UseJcapHttpsRedirection_WhenTrue_RedirectsHttpToHttps()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Hosting:ForceHttpsRedirection"] = "true"
        });

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddHttpsRedirection(options => options.HttpsPort = 443);
        using var provider = services.BuildServiceProvider();

        var app = new ApplicationBuilder(provider);
        app.UseJcapHttpsRedirection(config);
        app.Run(ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status200OK;
            return Task.CompletedTask;
        });

        var context = new DefaultHttpContext();
        context.Request.Scheme = "http";
        context.Request.Host = new HostString("app.example.com");
        context.Request.Path = "/api/stt/health";

        await app.Build().Invoke(context);

        Assert.Equal(StatusCodes.Status307TemporaryRedirect, context.Response.StatusCode);
        Assert.Equal("https://app.example.com/api/stt/health", context.Response.Headers.Location.ToString());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("*")]
    public async Task AddJcapCors_WhenUnsetEmptyOrWildcard_AllowsAnyOrigin(string? allowedOrigins)
    {
        var settings = new Dictionary<string, string?>();
        if (allowedOrigins != null)
        {
            settings["Cors:AllowedOrigins"] = allowedOrigins;
        }

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddJcapCors(BuildConfig(settings));
        using var provider = services.BuildServiceProvider();

        var corsProvider = provider.GetRequiredService<ICorsPolicyProvider>();
        var corsService = provider.GetRequiredService<ICorsService>();
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers.Origin = "https://any.example.com";

        var policy = await corsProvider.GetPolicyAsync(httpContext, HostingConfigurationExtensions.DefaultCorsPolicyName);

        Assert.NotNull(policy);
        Assert.Equal("*", Assert.Single(policy!.Origins));

        var result = corsService.EvaluatePolicy(httpContext, policy);
        Assert.True(result.IsOriginAllowed);
        Assert.Equal("*", result.AllowedOrigin);

        var secondContext = new DefaultHttpContext();
        secondContext.Request.Headers.Origin = "http://another.example.org:3000";
        var secondResult = corsService.EvaluatePolicy(secondContext, policy);
        Assert.True(secondResult.IsOriginAllowed);
        Assert.Equal("*", secondResult.AllowedOrigin);
    }

    [Fact]
    public async Task AddJcapCors_WithArrayOrigins_NormalizesAndRestrictsOrigins()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Cors:AllowedOrigins:0"] = "https://app.example.com/",
            ["Cors:AllowedOrigins:1"] = "http://localhost:5173"
        });

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddJcapCors(config);
        using var provider = services.BuildServiceProvider();

        var corsProvider = provider.GetRequiredService<ICorsPolicyProvider>();
        var policy = await corsProvider.GetPolicyAsync(new DefaultHttpContext(), HostingConfigurationExtensions.DefaultCorsPolicyName);

        Assert.NotNull(policy);
        Assert.Contains("https://app.example.com", policy!.Origins);
        Assert.Contains("http://localhost:5173", policy.Origins);
        Assert.True(policy.IsOriginAllowed("https://app.example.com"));
        Assert.True(policy.IsOriginAllowed("http://localhost:5173"));
        Assert.False(policy.IsOriginAllowed("https://evil.example.com"));
    }

    [Fact]
    public async Task AddJcapCors_WithDelimitedString_NormalizesAndRestrictsOrigins()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Cors:AllowedOrigins"] = " https://alpha.example.com/ , https://beta.example.com ; "
        });

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddJcapCors(config);
        using var provider = services.BuildServiceProvider();

        var corsProvider = provider.GetRequiredService<ICorsPolicyProvider>();
        var policy = await corsProvider.GetPolicyAsync(new DefaultHttpContext(), HostingConfigurationExtensions.DefaultCorsPolicyName);

        Assert.NotNull(policy);
        Assert.Contains("https://alpha.example.com", policy!.Origins);
        Assert.Contains("https://beta.example.com", policy.Origins);
        Assert.True(policy.IsOriginAllowed("https://alpha.example.com"));
        Assert.True(policy.IsOriginAllowed("https://beta.example.com"));
        Assert.False(policy.IsOriginAllowed("https://evil.example.com"));
    }
}
