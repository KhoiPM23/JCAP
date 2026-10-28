using System.Net;
using System.Text;
using System.Text.Json;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations;

public class GeminiAiClient : IAiClient
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GeminiAiClient> _logger;

    private static readonly string[] DefaultFallbackModels =
    [
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3-flash-preview"
    ];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public GeminiAiClient(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<GeminiAiClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
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

    private List<string> BuildCandidateModels()
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

        foreach (var sectionKey in new[] { "AI:FallbackModels", "Gemini:FallbackModels" })
        {
            var configuredFallbacks = _configuration.GetSection(sectionKey).Get<string[]>();
            if (configuredFallbacks != null)
            {
                foreach (var fb in configuredFallbacks)
                {
                    AddModel(fb);
                }
            }
        }

        foreach (var defaultModel in DefaultFallbackModels)
        {
            AddModel(defaultModel);
        }

        return models;
    }

    private static bool ShouldFallbackToNextModel(HttpStatusCode statusCode)
    {
        var code = (int)statusCode;
        return statusCode == HttpStatusCode.ServiceUnavailable // 503
            || statusCode == HttpStatusCode.NotFound           // 404
            || code == 429                                     // TooManyRequests
            || code >= 500;                                    // 5xx Server Errors
    }

    public async Task<AiResponse> GenerateAsync(AiRequest request, CancellationToken cancellationToken = default)
    {
        var apiKey = ResolveConfig("AI:ApiKey", "Gemini:ApiKey");
        var candidateModels = BuildCandidateModels();

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning("Gemini API Key chưa được cấu hình trong AI:ApiKey hoặc Gemini:ApiKey.");
            return AiResponse.Fail("Gemini API Key chưa được cấu hình.");
        }

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

        var generationConfig = new Dictionary<string, object>
        {
            ["temperature"] = request.Temperature
        };

        if (request.ResponseFormat == AiResponseFormat.Json)
        {
            generationConfig["responseMimeType"] = "application/json";
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

        var json = JsonSerializer.Serialize(requestBody, JsonOptions);

        var httpClient = _httpClientFactory.CreateClient("GeminiAiClient");
        int? lastStatusCode = null;
        string lastError = "Không nhận được phản hồi thành công từ Gemini API.";

        for (int i = 0; i < candidateModels.Count; i++)
        {
            var model = candidateModels[i];
            var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

            try
            {
                using var content = new StringContent(json, Encoding.UTF8, "application/json");
                using var response = await httpClient.PostAsync(endpoint, content, cancellationToken);
                var responseString = await response.Content.ReadAsStringAsync(cancellationToken);

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
                                var text = parts[0].GetProperty("text").GetString() ?? string.Empty;
                                return AiResponse.Ok(text);
                            }
                        }

                        lastError = $"Gemini model '{model}' trả về phản hồi không chứa candidate hợp lệ.";
                        _logger.LogWarning("{Error} Chuyển sang model tiếp theo (nếu có)...", lastError);
                        continue;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Lỗi parse JSON kết quả từ Gemini model '{Model}'. Response: {Response}", model, responseString);
                        lastError = $"Lỗi parse kết quả Gemini API ({model}): {ex.Message}";
                        continue;
                    }
                }

                lastStatusCode = (int)response.StatusCode;
                lastError = $"Gemini API error ({model} - {response.StatusCode}): {responseString}";

                if (ShouldFallbackToNextModel(response.StatusCode) && i < candidateModels.Count - 1)
                {
                    var nextModel = candidateModels[i + 1];
                    _logger.LogWarning(
                        "Gemini model '{Model}' gặp lỗi {StatusCode}, tự động fallback sang model '{NextModel}'...",
                        model,
                        (int)response.StatusCode,
                        nextModel);
                    continue;
                }

                _logger.LogWarning("Gemini model '{Model}' trả về lỗi status {StatusCode}: {Response}", model, response.StatusCode, responseString);
                return AiResponse.Fail(lastError, lastStatusCode);
            }
            catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
            {
                lastError = $"Lỗi kết nối Gemini API ({model}): {ex.Message}";
                if (i < candidateModels.Count - 1)
                {
                    var nextModel = candidateModels[i + 1];
                    _logger.LogWarning(ex, "Lỗi kết nối tới Gemini model '{Model}', tự động fallback sang model '{NextModel}'...", model, nextModel);
                    continue;
                }

                _logger.LogError(ex, "Lỗi ngoại lệ khi gọi model cuối cùng '{Model}' trong chuỗi Gemini API.", model);
                return AiResponse.Fail(lastError, lastStatusCode);
            }
        }

        return AiResponse.Fail(lastError, lastStatusCode);
    }
}
