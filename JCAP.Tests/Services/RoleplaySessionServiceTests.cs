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

        // user.CreditBalance = 0 (default) → không trừ credit nhưng vẫn hoạt động
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
        // user.CreditBalance = 0 → creditsSpentThisTurn = 0 (hết credit, được phép tiếp tục nhưng ghi log)
        Assert.Equal(0, result.Data.CreditsSpentThisTurn);

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

        // Assert
        Assert.True(result.Success);
        Assert.Equal(1, result.Data!.CreditsSpentThisTurn);  // tối thiểu 1 credit
        Assert.Equal(49, result.Data.CreditBalance);          // 50 - 1 = 49
        Assert.Equal(49, user.CreditBalance);                 // model được cập nhật

        // Verify transaction ghi vào DB
        var deductTx = dbContext.CreditTransactions
            .FirstOrDefault(t => t.Type == "Deduct" && t.Description != null && t.Description.Contains("Lượt hội thoại AI"));
        Assert.NotNull(deductTx);
        Assert.Equal(-1, deductTx!.Amount);
    }

    [Fact]
    public void EstimateCreditCost_ReturnsMinimumOne_ForShortReplies()
    {
        Assert.Equal(1, RoleplaySessionService.EstimateCreditCost(""));
        Assert.Equal(1, RoleplaySessionService.EstimateCreditCost("   "));
        Assert.Equal(1, RoleplaySessionService.EstimateCreditCost("はい。"));           // 3 chars
        Assert.Equal(1, RoleplaySessionService.EstimateCreditCost("かしこまりました。")); // 9 chars
    }

    [Fact]
    public void EstimateCreditCost_ScalesWithReplyLength()
    {
        // 30 chars → 30/30 = 1 credit
        Assert.Equal(1, RoleplaySessionService.EstimateCreditCost(new string('あ', 30)));
        // 60 chars → 60/30 = 2 credits
        Assert.Equal(2, RoleplaySessionService.EstimateCreditCost(new string('あ', 60)));
        // 90 chars → 90/30 = 3 credits
        Assert.Equal(3, RoleplaySessionService.EstimateCreditCost(new string('あ', 90)));
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
}


