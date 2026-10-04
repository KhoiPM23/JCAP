using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;

namespace JCAP.Tests.Services;

public class GeminiRoleplayServiceTests
{
    [Fact]
    public async Task ProcessTurnAsync_MarksFallbackFeedbackAsSimulatorWhenApiKeyIsMissing()
    {
        using var httpClient = new HttpClient();
        var configuration = new ConfigurationBuilder().Build();
        var service = new GeminiRoleplayService(
            httpClient,
            configuration,
            new Mock<ILogger<GeminiRoleplayService>>().Object);

        var result = await service.ProcessTurnAsync(
            new Scenario { Title = "Gọi món tại quán Ramen" },
            new ScenarioLevelConfiguration { JLPTLevel = "N5" },
            [],
            "ラーメンをください。",
            []);

        Assert.NotNull(result.LinguisticFeedback);
        Assert.Equal("Simulator", result.LinguisticFeedback.EvaluationSource);
    }
}
