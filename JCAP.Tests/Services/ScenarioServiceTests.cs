using JCAP.Data;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace JCAP.Tests.Services;

public class ScenarioServiceTests
{
    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    [Fact]
    public async Task GetScenariosAsync_ReturnsActiveScenariosWithPublishedLevels()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        dbContext.Scenarios.AddRange(
            new Scenario
            {
                Id = 1,
                Title = "Gọi món Ramen",
                Description = "Giao tiếp quán ăn",
                IsActive = true,
                ScenarioCode = "SCN_RAMEN",
                LevelConfigurations = new List<ScenarioLevelConfiguration>
                {
                    new() { Id = 10, JLPTLevel = "N5", Title = "N5 Ramen", Description = "Ramen N5", Status = "Published" },
                    new() { Id = 11, JLPTLevel = "N4", Title = "N4 Ramen", Description = "Ramen N4", Status = "Draft" }
                }
            },
            new Scenario
            {
                Id = 2,
                Title = "Phỏng vấn Baito",
                Description = "Giao tiếp xin việc",
                IsActive = false,
                ScenarioCode = "SCN_BAITO"
            }
        );
        await dbContext.SaveChangesAsync();

        var service = new ScenarioService(dbContext);

        // Act
        var response = await service.GetScenariosAsync();

