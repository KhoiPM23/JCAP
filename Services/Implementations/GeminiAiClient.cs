using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations;

/// <summary>
/// Theo dõi trạng thái tạm nghỉ (cooldown) theo từng model Gemini trong bộ nhớ.
/// Đăng ký Singleton qua DI để chia sẻ xuyên suốt các HTTP request, tránh lặp lại
/// việc gọi vào các model vừa gặp lỗi 503/429 hoặc quá thời gian phản hồi.
/// </summary>
public sealed class GeminiModelCooldownTracker
{
    private readonly ConcurrentDictionary<string, DateTimeOffset> _cooldownUntil = new(StringComparer.OrdinalIgnoreCase);

    public void MarkCooldown(string model, TimeSpan duration, DateTimeOffset? nowUtc = null)
    {
        if (string.IsNullOrWhiteSpace(model) || duration <= TimeSpan.Zero)
        {
            return;
        }

        var now = nowUtc ?? DateTimeOffset.UtcNow;
        _cooldownUntil[model.Trim()] = now.Add(duration);
    }

    public void MarkHealthy(string model)
    {
        if (string.IsNullOrWhiteSpace(model))
        {
            return;
        }

        _cooldownUntil.TryRemove(model.Trim(), out _);
    }

    public bool IsInCooldown(string model, DateTimeOffset? nowUtc = null)
    {
        if (string.IsNullOrWhiteSpace(model))
        {
            return false;
        }

        var key = model.Trim();
        if (!_cooldownUntil.TryGetValue(key, out var expiresAt))
        {
            return false;
        }

        var now = nowUtc ?? DateTimeOffset.UtcNow;
        if (expiresAt <= now)
        {
            _cooldownUntil.TryRemove(key, out _);
            return false;
        }

        return true;
    }

    public List<string> OrderByHealth(IReadOnlyList<string> models, DateTimeOffset? nowUtc = null)
    {
        var now = nowUtc ?? DateTimeOffset.UtcNow;
        var healthy = new List<string>(models.Count);
        var cooling = new List<(string Model, DateTimeOffset ExpiresAt)>();

        foreach (var model in models)
        {
            if (_cooldownUntil.TryGetValue(model, out var expiresAt) && expiresAt > now)
            {
                cooling.Add((model, expiresAt));
            }
            else
            {
                _cooldownUntil.TryRemove(model, out _);
                healthy.Add(model);
            }
        }

        if (cooling.Count == 0)
        {
            return healthy;
        }

        // Các model đang cooldown bị đẩy xuống cuối (sắp xếp theo thời điểm hết cooldown sớm nhất trước)
        cooling.Sort((a, b) => a.ExpiresAt.CompareTo(b.ExpiresAt));
        foreach (var item in cooling)
        {
            healthy.Add(item.Model);
        }

        return healthy;
    }

    public void Clear() => _cooldownUntil.Clear();
}

