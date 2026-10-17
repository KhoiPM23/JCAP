using System;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Nhận dạng giọng nói tiếng Nhật bằng Gemini (audio → transcript).
    /// Chỉ chép lại những gì nghe được: KHÔNG nhận câu mẫu, KHÔNG chấm điểm, KHÔNG nhận xét.
    /// Việc đưa câu mẫu vào prompt từng khiến mô hình "sửa" lời nói theo đáp án nên điểm bị thổi cao.
    /// </summary>
    public class GeminiSpeechRecognizer : IShadowingSpeechRecognizer
    {
        private const string DefaultModel = "gemini-3.1-flash-lite";
        private const int DefaultTimeoutSeconds = 15; // đo thực: 1.7–9.2s, từng có lần chạm 10s
        private const int MaxLoggedProviderMessageLength = 300;

        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<GeminiSpeechRecognizer> _logger;

        public GeminiSpeechRecognizer(
            HttpClient httpClient,
            IConfiguration configuration,
            ILogger<GeminiSpeechRecognizer> logger)
        {
            _httpClient = httpClient;
            _configuration = configuration;
            _logger = logger;
        }

        // Prompt đã được thử trên Gemini thật: phần "SPEECH DETECTION" chặn được trường hợp chỉ có tiếng ồn,
        // nhưng KHÔNG chặn được im lặng số tuyệt đối (mô hình vẫn bịa chữ) nên backend/client phải có bằng chứng
        // âm thanh độc lập (cổng mic, giải mã bản ghi) trước khi gọi nhận dạng.
        private const string SystemInstruction =
@"You are a strict speech-to-text engine for Japanese learners (native Vietnamese speakers practising Japanese).
Return strictly valid JSON: {""noSpeech"": boolean, ""transcript"": string}

SPEECH DETECTION (most important):
- Only report words you can CLEARLY hear a human voice saying. Silence, room noise, background chatter, breathing, clicks, hum, music or unintelligible sounds are NOT speech.
- If there is no clearly audible human speech, return {""noSpeech"": true, ""transcript"": """"}.
- NEVER invent, guess or fill in words. When unsure whether anything was said, return noSpeech = true.

TRANSCRIPT:
- Transcribe verbatim, in Japanese, exactly what was spoken.
- Do NOT correct grammar, do NOT complete or fix mispronounced or missing words or sounds, do NOT translate, do NOT guess what the speaker intended to say.
- If the speaker skips or mispronounces a word, transcribe what you actually heard.";

        public async Task<SpeechRecognitionResult> TranscribeAsync(
            byte[] audio,
            string mimeType,
            CancellationToken cancellationToken = default,
            TimeSpan? timeout = null)
        {
            var apiKey = _configuration["Gemini:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                return Fail(SpeechRecognitionOutcome.NotConfigured, "AI_KEY_NOT_CONFIGURED");
            }

            // Cùng cấu hình model với các tính năng AI khác; AudioModel là ghi đè tùy chọn.
            var model = _configuration["Gemini:AudioModel"] ?? _configuration["Gemini:Model"] ?? DefaultModel;
            var timeoutSeconds = timeout.HasValue
                ? Math.Max(1, (int)Math.Ceiling(timeout.Value.TotalSeconds))
                : _configuration.GetValue<int?>("Shadowing:Recognition:GeminiTimeoutSeconds") ?? DefaultTimeoutSeconds;

            var requestBody = new
            {
                systemInstruction = new { parts = new[] { new { text = SystemInstruction } } },
                contents = new[]
                {
                    new
                    {
                        role = "user",
                        parts = new object[]
                        {
                            new { inlineData = new { mimeType, data = Convert.ToBase64String(audio) } },
                            new { text = "Transcribe the attached audio." }
                        }
                    }
                },
                generationConfig = new { temperature = 0, responseMimeType = "application/json" }
            };

            // API key đi trong header, không đặt vào URL để tránh lộ qua log/proxy.
            var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{Uri.EscapeDataString(model)}:generateContent";
            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json")
            };
            request.Headers.Add("x-goog-api-key", apiKey);

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromSeconds(Math.Max(1, timeoutSeconds)));

            HttpResponseMessage response;
            string body;
            try
            {
                response = await _httpClient.SendAsync(request, timeoutCts.Token);
                body = await response.Content.ReadAsStringAsync(timeoutCts.Token);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                _logger.LogWarning("Gemini STT timeout sau {Seconds}s.", timeoutSeconds);
                return Fail(SpeechRecognitionOutcome.Timeout, "AI_TIMEOUT");
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning("Gemini STT lỗi mạng ({ExceptionType}).", ex.GetType().Name);
                return Fail(SpeechRecognitionOutcome.ProviderError, "AI_NETWORK_ERROR");
            }

            using (response)
            {
                if (!response.IsSuccessStatusCode)
                {
                    var status = (int)response.StatusCode;
                    _logger.LogWarning(
                        "Gemini STT thất bại: HTTP {Status} {ProviderMessage}",
                        status, ExtractProviderMessage(body));

                    return response.StatusCode == HttpStatusCode.TooManyRequests
                        ? Fail(SpeechRecognitionOutcome.QuotaExceeded, "AI_QUOTA_EXCEEDED")
                        : Fail(SpeechRecognitionOutcome.ProviderError, $"AI_HTTP_{status}");
                }
            }

            return ParseSuccessBody(body);
        }

        private SpeechRecognitionResult ParseSuccessBody(string body)
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (!doc.RootElement.TryGetProperty("candidates", out var candidates)
                    || candidates.ValueKind != JsonValueKind.Array
                    || candidates.GetArrayLength() == 0)
                {
                    return Fail(SpeechRecognitionOutcome.MalformedResponse, "AI_EMPTY_CANDIDATES");
                }

                var content = candidates[0].GetProperty("content");
                var parts = content.GetProperty("parts");
                if (parts.GetArrayLength() == 0)
                {
                    return Fail(SpeechRecognitionOutcome.MalformedResponse, "AI_EMPTY_PARTS");
                }

                var jsonText = parts[0].GetProperty("text").GetString();
                if (string.IsNullOrWhiteSpace(jsonText))
                {
                    return Fail(SpeechRecognitionOutcome.MalformedResponse, "AI_EMPTY_TEXT");
                }

                using var parsed = JsonDocument.Parse(jsonText);
                var root = parsed.RootElement;

                var noSpeech = root.TryGetProperty("noSpeech", out var ns) && ns.ValueKind == JsonValueKind.True;
                var transcript = root.TryGetProperty("transcript", out var tr) && tr.ValueKind == JsonValueKind.String
                    ? tr.GetString()?.Trim() ?? string.Empty
                    : string.Empty;

                if (noSpeech || transcript.Length == 0)
                {
                    return new SpeechRecognitionResult { Outcome = SpeechRecognitionOutcome.NoSpeech, ErrorCode = "NO_SPEECH_DETECTED" };
                }

                return new SpeechRecognitionResult { Outcome = SpeechRecognitionOutcome.Recognized, Text = transcript };
            }
            catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException)
            {
                _logger.LogWarning("Gemini STT trả về dữ liệu không đọc được ({ExceptionType}).", ex.GetType().Name);
                return Fail(SpeechRecognitionOutcome.MalformedResponse, "AI_MALFORMED_RESPONSE");
            }
        }

        private static string ExtractProviderMessage(string body)
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("error", out var err)
                    && err.TryGetProperty("message", out var msg)
                    && msg.ValueKind == JsonValueKind.String)
                {
                    var text = msg.GetString() ?? string.Empty;
                    return text.Length > MaxLoggedProviderMessageLength ? text[..MaxLoggedProviderMessageLength] : text;
                }
            }
            catch (JsonException)
            {
                // Không phải JSON: không ghi nội dung thô vào log.
            }
            return string.Empty;
        }

        private static SpeechRecognitionResult Fail(SpeechRecognitionOutcome outcome, string code) =>
            new() { Outcome = outcome, ErrorCode = code };
    }
}
