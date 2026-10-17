using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace JCAP.Tests.Services;

public class GeminiSpeechRecognizerTests
{
    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _respond;
        public HttpRequestMessage? LastRequest { get; private set; }
        public string? LastRequestBody { get; private set; }

        public StubHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond) => _respond = respond;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            LastRequestBody = request.Content == null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return await _respond(request, cancellationToken);
        }
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static string GeminiBody(string innerJson)
    {
        var escaped = System.Text.Json.JsonSerializer.Serialize(innerJson);
        return $"{{\"candidates\":[{{\"content\":{{\"parts\":[{{\"text\":{escaped}}}]}}}}]}}";
    }

    private static GeminiSpeechRecognizer Create(StubHandler handler, Dictionary<string, string?>? config = null)
    {
        var settings = new Dictionary<string, string?> { ["Gemini:ApiKey"] = "test-secret-key", ["Gemini:Model"] = "test-model" };
        if (config != null) foreach (var kv in config) settings[kv.Key] = kv.Value;

        return new GeminiSpeechRecognizer(
            new HttpClient(handler),
            new ConfigurationBuilder().AddInMemoryCollection(settings).Build(),
            new Mock<ILogger<GeminiSpeechRecognizer>>().Object);
    }

    private static readonly byte[] Audio = new byte[2048];

    [Fact]
    public async Task ReturnsNotConfigured_WhenApiKeyMissing()
    {
        var handler = new StubHandler((_, _) => throw new InvalidOperationException("must not call provider"));
        var recognizer = new GeminiSpeechRecognizer(
            new HttpClient(handler),
            new ConfigurationBuilder().Build(),
            new Mock<ILogger<GeminiSpeechRecognizer>>().Object);

        var result = await recognizer.TranscribeAsync(Audio, "audio/webm");

        Assert.Equal(SpeechRecognitionOutcome.NotConfigured, result.Outcome);
        Assert.Equal("AI_KEY_NOT_CONFIGURED", result.ErrorCode);
    }

    [Fact]
    public async Task ParsesTranscript_AndKeepsApiKeyOutOfTheUrl()
    {
        var handler = new StubHandler((_, _) => Task.FromResult(
            Json(HttpStatusCode.OK, GeminiBody("{\"noSpeech\":false,\"transcript\":\"一人です\"}"))));

        var result = await Create(handler).TranscribeAsync(Audio, "audio/webm");

        Assert.Equal(SpeechRecognitionOutcome.Recognized, result.Outcome);
        Assert.Equal("一人です", result.Text);
        Assert.DoesNotContain("test-secret-key", handler.LastRequest!.RequestUri!.ToString());
        Assert.DoesNotContain("key=", handler.LastRequest.RequestUri.Query);
        Assert.Contains("test-model", handler.LastRequest.RequestUri.ToString()); // dùng Gemini:Model chung
        Assert.True(handler.LastRequest.Headers.Contains("x-goog-api-key"));
    }

    [Fact]
    public async Task ReportsNoSpeech_AsNonTechnicalOutcome()
    {
        var handler = new StubHandler((_, _) => Task.FromResult(
            Json(HttpStatusCode.OK, GeminiBody("{\"noSpeech\":true,\"transcript\":\"\"}"))));

        var result = await Create(handler).TranscribeAsync(Audio, "audio/webm");

        Assert.Equal(SpeechRecognitionOutcome.NoSpeech, result.Outcome);
    }

    [Fact]
    public async Task MapsHttp429_ToQuotaExceeded()
    {
        var handler = new StubHandler((_, _) => Task.FromResult(
            Json(HttpStatusCode.TooManyRequests, "{\"error\":{\"message\":\"quota\"}}")));

        var result = await Create(handler).TranscribeAsync(Audio, "audio/webm");

        Assert.Equal(SpeechRecognitionOutcome.QuotaExceeded, result.Outcome);
        Assert.Equal("AI_QUOTA_EXCEEDED", result.ErrorCode);
    }

    [Fact]
    public async Task MapsHttp500_ToProviderError()
    {
        var handler = new StubHandler((_, _) => Task.FromResult(Json(HttpStatusCode.InternalServerError, "boom")));

        var result = await Create(handler).TranscribeAsync(Audio, "audio/webm");

        Assert.Equal(SpeechRecognitionOutcome.ProviderError, result.Outcome);
        Assert.Equal("AI_HTTP_500", result.ErrorCode);
    }

    [Theory]
    [InlineData("not json at all")]
    [InlineData("{\"candidates\":[]}")]
    [InlineData("{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"this is not json\"}]}}]}")]
    [InlineData("{\"candidates\":[{\"content\":{\"parts\":[]}}]}")]
    public async Task MalformedResponses_AreTechnicalFailures_NotNoSpeech(string body)
    {
        var handler = new StubHandler((_, _) => Task.FromResult(Json(HttpStatusCode.OK, body)));

        var result = await Create(handler).TranscribeAsync(Audio, "audio/webm");

        Assert.Equal(SpeechRecognitionOutcome.MalformedResponse, result.Outcome);
    }

    [Fact]
    public async Task ReturnsTimeout_WhenProviderExceedsConfiguredLimit()
    {
        var handler = new StubHandler(async (_, ct) =>
        {
            await Task.Delay(TimeSpan.FromSeconds(30), ct);
            return Json(HttpStatusCode.OK, "{}");
        });

        var result = await Create(handler, new() { ["Shadowing:Recognition:GeminiTimeoutSeconds"] = "1" })
            .TranscribeAsync(Audio, "audio/webm");

        Assert.Equal(SpeechRecognitionOutcome.Timeout, result.Outcome);
        Assert.Equal("AI_TIMEOUT", result.ErrorCode);
    }

    [Fact]
    public async Task ExplicitTimeout_OverridesTheConfiguredOne()
    {
        var handler = new StubHandler(async (_, ct) =>
        {
            await Task.Delay(TimeSpan.FromSeconds(30), ct);
            return Json(HttpStatusCode.OK, "{}");
        });

        // cấu hình 60 giây nhưng người gọi yêu cầu 1 giây
        var started = DateTime.UtcNow;
        var result = await Create(handler, new() { ["Shadowing:Recognition:GeminiTimeoutSeconds"] = "60" })
            .TranscribeAsync(Audio, "audio/webm", timeout: TimeSpan.FromSeconds(1));

        Assert.Equal(SpeechRecognitionOutcome.Timeout, result.Outcome);
        Assert.True(DateTime.UtcNow - started < TimeSpan.FromSeconds(10));
    }

    [Fact]
    public async Task PropagatesCallerCancellation_InsteadOfReportingTimeout()
    {
        using var cts = new CancellationTokenSource();
        var handler = new StubHandler(async (_, ct) =>
        {
            cts.Cancel();
            await Task.Delay(TimeSpan.FromSeconds(30), ct);
            return Json(HttpStatusCode.OK, "{}");
        });

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => Create(handler).TranscribeAsync(Audio, "audio/webm", cts.Token));
    }

    [Fact]
    public async Task NetworkFailure_IsProviderError()
    {
        var handler = new StubHandler((_, _) => throw new HttpRequestException("connection reset"));

        var result = await Create(handler).TranscribeAsync(Audio, "audio/webm");

        Assert.Equal(SpeechRecognitionOutcome.ProviderError, result.Outcome);
        Assert.Equal("AI_NETWORK_ERROR", result.ErrorCode);
    }
}
