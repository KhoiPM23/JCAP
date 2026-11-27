using System.Net;
using System.Text;
using JCAP.Services.Implementations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace JCAP.Tests.Services;

public class WhisperSttServiceTests
{
    private sealed class CapturingHttpHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _responder;

        public HttpRequestMessage? LastRequest { get; private set; }
        public string[]? LastInternalTokens { get; private set; }
        public int CallCount { get; private set; }

        public CapturingHttpHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responder)
        {
            _responder = responder;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            CallCount++;
            LastRequest = request;
            LastInternalTokens = request.Headers.TryGetValues("X-Internal-Token", out var values)
                ? values.ToArray()
                : null;
            return _responder(request, cancellationToken);
        }
    }

    private static WhisperSttService CreateService(
        CapturingHttpHandler handler,
        string environmentName,
        string? baseUrl = "http://127.0.0.1:50022",
        string? autoStart = "true",
        string? token = null,
        bool passNullEnvironment = false)
    {
        var client = new HttpClient(handler);
        var factoryMock = new Mock<IHttpClientFactory>();
        factoryMock.Setup(f => f.CreateClient(string.Empty)).Returns(client);

        var settings = new Dictionary<string, string?>();
        if (baseUrl != null) settings["Whisper:BaseUrl"] = baseUrl;
        if (autoStart != null) settings["Whisper:AutoStart"] = autoStart;
        if (token != null) settings["Whisper:Token"] = token;

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(settings)
            .Build();

        IHostEnvironment? env = null;
        if (!passNullEnvironment)
        {
            var envMock = new Mock<IHostEnvironment>();
            envMock.SetupGet(e => e.EnvironmentName).Returns(environmentName);
            env = envMock.Object;
        }

        return new WhisperSttService(
            factoryMock.Object,
            config,
            NullLogger<WhisperSttService>.Instance,
            env);
    }

    [Theory]
    [InlineData("http://127.0.0.1:50022", true)]
    [InlineData("http://localhost:50022", true)]
    [InlineData("http://[::1]:50022", true)]
    [InlineData("http://whisper:50022", false)]
    [InlineData("https://stt.example.com", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    [InlineData("not-a-valid-url", false)]
    public void IsLocalUrl_ClassifiesLoopbackAndRemoteUrls(string? url, bool expected)
    {
        Assert.Equal(expected, WhisperSttService.IsLocalUrl(url));
    }

    [Fact]
    public async Task TryAutoStartEngineAsync_InProduction_ReturnsFalseEvenWithLoopbackUrl()
    {
        var handler = new CapturingHttpHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)));
        var service = CreateService(handler, Environments.Production, baseUrl: "http://127.0.0.1:50022", autoStart: "true");

        var started = await service.TryAutoStartEngineAsync();

        Assert.False(started);
    }

    [Fact]
    public async Task TryAutoStartEngineAsync_WithNullEnvironment_ReturnsFalse()
    {
        var handler = new CapturingHttpHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)));
        var service = CreateService(handler, Environments.Development, baseUrl: "http://127.0.0.1:50022", autoStart: "true", passNullEnvironment: true);

        var started = await service.TryAutoStartEngineAsync();

        Assert.False(started);
    }

    [Fact]
    public async Task TryAutoStartEngineAsync_WhenAutoStartDisabled_ReturnsFalse()
    {
        var handler = new CapturingHttpHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)));
        var service = CreateService(handler, Environments.Development, baseUrl: "http://127.0.0.1:50022", autoStart: "false");

        var started = await service.TryAutoStartEngineAsync();

        Assert.False(started);
    }

    [Fact]
    public async Task TryAutoStartEngineAsync_WithRemoteUrlInDevelopment_ReturnsFalse()
    {
        var handler = new CapturingHttpHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)));
        var service = CreateService(handler, Environments.Development, baseUrl: "http://whisper:50022", autoStart: "true");

        var started = await service.TryAutoStartEngineAsync();

        Assert.False(started);
    }

    [Fact]
    public async Task IsAvailableAsync_WithToken_SendsTrimmedInternalTokenAndNormalizedHealthUri()
    {
        var handler = new CapturingHttpHandler((_, _) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)));
        var service = CreateService(
            handler,
            Environments.Production,
            baseUrl: "http://whisper:5055/",
            token: "  internal-secret-123  ");

        var available = await service.IsAvailableAsync();

        Assert.True(available);
        Assert.Equal("http://whisper:5055/health", handler.LastRequest!.RequestUri!.ToString());
        Assert.NotNull(handler.LastInternalTokens);
        Assert.Equal("internal-secret-123", Assert.Single(handler.LastInternalTokens!));
    }

    [Fact]
    public async Task IsAvailableAsync_WithoutToken_OmitsInternalTokenHeader()
    {
        var handler = new CapturingHttpHandler((_, _) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)));
        var service = CreateService(handler, Environments.Production, baseUrl: "http://whisper:5055", token: "   ");

        var available = await service.IsAvailableAsync();

        Assert.True(available);
        Assert.Null(handler.LastInternalTokens);
    }

    [Fact]
    public async Task IsAvailableAsync_WhenUnreachableInProduction_ReturnsFalse()
    {
        var handler = new CapturingHttpHandler((_, _) =>
            throw new HttpRequestException("connection refused"));
        var service = CreateService(handler, Environments.Production, baseUrl: "http://127.0.0.1:50022");

        var available = await service.IsAvailableAsync();

        Assert.False(available);
    }

    [Fact]
    public async Task TranscribeAsync_WithToken_SendsInternalTokenAndParsesResponse()
    {
        const string payload = """
            {"success":true,"text":"おはようございます","confidence":0.94,"durationSeconds":1.2,"speechPace":7.5,"language":"ja"}
            """;
        var handler = new CapturingHttpHandler((_, _) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            }));
        var service = CreateService(
            handler,
            Environments.Production,
            baseUrl: "http://whisper:50022",
            token: "whisper-secret");

        await using var stream = new MemoryStream(new byte[] { 1, 2, 3, 4 });
        var result = await service.TranscribeAsync(stream, "speech.webm", "ja");

        Assert.NotNull(result);
        Assert.True(result!.Success);
        Assert.Equal("おはようございます", result.Text);
        Assert.Equal("http://whisper:50022/transcribe?language=ja", handler.LastRequest!.RequestUri!.ToString());
        Assert.NotNull(handler.LastInternalTokens);
        Assert.Equal("whisper-secret", Assert.Single(handler.LastInternalTokens!));
    }

    [Fact]
    public async Task TranscribeAsync_WithoutToken_OmitsInternalTokenHeader()
    {
        const string payload = """{"success":true,"text":"はい","confidence":0.9,"durationSeconds":0.5,"speechPace":4.0,"language":"ja"}""";
        var handler = new CapturingHttpHandler((_, _) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            }));
        var service = CreateService(handler, Environments.Production, baseUrl: "http://whisper:50022", token: null);

        await using var stream = new MemoryStream(new byte[] { 1, 2, 3, 4 });
        var result = await service.TranscribeAsync(stream, "speech.wav", "ja");

        Assert.NotNull(result);
        Assert.Null(handler.LastInternalTokens);
    }

    [Fact]
    public async Task TranscribeAsync_EmptyStream_ReturnsNullWithoutCallingHttp()
    {
        var handler = new CapturingHttpHandler((_, _) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)));
        var service = CreateService(handler, Environments.Production);

        await using var stream = new MemoryStream();
        var result = await service.TranscribeAsync(stream, "empty.webm");

        Assert.Null(result);
        Assert.Equal(0, handler.CallCount);
    }

    [Fact]
    public async Task TranscribeAsync_OnHttpRequestException_ReturnsNull()
    {
        var handler = new CapturingHttpHandler((_, _) =>
            throw new HttpRequestException("engine offline"));
        var service = CreateService(handler, Environments.Production, baseUrl: "http://whisper:50022");

        await using var stream = new MemoryStream(new byte[] { 1, 2, 3 });
        var result = await service.TranscribeAsync(stream, "speech.webm");

        Assert.Null(result);
    }
}
