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

    public async Task<AiResponse> GenerateAsync(AiRequest request, CancellationToken cancellationToken = default)
    {
        var apiKey = ResolveConfig("AI:ApiKey", "Gemini:ApiKey");
        var model = ResolveConfig("AI:Model", "Gemini:Model") ?? "gemini-3.1-flash-lite";

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning("Gemini API Key chưa được cấu hình trong AI:ApiKey hoặc Gemini:ApiKey.");
            return AiResponse.Fail("Gemini API Key chưa được cấu hình.");
        }

        var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

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
        HttpResponseMessage? response = null;
        string responseString = string.Empty;

        for (int attempt = 0; attempt < 2; attempt++)
        {
            try
            {
                using var content = new StringContent(json, Encoding.UTF8, "application/json");
                response = await httpClient.PostAsync(endpoint, content, cancellationToken);
                responseString = await response.Content.ReadAsStringAsync(cancellationToken);

                if (response.IsSuccessStatusCode)
                {
                    break;
                }

                if ((response.StatusCode == HttpStatusCode.ServiceUnavailable || (int)response.StatusCode == 429) && attempt == 0)
                {
                    _logger.LogWarning("Gemini API bận (status {StatusCode}), tự động thử lại sau 1.2s...", response.StatusCode);
                    await Task.Delay(1200, cancellationToken);
                    continue;
                }

                _logger.LogWarning("Gemini API trả về lỗi status {StatusCode}: {Response}", response.StatusCode, responseString);
                return AiResponse.Fail($"Gemini API error ({response.StatusCode}): {responseString}", (int)response.StatusCode);
            }
            catch (Exception ex) when (attempt == 0 && !cancellationToken.IsCancellationRequested)
            {
                _logger.LogWarning(ex, "Lỗi kết nối khi gọi Gemini API, thử lại sau 1.2s...");
                await Task.Delay(1200, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi ngoại lệ khi gọi Gemini API.");
                return AiResponse.Fail($"Lỗi kết nối Gemini API: {ex.Message}");
            }
        }

        if (response == null || !response.IsSuccessStatusCode)
        {
            return AiResponse.Fail("Không nhận được phản hồi thành công từ Gemini API.");
        }

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

            return AiResponse.Fail("Gemini API trả về phản hồi không chứa candidate hợp lệ.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi parse JSON kết quả từ Gemini API. Response: {Response}", responseString);
            return AiResponse.Fail($"Lỗi parse kết quả Gemini API: {ex.Message}");
        }
    }
}
