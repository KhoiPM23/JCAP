using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Gọi dịch vụ Faster-Whisper riêng (services/faster-whisper) qua HTTP nội bộ. Không lưu âm thanh, không log nội dung lời nói.
    /// Cấu hình: `Shadowing:Asr:BaseUrl` (mặc định http://127.0.0.1:50023), `Shadowing:Asr:Token` (header X-Internal-Token),
    /// `Shadowing:Asr:TimeoutMs` (mặc định 20000).
    /// </summary>
    public sealed class FasterWhisperSpeechRecognitionService : ISpeechRecognitionService
    {
        public const string ProviderId = "faster-whisper";
        public string Provider => ProviderId;

        private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

        private readonly HttpClient _http;
        private readonly IConfiguration _configuration;
        private readonly ILogger<FasterWhisperSpeechRecognitionService> _logger;

        public FasterWhisperSpeechRecognitionService(HttpClient http, IConfiguration configuration, ILogger<FasterWhisperSpeechRecognitionService> logger)
        {
            _http = http;
            _configuration = configuration;
            _logger = logger;
        }

        private string BaseUrl => (_configuration["Shadowing:Asr:BaseUrl"] ?? "http://127.0.0.1:50023").TrimEnd('/');
        private int TimeoutMs => _configuration.GetValue<int?>("Shadowing:Asr:TimeoutMs") ?? 20_000;

        private HttpRequestMessage NewRequest(HttpMethod method, string path)
        {
            var request = new HttpRequestMessage(method, BaseUrl + path);
            var token = _configuration["Shadowing:Asr:Token"];
            if (!string.IsNullOrEmpty(token)) request.Headers.Add("X-Internal-Token", token);
            return request;
        }

        public async Task<SpeechRecognitionResult> RecognizeAsync(SpeechRecognitionRequest request, CancellationToken cancellationToken = default)
        {
            if (request.Wav.Length == 0) return SpeechRecognitionResult.Unavailable(Provider, "ASR_REJECTED_AUDIO");

            using var timeout = new CancellationTokenSource(TimeoutMs);
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeout.Token);
            try
            {
                using var message = NewRequest(HttpMethod.Post, "/v1/transcribe");
                var form = new MultipartFormDataContent();
                var file = new ByteArrayContent(request.Wav);
                file.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");
                form.Add(file, "file", "analysis.wav");
                message.Content = form;

                using var response = await _http.SendAsync(message, linked.Token);
                if (!response.IsSuccessStatusCode)
                {
                    var code = response.StatusCode switch
                    {
                        HttpStatusCode.ServiceUnavailable => "ASR_BUSY",
                        HttpStatusCode.BadRequest or HttpStatusCode.RequestEntityTooLarge => "ASR_REJECTED_AUDIO",
                        HttpStatusCode.Unauthorized => "ASR_UNAVAILABLE",
                        _ => "ASR_ERROR",
                    };
                    _logger.LogWarning("Dịch vụ ASR trả HTTP {Status} ({Code}).", (int)response.StatusCode, code);
                    return SpeechRecognitionResult.Unavailable(Provider, code);
                }

                var body = await response.Content.ReadFromJsonAsync<TranscribeResponse>(Json, linked.Token);
                if (body == null) return SpeechRecognitionResult.Unavailable(Provider, "ASR_ERROR");
                return new SpeechRecognitionResult
                {
                    Status = "completed",
                    Provider = Provider,
                    Text = body.Text ?? string.Empty,
                    Reading = body.Reading,
                    Language = body.Language ?? "ja",
                    Model = body.Model ?? string.Empty,
                    ModelVersion = body.ModelVersion ?? string.Empty,
                    ProcessingMs = body.ProcessingMs,
                    Segments = (body.Segments ?? new()).Select(s => new SpeechRecognitionSegment
                    {
                        Start = s.Start, End = s.End, Text = s.Text ?? string.Empty,
                        AvgLogprob = s.AvgLogprob, NoSpeechProb = s.NoSpeechProb, CompressionRatio = s.CompressionRatio,
                    }).ToList(),
                };
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                _logger.LogWarning("Dịch vụ ASR quá {Timeout} ms.", TimeoutMs);
                return SpeechRecognitionResult.Unavailable(Provider, "ASR_TIMEOUT");
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning("Không kết nối được dịch vụ ASR tại {Url}: {Message}", BaseUrl, ex.Message);
                return SpeechRecognitionResult.Unavailable(Provider, "ASR_UNAVAILABLE");
            }
            catch (JsonException)
            {
                return SpeechRecognitionResult.Unavailable(Provider, "ASR_ERROR");
            }
        }

        public async Task<SpeechRecognitionHealth> CheckHealthAsync(CancellationToken cancellationToken = default)
        {
            using var timeout = new CancellationTokenSource(3000);
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeout.Token);
            try
            {
                using var message = NewRequest(HttpMethod.Get, "/health");
                using var response = await _http.SendAsync(message, linked.Token);
                var body = await response.Content.ReadFromJsonAsync<HealthResponse>(Json, linked.Token);
                return new SpeechRecognitionHealth
                {
                    Available = response.IsSuccessStatusCode && body?.Status == "ok",
                    Provider = Provider,
                    Model = body?.Model,
                    ReadingAvailable = body?.ReadingAvailable ?? false,
                    Error = body?.Error,
                };
            }
            catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException or JsonException)
            {
                return new SpeechRecognitionHealth { Available = false, Provider = Provider, Error = ex.GetType().Name };
            }
        }

        private sealed class TranscribeResponse
        {
            public string? Text { get; set; }
            public string? Reading { get; set; }
            public string? Language { get; set; }
            public string? Model { get; set; }
            public string? ModelVersion { get; set; }
            public int ProcessingMs { get; set; }
            public List<SegmentResponse>? Segments { get; set; }
        }

        private sealed class SegmentResponse
        {
            public double Start { get; set; }
            public double End { get; set; }
            public string? Text { get; set; }
            public double? AvgLogprob { get; set; }
            public double? NoSpeechProb { get; set; }
            public double? CompressionRatio { get; set; }
        }

        private sealed class HealthResponse
        {
            public string? Status { get; set; }
            public string? Model { get; set; }
            public bool ReadingAvailable { get; set; }
            public string? Error { get; set; }
        }
    }
}
