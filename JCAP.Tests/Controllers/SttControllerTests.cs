using System.Text.Json;
using JCAP.Controllers;
using JCAP.DTOs.Common;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
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
}
