using System.Net;
using System.Text;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace JCAP.Tests.Services;

/// <summary>Gọi dịch vụ Faster-Whisper qua HTTP: đọc kết quả, lỗi/quá hạn → unavailable (không bao giờ ném ra ngoài), gửi token nội bộ.</summary>
public class FasterWhisperSpeechRecognitionServiceTests
{
    private sealed class Handler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _respond;
        public HttpRequestMessage? Last;
        public Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond) => _respond = respond;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Last = request;
            return _respond(request, cancellationToken);
        }
    }

    private static FasterWhisperSpeechRecognitionService Service(Handler handler, string? token = "secret", int timeoutMs = 2000) =>
        new(new HttpClient(handler), new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Shadowing:Asr:BaseUrl"] = "http://asr.local",
            ["Shadowing:Asr:Token"] = token,
            ["Shadowing:Asr:TimeoutMs"] = timeoutMs.ToString(),
        }).Build(), NullLogger<FasterWhisperSpeechRecognitionService>.Instance);

    private static HttpResponseMessage Json(string json, HttpStatusCode code = HttpStatusCode.OK) =>
        new(code) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    private static readonly SpeechRecognitionRequest Wav = new() { Wav = TestAudio.Wav(TestAudio.Sine(800)) };

    [Fact]
    public async Task Completed_ParsesTextReadingModelAndRawSegmentMetadata()
    {
        var handler = new Handler((_, _) => Task.FromResult(Json("""
            {"text":"学校に行きます","reading":"ガッコーニイキマス","language":"ja","model":"small","modelVersion":"faster-whisper 1.2.1",
             "processingMs":420,"segments":[{"start":0,"end":1.5,"text":"学校に行きます","avgLogprob":-0.2,"noSpeechProb":0.01,"compressionRatio":0.8}]}
            """)));

        var r = await Service(handler).RecognizeAsync(Wav);

        Assert.True(r.IsCompleted);
        Assert.Equal("学校に行きます", r.Text);
        Assert.Equal("ガッコーニイキマス", r.Reading);
        Assert.Equal("small", r.Model);
        Assert.Equal(420, r.ProcessingMs);
        Assert.Equal(-0.2, Assert.Single(r.Segments).AvgLogprob);
        Assert.Equal("secret", handler.Last!.Headers.GetValues("X-Internal-Token").Single());
        Assert.Equal("http://asr.local/v1/transcribe", handler.Last.RequestUri!.ToString());
    }

    [Theory]
    [InlineData(HttpStatusCode.ServiceUnavailable, "ASR_BUSY", "unavailable")]
    [InlineData(HttpStatusCode.BadRequest, "ASR_REJECTED_AUDIO", "unavailable")]
    [InlineData(HttpStatusCode.Unauthorized, "ASR_UNAVAILABLE", "unavailable")]
    [InlineData(HttpStatusCode.InternalServerError, "ASR_ERROR", "failed")]
    public async Task HttpErrors_BecomeUnavailableOrFailed_NeverThrow(HttpStatusCode status, string code, string expectedStatus)
    {
        var r = await Service(new Handler((_, _) => Task.FromResult(Json("{\"detail\":\"x\"}", status)))).RecognizeAsync(Wav);
        Assert.Equal(expectedStatus, r.Status);
        Assert.Equal(code, r.ErrorCode);
        Assert.Equal(string.Empty, r.Text);
    }

    [Fact]
    public async Task ServiceDown_IsUnavailable()
    {
        var r = await Service(new Handler((_, _) => throw new HttpRequestException("refused"))).RecognizeAsync(Wav);
        Assert.Equal("ASR_UNAVAILABLE", r.ErrorCode);
    }

    [Fact]
    public async Task SlowService_TimesOut()
    {
        var handler = new Handler(async (_, ct) => { await Task.Delay(5000, ct); return Json("{}"); });
        var r = await Service(handler, timeoutMs: 100).RecognizeAsync(Wav);
        Assert.Equal("ASR_TIMEOUT", r.ErrorCode);
    }

    [Fact]
    public async Task CallerCancellation_IsNotSwallowed()
    {
        var handler = new Handler(async (_, ct) => { await Task.Delay(5000, ct); return Json("{}"); });
        using var cts = new CancellationTokenSource(50);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => Service(handler).RecognizeAsync(Wav, cts.Token));
    }

    [Fact]
    public async Task EmptyAudio_IsRejectedWithoutCallingTheService()
    {
        var handler = new Handler((_, _) => throw new InvalidOperationException("should not be called"));
        var r = await Service(handler).RecognizeAsync(new SpeechRecognitionRequest());
        Assert.Equal("ASR_REJECTED_AUDIO", r.ErrorCode);
        Assert.Null(handler.Last);
    }

    [Fact]
    public async Task NoToken_SendsNoHeader_AndHealthReportsModel()
    {
        var handler = new Handler((_, _) => Task.FromResult(Json("""{"status":"ok","model":"small","readingAvailable":true}""")));
        var health = await Service(handler, token: null).CheckHealthAsync();
        Assert.True(health.Available);
        Assert.Equal("small", health.Model);
        Assert.True(health.ReadingAvailable);
        Assert.False(handler.Last!.Headers.Contains("X-Internal-Token"));
    }
}
