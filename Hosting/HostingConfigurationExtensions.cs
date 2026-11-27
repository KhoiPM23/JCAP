using System.Net;
using System.Net.Sockets;
using Microsoft.AspNetCore.HttpOverrides;

namespace JCAP.Hosting;

public static class HostingConfigurationExtensions
{
    public const string DefaultCorsPolicyName = "AllowAll";

    public static IServiceCollection AddJcapForwardedHeaders(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = configuration.GetValue<int?>("Hosting:ForwardLimit");

            var configuredProxies = GetConfiguredValues(configuration, "Hosting:KnownProxies");
            var configuredNetworks = GetConfiguredValues(configuration, "Hosting:KnownNetworks");
            var hasExplicitProxiesOrNetworks = configuredProxies.Length > 0 || configuredNetworks.Length > 0;
            var trustAllProxies = configuration.GetValue<bool>("Hosting:TrustAllProxies", true);

            if (hasExplicitProxiesOrNetworks)
            {
                options.KnownProxies.Clear();
                options.KnownNetworks.Clear();

                foreach (var proxy in configuredProxies)
                {
                    if (IPAddress.TryParse(proxy, out var ip))
                    {
                        options.KnownProxies.Add(ip);
                    }
                }

                foreach (var network in configuredNetworks)
                {
                    if (TryParseIpNetwork(network, out var ipNetwork))
                    {
                        options.KnownNetworks.Add(ipNetwork);
                    }
                }
            }
            else if (trustAllProxies)
            {
                options.KnownNetworks.Clear();
                options.KnownProxies.Clear();
            }
        });

        return services;
    }

    public static IServiceCollection AddJcapCors(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var allowedOrigins = GetCorsAllowedOrigins(configuration);

        services.AddCors(options =>
        {
            options.AddPolicy(DefaultCorsPolicyName, policy =>
            {
                if (allowedOrigins.Length > 0)
                {
                    policy.WithOrigins(allowedOrigins)
                          .AllowAnyMethod()
                          .AllowAnyHeader();
                }
                else
                {
                    policy.AllowAnyOrigin()
                          .AllowAnyMethod()
                          .AllowAnyHeader();
                }
            });
        });

        return services;
    }

    public static IApplicationBuilder UseJcapHttpsRedirection(
        this IApplicationBuilder app,
        IConfiguration configuration)
    {
        if (configuration.GetValue<bool>("Hosting:ForceHttpsRedirection", false))
        {
            app.UseHttpsRedirection();
        }

        return app;
    }

    public static string[] GetCorsAllowedOrigins(IConfiguration configuration)
    {
        var rawValues = GetConfiguredValues(configuration, "Cors:AllowedOrigins");
        var normalized = rawValues
            .Select(origin => origin.Trim().TrimEnd('/'))
            .Where(origin => !string.IsNullOrWhiteSpace(origin))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (normalized.Contains("*", StringComparer.Ordinal))
        {
            return Array.Empty<string>();
        }

        return normalized;
    }

    private static string[] GetConfiguredValues(IConfiguration configuration, string key)
    {
        var arrayValues = configuration.GetSection(key).Get<string[]>();
        if (arrayValues is { Length: > 0 })
        {
            return arrayValues
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Select(v => v.Trim())
                .ToArray();
        }

        var scalar = configuration[key];
        if (string.IsNullOrWhiteSpace(scalar))
        {
            return Array.Empty<string>();
        }

        return scalar
            .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(v => v.Trim())
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .ToArray();
    }

    private static bool TryParseIpNetwork(string cidr, out Microsoft.AspNetCore.HttpOverrides.IPNetwork network)
    {
        network = default!;
        if (string.IsNullOrWhiteSpace(cidr))
        {
            return false;
        }

        var parts = cidr.Split('/', StringSplitOptions.TrimEntries);
        if (parts.Length != 2)
        {
            return false;
        }

        if (!IPAddress.TryParse(parts[0], out var address) || !int.TryParse(parts[1], out var prefixLength))
        {
            return false;
        }

        var maxPrefix = address.AddressFamily == AddressFamily.InterNetwork ? 32 : 128;
        if (prefixLength < 0 || prefixLength > maxPrefix)
        {
            return false;
        }

        network = new Microsoft.AspNetCore.HttpOverrides.IPNetwork(address, prefixLength);
        return true;
    }
}
