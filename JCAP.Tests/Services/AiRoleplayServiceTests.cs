using JCAP.DTOs.Roleplay;
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
    public async Task ProcessTurnAsync_ReturnsPreFlightGuardInstantly_WhenLearnerSpeaksVietnamese()
    {
        var mockAiClient = new Mock<IAiClient>();
        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5" },
            [],
            "Cho toi mot bat ramen",
            []);

        Assert.NotNull(result);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("PreFlightGuard", result.LinguisticFeedback.EvaluationSource);
        Assert.Equal("Error", result.LinguisticFeedback.Status);
        Assert.Contains("日本語", result.JapaneseReply);
        // Verify that LLM was NEVER called (0 tokens spent)
        mockAiClient.Verify(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ProcessTurnAsync_InjectsPersonaDirective_IntoSystemPrompt()
    {
        var mockAiClient = new Mock<IAiClient>();
        AiRequest? capturedRequest = null;
        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .Callback<AiRequest, CancellationToken>((req, _) => capturedRequest = req)
            .ReturnsAsync(AiResponse.Ok(@"{
                ""replyJapanese"": ""いらっしゃい！"",
                ""replyVietnamese"": ""Chào mừng!"",
                ""completedMissionIds"": [],
                ""isNaturallyConcluded"": false,
                ""linguisticFeedback"": { ""status"": ""Good"", ""summary"": ""Tốt"", ""details"": [] }
            }"));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        await service.ProcessTurnAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5" },
            [],
            "こんにちは。",
            [],
            personaDirective: "[MEM: affinity=30, visits=3, likes='shoyu_ramen']");

        Assert.NotNull(capturedRequest);
        Assert.Contains("[NPC MEMORY DIRECTIVE]", capturedRequest.SystemInstruction);
        Assert.Contains("shoyu_ramen", capturedRequest.SystemInstruction);
    }

    [Fact]
    public async Task ProcessTurnAsync_BareNoun_DowngradesGoodStatusToWarning_AndSanitizesFlattery()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(@"{
                ""replyJapanese"": ""はい、かしこまりました。"",
                ""replyVietnamese"": ""Dạ vâng tôi hiểu rồi."",
                ""completedMissionIds"": [],
                ""isNaturallyConcluded"": false,
                ""linguisticFeedback"": {
                    ""status"": ""Good"",
                    ""summary"": ""Phản xạ tự nhiên • Đúng ngữ cảnh"",
                    ""details"": [
                        { ""type"": ""success"", ""aspect"": ""Văn phong"", ""comment"": ""Sử dụng thể lịch sự chuẩn mực, thể hiện thái độ chu đáo và lễ phép."" },
                        { ""type"": ""success"", ""aspect"": ""Cấu trúc"", ""comment"": ""Cấu trúc câu gãy gọn rõ ràng."" }
                    ],
                    ""naturalAlternative"": ""甘さ""
                }
            }"));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Đặt cà phê tại Harajuku" },
            new ScenarioLevelConfiguration { JLPTLevel = "N4", AiPersona = "Barista" },
            [],
            "甘さ",
            []);

        Assert.NotNull(result);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.DoesNotContain("chuẩn mực", result.LinguisticFeedback.Details[0].Comment);
        Assert.NotEqual("甘さ", result.LinguisticFeedback.NaturalAlternative);
        Assert.Contains("甘さをお願いします。", result.LinguisticFeedback.NaturalAlternative);
    }

    [Fact]
    public async Task ProcessTurnAsync_SevenCharBareNoun_DowngradesGoodStatusToWarning()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(@"{
                ""replyJapanese"": ""はい、かしこまりました。"",
                ""replyVietnamese"": ""Dạ vâng tôi hiểu rồi."",
                ""completedMissionIds"": [],
                ""isNaturallyConcluded"": false,
                ""linguisticFeedback"": {
                    ""status"": ""Good"",
                    ""summary"": ""Phản xạ tự nhiên • Đúng ngữ cảnh"",
                    ""details"": [
                        { ""type"": ""success"", ""aspect"": ""Văn phong"", ""comment"": ""Sử dụng thể lịch sự chuẩn mực, thể hiện thái độ chu đáo và lễ phép."" }
                    ],
                    ""naturalAlternative"": ""ホットコーヒー""
                }
            }"));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Đặt cà phê tại Harajuku" },
            new ScenarioLevelConfiguration { JLPTLevel = "N4", AiPersona = "Barista" },
            [],
            "ホットコーヒー",
            []);

        Assert.NotNull(result);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Contains("ホットコーヒーをお願いします。", result.LinguisticFeedback.NaturalAlternative);
    }

    [Fact]
    public async Task GenerateOpeningMessageAsync_UsesCircadianGreetingDirectly()
    {
        var mockAiClient = new Mock<IAiClient>();
        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var result = await service.GenerateOpeningMessageAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5" },
            circadianGreeting: "こんばんは！今日もお疲れ様でした。夜の練習も頑張りましょう！");

        Assert.NotNull(result);
        Assert.Equal("こんばんは！今日もお疲れ様でした。夜の練習も頑張りましょう！", result.JapaneseText);
        Assert.NotNull(result.FuriganaHtml);
        Assert.Contains("<ruby>", result.FuriganaHtml);
        // AI client not invoked when circadian greeting is ready
        mockAiClient.Verify(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()), Times.Never);
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

        if (!response.IsSuccess && (response.ErrorMessage?.Contains("No such host is known") == true || response.ErrorMessage?.Contains("Lỗi kết nối") == true))
        {
            // Môi trường sandbox offline / không có kết nối internet ra ngoài
            return;
        }

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

    [Fact]
    public async Task ProcessTurnAsync_DistortedWord_TriggersClarificationProtocol_AndClearsCompletedMissions()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(@"{
                ""replyJapanese"": ""濃厚な豚骨ラーメンですね。かしこまりました。"",
                ""replyVietnamese"": ""Quý khách gọi mì Tonkotsu vị đậm đà phải không ạ? Tôi đã rõ rồi."",
                ""completedMissionIds"": [2],
                ""isNaturallyConcluded"": false,
                ""linguisticFeedback"": {
                    ""status"": ""Good"",
                    ""summary"": ""Phản xạ tự nhiên"",
                    ""details"": []
                }
            }"));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var pendingMissions = new List<Mission>
        {
            new() { Id = 2, Content = "Gọi bát mì Tonkotsu", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" },
            new List<RoleplayMessage>(),
            "つらめのお願いします",
            pendingMissions);

        Assert.NotNull(result);
        Assert.Contains("濃いめ", result.JapaneseReply);
        Assert.Contains("辛め", result.JapaneseReply);
        Assert.Empty(result.CompletedMissionIds); // Strictly cleared
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Equal("濃いめでお願いします。", result.LinguisticFeedback.NaturalAlternative);
    }

    [Fact]
    public async Task ProcessTurnAsync_PrematureOrdering_WhenAskedPartySize_SteersBackToPartySize()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(@"{
                ""replyJapanese"": ""とんこつラーメンですね！かしこまりました。"",
                ""replyVietnamese"": ""Dạ vâng mì Tonkotsu ạ."",
                ""completedMissionIds"": [1],
                ""isNaturallyConcluded"": false,
                ""linguisticFeedback"": {
                    ""status"": ""Good"",
                    ""summary"": ""Rất tốt"",
                    ""details"": []
                }
            }"));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "いらっしゃいませ！何名様ですか？" }
        };

        var pendingMissions = new List<Mission>
        {
            new() { Id = 1, Content = "Chào hỏi và nói số lượng người", CompletionCriteriaJson = "{}" },
            new() { Id = 2, Content = "Gọi món ramen", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" },
            history,
            "ラーメンをお願いします。",
            pendingMissions);

        Assert.NotNull(result);
        Assert.Contains("何名様", result.JapaneseReply);
        Assert.Contains("先にお席へご案内", result.JapaneseReply);
        Assert.Empty(result.CompletedMissionIds); // Did NOT falsely complete mission
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Equal("1人です。", result.LinguisticFeedback.NaturalAlternative);
    }

    [Fact]
    public async Task ProcessTurnAsync_RudeLanguage_TriggersRegisterShockAndCorrectiveFeedback()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(@"{
                ""replyJapanese"": ""はい、お待ちください。"",
                ""replyVietnamese"": ""Vâng"",
                ""completedMissionIds"": [1],
                ""isNaturallyConcluded"": false,
                ""linguisticFeedback"": { ""status"": ""Good"", ""summary"": ""Tốt"", ""details"": [] }
            }"));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var pendingMissions = new List<Mission>
        {
            new() { Id = 1, Content = "Gọi món ramen", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" },
            new List<RoleplayMessage>(),
            "おい、お前ラーメン持ってこい！",
            pendingMissions);

        Assert.NotNull(result);
        Assert.Contains("丁寧", result.JapaneseReply);
        Assert.Empty(result.CompletedMissionIds);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Contains("Văn phong", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task ProcessTurnAsync_OffTopicEvasion_PolitelyRedirectsAndClearsMissions()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(@"{
                ""replyJapanese"": ""猫は可愛いですね。"",
                ""replyVietnamese"": ""Mèo dễ thương nhỉ"",
                ""completedMissionIds"": [1],
                ""isNaturallyConcluded"": false,
                ""linguisticFeedback"": { ""status"": ""Good"", ""summary"": ""Tốt"", ""details"": [] }
            }"));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var pendingMissions = new List<Mission>
        {
            new() { Id = 1, Content = "Gọi món ramen", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" },
            new List<RoleplayMessage>(),
            "私はアニメと猫が好きです。",
            pendingMissions);

        Assert.NotNull(result);
        Assert.Contains("ご注文", result.JapaneseReply);
        Assert.Empty(result.CompletedMissionIds);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Contains("Lệch trọng tâm", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task ProcessTurnAsync_ParrotingAiPrompt_GentlyPromptsAndClearsMissions()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(@"{
                ""replyJapanese"": ""いらっしゃいませ！何名様ですか？"",
                ""replyVietnamese"": ""Chào quý khách"",
                ""completedMissionIds"": [1],
                ""isNaturallyConcluded"": false,
                ""linguisticFeedback"": { ""status"": ""Good"", ""summary"": ""Tốt"", ""details"": [] }
            }"));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "いらっしゃいませ！何名様ですか？" }
        };

        var pendingMissions = new List<Mission>
        {
            new() { Id = 1, Content = "Báo số lượng người", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" },
            history,
            "いらっしゃいませ！何名様ですか？",
            pendingMissions);

        Assert.NotNull(result);
        Assert.Contains("繰り返して", result.JapaneseReply);
        Assert.Empty(result.CompletedMissionIds);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Contains("Lặp lại", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task ProcessTurnAsync_GibberishOrNoise_RequestsClarificationAndClearsMissions()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(@"{
                ""replyJapanese"": ""はい、どうぞ。"",
                ""replyVietnamese"": ""Vâng"",
                ""completedMissionIds"": [1],
                ""isNaturallyConcluded"": false,
                ""linguisticFeedback"": { ""status"": ""Good"", ""summary"": ""Tốt"", ""details"": [] }
            }"));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var pendingMissions = new List<Mission>
        {
            new() { Id = 1, Content = "Gọi món ramen", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" },
            new List<RoleplayMessage>(),
            "あああああああああ",
            pendingMissions);

        Assert.NotNull(result);
        Assert.Contains("聞き取りにくかった", result.JapaneseReply);
        Assert.Empty(result.CompletedMissionIds);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Contains("chưa rõ ràng", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task ProcessTurnAsync_AntiEgoKeigo_TriggersSelfElevationWarningAndCorrects()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(@"{
                ""replyJapanese"": ""はい、どうぞ。"",
                ""replyVietnamese"": ""Vâng"",
                ""completedMissionIds"": [1],
                ""isNaturallyConcluded"": false,
                ""linguisticFeedback"": { ""status"": ""Good"", ""summary"": ""Tốt"", ""details"": [] }
            }"));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" },
            new List<RoleplayMessage>(),
            "私が召し上がります。",
            new List<Mission> { new() { Id = 1, Content = "Ăn mì", CompletionCriteriaJson = "{}" } });

        Assert.NotNull(result);
        Assert.Contains("尊敬語", result.JapaneseReply);
        Assert.Empty(result.CompletedMissionIds);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Contains("Tôn kính ngữ", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task ProcessTurnAsync_PrematureAbruptGoodbye_PreventsEndingAndPromptsContinuation()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(@"{
                ""replyJapanese"": ""さようなら"",
                ""replyVietnamese"": ""Tạm biệt"",
                ""completedMissionIds"": [1, 2],
                ""isNaturallyConcluded"": true,
                ""linguisticFeedback"": { ""status"": ""Good"", ""summary"": ""Tốt"", ""details"": [] }
            }"));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var pendingMissions = new List<Mission>
        {
            new() { Id = 1, Content = "Chào hỏi và nói số người", CompletionCriteriaJson = "{}" },
            new() { Id = 2, Content = "Gọi mì tonkotsu vị đậm đà", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" },
            new List<RoleplayMessage>(),
            "さようなら。",
            pendingMissions);

        Assert.NotNull(result);
        Assert.Contains("もうお帰りですか", result.JapaneseReply);
        Assert.Empty(result.CompletedMissionIds);
        Assert.False(result.IsNaturallyConcluded);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
    }

    [Fact]
    public async Task ProcessTurnAsync_VagueRamenOrder_ClarifiesFlavorAndDoesNotClearMission()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(@"{
                ""replyJapanese"": ""濃厚な豚骨ラーメンですね。"",
                ""replyVietnamese"": ""Vâng mì đậm đà"",
                ""completedMissionIds"": [2],
                ""isNaturallyConcluded"": false,
                ""linguisticFeedback"": { ""status"": ""Good"", ""summary"": ""Tốt"", ""details"": [] }
            }"));

        var service = new AiRoleplayService(
            mockAiClient.Object,
            new Mock<ILogger<AiRoleplayService>>().Object);

        var pendingMissions = new List<Mission>
        {
            new() { Id = 2, Content = "Gọi mì Tonkotsu vị đậm đà", CompletionCriteriaJson = """{"keywords": ["濃いめ"]}""" }
        };

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" },
            new List<RoleplayMessage>(),
            "ラーメンをください。",
            pendingMissions);

        Assert.NotNull(result);
        Assert.Contains("お味はいかがなさいますか", result.JapaneseReply);
        Assert.Empty(result.CompletedMissionIds);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Contains("chưa rõ", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public void EnrichScaffolding_CleansKeywords_NeverGeneratesClippedEndings()
    {
        var hint = new RoleplayHintDto
        {
            JapaneseSuggestion = "すみません、これはいくらですか？"
        };

        var enriched = RoleplaySocialRegister.EnrichScaffolding(hint);

        Assert.NotNull(enriched);
        Assert.NotNull(enriched.Keywords);
        // Bảo đảm từ khóa KHÔNG bao giờ bị dính "いくらです"
        Assert.DoesNotContain("いくらです", enriched.Keywords);
        Assert.Contains("いくら", enriched.Keywords);
        // Bảo đảm cloze KHÔNG BAO GIỜ bị cụt thành "[ ______ ] か。"
        Assert.NotNull(enriched.ClozeSentence);
        Assert.DoesNotContain("[ ______ ] か", enriched.ClozeSentence);
        Assert.Contains("これは [ ______ ] ですか", enriched.ClozeSentence);
    }

    [Fact]
    public async Task ProcessTurnAsync_RomajiInput_WarnsAndPromptsForKanaKanji()
    {
        var mockAiClient = new Mock<IAiClient>();
        var service = new AiRoleplayService(mockAiClient.Object, new Mock<ILogger<AiRoleplayService>>().Object);
        var scenario = new Scenario { Title = "Mua hàng tại siêu thị" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Thu ngân siêu thị" };
        var history = new List<RoleplayMessage>();
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Hỏi giá tiền", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "kore wa ikura desu ka", missions);

        Assert.NotNull(result);
        Assert.Empty(result.CompletedMissionIds);
        Assert.Contains("ローマ字", result.JapaneseReply);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Contains("Romaji", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task ProcessTurnAsync_TrailingParticleFragment_PromptsForCompletionAndClearsMissions()
    {
        var mockAiClient = new Mock<IAiClient>();
        var service = new AiRoleplayService(mockAiClient.Object, new Mock<ILogger<AiRoleplayService>>().Object);
        var scenario = new Scenario { Title = "Gọi món tại quán Ramen" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "いらっしゃいませ！何名様ですか？" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Gọi bát mì Tonkotsu", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "すみません、ラーメンを…", missions);

        Assert.NotNull(result);
        Assert.Empty(result.CompletedMissionIds);
        Assert.Contains("どうなさいますか", result.JapaneseReply);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Contains("chưa hoàn chỉnh", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task ProcessTurnAsync_ParadoxicalRequest_RequestsClarificationAndClearsMissions()
    {
        var mockAiClient = new Mock<IAiClient>();
        var service = new AiRoleplayService(mockAiClient.Object, new Mock<ILogger<AiRoleplayService>>().Object);
        var scenario = new Scenario { Title = "Gọi đồ uống tại Cafe" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Barista quán cafe" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "お飲み物は何になさいますか？" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Gọi đồ uống", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "熱いアイスコーヒーをお願いします。", missions);

        Assert.NotNull(result);
        Assert.Empty(result.CompletedMissionIds);
        Assert.Contains("ホット", result.JapaneseReply);
        Assert.Contains("アイス", result.JapaneseReply);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Contains("mâu thuẫn", result.LinguisticFeedback.Summary);
    }
    [Fact]
    public async Task ProcessTurnAsync_AmbiguousDemonstrativeOrCounter_RequestsClarificationAndClearsMissions()
    {
        var mockAiClient = new Mock<IAiClient>();
        var service = new AiRoleplayService(mockAiClient.Object, new Mock<ILogger<AiRoleplayService>>().Object);
        var scenario = new Scenario { Title = "Gọi món tại quán mì Ramen" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "いらっしゃいませ！ご注文をお伺いします。" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Gọi 1 bát Tonkotsu Ramen", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "ひとつお願いします。", missions);

        Assert.NotNull(result);
        Assert.Empty(result.CompletedMissionIds);
        Assert.Contains("料理", result.JapaneseReply);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Contains("Yêu cầu chưa cụ thể", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task ProcessTurnAsync_OffMenuFoodOrder_RejectsPolitelyAndClearsMissions()
    {
        var mockAiClient = new Mock<IAiClient>();
        var service = new AiRoleplayService(mockAiClient.Object, new Mock<ILogger<AiRoleplayService>>().Object);
        var scenario = new Scenario { Title = "Gọi món tại quán mì Ramen" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "いらっしゃいませ！何名様ですか？" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Gọi 1 bát Tonkotsu Ramen", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "ピザをお願いします。", missions);

        Assert.NotNull(result);
        Assert.Empty(result.CompletedMissionIds);
        Assert.Contains("ラーメン", result.JapaneseReply);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Contains("thực đơn", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task ProcessTurnAsync_CounterInquiryWhenAskedPartySize_ClarifiesRecommendationAndPromptsForPartySize()
    {
        var mockAiClient = new Mock<IAiClient>();
        var service = new AiRoleplayService(mockAiClient.Object, new Mock<ILogger<AiRoleplayService>>().Object);
        var scenario = new Scenario { Title = "Gọi món tại quán mì Ramen" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "いらっしゃいませ！何名様ですか？" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Báo số lượng người", CompletionCriteriaJson = "{\"count\": 1}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "おすすめは何ですか？", missions);

        Assert.NotNull(result);
        Assert.Empty(result.CompletedMissionIds);
        Assert.Contains("何名様", result.JapaneseReply);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Contains("số lượng người", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task ProcessTurnAsync_PassiveAgreementOnParametricQuery_PromptsForSpecificChoice()
    {
        var mockAiClient = new Mock<IAiClient>();
        var service = new AiRoleplayService(mockAiClient.Object, new Mock<ILogger<AiRoleplayService>>().Object);
        var scenario = new Scenario { Title = "Gọi món tại quán mì Ramen" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "いらっしゃいませ！何名様ですか？" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Báo số lượng người", CompletionCriteriaJson = "{\"count\": 1}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "はい。", missions);

        Assert.NotNull(result);
        Assert.Empty(result.CompletedMissionIds);
        Assert.Contains("何名様", result.JapaneseReply);
        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Warning", result.LinguisticFeedback.Status);
        Assert.Contains("lựa chọn", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task ProcessTurnAsync_ValidDishWithHitotsu_DoesNotTriggerGuard4AmbiguousDemonstrative()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient.Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok("{\"userVietnameseMeaning\":\"Cho tôi một bát mì ramen tonkotsu\",\"replyJapanese\":\"かしこまりました！豚骨ラーメン一杯ですね。\",\"replyVietnamese\":\"Dạ vâng, một bát ramen tonkotsu ạ.\",\"completedMissionIds\":[1],\"isNaturallyConcluded\":false,\"linguisticFeedback\":{\"status\":\"Good\",\"summary\":\"Rất tốt • Đầy đủ ngữ nghĩa\",\"details\":[]}}"));

        var service = new AiRoleplayService(mockAiClient.Object, new Mock<ILogger<AiRoleplayService>>().Object);
        var scenario = new Scenario { Title = "Gọi món tại quán mì Ramen" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "いらっしゃいませ！カウンター席へどうぞ。ご注文はお決まりですか？" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Gọi 1 bát Tonkotsu Ramen", CompletionCriteriaJson = "{\"item\":\"tonkotsu\"}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "豚骨ラーメンをひとつお願いします。", missions);

        Assert.NotNull(result);
        // It must NOT be rejected by Guardrail (Guard 4)
        Assert.NotEqual("Guardrail", result.LinguisticFeedback.EvaluationSource);
        Assert.DoesNotContain("どの料理をひとつご希望でしょうか", result.JapaneseReply);
        Assert.Contains(1, result.CompletedMissionIds);
    }

    [Fact]
    public async Task ProcessTurnAsync_BareKoreOnegaiShimasu_TriggersGuard4AmbiguousDemonstrative()
    {
        var mockAiClient = new Mock<IAiClient>();
        var service = new AiRoleplayService(mockAiClient.Object, new Mock<ILogger<AiRoleplayService>>().Object);
        var scenario = new Scenario { Title = "Gọi món tại quán mì Ramen" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "いらっしゃいませ！ご注文はお決まりですか？" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Gọi món", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "これをお願いします。", missions);

        Assert.NotNull(result);
        Assert.Equal("Guardrail", result.LinguisticFeedback.EvaluationSource);
        Assert.Contains("どの料理をひとつご希望でしょうか", result.JapaneseReply);
        Assert.Empty(result.CompletedMissionIds);
    }

    [Fact]
    public async Task ProcessTurnAsync_CafeScenario_RejectsRamenOrderWithCafeGuard()
    {
        var mockAiClient = new Mock<IAiClient>();
        var service = new AiRoleplayService(mockAiClient.Object, new Mock<ILogger<AiRoleplayService>>().Object);
        var scenario = new Scenario { Title = "Gọi cà phê tại quán Cafe Shibuya" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N4", AiPersona = "Nhân viên quán Cafe" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "いらっしゃいませ！何にいたしますか？" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Gọi đồ uống", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "ラーメンをお願いします。", missions);

        Assert.NotNull(result);
        Assert.Equal("Guardrail", result.LinguisticFeedback.EvaluationSource);
        Assert.Contains("当店はカフェでございますので", result.JapaneseReply);
        Assert.Contains("thực đơn quán cà phê", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task ProcessTurnAsync_ClinicScenario_RejectsFoodOrderWithMedicalGuard()
    {
        var mockAiClient = new Mock<IAiClient>();
        var service = new AiRoleplayService(mockAiClient.Object, new Mock<ILogger<AiRoleplayService>>().Object);
        var scenario = new Scenario { Title = "Khám bệnh tại phòng khám đa khoa Shinjuku" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N3", AiPersona = "Bác sĩ phòng khám" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "こんにちは。本日はどうされましたか？" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Trình bày triệu chứng", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "ピザをお願いします。", missions);

        Assert.NotNull(result);
        Assert.Equal("Guardrail", result.LinguisticFeedback.EvaluationSource);
        Assert.Contains("医療機関でございますので", result.JapaneseReply);
        Assert.Contains("cơ sở y tế", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task ProcessTurnAsync_JapaneseWithTildePlaceholder_WhenLlmErroneouslyRefusesAsForeign_RecoversViaSimulator()
    {
        var mockAiClient = new Mock<IAiClient>();
        mockAiClient.Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok("{\"isForeignLanguage\":true,\"userVietnameseMeaning\":\"Không hợp lệ\",\"replyJapanese\":\"恐れ入りますが、日本語が分かりませんので、日本語でお話しいただけますでしょうか。\",\"replyVietnamese\":\"Xin lỗi, tôi không hiểu tiếng nước ngoài.\",\"completedMissionIds\":[],\"isNaturallyConcluded\":false,\"linguisticFeedback\":{\"status\":\"NeedsImprovement\",\"summary\":\"Cần sửa\",\"details\":[]}}"));

        var service = new AiRoleplayService(mockAiClient.Object, new Mock<ILogger<AiRoleplayService>>().Object);
        var scenario = new Scenario { Title = "Gọi món tại quán mì Ramen" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "いらっしゃいませ！ラーメンはいかがですか？" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Gọi 1 bát Tonkotsu Ramen", CompletionCriteriaJson = "{\"item\":\"tonkotsu\"}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "豚骨ラーメン ～をお願いしますでお願いします。", missions);

        Assert.NotNull(result);
        Assert.DoesNotContain("日本語が分かりませんので", result.JapaneseReply);
        Assert.DoesNotContain("外国語は分かりませんので", result.JapaneseReply);
        Assert.DoesNotContain("日本語でお話し", result.JapaneseReply);
        Assert.Contains(1, result.CompletedMissionIds);
    }

    [Fact]
    public async Task ProcessTurnAsync_PureVietnameseInput_UsesGrammaticallyCorrectForeignRefusal()
    {
        var mockAiClient = new Mock<IAiClient>();
        var service = new AiRoleplayService(mockAiClient.Object, new Mock<ILogger<AiRoleplayService>>().Object);
        var scenario = new Scenario { Title = "Gọi món tại quán mì Ramen" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên quán mì" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "いらっしゃいませ！ラーメンはいかがですか？" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Gọi 1 bát Tonkotsu Ramen", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "Cho tôi một bát mì", missions);

        Assert.NotNull(result);
        Assert.Contains("外国語は分かりませんので", result.JapaneseReply);
        Assert.DoesNotContain("日本語が分かりませんので", result.JapaneseReply);
    }
}
