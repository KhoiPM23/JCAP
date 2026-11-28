using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
using JCAP.Controllers;
using JCAP.DTOs.Common;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace JCAP.Tests.Controllers;

public class SttControllerTests
{
    private static SttController CreateController(string? whisperBaseUrl, bool isAvailable)
    {
        var whisperMock = new Mock<IWhisperSttService>();
        whisperMock
            .Setup(s => s.IsAvailableAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(isAvailable);

        var envMock = new Mock<IWebHostEnvironment>();
        envMock.SetupGet(e => e.ContentRootPath).Returns(Path.GetTempPath());
        envMock.SetupGet(e => e.WebRootPath).Returns(Path.GetTempPath());

        var settings = new Dictionary<string, string?>();
        if (whisperBaseUrl != null)
        {
            settings["Whisper:BaseUrl"] = whisperBaseUrl;
        }

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(settings)
            .Build();

        return new SttController(
            whisperMock.Object,
            envMock.Object,
            config,
            NullLogger<SttController>.Instance);
    }

    private static JsonElement ExtractStatus(ActionResult<ApiResponse<object>> actionResult)
    {
        var ok = Assert.IsType<OkObjectResult>(actionResult.Result);
        var apiResponse = Assert.IsType<ApiResponse<object>>(ok.Value);
        Assert.True(apiResponse.Success);
        return JsonSerializer.SerializeToElement(apiResponse.Data);
    }

    [Theory]
    [InlineData("http://whisper:5055", true, 5055, true)]
    [InlineData("http://127.0.0.1:50022", false, 50022, true)]
    [InlineData("https://stt.example.com", true, 443, true)]
    [InlineData("  http://whisper.internal:6100/  ", true, 6100, true)]
    public async Task Health_WithValidConfiguredUrl_DerivesPortAndReportsConfiguredTrue(
        string baseUrl,
        bool available,
        int expectedPort,
        bool expectedConfigured)
    {
        var controller = CreateController(baseUrl, available);

        var result = await controller.Health(CancellationToken.None);
        var status = ExtractStatus(result);

        Assert.Equal(available, status.GetProperty("available").GetBoolean());
        Assert.Equal("faster-whisper", status.GetProperty("engine").GetString());
        Assert.Equal(expectedPort, status.GetProperty("port").GetInt32());
        Assert.Equal(expectedConfigured, status.GetProperty("configured").GetBoolean());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-a-url")]
    public async Task Health_WithMissingOrInvalidUrl_FallsBackTo50022AndReportsConfiguredFalse(string? baseUrl)
    {
        var controller = CreateController(baseUrl, isAvailable: false);

        var result = await controller.Health(CancellationToken.None);
        var status = ExtractStatus(result);

        Assert.False(status.GetProperty("available").GetBoolean());
        Assert.Equal("faster-whisper", status.GetProperty("engine").GetString());
        Assert.Equal(50022, status.GetProperty("port").GetInt32());
        Assert.False(status.GetProperty("configured").GetBoolean());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("/audio/other/file.webm")]
    [InlineData("/audio/roleplay/../secrets.txt")]
    [InlineData("/audio/roleplay/sub\\file.webm")]
    public void DeleteAudio_RejectsInvalidOrTraversalPaths(string? url)
    {
        var controller = CreateController(null, false);
        var result = controller.DeleteAudio(url);
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public void DeleteAudio_DeletesExistingRoleplayAudioFile()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"jcap_stt_test_{Guid.NewGuid():N}");
        var folder = Path.Combine(tempRoot, "audio", "roleplay");
        Directory.CreateDirectory(folder);
        var filePath = Path.Combine(folder, "user_test123.webm");
        File.WriteAllBytes(filePath, new byte[] { 1, 2, 3, 4 });

        try
        {
            var whisperMock = new Mock<IWhisperSttService>();
            var envMock = new Mock<IWebHostEnvironment>();
            envMock.SetupGet(e => e.ContentRootPath).Returns(tempRoot);
            envMock.SetupGet(e => e.WebRootPath).Returns(tempRoot);
            var config = new ConfigurationBuilder().Build();

            var controller = new SttController(whisperMock.Object, envMock.Object, config, NullLogger<SttController>.Instance);

            var result = controller.DeleteAudio("/audio/roleplay/user_test123.webm");
            var payload = ExtractStatus(result);

            Assert.True(payload.GetProperty("deleted").GetBoolean());
            Assert.False(File.Exists(filePath));
        }
        finally
        {
            if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
        }
    }

    private static IFormFile CreateFakeFormFile(string fileName, long lengthBytes = 128)
    {
        var bytes = new byte[Math.Min(lengthBytes, 256)];
        var stream = new MemoryStream(bytes);
        var mock = new Mock<IFormFile>();
        mock.SetupGet(f => f.FileName).Returns(fileName);
        mock.SetupGet(f => f.Length).Returns(lengthBytes);
        mock.Setup(f => f.OpenReadStream()).Returns(() => new MemoryStream(bytes));
        mock.Setup(f => f.CopyToAsync(It.IsAny<Stream>(), It.IsAny<CancellationToken>()))
            .Returns((Stream target, CancellationToken ct) => target.WriteAsync(bytes, 0, bytes.Length, ct));
        return mock.Object;
    }

    [Theory]
    [InlineData("evil.html")]
    [InlineData("payload.svg")]
    [InlineData("script.js")]
    [InlineData("binary.exe")]
    public async Task Transcribe_RejectsDisallowedExtensions_WithoutCallingWhisper(string fileName)
    {
        var whisperMock = new Mock<IWhisperSttService>();
        var envMock = new Mock<IWebHostEnvironment>();
        envMock.SetupGet(e => e.ContentRootPath).Returns(Path.GetTempPath());
        envMock.SetupGet(e => e.WebRootPath).Returns(Path.GetTempPath());
        var controller = new SttController(whisperMock.Object, envMock.Object, new ConfigurationBuilder().Build(), NullLogger<SttController>.Instance);

        var file = CreateFakeFormFile(fileName);
        var result = await controller.Transcribe(file, "ja", CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result.Result);
        whisperMock.Verify(w => w.TranscribeAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Theory]
    [InlineData("evil.html")]
    [InlineData("payload.svg")]
    [InlineData("shell.ps1")]
    public async Task SaveAudio_RejectsDisallowedExtensions(string fileName)
    {
        var controller = CreateController(null, false);
        var file = CreateFakeFormFile(fileName);

        var result = await controller.SaveAudio(file, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task Transcribe_RejectsOversizedAudioFile()
    {
        var whisperMock = new Mock<IWhisperSttService>();
        var envMock = new Mock<IWebHostEnvironment>();
        envMock.SetupGet(e => e.ContentRootPath).Returns(Path.GetTempPath());
        envMock.SetupGet(e => e.WebRootPath).Returns(Path.GetTempPath());
        var controller = new SttController(whisperMock.Object, envMock.Object, new ConfigurationBuilder().Build(), NullLogger<SttController>.Instance);

        var oversizedFile = CreateFakeFormFile("long.webm", SttController.MaxAudioUploadBytes + 1);
        var result = await controller.Transcribe(oversizedFile, "ja", CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result.Result);
        whisperMock.Verify(w => w.TranscribeAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Theory]
    [InlineData("voice.webm", ".webm")]
    [InlineData("voice.WAV", ".wav")]
    [InlineData("voice.m4a", ".m4a")]
    public async Task SaveAudio_AcceptsAllowedExtensions_AndSavesNormalizedFile(string fileName, string expectedExt)
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"jcap_stt_save_{Guid.NewGuid():N}");
        try
        {
            var whisperMock = new Mock<IWhisperSttService>();
            var envMock = new Mock<IWebHostEnvironment>();
            envMock.SetupGet(e => e.ContentRootPath).Returns(tempRoot);
            envMock.SetupGet(e => e.WebRootPath).Returns(tempRoot);
            var controller = new SttController(whisperMock.Object, envMock.Object, new ConfigurationBuilder().Build(), NullLogger<SttController>.Instance);

            var result = await controller.SaveAudio(CreateFakeFormFile(fileName), CancellationToken.None);
            var payload = ExtractStatus(result);
            var audioUrl = payload.GetProperty("audioUrl").GetString();

            Assert.NotNull(audioUrl);
            Assert.StartsWith("/audio/roleplay/user_", audioUrl);
            Assert.EndsWith(expectedExt, audioUrl);
        }
        finally
        {
            if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
        }
    }

    [Fact]
    public async Task StartEngine_InProductionAsLearner_Returns403Forbidden()
    {
        var whisperMock = new Mock<IWhisperSttService>();
        var envMock = new Mock<IWebHostEnvironment>();
        envMock.SetupGet(e => e.EnvironmentName).Returns(Environments.Production);
        var controller = new SttController(whisperMock.Object, envMock.Object, new ConfigurationBuilder().Build(), NullLogger<SttController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                    {
                        new Claim(ClaimTypes.NameIdentifier, "learner-1"),
                        new Claim(ClaimTypes.Role, "Learner")
                    }, "Bearer"))
                }
            }
        };

