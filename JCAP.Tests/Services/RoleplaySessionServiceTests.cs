using JCAP.Data;
using JCAP.DTOs.Roleplay;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace JCAP.Tests.Services;

public class RoleplaySessionServiceTests
{
    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: $"JCAP_Roleplay_Test_{Guid.NewGuid()}")
            .Options;

        return new AppDbContext(options);
    }

    private static Mock<UserManager<ApplicationUser>> CreateUserManagerMock(ApplicationUser? returnedUser = null)
    {
        var store = new Mock<IUserStore<ApplicationUser>>();
        var userManager = new Mock<UserManager<ApplicationUser>>(
            store.Object, null!, null!, null!, null!, null!, null!, null!, null!);

        if (returnedUser != null)
        {
            userManager.Setup(m => m.FindByIdAsync(returnedUser.Id))
                .ReturnsAsync(returnedUser);
        }

        return userManager;
    }

    private static (Scenario, ScenarioLevelConfiguration, Mission) SeedBasicScenario(AppDbContext dbContext)
    {
        var scenario = new Scenario
        {
            Id = 1,
            Title = "Gọi món Ramen",
            Description = "Quán mì Ramen",
            IsActive = true,
            ScenarioCode = "SCN_RAMEN_01"
        };

        var levelConfig = new ScenarioLevelConfiguration
        {
            Id = 10,
            ScenarioId = 1,
            JLPTLevel = "N5",
            Title = "Ramen N5",
            Description = "Gọi mì đơn giản",
            AiPersona = "Nhân viên quán mì",
            CreditCost = 5,
            Status = "Published",
            Scenario = scenario
        };

        var mission = new Mission
        {
            Id = 100,
            ScenarioLevelConfigurationId = 10,
            Content = "Gọi 1 bát Tonkotsu Ramen",
            Order = 1,
            CompletionCriteriaJson = "{\"intent\":\"Order\",\"target\":\"Tonkotsu Ramen\"}",
            ScenarioLevelConfiguration = levelConfig
        };

        levelConfig.Missions.Add(mission);
        scenario.LevelConfigurations.Add(levelConfig);

        dbContext.Scenarios.Add(scenario);
        dbContext.ScenarioLevelConfigurations.Add(levelConfig);
        dbContext.Missions.Add(mission);
        dbContext.SaveChanges();

        return (scenario, levelConfig, mission);
    }

    [Fact]
    public async Task StartSessionAsync_Fails_WhenCreditIsInsufficient()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, _) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-poor", CreditBalance = 2 };
        var userManagerMock = CreateUserManagerMock(user);
        var aiMock = new Mock<IAiRoleplayService>();
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();

        var service = new RoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        // Act
        var result = await service.StartSessionAsync(user.Id, 1, "N5", new StartRoleplaySessionRequestDto());

        // Assert
        Assert.False(result.Success);
        Assert.Contains("Số dư credit của bạn không đủ", result.Message);
        Assert.Equal(2, user.CreditBalance); // Không bị trừ
    }

    [Fact]
    public async Task StartSessionAsync_DeductsCredit_AndCreatesSession_WhenCreditIsSufficient()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, _) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-rich", CreditBalance = 20 };
        var userManagerMock = CreateUserManagerMock(user);
        var aiMock = new Mock<IAiRoleplayService>();
        aiMock.Setup(a => a.GenerateOpeningMessageAsync(It.IsAny<Scenario>(), It.IsAny<ScenarioLevelConfiguration>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiOpeningMessageResult
            {
                JapaneseText = "いらっしゃいませ！",
                VietnameseMeaning = "Kính chào quý khách!"
            });

        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = new RoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        // Act
        var result = await service.StartSessionAsync(user.Id, 1, "N5", new StartRoleplaySessionRequestDto());

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(15, user.CreditBalance); // Đã trừ 5 credit
        Assert.Single(dbContext.CreditTransactions);
        Assert.Equal(-5, dbContext.CreditTransactions.First().Amount);
        Assert.Equal("Active", result.Data.Status);
        Assert.Single(result.Data.Messages);
        Assert.Equal("いらっしゃいませ！", result.Data.Messages[0].JapaneseText);
        Assert.Single(result.Data.Missions);
        Assert.False(result.Data.Missions[0].IsCompleted);
    }

    [Fact]
    public async Task StartSessionAsync_ResumesExistingActiveSession_WithoutDeductingCredit()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, _) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-resume", CreditBalance = 10 };
        var userManagerMock = CreateUserManagerMock(user);
        var aiMock = new Mock<IAiRoleplayService>();
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();

        // Giả lập đã có 1 session active
        var existingSession = new RoleplaySession
        {
            Id = 55,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active",
            CreditDeducted = 5,
            CreatedAt = DateTime.UtcNow.AddMinutes(-10)
        };
        dbContext.RoleplaySessions.Add(existingSession);
        dbContext.RoleplayMessages.Add(new RoleplayMessage
        {
            RoleplaySessionId = 55,
            Sender = "Ai",
            JapaneseText = "いらっしゃいませ！",
            CreatedAt = DateTime.UtcNow.AddMinutes(-10)
        });
        await dbContext.SaveChangesAsync();

        var service = new RoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        // Act - Bắt đầu session mà không force restart
        var result = await service.StartSessionAsync(user.Id, 1, "N5", new StartRoleplaySessionRequestDto { ForceRestart = false });

        // Assert
        Assert.True(result.Success);
        Assert.Equal(55, result.Data!.SessionId);
        Assert.Equal(10, user.CreditBalance); // Không bị trừ thêm credit
    }

    [Fact]
    public async Task StartSessionAsync_AbandonsExisting_AndDeductsNewCredit_WhenForceRestart()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, _) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-restart", CreditBalance = 10 };
        var userManagerMock = CreateUserManagerMock(user);
        var aiMock = new Mock<IAiRoleplayService>();
        aiMock.Setup(a => a.GenerateOpeningMessageAsync(It.IsAny<Scenario>(), It.IsAny<ScenarioLevelConfiguration>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiOpeningMessageResult { JapaneseText = "新しいセッションです。" });

        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();

        var existingSession = new RoleplaySession
        {
            Id = 55,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active",
            CreditDeducted = 5,
            CreatedAt = DateTime.UtcNow.AddMinutes(-10)
        };
        dbContext.RoleplaySessions.Add(existingSession);
        await dbContext.SaveChangesAsync();

        var service = new RoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        // Act
        var result = await service.StartSessionAsync(user.Id, 1, "N5", new StartRoleplaySessionRequestDto { ForceRestart = true });

        // Assert
        Assert.True(result.Success);
        Assert.NotEqual(55, result.Data!.SessionId);
        Assert.Equal(5, user.CreditBalance); // Bị trừ 5 credit cho session mới

        var oldSession = await dbContext.RoleplaySessions.FindAsync(55);
        Assert.Equal("Abandoned", oldSession!.Status);
    }

    [Fact]
    public async Task SendMessageAsync_TicksMission_AndDetectsNaturalConclusion()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-chat" };
        var userManagerMock = CreateUserManagerMock(user);

        var session = new RoleplaySession
        {
            Id = 101,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active",
            CreditDeducted = 5
        };
        dbContext.RoleplaySessions.Add(session);
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 101,
            MissionId = mission.Id,
            IsCompleted = false
        });
        await dbContext.SaveChangesAsync();

        var aiMock = new Mock<IAiRoleplayService>();
        aiMock.Setup(a => a.ProcessTurnAsync(
            It.IsAny<Scenario>(),
            It.IsAny<ScenarioLevelConfiguration>(),
            It.IsAny<List<RoleplayMessage>>(),
            It.IsAny<string>(),
            It.IsAny<List<Mission>>(),
            It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiTurnResult
            {
                JapaneseReply = "かしこまりました。少々お待ちください。",
                VietnameseMeaning = "Tôi đã hiểu, xin chờ một chút.",
                CompletedMissionIds = [mission.Id],
                IsNaturallyConcluded = true,
                LinguisticFeedback = new LinguisticFeedbackDto
                {
                    Status = "Warning",
                    Summary = "Khá tốt • Cần điều chỉnh nhỏ",
                    Details = [new() { Type = "warning", Aspect = "Trợ từ", Comment = "Hơi thừa trợ từ を" }]
                }
            });

        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = new RoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        // Act
        var result = await service.SendMessageAsync(user.Id, 101, new SendRoleplayMessageRequestDto
        {
            Message = "とんこつラーメンを一つください。"
        });

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Contains(mission.Id, result.Data.NewlyCompletedMissionIds);
        Assert.True(result.Data.UpdatedMissions.First(m => m.MissionId == mission.Id).IsCompleted);
        Assert.True(result.Data.IsNaturallyConcluded);
        Assert.NotNull(result.Data.UserMessage.LinguisticFeedback);
        Assert.Equal("Warning", result.Data.UserMessage.LinguisticFeedback.Status);
        Assert.Equal("Khá tốt • Cần điều chỉnh nhỏ", result.Data.UserMessage.LinguisticFeedback.Summary);

        // Check DB persisted state
        var dbSessionMission = await dbContext.RoleplaySessionMissions.FirstAsync(sm => sm.MissionId == mission.Id);
        Assert.True(dbSessionMission.IsCompleted);

        var dbSession = await dbContext.RoleplaySessions.FindAsync(101);
        Assert.True(dbSession!.IsNaturallyConcluded);

        var dbUserMsg = await dbContext.RoleplayMessages.FirstAsync(m => m.Sender == "User");
        Assert.NotNull(dbUserMsg.LinguisticFeedbackJson);
        Assert.Contains("Khá tốt", dbUserMsg.LinguisticFeedbackJson);
    }
}
