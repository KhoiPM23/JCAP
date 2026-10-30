using System.Net.Http.Headers;
using System.Text.Json;
using JCAP.DTOs.Stt;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations;

public class WhisperSttService : IWhisperSttService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<WhisperSttService> _logger;
    private readonly string _baseUrl;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public WhisperSttService(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<WhisperSttService> logger)
    {
        _logger = logger;
        _baseUrl = configuration["Whisper:BaseUrl"] ?? "http://127.0.0.1:50022";
        _httpClient = httpClientFactory.CreateClient();
        _httpClient.BaseAddress = new Uri(_baseUrl);
        _httpClient.Timeout = TimeSpan.FromSeconds(30);
    }

    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.GetAsync("/health", cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public async Task<WhisperTranscribeResponseDto?> TranscribeAsync(
        Stream audioStream,
        string fileName,
        string language = "ja",
        CancellationToken cancellationToken = default)
    {
        if (audioStream == null || audioStream.Length == 0)
        {
            return null;
        }

        try
        {
            using var content = new MultipartFormDataContent();
            var streamContent = new StreamContent(audioStream);
            var mimeType = fileName.EndsWith(".webm", StringComparison.OrdinalIgnoreCase)
                ? "audio/webm"
                : (fileName.EndsWith(".ogg", StringComparison.OrdinalIgnoreCase) ? "audio/ogg" : "audio/wav");
            streamContent.Headers.ContentType = new MediaTypeHeaderValue(mimeType);
            content.Add(streamContent, "file", string.IsNullOrWhiteSpace(fileName) ? "speech.webm" : fileName);

            var url = $"/transcribe?language={Uri.EscapeDataString(language)}";
            var response = await _httpClient.PostAsync(url, content, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning("Whisper Engine transcribe failed ({StatusCode}): {Body}", response.StatusCode, errorBody);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            return JsonSerializer.Deserialize<WhisperTranscribeResponseDto>(json, JsonOptions);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning("Không thể kết nối đến Whisper Engine tại {BaseUrl}: {Message}", _baseUrl, ex.Message);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi khi xử lý nhận diện giọng nói qua Whisper Engine");
            return null;
        }
    }
}