        var result = await controller.StartEngine(CancellationToken.None);

        var obj = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status403Forbidden, obj.StatusCode);
        whisperMock.Verify(w => w.TryAutoStartEngineAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task StartEngine_InDevelopment_AllowsStartEngine()
    {
        var whisperMock = new Mock<IWhisperSttService>();
        whisperMock.Setup(w => w.TryAutoStartEngineAsync(It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var envMock = new Mock<IWebHostEnvironment>();
        envMock.SetupGet(e => e.EnvironmentName).Returns(Environments.Development);
        var controller = new SttController(whisperMock.Object, envMock.Object, new ConfigurationBuilder().Build(), NullLogger<SttController>.Instance);

        var result = await controller.StartEngine(CancellationToken.None);
        var payload = ExtractStatus(result);

        Assert.True(payload.GetProperty("started").GetBoolean());
        whisperMock.Verify(w => w.TryAutoStartEngineAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public void SttAndRoleplayControllers_EnforceAuthorizeAndRoleplayAiRateLimiting()
    {
        var sttType = typeof(SttController);
        Assert.NotNull(sttType.GetCustomAttribute<AuthorizeAttribute>());
        Assert.Null(sttType.GetCustomAttribute<AllowAnonymousAttribute>());

        var transcribeRate = sttType.GetMethod(nameof(SttController.Transcribe))?.GetCustomAttribute<EnableRateLimitingAttribute>();
        var saveAudioRate = sttType.GetMethod(nameof(SttController.SaveAudio))?.GetCustomAttribute<EnableRateLimitingAttribute>();
        Assert.Equal("roleplay-ai", transcribeRate?.PolicyName);
        Assert.Equal("roleplay-ai", saveAudioRate?.PolicyName);

        var roleplayType = typeof(RoleplaySessionController);
        var sendMsgRate = roleplayType.GetMethod(nameof(RoleplaySessionController.SendMessage))?.GetCustomAttribute<EnableRateLimitingAttribute>();
        var hintRate = roleplayType.GetMethod(nameof(RoleplaySessionController.GetHint))?.GetCustomAttribute<EnableRateLimitingAttribute>();
        Assert.Equal("roleplay-ai", sendMsgRate?.PolicyName);
        Assert.Equal("roleplay-ai", hintRate?.PolicyName);
    }
}