public class GeminiAiClient : IAiClient
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GeminiAiClient> _logger;
    private readonly GeminiModelCooldownTracker _cooldownTracker;

    private static readonly string[] DefaultFallbackModels =
    [
        "gemini-3.5-flash-lite",
        "gemini-3.8-flash",
        "gemini-3.6-flash",
        "gemini-4-hydrogen",
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite"
    ];

    private const int DefaultPerModelTimeoutSeconds = 10;
    private const int DefaultModelCooldownSeconds = 45;
    private const int DefaultTransientRetryCount = 1;
    private const int TransientRetryDelayMs = 500;
    private const int MaxElapsedSecondsForRetry = 12;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public GeminiAiClient(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<GeminiAiClient> logger,
        GeminiModelCooldownTracker? cooldownTracker = null)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
        _cooldownTracker = cooldownTracker ?? new GeminiModelCooldownTracker();
    }

    private string? ResolveConfig(params string[] keys)
    {
        foreach (var key in keys)
        {
            var val = _configuration[key];
            if (!string.IsNullOrWhiteSpace(val))
            {
                return val.Trim();
            }
        }
        return null;
    }

    private int ResolveIntConfig(int defaultValue, int minValue, int maxValue, params string[] keys)
    {
        var raw = ResolveConfig(keys);
        if (int.TryParse(raw, out var parsed))
        {
            return Math.Clamp(parsed, minValue, maxValue);
        }
        return defaultValue;
    }

    public List<string> BuildCandidateModels(string? preferredModel = null)
    {
        var models = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void AddModel(string? modelName)
        {
            if (!string.IsNullOrWhiteSpace(modelName))
            {
                var trimmed = modelName.Trim();
                if (seen.Add(trimmed))
                {
                    models.Add(trimmed);
                }
            }
        }

        AddModel(ResolveConfig("AI:Model", "Gemini:Model"));

        var hasConfiguredFallbacks = false;
        foreach (var sectionKey in new[] { "AI:FallbackModels", "Gemini:FallbackModels" })
        {
            var configuredFallbacks = _configuration.GetSection(sectionKey).Get<string[]>();
            if (configuredFallbacks != null && configuredFallbacks.Length > 0)
            {
                hasConfiguredFallbacks = true;
                foreach (var fb in configuredFallbacks)
                {
                    AddModel(fb);
                }
            }
        }

        if (!hasConfiguredFallbacks)
        {
            foreach (var defaultModel in DefaultFallbackModels)
            {
                AddModel(defaultModel);
            }
        }

        if (!string.IsNullOrWhiteSpace(preferredModel))
        {
            var target = preferredModel.Trim();
            var idx = models.FindIndex(m => string.Equals(m, target, StringComparison.OrdinalIgnoreCase));
            if (idx > 0)
            {
                // Phương án B: Ưu tiên bắt đầu từ model đang ghim đến hết danh sách,
                // chỉ vòng lại các model phía trước nếu toàn bộ phần đuôi thất bại.
                var rotated = new List<string>(models.Count);
                for (int j = idx; j < models.Count; j++) rotated.Add(models[j]);
                for (int j = 0; j < idx; j++) rotated.Add(models[j]);
                return rotated;
            }
            if (idx < 0)
            {
                models.Insert(0, target);
            }
        }

        return models;
    }

    private static bool ShouldFallbackToNextModel(HttpStatusCode statusCode)
    {
        var code = (int)statusCode;
        return statusCode == HttpStatusCode.ServiceUnavailable // 503
            || statusCode == HttpStatusCode.NotFound           // 404
            || statusCode == HttpStatusCode.RequestTimeout     // 408
            || code == 429                                     // TooManyRequests
            || code >= 500;                                    // 5xx Server Errors
    }

    private static bool IsTransientStatus(HttpStatusCode statusCode)
    {
        var code = (int)statusCode;
        return statusCode == HttpStatusCode.ServiceUnavailable // 503
            || statusCode == HttpStatusCode.RequestTimeout     // 408
            || code == 429                                     // TooManyRequests
            || code >= 500;                                    // 5xx Server Errors
    }

    /// <summary>
    /// Xác định mức thinkingLevel tối ưu độ trễ cho từng dòng Gemini 3 / Gemini 4
    /// theo tài liệu chính thức của Google (generateContent REST API).
    /// </summary>
    internal string? ResolveThinkingLevel(string model)
    {
        if (string.IsNullOrWhiteSpace(model))
        {
            return null;
        }

        var normalized = model.Trim().ToLowerInvariant();
        var isGemini4 = normalized.StartsWith("gemini-4", StringComparison.Ordinal);
        var isGemini3 = normalized.StartsWith("gemini-3", StringComparison.Ordinal);
        var isLatestAlias = normalized is "gemini-flash-latest" or "gemini-flash-lite-latest" or "gemini-pro-latest";

        if (!isGemini4 && !isGemini3 && !isLatestAlias)
        {
            return null;
        }

        // Các model hỗ trợ mức MINIMAL theo tài liệu chính thức Google Gemini API
        var supportsMinimal =
            normalized.StartsWith("gemini-3.5-flash-lite", StringComparison.Ordinal) ||
            normalized.StartsWith("gemini-3.6-flash", StringComparison.Ordinal) ||
            normalized.StartsWith("gemini-3.1-flash-lite", StringComparison.Ordinal) ||
            normalized.StartsWith("gemini-3-flash-preview", StringComparison.Ordinal) ||
            normalized == "gemini-flash-lite-latest";

        var configuredLevel = ResolveConfig("AI:ThinkingLevel", "Gemini:ThinkingLevel");
        if (!string.IsNullOrWhiteSpace(configuredLevel))
        {
            var upper = configuredLevel.Trim().ToUpperInvariant();
            if (upper is "NONE" or "OFF" or "DEFAULT")
            {
                return null;
            }
            if (upper == "MINIMAL" && !supportsMinimal)
            {
                return "LOW";
            }
            if (upper is "MINIMAL" or "LOW" or "MEDIUM" or "HIGH" or "XHIGH")
            {
                return upper;
            }
        }

        return supportsMinimal ? "MINIMAL" : "LOW";
    }

    private string BuildRequestBodyJson(
        List<object> contents,
        object? systemInstructionObj,
        AiRequest request,
        string model)
    {
        var generationConfig = new Dictionary<string, object>
        {
            ["temperature"] = request.Temperature
        };

        if (request.ResponseFormat == AiResponseFormat.Json)
        {
            generationConfig["responseMimeType"] = "application/json";
        }

        var thinkingLevel = ResolveThinkingLevel(model);
        if (!string.IsNullOrEmpty(thinkingLevel))
        {
            generationConfig["thinkingConfig"] = new Dictionary<string, object>
            {
                ["thinkingLevel"] = thinkingLevel
            };
        }

        var requestBody = new Dictionary<string, object>
        {
            ["contents"] = contents,
            ["generationConfig"] = generationConfig
        };

        if (systemInstructionObj != null)
        {
            requestBody["systemInstruction"] = systemInstructionObj;
        }

        return JsonSerializer.Serialize(requestBody, JsonOptions);
    }

    /// <summary>
    /// Trích xuất văn bản phản hồi thực sự từ mảng parts, bỏ qua các part nội bộ có cờ "thought": true.
    /// </summary>
    private static string ExtractCandidateText(JsonElement parts)
    {
        var sb = new StringBuilder();
        foreach (var part in parts.EnumerateArray())
        {
            if (part.TryGetProperty("thought", out var thoughtProp) &&
                thoughtProp.ValueKind == JsonValueKind.True)
            {
                continue;
            }

            if (part.TryGetProperty("text", out var textProp) &&
                textProp.ValueKind == JsonValueKind.String)
            {
                sb.Append(textProp.GetString());
            }
        }

        return sb.ToString();
    }

    private static string StripMarkdownJsonFence(string text)
    {
        var trimmed = text.Trim();
        if (!trimmed.StartsWith("```", StringComparison.Ordinal))
        {
            return trimmed;
        }

        var firstNewLine = trimmed.IndexOf('\n');
        if (firstNewLine < 0)
        {
            return trimmed;
        }

        var inner = trimmed[(firstNewLine + 1)..];
        var lastFence = inner.LastIndexOf("```", StringComparison.Ordinal);
        if (lastFence >= 0)
        {
            inner = inner[..lastFence];
        }

        return inner.Trim();
    }

    private static bool TryNormalizeJsonOutput(string rawText, out string normalizedJson)
    {
        normalizedJson = StripMarkdownJsonFence(rawText);
        if (string.IsNullOrWhiteSpace(normalizedJson))
        {
            return false;
        }

        try
        {
            using var _ = JsonDocument.Parse(normalizedJson);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public async Task<AiResponse> GenerateAsync(AiRequest request, CancellationToken cancellationToken = default)
    {
        var apiKey = ResolveConfig("AI:ApiKey", "Gemini:ApiKey");
        var baseCandidates = BuildCandidateModels(request.PreferredModel);

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning("Gemini API Key chưa được cấu hình trong AI:ApiKey hoặc Gemini:ApiKey.");
            return AiResponse.Fail("Gemini API Key chưa được cấu hình.");
        }

        var perModelTimeout = TimeSpan.FromSeconds(
            ResolveIntConfig(DefaultPerModelTimeoutSeconds, 1, 90, "AI:PerModelTimeoutSeconds", "Gemini:PerModelTimeoutSeconds"));
        var cooldownDuration = TimeSpan.FromSeconds(
            ResolveIntConfig(DefaultModelCooldownSeconds, 0, 600, "AI:ModelCooldownSeconds", "Gemini:ModelCooldownSeconds"));
        var transientRetryCount =
            ResolveIntConfig(DefaultTransientRetryCount, 0, 2, "AI:TransientRetryCount", "Gemini:TransientRetryCount");

        // Đẩy các model vừa bị 503/429/timeout xuống cuối để ưu tiên gọi thẳng model đang khỏe
        var candidateModels = cooldownDuration > TimeSpan.Zero
            ? _cooldownTracker.OrderByHealth(baseCandidates)
            : baseCandidates;

        // Map messages sang format contents của Gemini
        var contents = new List<object>();
        foreach (var msg in request.Messages)
        {
            var geminiRole = string.Equals(msg.Role, "assistant", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(msg.Role, "model", StringComparison.OrdinalIgnoreCase)
                ? "model"
                : "user";

            contents.Add(new
            {
                role = geminiRole,
                parts = new[] { new { text = msg.Content } }
            });
        }

        // Nếu request không có messages nhưng có system instruction hoặc rỗng
        if (contents.Count == 0)
        {
            contents.Add(new
            {
                role = "user",
                parts = new[] { new { text = string.Empty } }
            });
        }

        object? systemInstructionObj = null;
        if (!string.IsNullOrWhiteSpace(request.SystemInstruction))
        {
            systemInstructionObj = new
            {
                parts = new[] { new { text = request.SystemInstruction } }
            };
        }

        var httpClient = _httpClientFactory.CreateClient("GeminiAiClient");
        var totalWatch = Stopwatch.StartNew();
        int? lastStatusCode = null;
        string lastError = "Không nhận được phản hồi thành công từ Gemini API.";

        for (int pass = 0; pass <= transientRetryCount; pass++)
        {
            IReadOnlyList<string> modelsThisPass;
            if (pass == 0)
            {
                modelsThisPass = candidateModels;
            }
            else
            {
                // Chỉ retry nhanh khi toàn bộ pass trước fail sớm do lỗi tạm thời (503/429/timeout)
                if (totalWatch.Elapsed.TotalSeconds >= MaxElapsedSecondsForRetry)
                {
                    break;
                }

                _logger.LogWarning(
                    "Toàn bộ chuỗi Gemini gặp lỗi tạm thời, thử lại nhanh lần {Pass}/{MaxRetry} sau {DelayMs}ms...",
                    pass,
                    transientRetryCount,
                    TransientRetryDelayMs);

                await Task.Delay(TransientRetryDelayMs, cancellationToken);
                modelsThisPass = candidateModels.Take(Math.Min(2, candidateModels.Count)).ToList();
            }

            var sawOnlyTransientFailures = true;

            for (int i = 0; i < modelsThisPass.Count; i++)
            {
                var model = modelsThisPass[i];
                var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";
                var json = BuildRequestBodyJson(contents, systemInstructionObj, request, model);

                using var attemptCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                attemptCts.CancelAfter(perModelTimeout);

                try
                {
                    using var content = new StringContent(json, Encoding.UTF8, "application/json");
                    using var response = await httpClient.PostAsync(endpoint, content, attemptCts.Token);
                    var responseString = await response.Content.ReadAsStringAsync(attemptCts.Token);

                    if (response.IsSuccessStatusCode)
                    {
                        try
                        {
                            using var doc = JsonDocument.Parse(responseString);
                            var root = doc.RootElement;
                            if (root.TryGetProperty("candidates", out var candidates) && candidates.GetArrayLength() > 0)
                            {
                                var candidate = candidates[0];
                                if (candidate.TryGetProperty("content", out var contentElem) &&
                                    contentElem.TryGetProperty("parts", out var parts) &&
                                    parts.GetArrayLength() > 0)
                                {
                                    var text = ExtractCandidateText(parts);
                                    if (string.IsNullOrWhiteSpace(text))
                                    {
                                        lastError = $"Gemini model '{model}' chỉ trả về nội dung rỗng hoặc thought-only.";
                                        _logger.LogWarning("{Error} Chuyển sang model tiếp theo (nếu có)...", lastError);
                                        if (cooldownDuration > TimeSpan.Zero) _cooldownTracker.MarkCooldown(model, cooldownDuration);
                                        continue;
                                    }

                                    if (request.ResponseFormat == AiResponseFormat.Json)
                                    {
                                        if (!TryNormalizeJsonOutput(text, out var normalizedJson))
                                        {
                                            lastError = $"Gemini model '{model}' trả về JSON không hợp lệ.";
                                            _logger.LogWarning("{Error} Chuyển sang model tiếp theo (nếu có)...", lastError);
                                            if (cooldownDuration > TimeSpan.Zero) _cooldownTracker.MarkCooldown(model, cooldownDuration);
                                            continue;
                                        }

                                        text = normalizedJson;
                                    }

                                    _cooldownTracker.MarkHealthy(model);
                                    return AiResponse.Ok(text, model);
                                }
                            }

                            lastError = $"Gemini model '{model}' trả về phản hồi không chứa candidate hợp lệ.";
                            _logger.LogWarning("{Error} Chuyển sang model tiếp theo (nếu có)...", lastError);
                            if (cooldownDuration > TimeSpan.Zero) _cooldownTracker.MarkCooldown(model, cooldownDuration);
                            continue;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Lỗi parse JSON kết quả từ Gemini model '{Model}'. Response: {Response}", model, responseString);
                            lastError = $"Lỗi parse kết quả Gemini API ({model}): {ex.Message}";
                            if (cooldownDuration > TimeSpan.Zero) _cooldownTracker.MarkCooldown(model, cooldownDuration);
                            continue;
                        }
                    }

                    lastStatusCode = (int)response.StatusCode;
                    lastError = $"Gemini API error ({model} - {response.StatusCode}): {responseString}";

                    if (IsTransientStatus(response.StatusCode))
                    {
                        if (cooldownDuration > TimeSpan.Zero)
                        {
                            _cooldownTracker.MarkCooldown(model, cooldownDuration);
                        }
                    }
                    else
                    {
                        sawOnlyTransientFailures = false;
                    }

                    var shouldFallback = request.FallbackOnAnyError || ShouldFallbackToNextModel(response.StatusCode);
                    if (shouldFallback && i < modelsThisPass.Count - 1)
                    {
                        var nextModel = modelsThisPass[i + 1];
                        _logger.LogWarning(
                            "Gemini model '{Model}' gặp lỗi {StatusCode}, tự động fallback sang model '{NextModel}'...",
                            model,
                            (int)response.StatusCode,
                            nextModel);
                        continue;
                    }

                    if (!shouldFallback)
                    {
                        _logger.LogWarning("Gemini model '{Model}' trả về lỗi status {StatusCode}: {Response}", model, response.StatusCode, responseString);
                        return AiResponse.Fail(lastError, lastStatusCode);
                    }

                    _logger.LogWarning("Gemini model cuối '{Model}' trong lượt gọi trả về lỗi status {StatusCode}.", model, (int)response.StatusCode);
                }
                catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
                {
                    lastStatusCode = (int)HttpStatusCode.RequestTimeout;
                    lastError = $"Gemini model '{model}' quá thời gian phản hồi ({perModelTimeout.TotalSeconds:0.#}s).";
                    if (cooldownDuration > TimeSpan.Zero)
                    {
                        _cooldownTracker.MarkCooldown(model, cooldownDuration);
                    }

                    if (i < modelsThisPass.Count - 1)
                    {
                        var nextModel = modelsThisPass[i + 1];
                        _logger.LogWarning(
                            "Gemini model '{Model}' quá thời gian ({TimeoutSec}s), tự động fallback sang model '{NextModel}'...",
                            model,
                            perModelTimeout.TotalSeconds,
                            nextModel);
                        continue;
                    }

                    _logger.LogWarning("Gemini model cuối '{Model}' quá thời gian ({TimeoutSec}s).", model, perModelTimeout.TotalSeconds);
                }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                {
                    lastError = $"Lỗi kết nối Gemini API ({model}): {ex.Message}";
                    if (cooldownDuration > TimeSpan.Zero)
                    {
                        _cooldownTracker.MarkCooldown(model, cooldownDuration);
                    }

                    if (i < modelsThisPass.Count - 1)
                    {
                        var nextModel = modelsThisPass[i + 1];
                        _logger.LogWarning(ex, "Lỗi kết nối tới Gemini model '{Model}', tự động fallback sang model '{NextModel}'...", model, nextModel);
                        continue;
                    }

                    _logger.LogError(ex, "Lỗi ngoại lệ khi gọi model cuối cùng '{Model}' trong chuỗi Gemini API.", model);
                }
            }

            if (!sawOnlyTransientFailures)
            {
                break;
            }
        }

        return AiResponse.Fail(lastError, lastStatusCode);
    }
}
