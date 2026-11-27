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

    private static RoleplaySessionService CreateRoleplaySessionService(
        AppDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        IAiRoleplayService aiRoleplayService,
        ILogger<RoleplaySessionService> logger)
    {
        var errorDetector = new Mock<IVietnameseLearnerErrorDetector>();
        errorDetector.Setup(d => d.DetectErrors(It.IsAny<string>()))
            .Returns(new List<DetectedGrammarIssue>());

        var telemetryEvaluator = new Mock<ITelemetryEvaluatorService>();
        telemetryEvaluator.Setup(t => t.RecordAndEvaluateTurnAsync(It.IsAny<TurnTelemetryInput>()))
            .ReturnsAsync(new DynamicScaffoldingDecision { SpeedScale = 1.0 });

        var personaMemory = new Mock<IPersonaMemoryService>();

        return new RoleplaySessionService(
            dbContext,
            userManager,
            aiRoleplayService,
            logger,
            errorDetector.Object,
            telemetryEvaluator.Object,
            personaMemory.Object);
    }


    [Fact]
    public async Task StartSessionAsync_AllowsStarting_WithoutUpfrontCreditCost()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, _) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-poor", CreditBalance = 2 };
        var userManagerMock = CreateUserManagerMock(user);
        var aiMock = new Mock<IAiRoleplayService>();
        aiMock.Setup(a => a.GenerateOpeningMessageAsync(It.IsAny<Scenario>(), It.IsAny<ScenarioLevelConfiguration>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiOpeningMessageResult
            {
                JapaneseText = "いらっしゃいませ！",
                VietnameseMeaning = "Kính chào quý khách!"
            });
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();

        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        // Act
        var result = await service.StartSessionAsync(user.Id, 1, "N5", new StartRoleplaySessionRequestDto());

        // Assert: Bắt đầu vào học là miễn phí, không trừ 5 credit
        Assert.True(result.Success);
        Assert.Equal(2, user.CreditBalance); // Không bị trừ
        Assert.Empty(dbContext.CreditTransactions);
    }

    [Fact]
    public async Task StartSessionAsync_FreeToStart_AndCreatesSession_WhenCreditIsSufficient()
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
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        // Act
        var result = await service.StartSessionAsync(user.Id, 1, "N5", new StartRoleplaySessionRequestDto());

        // Assert: Bắt đầu vào học miễn phí, không trừ 5 credit
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(20, user.CreditBalance); // Không bị trừ credit khởi tạo
        Assert.Empty(dbContext.CreditTransactions);
        Assert.Equal("Active", result.Data.Status);
        Assert.Single(result.Data.Messages);
        Assert.Equal("いらっしゃいませ！", result.Data.Messages[0].JapaneseText);
        Assert.Single(result.Data.Missions);
        Assert.False(result.Data.Missions[0].IsCompleted);
    }

    [Fact]
    public async Task StartSessionAsync_FreeCredit_WhenUserIsAdmin()
    {
        // Arrange: Admin user with 0 credits should still be allowed to test scenarios without deduction
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, _) = SeedBasicScenario(dbContext);

        var adminUser = new ApplicationUser { Id = "admin-tester", Role = "Admin", CreditBalance = 0 };
        var userManagerMock = CreateUserManagerMock(adminUser);
        var aiMock = new Mock<IAiRoleplayService>();
        aiMock.Setup(a => a.GenerateOpeningMessageAsync(It.IsAny<Scenario>(), It.IsAny<ScenarioLevelConfiguration>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiOpeningMessageResult
            {
                JapaneseText = "いらっしゃいませ！",
                VietnameseMeaning = "Kính chào quý khách!"
            });

        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        // Act
        var result = await service.StartSessionAsync(adminUser.Id, 1, "N5", new StartRoleplaySessionRequestDto());

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(0, adminUser.CreditBalance); // Không bị trừ và không bị chặn
        Assert.Empty(dbContext.CreditTransactions); // Không sinh transaction trừ tiền
        Assert.Equal(0, result.Data.CreditBalance);
        Assert.Equal("Active", result.Data.Status);
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

        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

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

        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        // Act
        var result = await service.StartSessionAsync(user.Id, 1, "N5", new StartRoleplaySessionRequestDto { ForceRestart = true });

        // Assert
        Assert.True(result.Success);
        Assert.NotEqual(55, result.Data!.SessionId);
        Assert.Equal(10, user.CreditBalance); // Không bị trừ thêm credit vì vào học miễn phí

        var oldSession = await dbContext.RoleplaySessions.FindAsync(55);
        Assert.Equal("Abandoned", oldSession!.Status);
    }

    [Fact]
    public async Task SendMessageAsync_TicksMission_AndDetectsNaturalConclusion()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-chat", CreditBalance = 10 };
        var userManagerMock = CreateUserManagerMock(user);
        userManagerMock.Setup(m => m.UpdateAsync(It.IsAny<ApplicationUser>()))
            .ReturnsAsync(IdentityResult.Success);

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
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

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
        // 1 + ceil((16 + 19) / 50.0) + 0 = 2 credits
        Assert.Equal(2, result.Data.CreditsSpentThisTurn);
        Assert.Equal(8, result.Data.CreditBalance);

        // Check DB persisted state
        var dbSessionMission = await dbContext.RoleplaySessionMissions.FirstAsync(sm => sm.MissionId == mission.Id);
        Assert.True(dbSessionMission.IsCompleted);

        var dbSession = await dbContext.RoleplaySessions.FindAsync(101);
        Assert.True(dbSession!.IsNaturallyConcluded);

        var dbUserMsg = await dbContext.RoleplayMessages.FirstAsync(m => m.Sender == "User");
        Assert.NotNull(dbUserMsg.LinguisticFeedbackJson);
        Assert.Contains("Khá tốt", dbUserMsg.LinguisticFeedbackJson);
        Assert.Contains("\"evaluationSource\":\"AI\"", dbUserMsg.LinguisticFeedbackJson);
    }

    [Fact]
    public async Task SendMessageAsync_DeductsCredit_PerAiReplyLength()
    {
        // Arrange: User có 50 credits, AI reply ngắn (< 30 chars) → trừ 1 credit (tối thiểu)
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-credit-deduct", CreditBalance = 50 };
        var userManagerMock = CreateUserManagerMock(user);
        userManagerMock.Setup(m => m.UpdateAsync(It.IsAny<ApplicationUser>()))
            .ReturnsAsync(IdentityResult.Success);

        var session = new RoleplaySession
        {
            Id = 202,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active",
            CreditDeducted = 5
        };
        dbContext.RoleplaySessions.Add(session);
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 202,
            MissionId = mission.Id,
            IsCompleted = false
        });
        await dbContext.SaveChangesAsync();

        // AI reply = "かしこまりました。" (9 chars → 9/30=0 → max(1,0)=1 credit tối thiểu)
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
                JapaneseReply = "かしこまりました。",
                VietnameseMeaning = "Tôi đã hiểu.",
                CompletedMissionIds = [],
                IsNaturallyConcluded = false
            });

        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        // Act
        var result = await service.SendMessageAsync(user.Id, 202, new SendRoleplayMessageRequestDto
        {
            Message = "ラーメンをください。"
        });

        // Assert: 1 + ceil((10 + 9) / 50.0) + 0 = 2 credits
        Assert.True(result.Success);
        Assert.Equal(2, result.Data!.CreditsSpentThisTurn);
        Assert.Equal(48, result.Data.CreditBalance);          // 50 - 2 = 48
        Assert.Equal(48, user.CreditBalance);                 // model được cập nhật

        // Verify transaction ghi vào DB
        var deductTx = dbContext.CreditTransactions
            .FirstOrDefault(t => t.Type == "Deduct" && t.Description != null && t.Description.Contains("Lượt hội thoại AI"));
        Assert.NotNull(deductTx);
        Assert.Equal(-2, deductTx!.Amount);
    }

    [Fact]
    public void EstimateCreditCost_ReturnsMinimumOne_ForShortReplies()
    {
        Assert.Equal(1, RoleplaySessionService.EstimateCreditCost("", "", 1));
        Assert.Equal(1, RoleplaySessionService.EstimateCreditCost("   ", "   ", 1));
        Assert.Equal(2, RoleplaySessionService.EstimateCreditCost("はい。", "はい。", 1));
    }

    [Fact]
    public void EstimateCreditCost_ScalesWithReplyLengthAndContextDepth_AndCapsAtFour()
    {
        // 50 chars -> ceil(50/50)=1, turn 1 (depth=0) -> 1+1+0 = 2
        Assert.Equal(2, RoleplaySessionService.EstimateCreditCost(new string('あ', 25), new string('い', 25), 1));
        // 80 chars -> ceil(80/50)=2, turn 1 (depth=0) -> 1+2+0 = 3
        Assert.Equal(3, RoleplaySessionService.EstimateCreditCost(new string('あ', 40), new string('い', 40), 1));
        // 40 chars -> ceil(40/50)=1, turn 6 (depth=1) -> 1+1+1 = 3
        Assert.Equal(3, RoleplaySessionService.EstimateCreditCost(new string('あ', 20), new string('い', 20), 6));
        // 40 chars -> ceil(40/50)=1, turn 13 (depth=2) -> 1+1+2 = 4
        Assert.Equal(4, RoleplaySessionService.EstimateCreditCost(new string('あ', 20), new string('い', 20), 13));
        // Clamped at 4
        Assert.Equal(4, RoleplaySessionService.EstimateCreditCost(new string('あ', 150), new string('い', 150), 20));
    }

    [Fact]
    public async Task GetIntelligenceProfileAsync_ReturnsSuccess_WithComputedMetrics()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var user = new ApplicationUser { Id = "user-test", UserName = "tester" };
        var userManagerMock = CreateUserManagerMock(user);
        var aiRoleplayMock = new Mock<IAiRoleplayService>();
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();

        var errorDetector = new Mock<IVietnameseLearnerErrorDetector>();
        var telemetryEvaluator = new Mock<ITelemetryEvaluatorService>();
        telemetryEvaluator.Setup(t => t.GetOrCreateProfileAsync("user-test"))
            .ReturnsAsync(new LearnerIntelligenceProfile
            {
                UserId = "user-test",
                SpeakingReflexIndex = 75.0,
                KeigoCommandScore = 80.0,
                ParticleAccuracyRate = 85.0,
                AverageMoraRate = 4.8,
                CommunicativeProficiencyIndex = 88.0,
                CommunicativeConfidenceScore = 82.0
            });

        var personaMemory = new Mock<IPersonaMemoryService>();
        dbContext.LearnerSkillMasteries.Add(new LearnerSkillMastery
        {
            UserId = "user-test",
            SkillCode = "E01_INTRANSITIVE_WO",
            SkillName = "Trợ từ を với tự động từ (E01)",
            Category = "Grammar",
            Stability = 0.8,
            Difficulty = 6.0,
            Repetitions = 1,
            Lapses = 1,
            LastPracticedUtc = DateTime.UtcNow,
            NextRecommendedReviewUtc = DateTime.UtcNow.AddHours(-1)
        });
        await dbContext.SaveChangesAsync();

        var service = new RoleplaySessionService(
            dbContext,
            userManagerMock.Object,
            aiRoleplayMock.Object,
            loggerMock.Object,
            errorDetector.Object,
            telemetryEvaluator.Object,
            personaMemory.Object);

        // Act
        var result = await service.GetIntelligenceProfileAsync("user-test");

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(75.0, result.Data!.SpeakingReflexIndex);
        Assert.Equal(80.0, result.Data.KeigoCommandScore);
        Assert.Equal("大吉 (Đại Cát)", result.Data.OmikujiRank);
        Assert.NotEmpty(result.Data.Strengths);
        Assert.Single(result.Data.DueReviewItems);
        Assert.True(result.Data.DueReviewItems[0].IsDueForReview);
        Assert.Equal("E01_INTRANSITIVE_WO", result.Data.DueReviewItems[0].SkillCode);
    }

    [Fact]
    public async Task StartSessionAsync_WhenSubscriptionQuotaExceeded_AllowsEntryWithoutUpfrontCost()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var (scenario, levelConfig, _) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser
        {
            Id = "user-sub-quota-full",
            CreditBalance = 0,
            SubscriptionPlanId = "plan-pro",
            SubscriptionExpiresAt = DateTime.UtcNow.AddDays(15)
        };

        dbContext.CreditTransactions.Add(new CreditTransaction
        {
            UserId = user.Id,
            Amount = -50,
            Type = "Deduct",
            Status = "Paid",
            CoveredBySubscription = true,
            Description = "[Gói tháng] Luyện tập trước đó",
            CreatedAt = DateTime.UtcNow.AddHours(-1)
        });
        await dbContext.SaveChangesAsync();

        var userManagerMock = CreateUserManagerMock(user);
        var aiMock = new Mock<IAiRoleplayService>();
        aiMock.Setup(a => a.GenerateOpeningMessageAsync(It.IsAny<Scenario>(), It.IsAny<ScenarioLevelConfiguration>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiOpeningMessageResult { JapaneseText = "新しいセッションです。" });
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        // Act: Bắt đầu vào phiên là miễn phí
        var result = await service.StartSessionAsync(user.Id, scenario.Id, levelConfig.JLPTLevel, new StartRoleplaySessionRequestDto());

        // Assert: Phiên tạo thành công, không bị chặn bởi phí khởi tạo
        Assert.True(result.Success);
    }

    [Fact]
    public async Task SendMessageAsync_TracksEventsAcrossTurns_AndEnforcesCooldown()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var (scenario, levelConfig, mission1) = SeedBasicScenario(dbContext);

        // Add extra missions so scenario doesn't end early
        var mission2 = new Mission
        {
            Id = 101,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Content = "Hỏi giá tiền",
            Order = 2,
            CompletionCriteriaJson = "{\"intent\":\"AskPrice\"}",
            ScenarioLevelConfiguration = levelConfig
        };
        var mission3 = new Mission
        {
            Id = 102,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Content = "Thanh toán",
            Order = 3,
            CompletionCriteriaJson = "{\"intent\":\"Pay\"}",
            ScenarioLevelConfiguration = levelConfig
        };
        dbContext.Missions.AddRange(mission2, mission3);

        var user = new ApplicationUser
        {
            Id = "user-cooldown-test",
            CreditBalance = 100
        };

        var session = new RoleplaySession
        {
            Id = 500,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active",
            CreatedAt = DateTime.UtcNow
        };
        dbContext.RoleplaySessions.Add(session);
        dbContext.RoleplaySessionMissions.AddRange(
            new RoleplaySessionMission { RoleplaySessionId = 500, MissionId = mission1.Id, IsCompleted = false },
            new RoleplaySessionMission { RoleplaySessionId = 500, MissionId = mission2.Id, IsCompleted = false },
            new RoleplaySessionMission { RoleplaySessionId = 500, MissionId = mission3.Id, IsCompleted = false }
        );
        await dbContext.SaveChangesAsync();

        var userManagerMock = CreateUserManagerMock(user);
        var aiMock = new Mock<IAiRoleplayService>();
        aiMock.Setup(a => a.ProcessTurnAsync(
            It.IsAny<Scenario>(),
            It.IsAny<ScenarioLevelConfiguration>(),
            It.IsAny<List<RoleplayMessage>>(),
            It.IsAny<string>(),
            It.IsAny<List<Mission>>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()))
            .ReturnsAsync((Scenario s, ScenarioLevelConfiguration c, List<RoleplayMessage> h, string u, List<Mission> m, string? dir, CancellationToken ct) =>
                new AiTurnResult
                {
                    JapaneseReply = "かしこまりました。",
                    VietnameseMeaning = "Tôi hiểu rồi.",
                    FuriganaHtml = "かしこまりました。",
                    CompletedMissionIds = new List<int>(),
                    IsNaturallyConcluded = false,
                    LinguisticFeedback = new LinguisticFeedbackDto
                    {
                        Status = "Good",
                        Summary = "Rất tốt"
                    }
                });

        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        // Turn 1: No event (Timing guard: first 2 turns blocked)
        var t1 = await service.SendMessageAsync(user.Id, 500, new SendRoleplayMessageRequestDto { Message = "こんにちは" });
        Assert.Null(t1.Data!.ActiveBranchingEventCode);

        // Turn 2: No event (Timing guard)
        var t2 = await service.SendMessageAsync(user.Id, 500, new SendRoleplayMessageRequestDto { Message = "メニューを見せてください" });
        Assert.Null(t2.Data!.ActiveBranchingEventCode);

        // Turn 3: Event triggers!
        var t3 = await service.SendMessageAsync(user.Id, 500, new SendRoleplayMessageRequestDto { Message = "とんこつラーメンをください" });
        Assert.NotNull(t3.Data!.ActiveBranchingEventCode);
        var eventCode = t3.Data.ActiveBranchingEventCode;

        // Turn 4: Cooldown guard prevents another event (turnsSinceLastEvent = 1 < 3)
        var t4 = await service.SendMessageAsync(user.Id, 500, new SendRoleplayMessageRequestDto { Message = "じゃあ醤油ラーメンにします" });
        Assert.Null(t4.Data!.ActiveBranchingEventCode);

        // Turn 5: Cooldown guard still prevents (turnsSinceLastEvent = 2 < 3)
        var t5 = await service.SendMessageAsync(user.Id, 500, new SendRoleplayMessageRequestDto { Message = "いくらですか？" });
        Assert.Null(t5.Data!.ActiveBranchingEventCode);
    }

    [Fact]
    public async Task EndSessionAsync_PersistsEpisodicFactsToLearnerMemory_AndUpdatesCharacterMemory()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var (scenario, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser
        {
            Id = "user-memory-test",
            CreditBalance = 100
        };

        var session = new RoleplaySession
        {
            Id = 600,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active",
            CreatedAt = DateTime.UtcNow
        };
        dbContext.RoleplaySessions.Add(session);
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 600,
            MissionId = mission.Id,
            IsCompleted = true
        });

        // Add user messages containing memorable personal facts
        dbContext.RoleplayMessages.AddRange(
            new RoleplayMessage
            {
                RoleplaySessionId = 600,
                Sender = "User",
                JapaneseText = "私はダナン出身です。とんこつラーメンが好きです。"
            },
            new RoleplayMessage
            {
                RoleplaySessionId = 600,
                Sender = "Ai",
                JapaneseText = "ダナンは綺麗な街ですね！"
            }
        );
        await dbContext.SaveChangesAsync();

        var userManagerMock = CreateUserManagerMock(user);
        var aiMock = new Mock<IAiRoleplayService>();
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();

        var factExtractorMock = new Mock<IEpisodicFactExtractor>();
        factExtractorMock.Setup(f => f.ExtractFact(It.Is<string>(s => s.Contains("ラーメン"))))
            .Returns("favorite_ramen:tonkotsu");

        var service = new RoleplaySessionService(
            dbContext,
            userManagerMock.Object,
            aiMock.Object,
            loggerMock.Object,
            new Mock<IVietnameseLearnerErrorDetector>().Object,
            new Mock<ITelemetryEvaluatorService>().Object,
            new Mock<IPersonaMemoryService>().Object,
            factExtractor: factExtractorMock.Object);

        // Act
        var result = await service.EndSessionAsync(user.Id, 600);

        // Assert
        Assert.True(result.Success);

        // Verify LearnerMemories table has persisted facts
        var memories = await dbContext.LearnerMemories
            .Where(lm => lm.UserId == user.Id)
            .ToListAsync();
        Assert.NotEmpty(memories);
        var ramenMem = memories.FirstOrDefault(m => m.Key == "favorite_ramen");
        Assert.NotNull(ramenMem);
        Assert.Equal("tonkotsu", ramenMem!.Value);
        Assert.Equal("FoodPreference", ramenMem.Category);

        // Verify CharacterMemory has recorded the encounter
        var charMem = await dbContext.CharacterMemories
            .FirstOrDefaultAsync(cm => cm.UserId == user.Id && cm.CharacterPersonaKey == scenario.ScenarioCode);
        Assert.NotNull(charMem);
        Assert.Equal(1, charMem!.EncounterCount);
        Assert.True(charMem.AffinityScore > 0);
    }

    [Fact]
    public async Task PlacementAndRoleplaySessions_AreCompletelyIsolated_EvenIfLegacyPlacementHasScenarioConfigId()
    {
        // Arrange: Giả lập dữ liệu cũ có phiên PlacementTest trỏ vào ScenarioLevelConfigurationId của Ramen (giống bug #83)
        using var dbContext = CreateInMemoryDbContext();
        var (scenario, levelConfig, _) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-isolated", CreditBalance = 10 };
        dbContext.Users.Add(user);

        var activePlacementSession = new RoleplaySession
        {
            Id = 83,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            SessionType = "PlacementTest",
            Status = "Active",
            CreditDeducted = 0,
            CreatedAt = DateTime.UtcNow.AddMinutes(-2)
        };
        dbContext.RoleplaySessions.Add(activePlacementSession);
        await dbContext.SaveChangesAsync();

        var userManagerMock = CreateUserManagerMock(user);
        var aiMock = new Mock<IAiRoleplayService>();
        aiMock.Setup(a => a.GenerateOpeningMessageAsync(It.IsAny<Scenario>(), It.IsAny<ScenarioLevelConfiguration>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiOpeningMessageResult
            {
                JapaneseText = "いらっしゃいませ！",
                VietnameseMeaning = "Kính chào quý khách!"
            });
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        // Act 1: Kiểm tra active session cho scenario Ramen -> không được nhầm sang phiên PlacementTest #83
        var activeRes = await service.GetActiveSessionAsync(user.Id, scenario.Id);
        Assert.True(activeRes.Success);
        Assert.Null(activeRes.Data);

        // Act 2: StartSessionAsync vào scenario Ramen -> phải tạo phiên Standard mới, KHÔNG resume #83
        var startRes = await service.StartSessionAsync(user.Id, scenario.Id, "N5", new StartRoleplaySessionRequestDto());
        Assert.True(startRes.Success);
        Assert.NotNull(startRes.Data);
        Assert.NotEqual(83, startRes.Data!.SessionId);

        var createdRoleplay = await dbContext.RoleplaySessions.FindAsync(startRes.Data.SessionId);
        Assert.NotNull(createdRoleplay);
        Assert.Equal("Standard", createdRoleplay!.SessionType);
        Assert.Equal(levelConfig.Id, createdRoleplay.ScenarioLevelConfigurationId);

        // Act 3: Gửi tin nhắn Roleplay thường nhắm vào sessionId #83 -> phải bị từ chối
        var sendRes = await service.SendMessageAsync(user.Id, 83, new SendRoleplayMessageRequestDto { Message = "あれ" });
        Assert.False(sendRes.Success);
    }

    [Fact]
    public async Task PlacementTestService_StartOrResumeSessionAsync_SetsNullScenarioLevelConfigurationId()
    {
        // Arrange: DB hoàn toàn không có ScenarioLevelConfiguration nào vẫn phải tạo được phiên PlacementTest
        using var dbContext = CreateInMemoryDbContext();
        var user = new ApplicationUser { Id = "user-pt-null-fk", PlacementTestStatus = "NotStarted" };
        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync();

        var engine = new PlacementAssessmentEngine(
            new Mock<IAiClient>().Object,
            new VietnameseLearnerErrorDetector(),
            new Mock<ILogger<PlacementAssessmentEngine>>().Object);

        var ptService = new PlacementTestService(
            dbContext,
            engine,
            new Mock<ILogger<PlacementTestService>>().Object);

        // Act
        var result = await ptService.StartOrResumeSessionAsync(user.Id);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);

        var session = await dbContext.RoleplaySessions.FindAsync(result.Data!.SessionId);
        Assert.NotNull(session);
        Assert.Equal("PlacementTest", session!.SessionType);
        Assert.Null(session.ScenarioLevelConfigurationId);
        Assert.Equal(0, session.CreditDeducted);
    }

    [Fact]
    public void ResolveNpcCode_AndApplyEffortRebate_BehaveDeterministically()
    {
        Assert.Equal("SCN_RAMEN_01", RoleplaySessionService.ResolveNpcCode("SCN_RAMEN_01", 1, 5));
        Assert.Equal("SCN_3", RoleplaySessionService.ResolveNpcCode(null, 3, 9));
        Assert.Equal("NPC_9", RoleplaySessionService.ResolveNpcCode(null, 0, 9));

        var (rebatedPenalty, isRebated) = AssistancePolicy.ApplyEffortRebate(40, 3, 0.25);
        Assert.True(isRebated);
        Assert.Equal(20, rebatedPenalty);

        var (fullPenalty, notRebated) = AssistancePolicy.ApplyEffortRebate(40, 3, 0.90);
        Assert.False(notRebated);
        Assert.Equal(40, fullPenalty);
    }

    [Fact]
    public async Task SendMessageAsync_RecordsHonestTelemetry_ZeroMoraForTextAndRealLowTurnScoreOnError()
    {
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-telemetry-honest", CreditBalance = 50 };
        var userManagerMock = CreateUserManagerMock(user);
        userManagerMock.Setup(m => m.UpdateAsync(It.IsAny<ApplicationUser>()))
            .ReturnsAsync(IdentityResult.Success);

        var session = new RoleplaySession
        {
            Id = 505,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active",
            SessionType = "Standard"
        };
        dbContext.RoleplaySessions.Add(session);
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 505,
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
                JapaneseReply = "もう一度お願いできますか。",
                VietnameseMeaning = "Bạn nói lại giúp nhé.",
                CompletedMissionIds = [],
                IsNaturallyConcluded = false,
                LinguisticFeedback = new LinguisticFeedbackDto
                {
                    Status = "Error",
                    Summary = "Sai trợ từ và cấu trúc câu",
                    Details = []
                }
            });

        var errorDetector = new VietnameseLearnerErrorDetector();
        var telemetryEvaluator = new TelemetryEvaluatorService(dbContext, errorDetector);
        var personaMemory = new Mock<IPersonaMemoryService>();
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();

        var service = new RoleplaySessionService(
            dbContext,
            userManagerMock.Object,
            aiMock.Object,
            loggerMock.Object,
            errorDetector,
            telemetryEvaluator,
            personaMemory.Object);

        var result = await service.SendMessageAsync(user.Id, 505, new SendRoleplayMessageRequestDto
        {
            Message = "ラーメンを食べるです",
            FallbackToTextInput = true,
            SpeechConfidence = null,
            MoraRate = null,
            ResponseLatencySeconds = null
        });

        Assert.True(result.Success);
        var signal = await dbContext.LearnerBehaviorSignals
            .FirstOrDefaultAsync(s => s.SessionId == 505);
        Assert.NotNull(signal);
        Assert.Equal(0.0, signal!.MoraRate);
        Assert.Equal(0, signal.LatencyMs);
        Assert.True(signal.TurnScore > 0.0 && signal.TurnScore <= 45.0, $"Expected TurnScore in (0, 45], got {signal.TurnScore}");
    }

    [Fact]
    public async Task GetIntelligenceProfileAsync_ComputesDynamicLevel_FailStreakAlert_AndRecurringMistakes()
    {
        using var dbContext = CreateInMemoryDbContext();
        var user = new ApplicationUser { Id = "user-fail-streak", CreditBalance = 20 };
        var userManagerMock = CreateUserManagerMock(user);
        var aiMock = new Mock<IAiRoleplayService>();
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();

        dbContext.LearnerIntelligenceProfiles.Add(new LearnerIntelligenceProfile
        {
            UserId = user.Id,
            ThetaEstimate = 0.6,
            SpeakingReflexIndex = 60,
            KeigoCommandScore = 62,
            ParticleAccuracyRate = 65,
            AverageMoraRate = 3.8,
            HintDependencyRate = 25,
            CommunicativeConfidenceScore = 64,
            CommunicativeProficiencyIndex = 62
        });

        dbContext.RoleplayResults.AddRange(
            new RoleplayResult { Id = 701, RoleplaySessionId = 701, UserId = user.Id, ScenarioTitle = "Gọi món Ramen", JLPTLevel = "N5", OverallScore = 82, PassStatus = true, CompletedAt = DateTime.UtcNow.AddDays(-3) },
            new RoleplayResult { Id = 702, RoleplaySessionId = 702, UserId = user.Id, ScenarioTitle = "Gọi món Ramen", JLPTLevel = "N4", OverallScore = 48, PassStatus = false, CompletedAt = DateTime.UtcNow.AddDays(-2) },
            new RoleplayResult { Id = 703, RoleplaySessionId = 703, UserId = user.Id, ScenarioTitle = "Mua vé tàu", JLPTLevel = "N4", OverallScore = 51, PassStatus = false, CompletedAt = DateTime.UtcNow.AddDays(-1) }
        );

        dbContext.LearnerSkillMasteries.Add(new LearnerSkillMastery
        {
            UserId = user.Id,
            SkillCode = "E02_PLACE_DE_NI",
            SkillName = "Trợ từ tồn tại で vs に (E02)",
            Category = "Grammar",
            Stability = 0.8,
            Difficulty = 6.5,
            Repetitions = 4,
            Lapses = 3,
            LastPracticedUtc = DateTime.UtcNow.AddHours(-2),
            NextRecommendedReviewUtc = DateTime.UtcNow.AddHours(6)
        });
        await dbContext.SaveChangesAsync();

        var errorDetector = new VietnameseLearnerErrorDetector();
        var telemetryEvaluator = new TelemetryEvaluatorService(dbContext, errorDetector);
        var personaMemory = new Mock<IPersonaMemoryService>();
        var service = new RoleplaySessionService(
            dbContext,
            userManagerMock.Object,
            aiMock.Object,
            loggerMock.Object,
            errorDetector,
            telemetryEvaluator,
            personaMemory.Object);
        var res = await service.GetIntelligenceProfileAsync(user.Id);

        Assert.True(res.Success);
        Assert.NotNull(res.Data);
        Assert.Equal(2, res.Data!.ConsecutiveFailCount);
        Assert.Equal("N5", res.Data.EstimatedJlptLevel);
        Assert.Equal("N5 (Cơ bản)", res.Data.EstimatedJlptLabel);
        Assert.Single(res.Data.RecurringMistakes);
        Assert.Equal(3, res.Data.RecurringMistakes[0].Lapses);
        Assert.Contains(res.Data.CoachingAlerts, a => a.Severity == "danger" && a.Title.Contains("2 phiên"));
        Assert.Contains(res.Data.CoachingAlerts, a => a.Severity == "warning" && a.Title.Contains("3 lần"));
    }

    [Fact]
    public async Task SendMessageAsync_RejectsZeroCreditNonSubscriptionUser_WithoutCallingAiOrSavingMessage()
    {
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-zero-credit", CreditBalance = 0 };
        var userManagerMock = CreateUserManagerMock(user);

        dbContext.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 801,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active"
        });
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 801,
            MissionId = mission.Id,
            IsCompleted = false
        });
        await dbContext.SaveChangesAsync();

        var aiMock = new Mock<IAiRoleplayService>();
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        var result = await service.SendMessageAsync(user.Id, 801, new SendRoleplayMessageRequestDto
        {
            Message = "ラーメンをください。"
        });

        Assert.False(result.Success);
        Assert.Contains("credit", result.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Empty(await dbContext.RoleplayMessages.Where(m => m.RoleplaySessionId == 801).ToListAsync());
        Assert.Empty(await dbContext.CreditTransactions.ToListAsync());
        aiMock.Verify(a => a.ProcessTurnAsync(
            It.IsAny<Scenario>(),
            It.IsAny<ScenarioLevelConfiguration>(),
            It.IsAny<List<RoleplayMessage>>(),
            It.IsAny<string>(),
            It.IsAny<List<Mission>>(),
            It.IsAny<CancellationToken>()), Times.Never);
        aiMock.Verify(a => a.ProcessTurnAsync(
            It.IsAny<Scenario>(),
            It.IsAny<ScenarioLevelConfiguration>(),
            It.IsAny<List<RoleplayMessage>>(),
            It.IsAny<string>(),
            It.IsAny<List<Mission>>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SendMessageAsync_RejectsSubscriptionUser_WhenQuotaExhaustedAndZeroExtraCredits()
    {
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser
        {
            Id = "user-sub-exhausted",
            CreditBalance = 0,
            SubscriptionPlanId = "pro-monthly",
            SubscriptionExpiresAt = DateTime.UtcNow.AddDays(10)
        };
        var userManagerMock = CreateUserManagerMock(user);

        dbContext.CreditTransactions.Add(new CreditTransaction
        {
            UserId = user.Id,
            Amount = -500,
            Type = "Deduct",
            Status = "Paid",
            CoveredBySubscription = true,
            Description = "[Gói tháng] Đã dùng hết quota 5h",
            CreatedAt = DateTime.UtcNow.AddMinutes(-30)
        });
        dbContext.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 802,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active"
        });
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 802,
            MissionId = mission.Id,
            IsCompleted = false
        });
        await dbContext.SaveChangesAsync();

        var aiMock = new Mock<IAiRoleplayService>();
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        var result = await service.SendMessageAsync(user.Id, 802, new SendRoleplayMessageRequestDto
        {
            Message = "ラーメンをください。"
        });

        Assert.False(result.Success);
        Assert.Contains("hạn ngạch", result.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Empty(await dbContext.RoleplayMessages.Where(m => m.RoleplaySessionId == 802).ToListAsync());
        aiMock.Verify(a => a.ProcessTurnAsync(
            It.IsAny<Scenario>(),
            It.IsAny<ScenarioLevelConfiguration>(),
            It.IsAny<List<RoleplayMessage>>(),
            It.IsAny<string>(),
            It.IsAny<List<Mission>>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SendMessageAsync_AllowsSubscriptionUserWithinQuota_WithoutDeductingCreditBalance()
    {
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser
        {
            Id = "user-sub-active",
            CreditBalance = 15,
            SubscriptionPlanId = "pro-monthly",
            SubscriptionExpiresAt = DateTime.UtcNow.AddDays(20)
        };
        var userManagerMock = CreateUserManagerMock(user);

        dbContext.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 803,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active"
        });
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 803,
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
                JapaneseReply = "かしこまりました。",
                VietnameseMeaning = "Toi da hieu."
            });

        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        var result = await service.SendMessageAsync(user.Id, 803, new SendRoleplayMessageRequestDto
        {
            Message = "ラーメンをください。"
        });

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(15, user.CreditBalance);
        Assert.Equal(15, result.Data!.CreditBalance);
        Assert.True(result.Data.CreditsSpentThisTurn > 0);
        var subTx = await dbContext.CreditTransactions.SingleAsync(t => t.UserId == user.Id);
        Assert.Equal("Deduct", subTx.Type);
        Assert.True(subTx.CoveredBySubscription);
        userManagerMock.Verify(m => m.UpdateAsync(It.IsAny<ApplicationUser>()), Times.Never);
    }

    [Fact]
    public async Task SendMessageAsync_AllowsAdminViaIdentityRole_WithZeroCreditsAndNoDeduction()
    {
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var adminByRole = new ApplicationUser
        {
            Id = "user-identity-admin",
            Role = "Learner",
            CreditBalance = 0
        };
        var userManagerMock = CreateUserManagerMock(adminByRole);
        userManagerMock.Setup(m => m.GetRolesAsync(adminByRole))
            .ReturnsAsync(new List<string> { "Admin" });

        dbContext.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 804,
            UserId = adminByRole.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active"
        });
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 804,
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
                JapaneseReply = "いらっしゃいませ。",
                VietnameseMeaning = "Kinh chao quy khach."
            });

        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        var result = await service.SendMessageAsync(adminByRole.Id, 804, new SendRoleplayMessageRequestDto
        {
            Message = "こんにちは。"
        });

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(0, result.Data!.CreditsSpentThisTurn);
        Assert.Equal(0, adminByRole.CreditBalance);
        Assert.Empty(await dbContext.CreditTransactions.ToListAsync());
    }

    [Fact]
    public async Task SendMessageAsync_FailsGracefully_WhenUserNotFound()
    {
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var userManagerMock = CreateUserManagerMock(null);
        dbContext.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 805,
            UserId = "missing-user",
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active"
        });
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 805,
            MissionId = mission.Id,
            IsCompleted = false
        });
        await dbContext.SaveChangesAsync();

        var aiMock = new Mock<IAiRoleplayService>();
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        var result = await service.SendMessageAsync("missing-user", 805, new SendRoleplayMessageRequestDto
        {
            Message = "こんにちは。"
        });

        Assert.False(result.Success);
        Assert.Empty(await dbContext.RoleplayMessages.Where(m => m.RoleplaySessionId == 805).ToListAsync());
        aiMock.Verify(a => a.ProcessTurnAsync(
            It.IsAny<Scenario>(),
            It.IsAny<ScenarioLevelConfiguration>(),
            It.IsAny<List<RoleplayMessage>>(),
            It.IsAny<string>(),
            It.IsAny<List<Mission>>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SendMessageAsync_DoesNotDeductCredit_OnPreFlightGuardTurn()
    {
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-guard-free", CreditBalance = 10 };
        var userManagerMock = CreateUserManagerMock(user);

        dbContext.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 806,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active"
        });
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 806,
            MissionId = mission.Id,
            IsCompleted = false
        });
        await dbContext.SaveChangesAsync();

        var aiMock = new Mock<IAiRoleplayService>();
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        // 1. Pure Vietnamese pre-flight guard (0 LLM tokens)
        var viGuardResult = await service.SendMessageAsync(user.Id, 806, new SendRoleplayMessageRequestDto
        {
            Message = "Cho toi mot to ramen"
        });

        Assert.True(viGuardResult.Success);
        Assert.Equal(0, viGuardResult.Data!.CreditsSpentThisTurn);
        Assert.Equal(10, user.CreditBalance);

        // 2. AcousticConfidenceGuard (< 0.35 confidence -> 0 LLM tokens, hỏi lại nhẹ nhàng)
        var lowConfResult = await service.SendMessageAsync(user.Id, 806, new SendRoleplayMessageRequestDto
        {
            Message = "ラーメンをください。",
            SpeechConfidence = 0.25,
            FallbackToTextInput = false
        });

        Assert.True(lowConfResult.Success);
        Assert.Equal(0, lowConfResult.Data!.CreditsSpentThisTurn);
        Assert.Equal(10, user.CreditBalance);
        Assert.Equal("AcousticConfidenceGuard", lowConfResult.Data.UserMessage.LinguisticFeedback?.EvaluationSource);
        Assert.Empty(await dbContext.CreditTransactions.ToListAsync());
    }

    [Fact]
    public async Task SendMessageAsync_AllowsMediumConfidence_WhenAt045()
    {
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-med-conf", CreditBalance = 10 };
        var userManagerMock = CreateUserManagerMock(user);

        dbContext.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 8061,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active"
        });
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 8061,
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
                JapaneseReply = "かしこまりました！",
                VietnameseMeaning = "Vâng, xin đợi một chút ạ!",
                UserFuriganaHtml = "ラーメンをください。",
                LinguisticFeedback = new LinguisticFeedbackDto { Status = "Good", Summary = "Tự nhiên" }
            });

        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        var res = await service.SendMessageAsync(user.Id, 8061, new SendRoleplayMessageRequestDto
        {
            Message = "ラーメンをください。",
            SpeechConfidence = 0.45,
            FallbackToTextInput = false
        });

        Assert.True(res.Success);
        Assert.NotEqual("AcousticConfidenceGuard", res.Data!.UserMessage.LinguisticFeedback?.EvaluationSource);
        Assert.Equal("かしこまりました！", res.Data.AiMessage.JapaneseText);
    }

    [Fact]
    public async Task SendMessageAsync_ComputesJapaneseMoraRate_WhenSpeakingDurationProvidedWithoutMoraRate()
    {
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-mora-calc", CreditBalance = 20 };
        var userManagerMock = CreateUserManagerMock(user);
        userManagerMock.Setup(m => m.UpdateAsync(It.IsAny<ApplicationUser>()))
            .ReturnsAsync(IdentityResult.Success);

        dbContext.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 807,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active"
        });
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 807,
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
                JapaneseReply = "かしこまりました。",
                VietnameseMeaning = "Toi hieu roi.",
                LinguisticFeedback = new LinguisticFeedbackDto
                {
                    Status = "Good",
                    Summary = "Tot",
                    Details = []
                }
            });

        var errorDetector = new VietnameseLearnerErrorDetector();
        var telemetryEvaluator = new TelemetryEvaluatorService(dbContext, errorDetector);
        var personaMemory = new Mock<IPersonaMemoryService>();
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();

        var service = new RoleplaySessionService(
            dbContext,
            userManagerMock.Object,
            aiMock.Object,
            loggerMock.Object,
            errorDetector,
            telemetryEvaluator,
            personaMemory.Object);

        // "ラーメンをください。" = 9 moras; duration 2.0s => 4.5 mora/s
        var result = await service.SendMessageAsync(user.Id, 807, new SendRoleplayMessageRequestDto
        {
            Message = "ラーメンをください。",
            FallbackToTextInput = false,
            SpeechConfidence = 0.92,
            SpeakingDurationSeconds = 2.0,
            MoraRate = null
        });

        Assert.True(result.Success);
        var delivery = result.Data!.UserMessage.LinguisticFeedback?.SpeechDelivery;
        Assert.NotNull(delivery);
        Assert.Equal(4.5, delivery!.MoraRate);
        Assert.Equal(4.5, delivery.SpeechPace);

        var signal = await dbContext.LearnerBehaviorSignals.FirstAsync(s => s.SessionId == 807);
        Assert.Equal(4.5, signal.MoraRate);
    }

    [Fact]
    public async Task GetSessionDetailsAsync_PopulatesHasActiveSubscription_AndResultIdWhenCompleted()
    {
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, _) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser
        {
            Id = "user-details-sub",
            CreditBalance = 33,
            SubscriptionPlanId = "pro-monthly",
            SubscriptionExpiresAt = DateTime.UtcNow.AddDays(5)
        };
        var userManagerMock = CreateUserManagerMock(user);

        dbContext.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 808,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Completed",
            CompletedAt = DateTime.UtcNow
        });
        dbContext.RoleplayResults.Add(new RoleplayResult
        {
            Id = 9808,
            RoleplaySessionId = 808,
            UserId = user.Id,
            ScenarioTitle = "Gọi món Ramen",
            JLPTLevel = "N5",
            OverallScore = 88,
            PassStatus = true,
            CompletedAt = DateTime.UtcNow
        });
        await dbContext.SaveChangesAsync();

        var aiMock = new Mock<IAiRoleplayService>();
        var loggerMock = new Mock<ILogger<RoleplaySessionService>>();
        var service = CreateRoleplaySessionService(dbContext, userManagerMock.Object, aiMock.Object, loggerMock.Object);

        var result = await service.GetSessionDetailsAsync(user.Id, 808);

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.True(result.Data!.HasActiveSubscription);
        Assert.Equal(9808, result.Data.ResultId);
        Assert.Equal(33, result.Data.CreditBalance);
    }

    [Fact]
    public async Task SendMessageAsync_DoesNotPersistUserMessageOrSignal_WhenAiServiceThrows()
    {
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-ai-throw", CreditBalance = 10 };
        var userManagerMock = CreateUserManagerMock(user);
        userManagerMock.Setup(m => m.UpdateAsync(It.IsAny<ApplicationUser>()))
            .ReturnsAsync(IdentityResult.Success);

        dbContext.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 809,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active"
        });
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 809,
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
            .ThrowsAsync(new InvalidOperationException("Simulated AI failure"));

        var errorDetector = new VietnameseLearnerErrorDetector();
        var telemetryEvaluator = new TelemetryEvaluatorService(dbContext, errorDetector);
        var service = new RoleplaySessionService(
            dbContext,
            userManagerMock.Object,
            aiMock.Object,
            new Mock<ILogger<RoleplaySessionService>>().Object,
            errorDetector,
            telemetryEvaluator,
            new Mock<IPersonaMemoryService>().Object);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.SendMessageAsync(user.Id, 809, new SendRoleplayMessageRequestDto
            {
                Message = "とんこつラーメンをください。"
            }));

        Assert.Empty(await dbContext.RoleplayMessages.Where(m => m.RoleplaySessionId == 809).ToListAsync());
        Assert.Empty(await dbContext.LearnerBehaviorSignals.Where(s => s.SessionId == 809).ToListAsync());
        Assert.Empty(await dbContext.CreditTransactions.ToListAsync());
        Assert.Equal(10, user.CreditBalance);
    }

    [Fact]
    public async Task SendMessageAsync_ConcurrentTurnsOnExactBalance_NeverDoubleSpends()
    {
        var dbName = $"JCAP_Race_{Guid.NewGuid()}";
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        using (var seedDb = new AppDbContext(options))
        {
            var (_, levelConfig, mission) = SeedBasicScenario(seedDb);
            seedDb.Users.Add(new ApplicationUser { Id = "user-race-exact", CreditBalance = 2 });
            seedDb.RoleplaySessions.Add(new RoleplaySession
            {
                Id = 810,
                UserId = "user-race-exact",
                ScenarioLevelConfigurationId = levelConfig.Id,
                Status = "Active"
            });
            seedDb.RoleplaySessionMissions.Add(new RoleplaySessionMission
            {
                RoleplaySessionId = 810,
                MissionId = mission.Id,
                IsCompleted = false
            });
            await seedDb.SaveChangesAsync();
        }

        static RoleplaySessionService BuildConcurrentService(AppDbContext db)
        {
            var userStore = new Mock<IUserStore<ApplicationUser>>();
            var userManagerMock = new Mock<UserManager<ApplicationUser>>(
                userStore.Object, null!, null!, null!, null!, null!, null!, null!, null!);

            userManagerMock.Setup(m => m.FindByIdAsync("user-race-exact"))
                .Returns(() => db.Users.FirstOrDefaultAsync(u => u.Id == "user-race-exact"));
            userManagerMock.Setup(m => m.UpdateAsync(It.IsAny<ApplicationUser>()))
                .Returns(async (ApplicationUser u) =>
                {
                    await db.SaveChangesAsync();
                    return IdentityResult.Success;
                });

            var aiMock = new Mock<IAiRoleplayService>();
            aiMock.Setup(a => a.ProcessTurnAsync(
                It.IsAny<Scenario>(),
                It.IsAny<ScenarioLevelConfiguration>(),
                It.IsAny<List<RoleplayMessage>>(),
                It.IsAny<string>(),
                It.IsAny<List<Mission>>(),
                It.IsAny<CancellationToken>()))
                .Returns(async (Scenario s, ScenarioLevelConfiguration c, List<RoleplayMessage> h, string u, List<Mission> m, CancellationToken ct) =>
                {
                    await Task.Delay(40, ct);
                    return new AiTurnResult
                    {
                        JapaneseReply = "かしこまりました。少々お待ちください。",
                        VietnameseMeaning = "Toi da hieu.",
                        CompletedMissionIds = [],
                        IsNaturallyConcluded = false,
                        LinguisticFeedback = new LinguisticFeedbackDto
                        {
                            Status = "Good",
                            Summary = "Tot"
                        }
                    };
                });

            var errorDetector = new VietnameseLearnerErrorDetector();
            var telemetryEvaluator = new TelemetryEvaluatorService(db, errorDetector);
            return new RoleplaySessionService(
                db,
                userManagerMock.Object,
                aiMock.Object,
                new Mock<ILogger<RoleplaySessionService>>().Object,
                errorDetector,
                telemetryEvaluator,
                new Mock<IPersonaMemoryService>().Object);
        }

        using var db1 = new AppDbContext(options);
        using var db2 = new AppDbContext(options);
        var svc1 = BuildConcurrentService(db1);
        var svc2 = BuildConcurrentService(db2);

        var results = await Task.WhenAll(
            svc1.SendMessageAsync("user-race-exact", 810, new SendRoleplayMessageRequestDto { Message = "ラーメンをください。" }),
            svc2.SendMessageAsync("user-race-exact", 810, new SendRoleplayMessageRequestDto { Message = "ラーメンをください。" }));

        Assert.Equal(1, results.Count(r => r.Success));
        Assert.Equal(1, results.Count(r => !r.Success));

        using var verifyDb = new AppDbContext(options);
        var finalUser = await verifyDb.Users.SingleAsync(u => u.Id == "user-race-exact");
        Assert.Equal(0, finalUser.CreditBalance);

        var txs = await verifyDb.CreditTransactions.Where(t => t.UserId == "user-race-exact").ToListAsync();
        Assert.Single(txs);
        Assert.Equal(-2, txs[0].Amount);
    }

    [Fact]
    public async Task SendMessageAsync_FailsCleanlyWithoutPersistingMessages_WhenUserManagerUpdateFails()
    {
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-update-fail", CreditBalance = 10 };
        var userManagerMock = CreateUserManagerMock(user);
        userManagerMock.Setup(m => m.UpdateAsync(It.IsAny<ApplicationUser>()))
            .ReturnsAsync(IdentityResult.Failed(new IdentityError { Code = "ConcurrencyFailure", Description = "Conflict" }));

        dbContext.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 811,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active"
        });
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 811,
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
                JapaneseReply = "かしこまりました。",
                VietnameseMeaning = "Toi da hieu.",
                LinguisticFeedback = new LinguisticFeedbackDto { Status = "Good", Summary = "Tot" }
            });

        var errorDetector = new VietnameseLearnerErrorDetector();
        var telemetryEvaluator = new TelemetryEvaluatorService(dbContext, errorDetector);
        var service = new RoleplaySessionService(
            dbContext,
            userManagerMock.Object,
            aiMock.Object,
            new Mock<ILogger<RoleplaySessionService>>().Object,
            errorDetector,
            telemetryEvaluator,
            new Mock<IPersonaMemoryService>().Object);

        var result = await service.SendMessageAsync(user.Id, 811, new SendRoleplayMessageRequestDto
        {
            Message = "ラーメンをください。"
        });

        Assert.False(result.Success);
        Assert.Equal(10, user.CreditBalance);
        Assert.Empty(await dbContext.RoleplayMessages.Where(m => m.RoleplaySessionId == 811).ToListAsync());
        Assert.Empty(await dbContext.LearnerBehaviorSignals.Where(s => s.SessionId == 811).ToListAsync());
        Assert.Empty(await dbContext.CreditTransactions.ToListAsync());
    }

    [Fact]
    public async Task SendMessageAsync_ClearsTurnSignalMoraRate_WhenPostAiFuriganaLowersPaceBelowOne()
    {
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-mora-sync", CreditBalance = 20 };
        var userManagerMock = CreateUserManagerMock(user);
        userManagerMock.Setup(m => m.UpdateAsync(It.IsAny<ApplicationUser>()))
            .ReturnsAsync(IdentityResult.Success);

        dbContext.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 812,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active"
        });
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 812,
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
                JapaneseReply = "はい。",
                VietnameseMeaning = "Vang.",
                UserFuriganaHtml = "<ruby>一二三<rt>いち</rt></ruby>",
                LinguisticFeedback = new LinguisticFeedbackDto
                {
                    Status = "Good",
                    Summary = "Tot",
                    Details = []
                }
            });

        var errorDetector = new VietnameseLearnerErrorDetector();
        var telemetryEvaluator = new TelemetryEvaluatorService(dbContext, errorDetector);
        var service = new RoleplaySessionService(
            dbContext,
            userManagerMock.Object,
            aiMock.Object,
            new Mock<ILogger<RoleplaySessionService>>().Object,
            errorDetector,
            telemetryEvaluator,
            new Mock<IPersonaMemoryService>().Object);

        // Pre-AI kanji count (3) / 2.6s = 1.2 >= 1.0, but post-AI furigana (<rt>いち</rt>) yields 2 / 2.6s = 0.8 < 1.0
        var result = await service.SendMessageAsync(user.Id, 812, new SendRoleplayMessageRequestDto
        {
            Message = "一二三",
            FallbackToTextInput = false,
            SpeechConfidence = 0.90,
            SpeakingDurationSeconds = 2.6,
            MoraRate = null
        });

        Assert.True(result.Success);
        var delivery = result.Data!.UserMessage.LinguisticFeedback?.SpeechDelivery;
        Assert.NotNull(delivery);
        Assert.Null(delivery!.MoraRate);

        var signal = await dbContext.LearnerBehaviorSignals.SingleAsync(s => s.SessionId == 812);
        Assert.Equal(0.0, signal.MoraRate);
    }

    [Fact]
    public async Task SendMessageAsync_SyncsTurnSignalMoraRate_WhenLinguisticFeedbackIsNull()
    {
        using var dbContext = CreateInMemoryDbContext();
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-mora-null-fb", CreditBalance = 20 };
        var userManagerMock = CreateUserManagerMock(user);
        userManagerMock.Setup(m => m.UpdateAsync(It.IsAny<ApplicationUser>()))
            .ReturnsAsync(IdentityResult.Success);

        dbContext.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 813,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active"
        });
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 813,
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
                JapaneseReply = "はい。",
                VietnameseMeaning = "Vang.",
                UserFuriganaHtml = "<ruby>一二三<rt>いち</rt></ruby>",
                LinguisticFeedback = null
            });

        var errorDetector = new VietnameseLearnerErrorDetector();
        var telemetryEvaluator = new TelemetryEvaluatorService(dbContext, errorDetector);
        var service = new RoleplaySessionService(
            dbContext,
            userManagerMock.Object,
            aiMock.Object,
            new Mock<ILogger<RoleplaySessionService>>().Object,
            errorDetector,
            telemetryEvaluator,
            new Mock<IPersonaMemoryService>().Object);

        // Pre-AI kanji count (3) / 2.6s = 1.2 >= 1.0, but post-AI furigana (<rt>いち</rt>) yields 2 / 2.6s = 0.8 < 1.0
        var result = await service.SendMessageAsync(user.Id, 813, new SendRoleplayMessageRequestDto
        {
            Message = "一二三",
            FallbackToTextInput = false,
            SpeechConfidence = 0.90,
            SpeakingDurationSeconds = 2.6,
            MoraRate = null
        });

        Assert.True(result.Success);
        var signal = await dbContext.LearnerBehaviorSignals.SingleAsync(s => s.SessionId == 813);
        Assert.Equal(0.0, signal.MoraRate);
    }

    private sealed class ThrowingSaveDbContext : AppDbContext
    {
        public bool ThrowWhenCreditTransactionAdded { get; set; }

        public ThrowingSaveDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            if (ThrowWhenCreditTransactionAdded
                && ChangeTracker.Entries<CreditTransaction>().Any(e => e.State == EntityState.Added))
            {
                ThrowWhenCreditTransactionAdded = false;
                throw new DbUpdateException("Simulated SaveChangesAsync failure");
            }
            return base.SaveChangesAsync(cancellationToken);
        }
    }

    [Fact]
    public async Task SendMessageAsync_DetachesPendingCreditTransactionAndEntities_WhenSaveChangesThrows()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: $"JCAP_SaveThrow_{Guid.NewGuid()}")
            .Options;
        using var dbContext = new ThrowingSaveDbContext(options);
        var (_, levelConfig, mission) = SeedBasicScenario(dbContext);

        var user = new ApplicationUser { Id = "user-save-throw", CreditBalance = 20 };
        var userManagerMock = CreateUserManagerMock(user);
        userManagerMock.Setup(m => m.UpdateAsync(It.IsAny<ApplicationUser>()))
            .ReturnsAsync(IdentityResult.Success);

        dbContext.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 814,
            UserId = user.Id,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active"
        });
        dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
        {
            RoleplaySessionId = 814,
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
                JapaneseReply = "かしこまりました。",
                VietnameseMeaning = "Toi da hieu.",
                LinguisticFeedback = new LinguisticFeedbackDto
                {
                    Status = "Good",
                    Summary = "Tot",
                    Details = []
                }
            });

        var errorDetector = new VietnameseLearnerErrorDetector();
        var telemetryEvaluator = new TelemetryEvaluatorService(dbContext, errorDetector);
        var service = new RoleplaySessionService(
            dbContext,
            userManagerMock.Object,
            aiMock.Object,
            new Mock<ILogger<RoleplaySessionService>>().Object,
            errorDetector,
            telemetryEvaluator,
            new Mock<IPersonaMemoryService>().Object);

        dbContext.ThrowWhenCreditTransactionAdded = true;

        await Assert.ThrowsAsync<DbUpdateException>(() =>
            service.SendMessageAsync(user.Id, 814, new SendRoleplayMessageRequestDto
            {
                Message = "ラーメンをください。"
            }));

        Assert.DoesNotContain(
            dbContext.ChangeTracker.Entries<CreditTransaction>(),
            e => e.State == EntityState.Added);
        Assert.DoesNotContain(
            dbContext.ChangeTracker.Entries<RoleplayMessage>(),
            e => e.State == EntityState.Added);
        Assert.DoesNotContain(
            dbContext.ChangeTracker.Entries<LearnerBehaviorSignal>(),
            e => e.State == EntityState.Added);
    }
}