        // Assert
        Assert.True(response.Success);
        Assert.Single(response.Data!);
        Assert.Equal(1, response.Data![0].Id);
        Assert.Equal("Gọi món Ramen", response.Data[0].Title);
        Assert.Single(response.Data[0].SupportedJLPTLevels);
        Assert.Equal("N5", response.Data[0].SupportedJLPTLevels[0]);
    }

    [Fact]
    public async Task GetScenariosAsync_WithSearchQuery_FiltersScenariosByTitleOrDescriptionOrCode()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        dbContext.Scenarios.AddRange(
            new Scenario
            {
                Id = 1,
                Title = "Gọi món Ramen",
                Description = "Giao tiếp quán ăn",
                IsActive = true,
                ScenarioCode = "SCN_RAMEN_01"
            },
            new Scenario
            {
                Id = 2,
                Title = "Phỏng vấn Baito",
                Description = "Giao tiếp xin việc làm thêm",
                IsActive = true,
                ScenarioCode = "SCN_BAITO_01"
            }
        );
        await dbContext.SaveChangesAsync();

        var service = new ScenarioService(dbContext);

        // Act
        var ramenResponse = await service.GetScenariosAsync("Ramen");
        var baitoResponse = await service.GetScenariosAsync("xin việc");
        var codeResponse = await service.GetScenariosAsync("BAITO");
        var noMatchResponse = await service.GetScenariosAsync("NonExistentQuery");

        // Assert
        Assert.True(ramenResponse.Success);
        Assert.Single(ramenResponse.Data!);
        Assert.Equal("Gọi món Ramen", ramenResponse.Data![0].Title);

        Assert.True(baitoResponse.Success);
        Assert.Single(baitoResponse.Data!);
        Assert.Equal("Phỏng vấn Baito", baitoResponse.Data![0].Title);

        Assert.True(codeResponse.Success);
        Assert.Single(codeResponse.Data!);
        Assert.Equal("Phỏng vấn Baito", codeResponse.Data![0].Title);

        Assert.True(noMatchResponse.Success);
        Assert.Empty(noMatchResponse.Data!);
    }

    [Fact]
    public async Task GetDetailsAsync_ValidId_ReturnsFullScenarioDetails()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var scenario = new Scenario
        {
            Id = 1,
            Title = "Gọi món Ramen",
            Description = "Giao tiếp quán ăn",
            IsActive = true,
            ScenarioCode = "SCN_RAMEN",
            LevelConfigurations = new List<ScenarioLevelConfiguration>
            {
                new()
                {
                    Id = 10,
                    JLPTLevel = "N5",
                    Title = "Ramen N5",
                    Description = "Mô tả N5",
                    AiPersona = "Nhân viên",
                    CreditCost = 5,
                    Status = "Published",
                    Missions = new List<Mission>
                    {
                        new() { Id = 100, Content = "Gọi mì", Order = 1, CompletionCriteriaJson = "{\"intent\":\"Order\",\"target\":\"Ramen\",\"conditions\":[\"Polite\"]}" }
                    },
                    TargetVocabularies = new List<TargetVocabulary>
                    {
                        new() { Id = 1, Word = "ラーメン", Meaning = "Mì Ramen" }
                    },
                    TargetGrammars = new List<TargetGrammar>
                    {
                        new() { Id = 1, Pattern = "～をお願いします", Meaning = "Cho tôi..." }
                    }
                }
            }
        };
        dbContext.Scenarios.Add(scenario);
        await dbContext.SaveChangesAsync();

        var service = new ScenarioService(dbContext);

        // Act
        var response = await service.GetDetailsAsync(1);

        // Assert
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal("Gọi món Ramen", response.Data!.Title);
        Assert.Single(response.Data.LevelConfigurations);
        Assert.Single(response.Data.LevelConfigurations[0].TargetVocabularies);
        Assert.Single(response.Data.LevelConfigurations[0].TargetGrammars);
        Assert.Single(response.Data.LevelConfigurations[0].Missions);
        Assert.Equal("Order", response.Data.LevelConfigurations[0].Missions[0].CompletionCriteria.Intent);
    }

    [Fact]
    public async Task GetSupportedLevelsAsync_ValidScenario_ReturnsOnlyPublishedLevels()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        dbContext.Scenarios.Add(new Scenario
        {
            Id = 1,
            Title = "Test Scenario",
            IsActive = true,
            LevelConfigurations = new List<ScenarioLevelConfiguration>
            {
                new() { JLPTLevel = "N5", Status = "Published", Title = "N5", Description = "N5" },
                new() { JLPTLevel = "N4", Status = "Published", Title = "N4", Description = "N4" },
                new() { JLPTLevel = "N3", Status = "Draft", Title = "N3", Description = "N3" }
            }
        });
        await dbContext.SaveChangesAsync();

        var service = new ScenarioService(dbContext);

        // Act
        var response = await service.GetSupportedLevelsAsync(1);

        // Assert
        Assert.True(response.Success);
        Assert.Equal(2, response.Data!.Count);
        Assert.Contains("N5", response.Data);
        Assert.Contains("N4", response.Data);
        Assert.DoesNotContain("N3", response.Data);
    }

    [Fact]
    public async Task GetLevelDetailsAsync_ValidLevel_ReturnsConfigurationAndMissions()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        dbContext.Scenarios.Add(new Scenario
        {
            Id = 1,
            Title = "Test Scenario",
            IsActive = true,
            LevelConfigurations = new List<ScenarioLevelConfiguration>
            {
                new()
                {
                    Id = 10,
                    ScenarioId = 1,
                    JLPTLevel = "N5",
                    Title = "N5 Config",
                    Description = "Mô tả N5",
                    AiPersona = "Phục vụ",
                    CreditCost = 5,
                    Status = "Published",
                    Missions = new List<Mission>
                    {
                        new() { Id = 1, Content = "Chào hỏi", Order = 1, CompletionCriteriaJson = "{\"intent\":\"Greet\",\"target\":\"Staff\",\"conditions\":[\"Say Konnichiwa\"]}" }
                    },
                    TargetVocabularies = new List<TargetVocabulary>
                    {
                        new() { Id = 1, Word = "水", Meaning = "Nước" }
                    }
                }
            }
        });
        await dbContext.SaveChangesAsync();

        var service = new ScenarioService(dbContext);

        // Act
        var response = await service.GetLevelDetailsAsync(1, "n5");

        // Assert
        Assert.True(response.Success);
        Assert.Equal("N5 Config", response.Data!.Title);
        Assert.Equal("Phục vụ", response.Data.AiPersona);
        Assert.Single(response.Data.Missions);
        Assert.Equal("Greet", response.Data.Missions[0].CompletionCriteria.Intent);
        Assert.Single(response.Data.TargetVocabularies);
    }

    [Fact]
    public async Task CreateScenarioAsync_ValidDto_CreatesScenarioWithLevels()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var service = new ScenarioService(dbContext);

        var dto = new JCAP.DTOs.Scenario.CreateScenarioDto
        {
            Title = "Kịch bản Mới",
            Description = "Mô tả kịch bản mới",
            ScenarioCode = "SCN_NEW_01",
            IsActive = true,
            LevelConfigurations = new List<JCAP.DTOs.Scenario.CreateScenarioLevelConfigDto>
            {
                new() { JLPTLevel = "N5", Title = "N5 New", Description = "Desc N5", AiPersona = "Nhân viên", CreditCost = 5 }
            }
        };

        // Act
        var response = await service.CreateScenarioAsync(dto);

        // Assert
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal("Kịch bản Mới", response.Data!.Title);
        Assert.Equal("SCN_NEW_01", response.Data.ScenarioCode);
        Assert.Single(response.Data.LevelConfigurations);
    }

    [Fact]
    public async Task UpdateScenarioAsync_ValidId_UpdatesScenarioInfo()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var scenario = new Scenario
        {
            Id = 1,
            Title = "Tên cũ",
            Description = "Mô tả cũ",
            IsActive = true,
            ScenarioCode = "SCN_OLD"
        };
        dbContext.Scenarios.Add(scenario);
        await dbContext.SaveChangesAsync();

        var service = new ScenarioService(dbContext);

        var updateDto = new JCAP.DTOs.Scenario.UpdateScenarioDto
        {
            Title = "Tên Mới Cập Nhật",
            Description = "Mô tả mới đã sửa",
            ScenarioCode = "SCN_UPDATED",
            IsActive = true
        };

        // Act
        var response = await service.UpdateScenarioAsync(1, updateDto);

        // Assert
        Assert.True(response.Success);
        Assert.Equal("Tên Mới Cập Nhật", response.Data!.Title);
        Assert.Equal("SCN_UPDATED", response.Data.ScenarioCode);
    }

    [Fact]
    public async Task DeleteScenarioAsync_ValidId_SetsIsActiveToFalse()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var scenario = new Scenario
        {
            Id = 1,
            Title = "Kịch bản sắp xóa",
            Description = "Mô tả",
            IsActive = true
        };
        dbContext.Scenarios.Add(scenario);
        await dbContext.SaveChangesAsync();

        var service = new ScenarioService(dbContext);

        // Act
        var response = await service.DeleteScenarioAsync(1);

        // Assert
        Assert.True(response.Success);
        Assert.True(response.Data);
        var dbItem = await dbContext.Scenarios.FindAsync(1);
        Assert.NotNull(dbItem);
        Assert.False(dbItem!.IsActive);
    }
}
