using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace JCAP.Tests.Services;

public class AiRoleplayServiceTests
{
    [Fact]
    public async Task ProcessTurnAsync_FallsBackToSimulator_WhenAiClientFails()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Fail("API unavailable"));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5" },
            [],
            "ラーメンをください。",
            []);

        Assert.NotNull(result);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Simulator", result.LinguisticFeedback.EvaluationSource);
        Assert.False(string.IsNullOrWhiteSpace(result.JapaneseReply));
    }

    [Fact]
    public async Task ProcessTurnAsync_UsesAiResponse_WhenAiClientSucceeds()
    {
        var mockAiClient = new Mock<IAiClient>();
        var sampleAiJson = @"{
          ""replyJapanese"": ""はい、かしこまりました。"",
          ""replyVietnamese"": ""Vâng, tôi đã rõ ạ."",
          ""completedMissionIds"": [1],
          ""isNaturallyConcluded"": false,
          ""linguisticFeedback"": {
            ""status"": ""Good"",
            ""summary"": ""Phát âm tự nhiên"",
            ""details"": [
              { ""type"": ""success"", ""aspect"": ""Ngữ cảnh"", ""comment"": ""Rất tốt"" }
            ],
            ""naturalAlternative"": null,
            ""culturalTip"": null
          }
        }";

        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(sampleAiJson));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var pendingMissions = new List<Mission>
        {
            new() { Id = 1, Content = "Gọi món", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5" },
            [],
            "ラーメンをください。",
            pendingMissions);

        Assert.NotNull(result);
        Assert.Equal("はい、かしこまりました。", result.JapaneseReply);
        Assert.Equal("Vâng, tôi đã rõ ạ.", result.VietnameseMeaning);
        Assert.Contains(1, result.CompletedMissionIds);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("AI", result.LinguisticFeedback.EvaluationSource);
        Assert.Equal("Good", result.LinguisticFeedback.Status);
    }

    [Fact]
    public async Task GenerateOpeningMessageAsync_FallsBackToSimulator_WhenAiClientFails()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Fail("API unavailable"));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var result = await service.GenerateOpeningMessageAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5" });

        Assert.NotNull(result);
        Assert.Contains("いらっしゃいませ", result.JapaneseText);
    }

    [Fact]
    public async Task GeminiAiClient_ReturnsFail_WhenApiKeyMissing()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AI:ApiKey"] = "",
                ["Gemini:ApiKey"] = ""
            })
            .Build();

        var mockFactory = new Mock<IHttpClientFactory>();
        var mockLogger = new Mock<ILogger<GeminiAiClient>>();

        var client = new GeminiAiClient(mockFactory.Object, config, mockLogger.Object);
        var response = await client.GenerateAsync(AiRequest.CreateText("Say hello"));

        Assert.False(response.IsSuccess);
        Assert.Contains("Gemini API Key chưa được cấu hình", response.ErrorMessage);
    }

    [Fact]
    public async Task GeminiAiClient_FallsBackToGeminiApiKey_WhenAiApiKeyIsEmptyString()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AI:ApiKey"] = "",
                ["Gemini:ApiKey"] = "fake-gemini-key",
                ["Gemini:Model"] = "gemini-3.1-flash-lite"
            })
            .Build();

        string? requestedUrl = null;
        var fakeClient = new HttpClient(new TestHttpMessageHandler(req =>
        {
            requestedUrl = req.RequestUri?.ToString();
            var fakeResponse = new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent(
                    System.Text.Json.JsonSerializer.Serialize(new
                    {
                        candidates = new[]
                        {
                            new
                            {
                                content = new
                                {
                                    parts = new[] { new { text = "こんにちは" } }
                                }
                            }
                        }
                    }))
            };
            return Task.FromResult(fakeResponse);
        }));

        var mockFactory = new Mock<IHttpClientFactory>();
        mockFactory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(fakeClient);
        var mockLogger = new Mock<ILogger<GeminiAiClient>>();

        var client = new GeminiAiClient(mockFactory.Object, config, mockLogger.Object);
        var response = await client.GenerateAsync(AiRequest.CreateText("Hello"));

        Assert.True(response.IsSuccess);
        Assert.Equal("こんにちは", response.Content);
        Assert.NotNull(requestedUrl);
        Assert.Contains("key=fake-gemini-key", requestedUrl);
        Assert.Contains("gemini-3.1-flash-lite", requestedUrl);
    }

    [Fact]
    public async Task GeminiAiClient_LiveGeminiApiCall_WhenLocalKeyExists()
    {
        var localSettingsPath = Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "..", "..", "appsettings.Local.json");
        if (!File.Exists(localSettingsPath))
        {
            localSettingsPath = Path.Combine(Directory.GetCurrentDirectory(), "appsettings.Local.json");
        }

        if (!File.Exists(localSettingsPath))
        {
            return;
        }

        var config = new ConfigurationBuilder()
            .AddJsonFile(localSettingsPath, optional: true)
            .Build();

        var key = config["AI:ApiKey"] ?? config["Gemini:ApiKey"];
        if (string.IsNullOrWhiteSpace(key))
        {
            return;
        }

        var factory = new TestHttpClientFactory();
        var mockLogger = new Mock<ILogger<GeminiAiClient>>();

        var client = new GeminiAiClient(factory, config, mockLogger.Object);
        var response = await client.GenerateAsync(AiRequest.CreateJson(
            "You are a helpful Japanese assistant.",
            "Say hello in Japanese and translate to Vietnamese. Return pure JSON {\"helloJa\": \"...\", \"helloVi\": \"...\"}"));

        Assert.True(response.IsSuccess, $"Live Gemini call failed: {response.ErrorMessage} (Status: {response.StatusCode})");
        Assert.False(string.IsNullOrWhiteSpace(response.Content));
        Assert.Contains("helloJa", response.Content);
    }

    private class TestHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, Task<HttpResponseMessage>> _handler;

        public TestHttpMessageHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> handler)
        {
            _handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return _handler(request);
        }
    }

    [Fact]
    public void EnsureNoFilesHaveUtf8Bom()
    {
        var projectDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
        var targetFiles = new[]
        {
            "Controllers/AdminScenarioController.cs",
            "Program.cs",
            "Services/Implementations/AdminShadowingService.cs",
            "Services/Implementations/ScenarioService.cs",
            "appsettings.json",
            "Services/Implementations/AiClientResolver.cs",
            "Services/Implementations/AiRoleplayService.cs",
            "Services/Implementations/GeminiAiClient.cs",
            "Services/Implementations/OpenAiCompatibleAiClient.cs",
            "Services/Interfaces/IAiClient.cs",
            "Services/Models/AiConfigurationOptions.cs",
            "Services/Models/AiModels.cs"
        };

        foreach (var relPath in targetFiles)
        {
            var fullPath = Path.Combine(projectDir, relPath);
            if (File.Exists(fullPath))
            {
                var bytes = File.ReadAllBytes(fullPath);
                bool hasBom = bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF;
                Assert.False(hasBom, $"File {relPath} has UTF-8 BOM, which violates project rules!");
            }
        }
    }

    private class TestHttpClientFactory : IHttpClientFactory
    {
        private static readonly HttpClient SharedClient = new();
        public HttpClient CreateClient(string name) => SharedClient;
    }
}

