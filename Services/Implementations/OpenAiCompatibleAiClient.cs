using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations;

public class OpenAiCompatibleAiClient : IAiClient
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<OpenAiCompatibleAiClient> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public OpenAiCompatibleAiClient(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<OpenAiCompatibleAiClient> logger)
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
        var apiKey = ResolveConfig("AI:ApiKey", "OpenAI:ApiKey", "Groq:ApiKey");

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning("OpenAI-Compatible API Key chưa được cấu hình trong AI:ApiKey hoặc OpenAI:ApiKey.");
            return AiResponse.Fail("API Key chưa được cấu hình cho OpenAI-compatible provider.");
        }

        var baseUrl = ResolveConfig("AI:BaseUrl", "OpenAI:BaseUrl", "Groq:BaseUrl")
            ?? "https://api.openai.com/v1";

        baseUrl = baseUrl.TrimEnd('/');
        var endpoint = $"{baseUrl}/chat/completions";

        var model = ResolveConfig("AI:Model", "OpenAI:Model", "Groq:Model")
            ?? "gpt-4o-mini";

        var messages = new List<object>();

        if (!string.IsNullOrWhiteSpace(request.SystemInstruction))
        {
            messages.Add(new
            {
                role = "system",
                content = request.SystemInstruction
            });
        }

        foreach (var msg in request.Messages)
        {
            var role = string.Equals(msg.Role, "assistant", StringComparison.OrdinalIgnoreCase) ||
                       string.Equals(msg.Role, "model", StringComparison.OrdinalIgnoreCase)
                ? "assistant"
                : "user";

            messages.Add(new
            {
                role,
                content = msg.Content
            });
        }

        if (messages.Count == 0)
        {
            messages.Add(new
            {
                role = "user",
                content = string.Empty
            });
        }

        var requestBody = new Dictionary<string, object>
        {
            ["model"] = model,
            ["messages"] = messages,
            ["temperature"] = request.Temperature
        };

        if (request.ResponseFormat == AiResponseFormat.Json)
        {
            requestBody["response_format"] = new { type = "json_object" };
        }

        var json = JsonSerializer.Serialize(requestBody, JsonOptions);

        HttpResponseMessage? response = null;
        string responseString = string.Empty;

        var httpClient = _httpClientFactory.CreateClient("OpenAiCompatibleAiClient");

        for (int attempt = 0; attempt < 2; attempt++)
        {
            try
            {
                using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint);
                httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
                httpRequest.Content = new StringContent(json, Encoding.UTF8, "application/json");

                response = await httpClient.SendAsync(httpRequest, cancellationToken);
                responseString = await response.Content.ReadAsStringAsync(cancellationToken);

                if (response.IsSuccessStatusCode)
                {
                    break;
                }

                if ((response.StatusCode == HttpStatusCode.ServiceUnavailable || (int)response.StatusCode == 429) && attempt == 0)
                {
                    _logger.LogWarning("OpenAI-Compatible API bận (status {StatusCode}), tự động thử lại sau 1.2s...", response.StatusCode);
                    await Task.Delay(1200, cancellationToken);
                    continue;
                }

                _logger.LogWarning("OpenAI-Compatible API trả về lỗi status {StatusCode}: {Response}", response.StatusCode, responseString);
                return AiResponse.Fail($"OpenAI API error ({response.StatusCode}): {responseString}", (int)response.StatusCode);
            }
            catch (Exception ex) when (attempt == 0 && !cancellationToken.IsCancellationRequested)
            {
                _logger.LogWarning(ex, "Lỗi kết nối khi gọi OpenAI-Compatible API, thử lại sau 1.2s...");
                await Task.Delay(1200, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi ngoại lệ khi gọi OpenAI-Compatible API.");
                return AiResponse.Fail($"Lỗi kết nối OpenAI API: {ex.Message}");
            }
        }

        if (response == null || !response.IsSuccessStatusCode)
        {
            return AiResponse.Fail("Không nhận được phản hồi thành công từ OpenAI-Compatible API.");
        }

        try
        {
            using var doc = JsonDocument.Parse(responseString);
            var root = doc.RootElement;
            if (root.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
            {
                var choice = choices[0];
                if (choice.TryGetProperty("message", out var msgElem) &&
                    msgElem.TryGetProperty("content", out var contentElem))
                {
                    var text = contentElem.GetString() ?? string.Empty;
                    return AiResponse.Ok(text);
                }
            }

            return AiResponse.Fail("OpenAI API trả về phản hồi không chứa message content hợp lệ.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi parse JSON kết quả từ OpenAI-Compatible API. Response: {Response}", responseString);
            return AiResponse.Fail($"Lỗi parse kết quả OpenAI API: {ex.Message}");
        }
    }
}
