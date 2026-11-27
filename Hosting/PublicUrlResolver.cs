using System.Net;

namespace JCAP.Hosting;

/// <summary>
/// Giải quyết URL công khai cho Backend, Frontend và Google OAuth callback.
/// Ưu tiên cấu hình tường minh nếu đã đặt khác localhost; nếu cấu hình vẫn là localhost/rỗng
/// thì tự suy ra từ request hiện tại (đã qua ForwardedHeaders / Origin) khi chạy dưới tên miền public.
/// </summary>
public static class PublicUrlResolver
{
    public const string DefaultLocalBackendUrl = "http://localhost:5254";
    public const string DefaultLocalFrontendUrl = "http://localhost:5173";
    public const string GoogleCallbackPath = "/api/auth/google/callback";

    public static string ResolveBackendUrl(IConfiguration configuration, HttpContext? httpContext)
    {
        var configured = NormalizeBaseUrl(configuration["BackendUrl"]);
        if (!string.IsNullOrEmpty(configured) && !IsLocalUrl(configured))
        {
            return configured;
        }

        var requestOrigin = GetRequestOrigin(httpContext);
        if (!string.IsNullOrEmpty(requestOrigin) && !IsLocalUrl(requestOrigin))
        {
            return requestOrigin;
        }

        var headerOrigin = GetHeaderOrigin(httpContext);
        if (!string.IsNullOrEmpty(headerOrigin) && !IsLocalUrl(headerOrigin))
        {
            return headerOrigin;
        }

        return configured ?? DefaultLocalBackendUrl;
    }

    public static string ResolveFrontendUrl(IConfiguration configuration, HttpContext? httpContext)
    {
        var configured = NormalizeBaseUrl(configuration["FrontendUrl"]);
        if (!string.IsNullOrEmpty(configured) && !IsLocalUrl(configured))
        {
            return configured;
        }

        var headerOrigin = GetHeaderOrigin(httpContext);
        if (!string.IsNullOrEmpty(headerOrigin) && !IsLocalUrl(headerOrigin))
        {
            return headerOrigin;
        }

        var requestOrigin = GetRequestOrigin(httpContext);
        if (!string.IsNullOrEmpty(requestOrigin) && !IsLocalUrl(requestOrigin))
        {
            return requestOrigin;
        }

        return configured ?? DefaultLocalFrontendUrl;
    }

    public static string ResolveGoogleRedirectUri(IConfiguration configuration, HttpContext? httpContext)
    {
        var configured = configuration["Authentication:Google:RedirectUri"]?.Trim();
        if (!string.IsNullOrEmpty(configured) && !IsLocalUrl(configured))
        {
            return configured;
        }

        var requestOrigin = GetRequestOrigin(httpContext);
        if (!string.IsNullOrEmpty(requestOrigin) && !IsLocalUrl(requestOrigin))
        {
            return $"{requestOrigin}{GoogleCallbackPath}";
        }

        var headerOrigin = GetHeaderOrigin(httpContext);
        if (!string.IsNullOrEmpty(headerOrigin) && !IsLocalUrl(headerOrigin))
        {
            return $"{headerOrigin}{GoogleCallbackPath}";
        }

        return string.IsNullOrEmpty(configured)
            ? $"{DefaultLocalBackendUrl}{GoogleCallbackPath}"
            : configured;
    }

    public static bool IsLocalUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return false;
        }

        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
        {
            return false;
        }

        return IsLoopbackHost(uri.Host);
    }

    private static string? GetRequestOrigin(HttpContext? httpContext)
    {
        if (httpContext == null)
        {
            return null;
        }

        var request = httpContext.Request;
        if (!request.Host.HasValue)
        {
            return null;
        }

        var scheme = string.Equals(request.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            ? Uri.UriSchemeHttps
            : Uri.UriSchemeHttp;

        var pathBase = request.PathBase.HasValue ? request.PathBase.Value!.TrimEnd('/') : string.Empty;
        return NormalizeBaseUrl($"{scheme}://{request.Host.Value}{pathBase}");
    }

    private static string? GetHeaderOrigin(HttpContext? httpContext)
    {
        if (httpContext == null)
        {
            return null;
        }

        var originHeader = httpContext.Request.Headers.Origin.FirstOrDefault();
        return ExtractOrigin(originHeader);
    }

    private static string? ExtractOrigin(string? rawUrl)
    {
        if (string.IsNullOrWhiteSpace(rawUrl))
        {
            return null;
        }

        if (!Uri.TryCreate(rawUrl.Trim(), UriKind.Absolute, out var uri))
        {
            return null;
        }

        if (!string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
    }

    private static string? NormalizeBaseUrl(string? rawUrl)
    {
        if (string.IsNullOrWhiteSpace(rawUrl))
        {
            return null;
        }

        return rawUrl.Trim().TrimEnd('/');
    }

    private static bool IsLoopbackHost(string? host)
    {
        if (string.IsNullOrWhiteSpace(host))
        {
            return false;
        }

        var trimmed = host.Trim().Trim('[', ']');
        if (string.Equals(trimmed, "localhost", StringComparison.OrdinalIgnoreCase)
            || string.Equals(trimmed, "0.0.0.0", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return IPAddress.TryParse(trimmed, out var ip) && IPAddress.IsLoopback(ip);
    }
}
