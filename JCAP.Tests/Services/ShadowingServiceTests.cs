using JCAP.Data;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace JCAP.Tests.Services;

public class ShadowingServiceTests
{
    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: $"JCAP_ShadowingService_Test_{Guid.NewGuid()}")
            .Options;

        return new AppDbContext(options);
    }

    private static async Task SeedTestDataAsync(AppDbContext context)
    {
        var activeScenario = new Scenario
        {
            Id = 1,
            Title = "Giao tiếp tại Tokyo",
            ScenarioCode = "TOKYO_01",
            IsActive = true
        };

        var inactiveScenario = new Scenario
        {
            Id = 2,
            Title = "Kịch bản đã ẩn",
            ScenarioCode = "INACTIVE_01",
            IsActive = false
        };

        var d1 = new ShadowingDialogue
        {
            Id = 10,
            ScenarioId = 1,
            Title = "Gọi món Ramen",
            JLPTLevel = "N5",
            SourceDescription = "Bài học Minna no Nihongo",
            SpeakerRoleA_Name = "Khách hàng",
            SpeakerRoleB_Name = "Nhân viên quán",
            IsActive = true,
            CreatedAt = DateTime.UtcNow.AddDays(-2),
            Sentences = new List<ShadowingSentence>
            {
                new() { Id = 101, OrderIndex = 2, SpeakerRole = "B", JapaneseText = "いらっしゃいませ！", VietnameseTranslation = "Xin chào quý khách!", NativeAudioUrl = "/audio/101.mp3" },
                new() { Id = 102, OrderIndex = 1, SpeakerRole = "A", JapaneseText = "すみません、ラーメンをください。", VietnameseTranslation = "Xin lỗi, cho tôi một bát ramen.", NativeAudioUrl = "/audio/102.mp3" }
            }
        };

        var d2 = new ShadowingDialogue
        {
            Id = 20,
            ScenarioId = 1,
            Title = "Hỏi đường đi ga Shinjuku",
            JLPTLevel = "N4",
            SourceDescription = "Hội thoại thực tế tại nhà ga",
            SpeakerRoleA_Name = "Người hỏi đường",
            SpeakerRoleB_Name = "Cảnh sát",
            IsActive = true,
            CreatedAt = DateTime.UtcNow.AddDays(-1),
            Sentences = new List<ShadowingSentence>
            {
                new() { Id = 201, OrderIndex = 1, SpeakerRole = "A", JapaneseText = "新宿駅はどこですか？", VietnameseTranslation = "Ga Shinjuku ở đâu?", NativeAudioUrl = "/audio/201.mp3" }
            }
        };

        var d3Hidden = new ShadowingDialogue
        {
            Id = 30,
            ScenarioId = 1,
            Title = "Bài học đã bị tắt",
            JLPTLevel = "N5",
            IsActive = false
        };

        var d4UnderInactiveScenario = new ShadowingDialogue
        {
            Id = 40,
            ScenarioId = 2,
            Title = "Bài học thuộc kịch bản tắt",
            JLPTLevel = "N5",
            IsActive = true
        };

        context.Scenarios.AddRange(activeScenario, inactiveScenario);
        context.ShadowingDialogues.AddRange(d1, d2, d3Hidden, d4UnderInactiveScenario);
        await context.SaveChangesAsync();
    }

    [Fact]
    public async Task GetLearnerCatalogAsync_ReturnsOnlyActiveDialoguesUnderActiveScenarios()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        await SeedTestDataAsync(context);
        var service = new ShadowingService(context);

        // Act
        var result = await service.GetLearnerCatalogAsync(null, null, null);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(2, result.Data.Count);
        Assert.Equal(20, result.Data[0].Id); // Ordered by Id descending
        Assert.Equal(10, result.Data[1].Id);
        Assert.Equal(2, result.Data[1].TotalSentences);
    }

    [Theory]
    [InlineData("Ramen", 1)]
    [InlineData("nhà ga", 1)]
    [InlineData("Tokyo", 2)]
    [InlineData("Không tồn tại", 0)]
    public async Task GetLearnerCatalogAsync_FiltersByKeyword(string keyword, int expectedCount)
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        await SeedTestDataAsync(context);
        var service = new ShadowingService(context);

        // Act
        var result = await service.GetLearnerCatalogAsync(keyword, null, null);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(expectedCount, result.Data.Count);
    }

    [Theory]
    [InlineData("N5", 1)]
    [InlineData("N4", 1)]
    [InlineData("ALL", 2)]
    [InlineData("", 2)]
    public async Task GetLearnerCatalogAsync_FiltersByJlptLevel(string jlptLevel, int expectedCount)
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        await SeedTestDataAsync(context);
        var service = new ShadowingService(context);

        // Act
        var result = await service.GetLearnerCatalogAsync(null, jlptLevel, null);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(expectedCount, result.Data.Count);
    }

    [Fact]
    public async Task GetLearnerDetailAsync_WithValidActiveId_ReturnsDialogueWithSentencesOrderedByIndex()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        await SeedTestDataAsync(context);
        var service = new ShadowingService(context);

        // Act
        var result = await service.GetLearnerDetailAsync(10);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(10, result.Data.Id);
        Assert.Equal("Gọi món Ramen", result.Data.Title);
        Assert.Equal(2, result.Data.Sentences.Count);
        // Verify sentence ordering by OrderIndex (1 then 2)
        Assert.Equal(1, result.Data.Sentences[0].OrderIndex);
        Assert.Equal("すみません、ラーメンをください。", result.Data.Sentences[0].JapaneseText);
        Assert.Equal(2, result.Data.Sentences[1].OrderIndex);
        Assert.Equal("いらっしゃいませ！", result.Data.Sentences[1].JapaneseText);
    }

    [Theory]
    [InlineData(30)] // Hidden dialogue
    [InlineData(40)] // Under inactive scenario
    [InlineData(999)] // Non-existent
    public async Task GetLearnerDetailAsync_WhenHiddenOrNotFound_ReturnsFailure(int id)
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        await SeedTestDataAsync(context);
        var service = new ShadowingService(context);

        // Act
        var result = await service.GetLearnerDetailAsync(id);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("Không tìm thấy bài học Shadowing", result.Message);
    }
}
