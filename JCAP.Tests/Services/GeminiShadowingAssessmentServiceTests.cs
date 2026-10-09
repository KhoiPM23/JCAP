using System.IO;
using System.Text;
using System.Threading.Tasks;
using JCAP.Services.Implementations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace JCAP.Tests.Services;

public class GeminiShadowingAssessmentServiceTests
{
    [Fact]
    public async Task EvaluateAudioAsync_ReturnsUnavailable_WhenAudioStreamIsEmpty()
    {
        using var httpClient = new HttpClient();
        var configuration = new ConfigurationBuilder().Build();
        var service = new GeminiShadowingAssessmentService(
            httpClient,
            configuration,
            new Mock<ILogger<GeminiShadowingAssessmentService>>().Object);

        using var emptyStream = new MemoryStream();
        var result = await service.EvaluateAudioAsync(emptyStream, "audio/webm", "一人です。");

        Assert.NotNull(result);
        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal("AUDIO_TOO_SHORT", result.ErrorCode);
    }

    [Fact]
    public async Task EvaluateAudioAsync_ReturnsUnavailable_WhenAudioTooShort()
    {
        using var httpClient = new HttpClient();
        var configuration = new ConfigurationBuilder().Build();
        var service = new GeminiShadowingAssessmentService(
            httpClient,
            configuration,
            new Mock<ILogger<GeminiShadowingAssessmentService>>().Object);

        // Giả lập 200 bytes audio (quá ngắn < 300ms)
        var tinyBytes = new byte[200];
        using var tinyStream = new MemoryStream(tinyBytes);
        var result = await service.EvaluateAudioAsync(tinyStream, "audio/webm", "一人です。");

        Assert.NotNull(result);
        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal("AUDIO_TOO_SHORT", result.ErrorCode);
    }

    [Fact]
    public async Task EvaluateAudioAsync_ReturnsPartialFallback_WhenApiKeyIsMissing()
    {
        using var httpClient = new HttpClient();
        var configuration = new ConfigurationBuilder().Build();
        var service = new GeminiShadowingAssessmentService(
            httpClient,
            configuration,
            new Mock<ILogger<GeminiShadowingAssessmentService>>().Object);

        var validSizeDummyBytes = new byte[2048];
        using var validStream = new MemoryStream(validSizeDummyBytes);
        var result = await service.EvaluateAudioAsync(validStream, "audio/webm", "一人です。");

        Assert.NotNull(result);
        Assert.Equal("partial", result.EvaluationStatus);
        Assert.Equal("client_fallback", result.Source);
        Assert.Equal("AI_KEY_NOT_CONFIGURED", result.ErrorCode);
        Assert.Null(result.PronunciationScore); // Không bịa điểm phát âm giả
    }
}

