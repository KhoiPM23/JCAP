using System.Net.Http;
using JCAP.Data;
using JCAP.DTOs.Shadowing.Admin;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace JCAP.Tests.Services;

public class AdminShadowingServiceTests
{
    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: $"JCAP_AdminShadowing_Test_{Guid.NewGuid()}")
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;

        return new AppDbContext(options);
    }

    private static AdminShadowingService CreateService(
        AppDbContext context,
        IAiClient? aiClient = null)
    {
        var loggerMock = new Mock<ILogger<AdminShadowingService>>();
        var configMock = new Mock<IConfiguration>();
        var httpClientFactoryMock = new Mock<IHttpClientFactory>();
        var envMock = new Mock<IWebHostEnvironment>();
        return new AdminShadowingService(
            context,
            loggerMock.Object,
            configMock.Object,
            httpClientFactoryMock.Object,
            envMock.Object,
            aiClient);
    }

    [Fact]
    public async Task GetAdminCatalogAsync_ReturnsAllDialoguesIncludingInactive()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var scenario = new Scenario { Id = 1, Title = "Scenario 1", ScenarioCode = "SCN_01" };
        context.Scenarios.Add(scenario);
        context.ShadowingDialogues.AddRange(
            new ShadowingDialogue { Id = 1, ScenarioId = 1, Title = "Active Lesson", IsActive = true, JLPTLevel = "N5" },
            new ShadowingDialogue { Id = 2, ScenarioId = 1, Title = "Inactive Lesson", IsActive = false, JLPTLevel = "N4" }
        );
        await context.SaveChangesAsync();

        var service = CreateService(context);

        // Act
        var result = await service.GetAdminCatalogAsync();

        // Assert
        Assert.True(result.Success);
        Assert.Equal(2, result.Data!.Count);
        Assert.Equal(2, result.Data[0].Id); // Ordered by Id descending
        Assert.Equal(1, result.Data[1].Id);
    }

    [Fact]
    public async Task GetAdminDetailAsync_WithInactiveDialogue_ReturnsDetailSuccessfully()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var scenario = new Scenario { Id = 1, Title = "Scenario 1", ScenarioCode = "SCN_01" };
        var dialogue = new ShadowingDialogue
        {
            Id = 5,
            ScenarioId = 1,
            Title = "Hidden Dialogue",
            IsActive = false,
            JLPTLevel = "N3",
            Sentences = new List<ShadowingSentence>
            {
                new() { Id = 51, OrderIndex = 1, SpeakerRole = "A", JapaneseText = "こんにちは", VietnameseTranslation = "Xin chào", NativeAudioUrl = "/audio/51.mp3" }
            }
        };
        context.Scenarios.Add(scenario);
        context.ShadowingDialogues.Add(dialogue);
        await context.SaveChangesAsync();

        var service = CreateService(context);

        // Act
        var result = await service.GetAdminDetailAsync(5);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal("Hidden Dialogue", result.Data.Title);
        Assert.False(result.Data.IsActive);
        Assert.Single(result.Data.Sentences);
    }

    [Fact]
    public async Task GetAdminDetailAsync_WithNonExistentId_ReturnsFailure()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var service = CreateService(context);

        // Act
        var result = await service.GetAdminDetailAsync(999);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("Không tìm thấy bài học", result.Message);
    }

    [Fact]
    public async Task CreateDialogueAsync_WhenScenarioDoesNotExist_ReturnsFailure()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var service = CreateService(context);

        var dto = new CreateShadowingDialogueDto
        {
            ScenarioId = 999, // Non-existent
            Title = "New Lesson",
            JLPTLevel = "N5",
            SpeakerRoleA_Name = "Role A",
            SpeakerRoleB_Name = "Role B",
            Sentences = new List<CreateShadowingSentenceDto>
            {
                new() { OrderIndex = 1, SpeakerRole = "A", JapaneseText = "テスト", VietnameseTranslation = "Test", NativeAudioUrl = "/audio/test.mp3" }
            }
        };

        // Act
        var result = await service.CreateDialogueAsync(dto);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("không tồn tại trong hệ thống", result.Message);
    }

    [Fact]
    public async Task CreateDialogueAsync_WithValidDto_CreatesDialogueAndSentences()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        context.Scenarios.Add(new Scenario { Id = 1, Title = "Scenario 1", ScenarioCode = "SCN_01" });
        await context.SaveChangesAsync();

        var service = CreateService(context);

        var dto = new CreateShadowingDialogueDto
        {
            ScenarioId = 1,
            Title = "  Bài học mới  ",
            JLPTLevel = "n5",
            SourceDescription = " Nguồn sách ",
            SpeakerRoleA_Name = " Vai A ",
            SpeakerRoleB_Name = " Vai B ",
            Sentences = new List<CreateShadowingSentenceDto>
            {
                new() { OrderIndex = 2, SpeakerRole = "B", JapaneseText = "B text", VietnameseTranslation = "B dich", NativeAudioUrl = "/b.mp3" },
                new() { OrderIndex = 1, SpeakerRole = "A", JapaneseText = "A text", VietnameseTranslation = "A dich", NativeAudioUrl = "/a.mp3" }
            }
        };

        // Act
        var result = await service.CreateDialogueAsync(dto);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal("Bài học mới", result.Data.Title);
        Assert.Equal("N5", result.Data.JLPTLevel);
        Assert.Equal("Vai A", result.Data.SpeakerRoleA_Name);
        Assert.Equal("Vai B", result.Data.SpeakerRoleB_Name);
        Assert.True(result.Data.IsActive);
        Assert.Equal(2, result.Data.Sentences.Count);

        // OrderIndex auto-indexed starting from 1
        Assert.Equal(1, result.Data.Sentences[0].OrderIndex);
        Assert.Equal("A text", result.Data.Sentences[0].JapaneseText);
        Assert.Equal(2, result.Data.Sentences[1].OrderIndex);
        Assert.Equal("B text", result.Data.Sentences[1].JapaneseText);
    }

    [Fact]
    public async Task UpdateDialogueAsync_WhenDialogueNotFound_ReturnsFailure()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var service = CreateService(context);

        var dto = new UpdateShadowingDialogueDto
        {
            Title = "Updated Title",
            JLPTLevel = "N4",
            SpeakerRoleA_Name = "A",
            SpeakerRoleB_Name = "B",
            IsActive = true
        };

        // Act
        var result = await service.UpdateDialogueAsync(999, dto);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("Không tìm thấy bài học", result.Message);
    }

    [Fact]
    public async Task UpdateDialogueAsync_WithValidDto_UpdatesFieldsAndReplacesSentences()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var scenario = new Scenario { Id = 1, Title = "Scenario 1", ScenarioCode = "SCN_01" };
        var dialogue = new ShadowingDialogue
        {
            Id = 10,
            ScenarioId = 1,
            Title = "Old Title",
            JLPTLevel = "N5",
            SpeakerRoleA_Name = "Old A",
            SpeakerRoleB_Name = "Old B",
            IsActive = true,
            Sentences = new List<ShadowingSentence>
            {
                new() { Id = 101, OrderIndex = 1, SpeakerRole = "A", JapaneseText = "Old sentence", VietnameseTranslation = "Old", NativeAudioUrl = "/old.mp3" }
            }
        };
        context.Scenarios.Add(scenario);
        context.ShadowingDialogues.Add(dialogue);
        await context.SaveChangesAsync();

        var service = CreateService(context);

        var updateDto = new UpdateShadowingDialogueDto
        {
            Title = "New Title",
            JLPTLevel = "N4",
            SourceDescription = "Updated Source",
            SpeakerRoleA_Name = "New A",
            SpeakerRoleB_Name = "New B",
            IsActive = false,
            Sentences = new List<CreateShadowingSentenceDto>
            {
                new() { OrderIndex = 1, SpeakerRole = "B", JapaneseText = "New replacement sentence", VietnameseTranslation = "New", NativeAudioUrl = "/new.mp3" }
            }
        };

        // Act
        var result = await service.UpdateDialogueAsync(10, updateDto);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal("New Title", result.Data.Title);
        Assert.Equal("N4", result.Data.JLPTLevel);
        Assert.False(result.Data.IsActive);
        Assert.Single(result.Data.Sentences);
        Assert.Equal("New replacement sentence", result.Data.Sentences[0].JapaneseText);

        // Verify old sentence was removed from DB
        var oldSentence = await context.ShadowingSentences.FindAsync(101);
        Assert.Null(oldSentence);
    }

    [Fact]
    public async Task SoftDeleteDialogueAsync_WhenNotFound_ReturnsFailure()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var service = CreateService(context);

        // Act
        var result = await service.SoftDeleteDialogueAsync(999);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("Không tìm thấy bài học", result.Message);
    }

    [Fact]
    public async Task SoftDeleteDialogueAsync_WithValidId_SetsIsActiveToFalse()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var dialogue = new ShadowingDialogue
        {
            Id = 20,
            ScenarioId = 1,
            Title = "Dialogue to Delete",
            IsActive = true,
            JLPTLevel = "N5"
        };
        context.ShadowingDialogues.Add(dialogue);
        await context.SaveChangesAsync();

        var service = CreateService(context);

        // Act
        var result = await service.SoftDeleteDialogueAsync(20);

        // Assert
        Assert.True(result.Success);
        Assert.True(result.Data);

        var persisted = await context.ShadowingDialogues.FindAsync(20);
        Assert.NotNull(persisted);
        Assert.False(persisted.IsActive); // Soft deleted
    }

    [Fact]
    public void NormalizeSpeakerRole_PreservesSingleLetterAndPrefixes()
    {
        var roles = new List<string> { "Khách hàng", "Nhân viên", "Quản lý" };

        Assert.Equal("A", AdminShadowingService.NormalizeSpeakerRole("A", roles));
        Assert.Equal("B", AdminShadowingService.NormalizeSpeakerRole("B", roles));
        Assert.Equal("C", AdminShadowingService.NormalizeSpeakerRole("C", roles));
        Assert.Equal("A", AdminShadowingService.NormalizeSpeakerRole("Vai A", roles));
        Assert.Equal("B", AdminShadowingService.NormalizeSpeakerRole("Role B", roles));
        Assert.Equal("C", AdminShadowingService.NormalizeSpeakerRole("Nhân vật C", roles));
        Assert.Equal("C", AdminShadowingService.NormalizeSpeakerRole("3", roles));
    }

    [Fact]
    public void NormalizeSpeakerRole_MatchesRoleNamesFromList()
    {
        var roles = new List<string> { "Khách hàng (Học viên)", "Nhân viên bán hàng", "Bếp trưởng" };

        Assert.Equal("A", AdminShadowingService.NormalizeSpeakerRole("Khách hàng (Học viên)", roles));
        Assert.Equal("B", AdminShadowingService.NormalizeSpeakerRole("Nhân viên bán hàng", roles));
        Assert.Equal("C", AdminShadowingService.NormalizeSpeakerRole("Bếp trưởng", roles));
        // Partial matching
        Assert.Equal("A", AdminShadowingService.NormalizeSpeakerRole("Khách hàng", roles));
        Assert.Equal("C", AdminShadowingService.NormalizeSpeakerRole("Bếp", roles));
    }

    [Fact]
    public async Task GenerateDialogueDraftAsync_WithAiClient_PreservesThreeRolesAndNonAlternatingSentences()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var mockAiClient = new Mock<IAiClient>();

        // AI returns 5 sentences with 3 roles: A, A (consecutive), B, C (3rd role), C (consecutive 3rd role)
        var sampleAiJson = @"{
          ""title"": ""Hội thoại ba người"",
          ""contextDescription"": ""Tại nhà hàng với 3 người"",
          ""sentences"": [
            { ""orderIndex"": 1, ""speakerRole"": ""A"", ""japaneseText"": ""こんにちは"", ""romajiText"": ""Konnichiwa"", ""vietnameseTranslation"": ""Xin chào"" },
            { ""orderIndex"": 2, ""speakerRole"": ""A"", ""japaneseText"": ""もう一つあります"", ""romajiText"": ""Mō hitotsu arimasu"", ""vietnameseTranslation"": ""Còn một việc nữa"" },
            { ""orderIndex"": 3, ""speakerRole"": ""B"", ""japaneseText"": ""はい、どうぞ"", ""romajiText"": ""Hai, dōzo"", ""vietnameseTranslation"": ""Vâng, xin mời"" },
            { ""orderIndex"": 4, ""speakerRole"": ""C"", ""japaneseText"": ""私も注文します"", ""romajiText"": ""Watashi mo chūmon shimasu"", ""vietnameseTranslation"": ""Tôi cũng gọi món"" },
            { ""orderIndex"": 5, ""speakerRole"": ""C"", ""japaneseText"": ""お願いします"", ""romajiText"": ""Onegai shimasu"", ""vietnameseTranslation"": ""Xin nhờ"" }
          ],
          ""targetVocabularies"": [],
          ""targetGrammars"": []
        }";

        mockAiClient
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(sampleAiJson));

        var service = CreateService(context, mockAiClient.Object);

        var request = new GenerateShadowingDialogueRequest
        {
            ContextTitle = "Hội thoại ba người",
            JLPTLevel = "N5",
            SpeakerRoles = new List<string> { "Khách 1", "Nhân viên", "Khách 2" },
            SentenceCount = 5
        };

        // Act
        var result = await service.GenerateDialogueDraftAsync(request);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(3, result.Data.SpeakerRoles.Count);
        Assert.Equal(5, result.Data.Sentences.Count);

        // Crucial: Sentences must retain exact roles A, A, B, C, C (not forced alternating between 2 roles!)
        Assert.Equal("A", result.Data.Sentences[0].SpeakerRole);
        Assert.Equal("A", result.Data.Sentences[1].SpeakerRole);
        Assert.Equal("B", result.Data.Sentences[2].SpeakerRole);
        Assert.Equal("C", result.Data.Sentences[3].SpeakerRole);
        Assert.Equal("C", result.Data.Sentences[4].SpeakerRole);
    }

    [Fact]
    public async Task CreateDialogueAsync_And_GetAdminDetailAsync_PreservesThreeRolesAndSentences()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var scenario = new Scenario { Id = 1, Title = "Scenario 1", ScenarioCode = "SCN_01" };
        context.Scenarios.Add(scenario);
        await context.SaveChangesAsync();

        var service = CreateService(context);

        var createDto = new CreateShadowingDialogueDto
        {
            ScenarioId = 1,
            Title = "Bài học 3 vai",
            JLPTLevel = "N4",
            SpeakerRoleA_Name = "Khách A",
            SpeakerRoleB_Name = "Nhân viên B",
            SpeakerRoles = new List<string> { "Khách A", "Nhân viên B", "Bếp trưởng C" },
            Sentences = new List<CreateShadowingSentenceDto>
            {
                new() { OrderIndex = 1, SpeakerRole = "A", JapaneseText = "A1", VietnameseTranslation = "A1" },
                new() { OrderIndex = 2, SpeakerRole = "A", JapaneseText = "A2", VietnameseTranslation = "A2" },
                new() { OrderIndex = 3, SpeakerRole = "B", JapaneseText = "B1", VietnameseTranslation = "B1" },
                new() { OrderIndex = 4, SpeakerRole = "C", JapaneseText = "C1", VietnameseTranslation = "C1" }
            }
        };

        // Act - Create
        var createResult = await service.CreateDialogueAsync(createDto);

        // Assert - Create
        Assert.True(createResult.Success);
        Assert.NotNull(createResult.Data);
        var dialogueId = createResult.Data.Id;
        Assert.Equal(3, createResult.Data.SpeakerRoles.Count);
        Assert.Equal("Bếp trưởng C", createResult.Data.SpeakerRoles[2]);

        // Act - Get Detail (Reloading from DB)
        var detailResult = await service.GetAdminDetailAsync(dialogueId);

        // Assert - Detail
        Assert.True(detailResult.Success);
        Assert.NotNull(detailResult.Data);
        Assert.Equal(3, detailResult.Data.SpeakerRoles.Count);
        Assert.Equal("Khách A", detailResult.Data.SpeakerRoles[0]);
        Assert.Equal("Nhân viên B", detailResult.Data.SpeakerRoles[1]);
        Assert.Equal("Bếp trưởng C", detailResult.Data.SpeakerRoles[2]);

        Assert.Equal(4, detailResult.Data.Sentences.Count);
        Assert.Equal("A", detailResult.Data.Sentences[0].SpeakerRole);
        Assert.Equal("A", detailResult.Data.Sentences[1].SpeakerRole);
        Assert.Equal("B", detailResult.Data.Sentences[2].SpeakerRole);
        Assert.Equal("C", detailResult.Data.Sentences[3].SpeakerRole);
    }

    [Fact]
    public async Task UpdateDialogueAsync_WhenSentenceRolesChangedManually_PersistsChangesAccurately()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var scenario = new Scenario { Id = 1, Title = "Scenario 1", ScenarioCode = "SCN_01" };
        var dialogue = new ShadowingDialogue
        {
            Id = 30,
            ScenarioId = 1,
            Title = "Original Dialogue",
            JLPTLevel = "N5",
            SpeakerRoleA_Name = "Vai A",
            SpeakerRoleB_Name = "Vai B",
            SpeakerRolesJson = "[\"Vai A\", \"Vai B\"]",
            IsActive = true,
            Sentences = new List<ShadowingSentence>
            {
                new() { Id = 301, OrderIndex = 1, SpeakerRole = "A", JapaneseText = "J1", VietnameseTranslation = "V1" },
                new() { Id = 302, OrderIndex = 2, SpeakerRole = "B", JapaneseText = "J2", VietnameseTranslation = "V2" }
            }
        };
        context.Scenarios.Add(scenario);
        context.ShadowingDialogues.Add(dialogue);
        await context.SaveChangesAsync();

        var service = CreateService(context);

        // Act - Update with 3 roles and modified sentence roles
        var updateDto = new UpdateShadowingDialogueDto
        {
            Title = "Updated Dialogue",
            JLPTLevel = "N5",
            SpeakerRoleA_Name = "Khách A",
            SpeakerRoleB_Name = "Nhân viên B",
            SpeakerRoles = new List<string> { "Khách A", "Nhân viên B", "Quản lý C" },
            IsActive = true,
            Sentences = new List<CreateShadowingSentenceDto>
            {
                // User changed sentence 1 from A to C!
                new() { OrderIndex = 1, SpeakerRole = "C", JapaneseText = "J1", VietnameseTranslation = "V1" },
                new() { OrderIndex = 2, SpeakerRole = "A", JapaneseText = "J2", VietnameseTranslation = "V2" },
                new() { OrderIndex = 3, SpeakerRole = "B", JapaneseText = "J3", VietnameseTranslation = "V3" }
            }
        };

        var updateResult = await service.UpdateDialogueAsync(30, updateDto);

        // Assert - Update result
        Assert.True(updateResult.Success);
        Assert.NotNull(updateResult.Data);
        Assert.Equal(3, updateResult.Data.SpeakerRoles.Count);
        Assert.Equal("C", updateResult.Data.Sentences[0].SpeakerRole);
        Assert.Equal("A", updateResult.Data.Sentences[1].SpeakerRole);
        Assert.Equal("B", updateResult.Data.Sentences[2].SpeakerRole);

        // Reload from DB directly
        var reloaded = await service.GetAdminDetailAsync(30);
        Assert.True(reloaded.Success);
        Assert.Equal("C", reloaded.Data!.Sentences[0].SpeakerRole);
        Assert.Equal("A", reloaded.Data!.Sentences[1].SpeakerRole);
        Assert.Equal("B", reloaded.Data!.Sentences[2].SpeakerRole);
    }
}
