using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.PlacementTest;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace JCAP.Tests.Services;

public class PlacementTestServiceTests
{
    private static AppDbContext CreateInMemoryContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"PlacementTests_{Guid.NewGuid()}")
            .Options);

    private static ApplicationUser CreateUser(
        string id = "learner-1",
        string status = "NotStarted",
        string? initialLevel = null,
        string? jlptLevel = "N5") =>
        new()
        {
            Id = id,
            UserName = $"{id}@jcap.test",
            Email = $"{id}@jcap.test",
            Role = "Learner",
            JLPTLevel = jlptLevel,
            PlacementTestStatus = status,
            InitialEstimatedLevel = initialLevel,
            IsActive = true
        };

    private static IConfiguration CreateConfig(bool allowRetake = false) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["PlacementTest:AllowRetakeForTesting"] = allowRetake ? "true" : "false"
            })
            .Build();

    private static PlacementAssessmentEngine CreateEngine(Mock<IAiClient>? aiMock = null) =>
        new(
            (aiMock ?? new Mock<IAiClient>()).Object,
            new VietnameseLearnerErrorDetector(),
            NullLogger<PlacementAssessmentEngine>.Instance);

    private static PlacementTestService CreateService(
        AppDbContext db,
        Mock<IAiClient>? aiMock = null,
        bool allowRetake = false) =>
        new(
            db,
            CreateEngine(aiMock),
            NullLogger<PlacementTestService>.Instance,
            voiceVoxService: null,
            configuration: CreateConfig(allowRetake));

    private static string BuildValidJson(
        string inputCategory = "Valid",
        string detectedIntent = "ConfirmReservation",
        string demonstratedBand = "N4",
        string replyJa = "ミン様、ありがとうございます。スタンダードルームの512号室をご用意しております。こちらの部屋でよろしいでしょうか。",
        string replyVi = "Cảm ơn quý khách Minh. Chúng tôi đã chuẩn bị phòng 512, phòng này có ổn không ạ?",
        string taskAchievement = "Exceeded_ProactiveDetail",
        string sentenceStructure = "Compound_LinkedClause",
        string grammarSeverity = "NoError",
        string lexicalUsage = "Rich_SituationalSpecific",
        string politeness = "Advanced_KeigoOrCushioned") =>
        $$"""
        {
          "userVietnameseMeaning": "Tôi là Minh, tôi đã đặt phòng 3 đêm.",
          "turnAnalysis": {
            "inputCategory": "{{inputCategory}}",
            "detectedIntent": "{{detectedIntent}}",
            "demonstratedBand": "{{demonstratedBand}}",
            "evidence": {
              "taskAchievement": "{{taskAchievement}}",
              "sentenceStructure": "{{sentenceStructure}}",
              "grammarErrorSeverity": "{{grammarSeverity}}",
              "grammarErrors": [],
              "lexicalUsage": "{{lexicalUsage}}",
              "politenessRegister": "{{politeness}}"
            },
            "evidenceNote": "Phản hồi phù hợp bối cảnh."
          },
          "replyJapanese": "{{replyJa}}",
          "replyVietnamese": "{{replyVi}}"
        }
        """;

    private static Mock<IAiClient> CreateMockAi(string json, string model = "gemini-2.5-flash")
    {
        var mock = new Mock<IAiClient>();
        mock.Setup(x => x.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(json, model));
        return mock;
    }

    private static PlacementAssessmentState CreateMixedBandConcludedState() =>
        new()
        {
            CurrentEvent = "CONCLUDED",
            TerminationReason = "CompletedNormally",
            ValidEvidenceTurnCount = 5,
            TurnEvidences =
            [
                new PlacementTurnEvidence
                {
                    TurnIndex = 1, EventCode = "EVT-01", InputClassification = "Valid",
                    DetectedIntent = "ConfirmReservation", DemonstratedBand = "N4",
                    TaskFulfillmentScore = 90, GrammarAccuracyScore = 93, VocabularyRangeScore = 86, PragmaticsScore = 86
                },
                new PlacementTurnEvidence
                {
                    TurnIndex = 2, EventCode = "EVT-02", InputClassification = "Valid",
                    DetectedIntent = "RequestRoomChange", DemonstratedBand = "N4",
                    TaskFulfillmentScore = 90, GrammarAccuracyScore = 93, VocabularyRangeScore = 86, PragmaticsScore = 86
                },
                new PlacementTurnEvidence
                {
                    TurnIndex = 3, EventCode = "EVT-03", InputClassification = "Valid",
                    DetectedIntent = "AcceptDeluxeUpgrade", DemonstratedBand = "N3",
                    TaskFulfillmentScore = 85, GrammarAccuracyScore = 88, VocabularyRangeScore = 85, PragmaticsScore = 85
                },
                new PlacementTurnEvidence
                {
                    TurnIndex = 4, EventCode = "EVT-04", InputClassification = "Valid",
                    DetectedIntent = "DeclineBreakfast", DemonstratedBand = "N5",
                    TaskFulfillmentScore = 90, GrammarAccuracyScore = 92, VocabularyRangeScore = 90, PragmaticsScore = 90
                },
                new PlacementTurnEvidence
                {
                    TurnIndex = 5, EventCode = "EVT-05", InputClassification = "Valid",
                    DetectedIntent = "ConfirmAndThank", DemonstratedBand = "N5",
                    TaskFulfillmentScore = 90, GrammarAccuracyScore = 92, VocabularyRangeScore = 90, PragmaticsScore = 90
                }
            ],
            EventSummaries =
            [
                new PlacementEventEvidenceSummary { EventCode = "EVT-01", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N4" },
                new PlacementEventEvidenceSummary { EventCode = "EVT-02", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N4" },
                new PlacementEventEvidenceSummary { EventCode = "EVT-03", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N3" },
                new PlacementEventEvidenceSummary { EventCode = "EVT-04", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N5" },
                new PlacementEventEvidenceSummary { EventCode = "EVT-05", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N5" }
            ]
        };

    #region UC83.1: StartOrResumeSessionAsync

    [Fact]
    public async Task UC83_1_UTCID01_StartNewSession_NotStartedUser_CreatesFreeSessionWithOpeningGreeting()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "NotStarted"));
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.StartOrResumeSessionAsync("learner-1", reset: false);

        Assert.True(res.Success);
        Assert.Equal("Bắt đầu bài kiểm tra xếp lớp thành công.", res.Message);
        Assert.False(res.Data!.IsResumed);
        Assert.Equal("Active", res.Data.Status);
        Assert.Equal("EVT-01", res.Data.CurrentEvent);
        Assert.Equal("N4", res.Data.CurrentDifficultyBand);
        Assert.Single(res.Data.MessageHistory);
        Assert.Equal("Ai", res.Data.OpeningMessage.Sender);
        Assert.Contains("ホテルさくら", res.Data.OpeningMessage.JapaneseText);

        var session = await db.RoleplaySessions.SingleAsync();
        Assert.Equal(0, session.CreditDeducted);
        Assert.Equal("PlacementTest", session.SessionType);

        var user = await db.Users.SingleAsync();
        Assert.Equal("InProgress", user.PlacementTestStatus);
        Assert.True(user.HasSeenPlacementPrompt);
    }

    [Fact]
    public async Task UC83_1_UTCID02_ResumeExistingActiveSession_ReturnsSavedStateAndMessages()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress"));
        var savedState = new PlacementAssessmentState { CurrentEvent = "EVT-03", CurrentDifficultyBand = "N3" };
        var session = new RoleplaySession
        {
            Id = 50,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = JsonSerializer.Serialize(savedState),
            CreatedAt = DateTime.UtcNow.AddMinutes(-5)
        };
        db.RoleplaySessions.Add(session);
        db.RoleplayMessages.AddRange(
            new RoleplayMessage { RoleplaySessionId = 50, Sender = "Ai", JapaneseText = "いらっしゃいませ。", CreatedAt = DateTime.UtcNow.AddMinutes(-4) },
            new RoleplayMessage { RoleplaySessionId = 50, Sender = "User", JapaneseText = "ミンです。", CreatedAt = DateTime.UtcNow.AddMinutes(-3) }
        );
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.StartOrResumeSessionAsync("learner-1", reset: false);

        Assert.True(res.Success);
        Assert.Equal("Tiếp tục bài kiểm tra xếp lớp đang dở.", res.Message);
        Assert.True(res.Data!.IsResumed);
        Assert.Equal(50, res.Data.SessionId);
        Assert.Equal("EVT-03", res.Data.CurrentEvent);
        Assert.Equal("N3", res.Data.CurrentDifficultyBand);
        Assert.Equal(2, res.Data.MessageHistory.Count);
    }

    [Fact]
    public async Task UC83_1_UTCID03_StartWithResetTrue_DeletesOldActiveSessionAndCreatesFreshSession()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress"));
        var oldSession = new RoleplaySession
        {
            Id = 60,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = JsonSerializer.Serialize(new PlacementAssessmentState { CurrentEvent = "EVT-04" })
        };
        db.RoleplaySessions.Add(oldSession);
        db.RoleplayMessages.Add(new RoleplayMessage { RoleplaySessionId = 60, Sender = "User", JapaneseText = "古いメッセージ" });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.StartOrResumeSessionAsync("learner-1", reset: true);

        Assert.True(res.Success);
        Assert.False(res.Data!.IsResumed);
        Assert.NotEqual(60, res.Data.SessionId);
        Assert.Equal("EVT-01", res.Data.CurrentEvent);
        Assert.Null(await db.RoleplaySessions.FindAsync(60));
        Assert.Equal(1, await db.RoleplaySessions.CountAsync());
        Assert.Equal(1, await db.RoleplayMessages.CountAsync());
    }

    [Fact]
    public async Task UC83_1_UTCID04_StartFromSkippedStatus_UpdatesUserToInProgress()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "Skipped"));
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.StartOrResumeSessionAsync("learner-1");

        Assert.True(res.Success);
        var user = await db.Users.SingleAsync();
        Assert.Equal("InProgress", user.PlacementTestStatus);
    }

    [Fact]
    public async Task UC83_1_UTCID05_StartWhenCompletedAndRetakeAllowed_CreatesSessionAndPreservesCompletedStatus()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "Completed", "N4"));
        await db.SaveChangesAsync();

        var service = CreateService(db, allowRetake: true);
        var res = await service.StartOrResumeSessionAsync("learner-1", reset: true);

        Assert.True(res.Success);
        Assert.False(res.Data!.IsResumed);
        var user = await db.Users.SingleAsync();
        Assert.Equal("Completed", user.PlacementTestStatus);
    }

    [Fact]
    public async Task UC83_1_UTCID06_ResetTrueWithNoExistingActiveSession_StartsCleanly()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "NotStarted"));
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.StartOrResumeSessionAsync("learner-1", reset: true);

        Assert.True(res.Success);
        Assert.False(res.Data!.IsResumed);
        Assert.Equal(1, await db.RoleplaySessions.CountAsync());
    }

    [Fact]
    public async Task UC83_1_UTCID07_ResumeActiveSessionWithBlankAssessmentStateJson_UsesDefaultState()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress"));
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 71,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = null
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.StartOrResumeSessionAsync("learner-1", reset: false);

        Assert.True(res.Success);
        Assert.True(res.Data!.IsResumed);
        Assert.Equal("EVT-01", res.Data.CurrentEvent);
        Assert.Equal("N4", res.Data.CurrentDifficultyBand);
    }

    [Fact]
    public async Task UC83_1_UTCID08_StandardRoleplayActiveSession_IsIsolatedFromPlacementStartAndReset()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "NotStarted"));
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 88,
            UserId = "learner-1",
            SessionType = "Standard",
            Status = "Active"
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.StartOrResumeSessionAsync("learner-1", reset: true);

        Assert.True(res.Success);
        Assert.NotEqual(88, res.Data!.SessionId);
        Assert.NotNull(await db.RoleplaySessions.FindAsync(88));
        Assert.Equal(2, await db.RoleplaySessions.CountAsync());
    }

    [Fact]
    public async Task UC83_1_UTCID09_NonExistentUser_ReturnsFail()
    {
        using var db = CreateInMemoryContext();
        var service = CreateService(db);

        var res = await service.StartOrResumeSessionAsync("missing-user");

        Assert.False(res.Success);
        Assert.Equal("Không tìm thấy thông tin người dùng.", res.Message);
    }

    [Fact]
    public async Task UC83_1_UTCID10_AlreadyCompletedWithoutAllowRetake_ReturnsFail()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "Completed", "N4"));
        await db.SaveChangesAsync();

        var service = CreateService(db, allowRetake: false);
        var res = await service.StartOrResumeSessionAsync("learner-1");

        Assert.False(res.Success);
        Assert.Equal("Bạn đã hoàn thành bài kiểm tra xếp lớp đầu vào. Mỗi tài khoản chỉ thực hiện một lần.", res.Message);
    }

    [Fact]
    public async Task UC83_1_UTCID11_EmptyOrWhitespaceUserId_ReturnsFail()
    {
        using var db = CreateInMemoryContext();
        var service = CreateService(db);

        var res = await service.StartOrResumeSessionAsync("   ");

        Assert.False(res.Success);
        Assert.Equal("Không tìm thấy thông tin người dùng.", res.Message);
    }

    #endregion

    #region UC83.2: ProcessMessageAsync

    [Fact]
    public async Task UC83_2_UTCID01_ValidTurn_PersistsMessagesAndUpdatesAssessmentState()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress"));
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 10,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = JsonSerializer.Serialize(new PlacementAssessmentState())
        });
        await db.SaveChangesAsync();

        var aiMock = CreateMockAi(BuildValidJson("Valid", "ConfirmReservation", "N4"));
        var service = CreateService(db, aiMock);

        var res = await service.ProcessMessageAsync("learner-1", 10, new PlacementTestMessageRequestDto
        {
            Message = "ミンと申します。チェックインをお願いします。"
        });

        Assert.True(res.Success);
        Assert.False(res.Data!.IsConcluded);
        Assert.Equal("EVT-02", res.Data.CurrentEvent);
        Assert.Equal("Valid", res.Data.InputClassification);
        Assert.Equal(2, await db.RoleplayMessages.CountAsync(m => m.RoleplaySessionId == 10));
    }

    [Fact]
    public async Task UC83_2_UTCID02_ConcludingTurnAtEvt05_CompletesSessionAndUpdatesUserProfile()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress", null, "N5"));
        var state = new PlacementAssessmentState
        {
            CurrentEvent = "EVT-05",
            CurrentDifficultyBand = "N4",
            ValidEvidenceTurnCount = 4,
            TurnEvidences =
            [
                new PlacementTurnEvidence { TurnIndex = 1, EventCode = "EVT-01", InputClassification = "Valid", DemonstratedBand = "N4", TaskFulfillmentScore = 90, GrammarAccuracyScore = 92, VocabularyRangeScore = 88, PragmaticsScore = 88 },
                new PlacementTurnEvidence { TurnIndex = 2, EventCode = "EVT-02", InputClassification = "Valid", DemonstratedBand = "N4", TaskFulfillmentScore = 90, GrammarAccuracyScore = 92, VocabularyRangeScore = 88, PragmaticsScore = 88 },
                new PlacementTurnEvidence { TurnIndex = 3, EventCode = "EVT-03", InputClassification = "Valid", DemonstratedBand = "N4", TaskFulfillmentScore = 90, GrammarAccuracyScore = 92, VocabularyRangeScore = 88, PragmaticsScore = 88 },
                new PlacementTurnEvidence { TurnIndex = 4, EventCode = "EVT-04", InputClassification = "Valid", DemonstratedBand = "N4", TaskFulfillmentScore = 90, GrammarAccuracyScore = 92, VocabularyRangeScore = 88, PragmaticsScore = 88 }
            ],
            EventSummaries =
            [
                new PlacementEventEvidenceSummary { EventCode = "EVT-01", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N4" },
                new PlacementEventEvidenceSummary { EventCode = "EVT-02", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N4" },
                new PlacementEventEvidenceSummary { EventCode = "EVT-03", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N4" },
                new PlacementEventEvidenceSummary { EventCode = "EVT-04", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N4" }
            ]
        };
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 11,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = JsonSerializer.Serialize(state)
        });
        await db.SaveChangesAsync();

        var aiMock = CreateMockAi(BuildValidJson("Valid", "ConfirmAndThank", "N4",
            "ありがとうございました。どうぞごゆっくりお寛ぎください。",
            "Xin cảm ơn quý khách. Chúc quý khách nghỉ ngơi thoải mái."));
        var service = CreateService(db, aiMock);

        var res = await service.ProcessMessageAsync("learner-1", 11, new PlacementTestMessageRequestDto
        {
            Message = "ありがとうございました。よろしくお願いします。"
        });

        Assert.True(res.Success);
        Assert.True(res.Data!.IsConcluded);
        Assert.Equal("CompletedNormally", res.Data.TerminationReason);

        var session = await db.RoleplaySessions.FindAsync(11);
        Assert.Equal("Completed", session!.Status);
        Assert.True(session.IsNaturallyConcluded);

        var user = await db.Users.FindAsync("learner-1");
        Assert.Equal("Completed", user!.PlacementTestStatus);
        Assert.Equal("N4", user.InitialEstimatedLevel);
        Assert.Equal("N4", user.JLPTLevel);
        Assert.NotNull(user.InitialProficiencySnapshotJson);
        Assert.NotNull(user.PlacementTestCompletedAtUtc);
    }

    [Fact]
    public async Task UC83_2_UTCID03_FirstSpamStrike_ReturnsStrikeWarningAndKeepsSessionActive()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress"));
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 12,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = JsonSerializer.Serialize(new PlacementAssessmentState())
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.ProcessMessageAsync("learner-1", 12, new PlacementTestMessageRequestDto { Message = "hello spam" });

        Assert.True(res.Success);
        Assert.Equal("AbusiveOrSpam", res.Data!.InputClassification);
        Assert.True(res.Data.IsStrikeWarning);
        Assert.False(res.Data.IsConcluded);
        var session = await db.RoleplaySessions.FindAsync(12);
        Assert.Equal("Active", session!.Status);
    }

    [Fact]
    public async Task UC83_2_UTCID04_ThirdSpamStrike_TerminatesEarlyWithInsufficientEvidence()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress"));
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 13,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = JsonSerializer.Serialize(new PlacementAssessmentState { AbuseOrSpamStrikeCount = 2 })
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.ProcessMessageAsync("learner-1", 13, new PlacementTestMessageRequestDto { Message = "aaaaa" });

        Assert.True(res.Success);
        Assert.True(res.Data!.IsConcluded);
        Assert.Equal("AbuseOrSpamLimit", res.Data.TerminationReason);

        var session = await db.RoleplaySessions.FindAsync(13);
        Assert.Equal("TerminatedEarly", session!.Status);
        Assert.False(session.IsNaturallyConcluded);

        var user = await db.Users.FindAsync("learner-1");
        Assert.Equal("InsufficientEvidence", user!.PlacementTestStatus);
    }

    [Fact]
    public async Task UC83_2_UTCID05_WhitespacePaddedJapaneseMessage_TrimsStoredUserMessage()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress"));
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 14,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active"
        });
        await db.SaveChangesAsync();

        var aiMock = CreateMockAi(BuildValidJson("Valid", "ConfirmReservation", "N4"));
        var service = CreateService(db, aiMock);

        var res = await service.ProcessMessageAsync("learner-1", 14, new PlacementTestMessageRequestDto
        {
            Message = "   ミンです。チェックインをお願いします。   "
        });

        Assert.True(res.Success);
        Assert.Equal("ミンです。チェックインをお願いします。", res.Data!.UserMessage.JapaneseText);
    }

    [Fact]
    public async Task UC83_2_UTCID06_ActiveSessionWithNullAssessmentStateJson_InitializesStateSafely()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress"));
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 15,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = null
        });
        await db.SaveChangesAsync();

        var aiMock = CreateMockAi(BuildValidJson("Valid", "ConfirmReservation", "N4"));
        var service = CreateService(db, aiMock);

        var res = await service.ProcessMessageAsync("learner-1", 15, new PlacementTestMessageRequestDto
        {
            Message = "ミンと申します。"
        });

        Assert.True(res.Success);
        Assert.Equal("EVT-02", res.Data!.CurrentEvent);
    }

    [Fact]
    public async Task UC83_2_UTCID07_TerminatedEarlyDuringRetake_PreservesCompletedUserStatus()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "Completed", "N4"));
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 16,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = JsonSerializer.Serialize(new PlacementAssessmentState { AbuseOrSpamStrikeCount = 2 })
        });
        await db.SaveChangesAsync();

        var service = CreateService(db, allowRetake: true);
        var res = await service.ProcessMessageAsync("learner-1", 16, new PlacementTestMessageRequestDto { Message = "12345" });

        Assert.True(res.Success);
        Assert.True(res.Data!.IsConcluded);
        var session = await db.RoleplaySessions.FindAsync(16);
        Assert.Equal("TerminatedEarly", session!.Status);
        var user = await db.Users.FindAsync("learner-1");
        Assert.Equal("Completed", user!.PlacementTestStatus);
    }

    [Fact]
    public async Task UC83_2_UTCID08_EmptyMessage_ReturnsValidationFail()
    {
        using var db = CreateInMemoryContext();
        var service = CreateService(db);

        var res = await service.ProcessMessageAsync("learner-1", 10, new PlacementTestMessageRequestDto { Message = "   " });

        Assert.False(res.Success);
        Assert.Equal("Nội dung tin nhắn không được để trống.", res.Message);
    }

    [Fact]
    public async Task UC83_2_UTCID09_NonExistentSessionId_ReturnsNotFoundFail()
    {
        using var db = CreateInMemoryContext();
        var service = CreateService(db);

        var res = await service.ProcessMessageAsync("learner-1", 999, new PlacementTestMessageRequestDto { Message = "田中です。" });

        Assert.False(res.Success);
        Assert.Equal("Không tìm thấy phiên kiểm tra xếp lớp.", res.Message);
    }

    [Fact]
    public async Task UC83_2_UTCID10_SessionOwnedByOtherUser_ReturnsNotFoundFail()
    {
        using var db = CreateInMemoryContext();
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 17,
            UserId = "learner-2",
            SessionType = "PlacementTest",
            Status = "Active"
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.ProcessMessageAsync("learner-1", 17, new PlacementTestMessageRequestDto { Message = "田中です。" });

        Assert.False(res.Success);
        Assert.Equal("Không tìm thấy phiên kiểm tra xếp lớp.", res.Message);
    }

    [Fact]
    public async Task UC83_2_UTCID11_CompletedOrTerminatedSession_ReturnsFail()
    {
        using var db = CreateInMemoryContext();
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 18,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Completed"
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.ProcessMessageAsync("learner-1", 18, new PlacementTestMessageRequestDto { Message = "田中です。" });

        Assert.False(res.Success);
        Assert.Equal("Phiên kiểm tra này đã kết thúc.", res.Message);
    }

    #endregion

    #region UC83.3: PlacementAssessmentEngine.EvaluateTurnAsync

    [Fact]
    public async Task UC83_3_UTCID01_Evt01AnyGuestName_ConfirmsReservationAndAdvancesToEvt02()
    {
        var aiMock = CreateMockAi(BuildValidJson("Valid", "ConfirmReservation", "N5",
            "ミン様、ありがとうございます。512号室をご用意しております。",
            "Cảm ơn quý khách Minh.",
            "Fulfilled_Core", "Simple_CompleteClause", "NoError", "Adequate_StandardTopic", "Standard_Teineigo"));
        var engine = CreateEngine(aiMock);
        var state = new PlacementAssessmentState { CurrentEvent = "EVT-01", CurrentDifficultyBand = "N4" };

        var (updated, outcome) = await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "ミンです。" }, "");

        Assert.True(updated.ReservationConfirmed);
        Assert.Equal("EVT-02", updated.CurrentEvent);
        Assert.Equal("Valid", outcome.InputClassification);
    }

    [Fact]
    public async Task UC83_3_UTCID02_Evt02ToEvt03ToEvt04RoomUpgradeFlow_UpdatesStateAndSelectedRoom()
    {
        var aiMockEvt2 = CreateMockAi(BuildValidJson("Valid", "RequestRoomChange", "N4",
            "申し訳ございません。デラックスルームの801号室は1泊2,000円でございます。",
            "Phòng Deluxe 801 phụ phí 2,000 Yên/đêm ạ."));
        var engine2 = CreateEngine(aiMockEvt2);
        var state = new PlacementAssessmentState { CurrentEvent = "EVT-02", CurrentDifficultyBand = "N4", ReservationConfirmed = true };

        var (afterEvt2, _) = await engine2.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "ほかの部屋に変えてもらえませんか？" }, "");
        Assert.True(afterEvt2.RoomChangeRequested);
        Assert.Equal("EVT-03", afterEvt2.CurrentEvent);

        var aiMockEvt3 = CreateMockAi(BuildValidJson("Valid", "AcceptDeluxeUpgrade", "N4",
            "ありがとうございます。801号室にご変更いたします。ご朝食はいかがなさいますか？",
            "Cảm ơn quý khách. Quý khách có dùng bữa sáng không ạ?"));
        var engine3 = CreateEngine(aiMockEvt3);

        var (afterEvt3, _) = await engine3.EvaluateTurnAsync(afterEvt2, new PlacementTestMessageRequestDto { Message = "では、デラックスルームにします。" }, "");
        Assert.Equal("Deluxe_Upgrade", afterEvt3.SelectedRoom);
        Assert.Equal("EVT-04", afterEvt3.CurrentEvent);
    }

    [Fact]
    public async Task UC83_3_UTCID03_Evt04BreakfastAndEvt05Confirm_ConcludesSessionNormally()
    {
        var aiMockEvt4 = CreateMockAi(BuildValidJson("Valid", "AddBreakfast", "N4",
            "かしこまりました。ご朝食を追加いたしました。",
            "Tôi đã thêm bữa sáng ạ."));
        var engine4 = CreateEngine(aiMockEvt4);
        var state = new PlacementAssessmentState { CurrentEvent = "EVT-04", CurrentDifficultyBand = "N4", SelectedRoom = "Deluxe_Upgrade" };

        var (afterEvt4, outcome4) = await engine4.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "はい、朝ごはんをお願いします。" }, "");
        Assert.Equal("Added", afterEvt4.BreakfastDecision);
        Assert.Equal("EVT-05", afterEvt4.CurrentEvent);
        Assert.False(outcome4.IsConcluded);

        var aiMockEvt5 = CreateMockAi(BuildValidJson("Valid", "ConfirmAndThank", "N4",
            "ありがとうございました。ごゆっくりお寛ぎください。",
            "Xin cảm ơn quý khách."));
        var engine5 = CreateEngine(aiMockEvt5);

        var (afterEvt5, outcome5) = await engine5.EvaluateTurnAsync(afterEvt4, new PlacementTestMessageRequestDto { Message = "いろいろありがとうございました。" }, "");
        Assert.Equal("CONCLUDED", afterEvt5.CurrentEvent);
        Assert.Equal("CompletedNormally", afterEvt5.TerminationReason);
        Assert.True(outcome5.IsConcluded);
    }

    [Fact]
    public async Task UC83_3_UTCID04_ShortCommunicationDifficultyPhrase_StepsDownBandWithoutStrike()
    {
        var aiMock = new Mock<IAiClient>();
        var engine = CreateEngine(aiMock);
        var state = new PlacementAssessmentState { CurrentEvent = "EVT-01", CurrentDifficultyBand = "N4" };

        var (updated, outcome) = await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "わかりません" }, "");

        Assert.Equal("CommunicationDifficulty", outcome.InputClassification);
        Assert.Equal("N5", updated.CurrentDifficultyBand);
        Assert.Equal(1, updated.CurrentEventScaffoldingStep);
        Assert.Equal(0, updated.AbuseOrSpamStrikeCount);
        Assert.False(outcome.IsStrikeWarning);
        aiMock.Verify(x => x.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task UC83_3_UTCID05_ClarificationIntentFromAi_ProtectedFromOffTopicPenalty()
    {
        var aiMock = CreateMockAi(BuildValidJson("OffTopic", "RequestRepetition", "N4",
            "すみません、ゆっくりお話ししますね。",
            "Xin lỗi, tôi sẽ nói chậm hơn ạ.",
            "Partial_IncompleteInfo", "Simple_CompleteClause", "NoError", "Adequate_StandardTopic", "Advanced_KeigoOrCushioned"));
        var engine = CreateEngine(aiMock);
        var state = new PlacementAssessmentState { CurrentEvent = "EVT-02", CurrentDifficultyBand = "N4" };

        var (updated, outcome) = await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "すみません、もう一度ゆっくりお願いします。" }, "");

        Assert.Equal("Valid", outcome.InputClassification);
        Assert.Equal(0, updated.ConsecutiveOffTopicCount);
        Assert.False(outcome.IsStrikeWarning);
    }

    [Fact]
    public async Task UC83_3_UTCID06_FallbackAiModel_PinnedAcrossSubsequentTurns()
    {
        var validJson = BuildValidJson();
        var seenPreferred = new List<string?>();
        var callCount = 0;
        var aiMock = new Mock<IAiClient>();
        aiMock.Setup(x => x.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((AiRequest req, CancellationToken _) =>
            {
                seenPreferred.Add(req.PreferredModel);
                callCount++;
                return AiResponse.Ok(validJson, callCount == 1 ? "gemini-3.1-flash-lite" : "gemini-3-flash-preview");
            });

        var engine = CreateEngine(aiMock);
        var state = new PlacementAssessmentState();

        await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "チェックインをお願いします。" }, "");
        await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "静かな部屋がいいです。" }, "");

        Assert.Null(seenPreferred[0]);
        Assert.Equal("gemini-3.1-flash-lite", seenPreferred[1]);
        Assert.Equal("gemini-3-flash-preview", state.PreferredAiModel);
    }

    [Fact]
    public async Task UC83_3_UTCID07_PrematureKeyHandoverBeforeEvt05_StrippedByGuardrail()
    {
        var aiMock = CreateMockAi(BuildValidJson("Valid", "RequestRoomChange", "N3",
            "かしこまりました。それでは801号室に変更いたします。こちらの鍵でございます。ごゆっくりお寛ぎください。",
            "Tôi đã đổi sang phòng 801. Đây là chìa khóa ạ.",
            "Exceeded_ProactiveDetail", "Complex_MultiClause", "NoError", "Rich_SituationalSpecific", "Advanced_KeigoOrCushioned"));
        var engine = CreateEngine(aiMock);
        var state = new PlacementAssessmentState { CurrentEvent = "EVT-02", CurrentDifficultyBand = "N3", ReservationConfirmed = true };

        var (updated, outcome) = await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "801号室に変更していただけますでしょうか。" }, "");

        Assert.Equal("EVT-03", updated.CurrentEvent);
        Assert.False(outcome.IsConcluded);
        Assert.DoesNotContain("鍵", outcome.AiReplyJapanese);
        Assert.DoesNotContain("お寛ぎ", outcome.AiReplyJapanese);
    }

    [Fact]
    public async Task UC83_3_UTCID08_ThirdCommunicationDifficultyAtSameEvent_AdvancesToNextEvent()
    {
        var engine = CreateEngine();
        var state = new PlacementAssessmentState
        {
            CurrentEvent = "EVT-01",
            CurrentDifficultyBand = "N5",
            CurrentEventScaffoldingStep = 2
        };

        var (updated, outcome) = await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "えっ？" }, "");

        Assert.Equal("CommunicationDifficulty", outcome.InputClassification);
        Assert.Equal("EVT-02", updated.CurrentEvent);
        Assert.Equal(0, updated.CurrentEventScaffoldingStep);
        Assert.Contains(updated.EventSummaries, e => e.EventCode == "EVT-01" && e.OutcomeStatus == "InsufficientEvidence");
    }

    [Fact]
    public async Task UC83_3_UTCID09_ValidTurnAfterPriorOffTopics_ResetsConsecutiveOffTopicCount()
    {
        var aiMock = CreateMockAi(BuildValidJson("Valid", "ConfirmReservation", "N4"));
        var engine = CreateEngine(aiMock);
        var state = new PlacementAssessmentState { CurrentEvent = "EVT-01", ConsecutiveOffTopicCount = 2 };

        var (updated, outcome) = await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "田中と申します。" }, "");

        Assert.Equal("Valid", outcome.InputClassification);
        Assert.Equal(0, updated.ConsecutiveOffTopicCount);
        Assert.Equal(1, updated.ValidEvidenceTurnCount);
    }

    [Fact]
    public async Task UC83_3_UTCID10_Evt02AcceptAssignedRoom_SelectsStandard512AndSkipsEvt03()
    {
        var aiMock = CreateMockAi(BuildValidJson("Valid", "AcceptAssignedRoom", "N4",
            "かしこまりました。512号室ですね。ご朝食はいかがなさいますか？",
            "Vâng, phòng 512 ạ. Quý khách có dùng bữa sáng không ạ?"));
        var engine = CreateEngine(aiMock);
        var state = new PlacementAssessmentState { CurrentEvent = "EVT-02", ReservationConfirmed = true };

        var (updated, _) = await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "はい、512号室で大丈夫です。" }, "");

        Assert.Equal("Standard_512", updated.SelectedRoom);
        Assert.Equal("EVT-04", updated.CurrentEvent);
    }

    [Fact]
    public async Task UC83_3_UTCID11_PreflightZeroTokenSpam_ReturnsStrikeWithoutCallingAi()
    {
        var aiMock = new Mock<IAiClient>();
        var engine = CreateEngine(aiMock);
        var state = new PlacementAssessmentState { CurrentEvent = "EVT-01" };

        var (updated, outcome) = await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "xin chao 12345" }, "");

        Assert.Equal("AbusiveOrSpam", outcome.InputClassification);
        Assert.Equal(1, updated.AbuseOrSpamStrikeCount);
        Assert.True(outcome.IsStrikeWarning);
        Assert.False(outcome.IsConcluded);
        aiMock.Verify(x => x.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task UC83_3_UTCID12_ThirdAbusiveSpamStrike_ConcludesWithAbuseOrSpamLimit()
    {
        var aiMock = new Mock<IAiClient>();
        var engine = CreateEngine(aiMock);
        var state = new PlacementAssessmentState { CurrentEvent = "EVT-01", AbuseOrSpamStrikeCount = 2 };

        var (updated, outcome) = await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "?????" }, "");

        Assert.True(outcome.IsConcluded);
        Assert.False(outcome.IsStrikeWarning);
        Assert.Equal("AbuseOrSpamLimit", outcome.TerminationReason);
        Assert.Equal("AbuseOrSpamLimit", updated.TerminationReason);
    }

    [Fact]
    public async Task UC83_3_UTCID13_AiDetectedOffTopicFirstStrike_ForcesZeroScoresAndHoldsEvent()
    {
        var aiMock = CreateMockAi(BuildValidJson("OffTopic", "OffTopic", "N3"));
        var engine = CreateEngine(aiMock);
        var state = new PlacementAssessmentState { CurrentEvent = "EVT-01", CurrentDifficultyBand = "N4" };

        var (updated, outcome) = await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "日本のラーメンはおいしいですね。" }, "");

        Assert.Equal("OffTopic", outcome.InputClassification);
        Assert.Equal("Unobserved", outcome.DemonstratedBand);
        Assert.Equal(0, outcome.TaskFulfillmentScore);
        Assert.Equal(0, outcome.GrammarAccuracyScore);
        Assert.Equal(1, updated.ConsecutiveOffTopicCount);
        Assert.Equal("EVT-01", updated.CurrentEvent);
        Assert.Equal("N4", updated.CurrentDifficultyBand);
        Assert.True(outcome.IsStrikeWarning);
    }

    [Fact]
    public async Task UC83_3_UTCID14_ThirdConsecutiveOffTopic_ConcludesWithOffTopicLimit()
    {
        var aiMock = CreateMockAi(BuildValidJson("OffTopic", "OffTopic", "N4"));
        var engine = CreateEngine(aiMock);
        var state = new PlacementAssessmentState { CurrentEvent = "EVT-02", ConsecutiveOffTopicCount = 2 };

        var (updated, outcome) = await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "今日のサッカーの試合はどうでしたか。" }, "");

        Assert.True(outcome.IsConcluded);
        Assert.Equal("OffTopicLimit", outcome.TerminationReason);
        Assert.Equal("OffTopicLimit", updated.TerminationReason);
    }

    [Fact]
    public async Task UC83_3_UTCID15_LlmFailureOrMalformedJson_ReturnsFallbackSafeResponse()
    {
        var aiMock = new Mock<IAiClient>();
        aiMock.Setup(x => x.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Fail("Simulated timeout"));
        var engine = CreateEngine(aiMock);
        var state = new PlacementAssessmentState { CurrentEvent = "EVT-01", CurrentDifficultyBand = "N4" };

        var (updated, outcome) = await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "チェックインをお願いします。" }, "");

        Assert.False(outcome.IsConcluded);
        Assert.Equal("EVT-01", updated.CurrentEvent);
        Assert.False(string.IsNullOrWhiteSpace(outcome.AiReplyJapanese));
    }

    #endregion

    #region UC83.4: PlacementAssessmentEngine.ComputeDeterministicTurnScores

    [Fact]
    public void UC83_4_UTCID01_StandardN5SimpleClause_MatchesExpectedN5Scores()
    {
        var ev = new PlacementTurnObservableEvidence
        {
            TaskAchievement = "Fulfilled_Core",
            SentenceStructure = "Simple_CompleteClause",
            GrammarErrorSeverity = "NoError",
            LexicalUsage = "Adequate_StandardTopic",
            PolitenessRegister = "Standard_Teineigo"
        };

        var res = PlacementAssessmentEngine.ComputeDeterministicTurnScores("チェックインをお願いします。田中です。", "Valid", "ConfirmReservation", "N5", ev, Array.Empty<string>());
        Assert.Equal((90, 92, 90, 90, "N5"), res);
    }

    [Fact]
    public void UC83_4_UTCID02_ExcellentN4CompoundClause_MatchesExpectedN4Scores()
    {
        var ev = new PlacementTurnObservableEvidence
        {
            TaskAchievement = "Exceeded_ProactiveDetail",
            SentenceStructure = "Compound_LinkedClause",
            GrammarErrorSeverity = "NoError",
            LexicalUsage = "Rich_SituationalSpecific",
            PolitenessRegister = "Advanced_KeigoOrCushioned"
        };

        var res = PlacementAssessmentEngine.ComputeDeterministicTurnScores("今日から3泊予約した田中と申します。チェックインをお願いします。", "Valid", "ConfirmReservation", "N4", ev, Array.Empty<string>());
        Assert.Equal((94, 93, 93, 94, "N4"), res);
    }

    [Fact]
    public void UC83_4_UTCID03_ComplexN3MultiClause_MatchesExpectedN3Scores()
    {
        var ev = new PlacementTurnObservableEvidence
        {
            TaskAchievement = "Exceeded_ProactiveDetail",
            SentenceStructure = "Complex_MultiClause",
            GrammarErrorSeverity = "NoError",
            LexicalUsage = "Rich_SituationalSpecific",
            PolitenessRegister = "Advanced_KeigoOrCushioned"
        };

        var res = PlacementAssessmentEngine.ComputeDeterministicTurnScores("本日3泊で予約している田中と申します。予約時に静かな部屋をお願いしたんですが、確認していただけますか。", "Valid", "ConfirmReservationWithQuietRequest", "N3", ev, Array.Empty<string>());
        Assert.Equal((94, 95, 94, 94, "N3"), res);
    }

    [Fact]
    public void UC83_4_UTCID04_N4MinorParticleSlip_DropsGrammarTo74()
    {
        var ev = new PlacementTurnObservableEvidence
        {
            TaskAchievement = "Exceeded_ProactiveDetail",
            SentenceStructure = "Compound_LinkedClause",
            GrammarErrorSeverity = "MinorSlip_MeaningIntact",
            LexicalUsage = "Adequate_StandardTopic",
            PolitenessRegister = "Standard_Teineigo"
        };

        var res = PlacementAssessmentEngine.ComputeDeterministicTurnScores("静かな部屋がいいので、他の部屋で変えてもらえませんか？", "Valid", "RequestRoomChange", "N4", ev, Array.Empty<string>());
        Assert.Equal((94, 74, 86, 86, "N4"), res);
    }

    [Fact]
    public void UC83_4_UTCID05_ClarificationStrategy_ProtectsTaskScoreAndPragmatics()
    {
        var ev = new PlacementTurnObservableEvidence
        {
            TaskAchievement = "Partial_IncompleteInfo",
            SentenceStructure = "Simple_CompleteClause",
            GrammarErrorSeverity = "NoError",
            LexicalUsage = "Adequate_StandardTopic",
            PolitenessRegister = "Advanced_KeigoOrCushioned"
        };

        var res = PlacementAssessmentEngine.ComputeDeterministicTurnScores("すみません、もう少しゆっくり話していただけますか？", "Valid", "RequestRepetition", "N4", ev, Array.Empty<string>(), isClarificationOrStrategy: true);
        Assert.Equal((84, 88, 86, 94, "N4"), res);
    }

    [Fact]
    public void UC83_4_UTCID06_N5AbruptCasualFragment_PenalizesPragmaticsAndGrammar()
    {
        var ev = new PlacementTurnObservableEvidence
        {
            TaskAchievement = "Fulfilled_Core",
            SentenceStructure = "Fragment_WordOnly",
            GrammarErrorSeverity = "MinorSlip_MeaningIntact",
            LexicalUsage = "Basic_Minimal",
            PolitenessRegister = "Abrupt_Casual"
        };

        var res = PlacementAssessmentEngine.ComputeDeterministicTurnScores("部屋、うるさい。変えて。", "Valid", "RequestRoomChange", "N5", ev, Array.Empty<string>());
        Assert.Equal((90, 70, 72, 48, "N5"), res);
    }

    [Fact]
    public void UC83_4_UTCID07_N3CompoundConclusion_MatchesN3CompoundScores()
    {
        var ev = new PlacementTurnObservableEvidence
        {
            TaskAchievement = "Exceeded_ProactiveDetail",
            SentenceStructure = "Compound_LinkedClause",
            GrammarErrorSeverity = "NoError",
            LexicalUsage = "Rich_SituationalSpecific",
            PolitenessRegister = "Advanced_KeigoOrCushioned"
        };

        var res = PlacementAssessmentEngine.ComputeDeterministicTurnScores("いろいろ丁寧にご対応いただきありがとうございました。3日間よろしくお願いします。", "Valid", "ConfirmAndThank", "N3", ev, Array.Empty<string>());
        Assert.Equal((94, 91, 94, 94, "N3"), res);
    }

    [Fact]
    public void UC83_4_UTCID08_SimpleClauseWithoutN4Signal_DowngradesRawN4ToN5()
    {
        var ev = new PlacementTurnObservableEvidence
        {
            TaskAchievement = "Fulfilled_Core",
            SentenceStructure = "Simple_CompleteClause",
            GrammarErrorSeverity = "NoError",
            LexicalUsage = "Adequate_StandardTopic",
            PolitenessRegister = "Standard_Teineigo"
        };

        var res = PlacementAssessmentEngine.ComputeDeterministicTurnScores("はい、デラックスルームにします。", "Valid", "AcceptDeluxeUpgrade", "N4", ev, Array.Empty<string>());
        Assert.Equal((90, 92, 90, 90, "N5"), res);
    }

    [Fact]
    public void UC83_4_UTCID09_PartialIncompleteInconsistentPoliteness_ScoresAsExpectedInN5()
    {
        var ev = new PlacementTurnObservableEvidence
        {
            TaskAchievement = "Partial_IncompleteInfo",
            SentenceStructure = "Simple_CompleteClause",
            GrammarErrorSeverity = "NoError",
            LexicalUsage = "Basic_Minimal",
            PolitenessRegister = "Inconsistent_Mixed"
        };

        var res = PlacementAssessmentEngine.ComputeDeterministicTurnScores("高いですね… どうしようかな。", "Valid", "AskUpgradeDetails", "N5", ev, Array.Empty<string>());
        Assert.Equal((68, 92, 72, 64, "N5"), res);
    }

    [Fact]
    public void UC83_4_UTCID10_TwoRuleErrorCodes_ForcesN5AndCapsGrammarScoreAt63()
    {
        var ev = new PlacementTurnObservableEvidence
        {
            TaskAchievement = "Fulfilled_Core",
            SentenceStructure = "Compound_LinkedClause",
            GrammarErrorSeverity = "NoError",
            LexicalUsage = "Adequate_StandardTopic",
            PolitenessRegister = "Standard_Teineigo"
        };

        var res = PlacementAssessmentEngine.ComputeDeterministicTurnScores("静かな部屋がいいので、変えてもらえませんか？", "Valid", "RequestRoomChange", "N4", ev, new[] { "E01", "E02" });
        Assert.Equal("N5", res.ValidatedBand);
        Assert.Equal(63, res.GrammarScore);
    }

    [Fact]
    public void UC83_4_UTCID11_ComputeTurnOverallScore_WeightedBoundaryCheck()
    {
        Assert.Equal(81, PlacementAssessmentEngine.ComputeTurnOverallScore(80, 85, 78, 80));
        Assert.Equal(0, PlacementAssessmentEngine.ComputeTurnOverallScore(0, 0, 0, 0));
        Assert.Equal(100, PlacementAssessmentEngine.ComputeTurnOverallScore(100, 100, 100, 100));
    }

    [Fact]
    public void UC83_4_UTCID12_ContradictoryEvidence_EnforcesConsistencyGuards()
    {
        var ev = new PlacementTurnObservableEvidence
        {
            TaskAchievement = "Fulfilled_Core",
            SentenceStructure = "Simple_CompleteClause",
            GrammarErrorSeverity = "NoError",
            GrammarErrors = ["Nhầm trợ từ"],
            LexicalUsage = "Adequate_StandardTopic",
            PolitenessRegister = "Standard_Teineigo"
        };

        var res = PlacementAssessmentEngine.ComputeDeterministicTurnScores("他の部屋で変える", "Valid", "RequestRoomChange", "N3", ev, Array.Empty<string>());
        Assert.Equal(72, res.GrammarScore);
        Assert.Equal(64, res.PragmaticsScore);
        Assert.Equal("N5", res.ValidatedBand);
    }

    [Fact]
    public void UC83_4_UTCID13_OffTopicInputCategory_ForcesZeroScoresAndUnobserved()
    {
        var ev = new PlacementTurnObservableEvidence { TaskAchievement = "Exceeded_ProactiveDetail" };
        var res = PlacementAssessmentEngine.ComputeDeterministicTurnScores("ラーメンが好きです。", "OffTopic", "OffTopic", "N4", ev, Array.Empty<string>());
        Assert.Equal((0, 0, 0, 0, "Unobserved"), res);
    }

    [Fact]
    public void UC83_4_UTCID14_AbusiveOrSpamInputCategory_ForcesZeroScoresAndUnobserved()
    {
        var ev = new PlacementTurnObservableEvidence { TaskAchievement = "Fulfilled_Core" };
        var res = PlacementAssessmentEngine.ComputeDeterministicTurnScores("あかさたな", "AbusiveOrSpam", "AbusiveOrSpam", "N5", ev, Array.Empty<string>());
        Assert.Equal((0, 0, 0, 0, "Unobserved"), res);
    }

    #endregion

    #region UC83.5: CompleteSessionAsync

    [Fact]
    public async Task UC83_5_UTCID01_MixedBandSession_ComputesHighConfidenceN4AndUpdatesUser()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress", null, "N5"));
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 20,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = JsonSerializer.Serialize(CreateMixedBandConcludedState())
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.CompleteSessionAsync("learner-1", 20);

        Assert.True(res.Success);
        Assert.Equal("Hoàn tất bài kiểm tra xếp lớp.", res.Message);
        Assert.Equal("Completed", res.Data!.PlacementTestStatus);
        Assert.Equal("N4", res.Data.InitialEstimatedLevel);
        Assert.Equal("High", res.Data.InitialConfidenceTier);
        Assert.InRange(res.Data.OverallScore, 88, 91);

        var user = await db.Users.FindAsync("learner-1");
        Assert.Equal("Completed", user!.PlacementTestStatus);
        Assert.Equal("N4", user.InitialEstimatedLevel);
        Assert.Equal("N4", user.JLPTLevel);
    }

    [Fact]
    public async Task UC83_5_UTCID02_StrongN3Session_EstimatesN3AndUpdatesJlptLevel()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress", null, "N5"));
        var state = new PlacementAssessmentState
        {
            TurnEvidences =
            [
                new PlacementTurnEvidence { TurnIndex = 1, EventCode = "EVT-01", InputClassification = "Valid", DemonstratedBand = "N3", TaskFulfillmentScore = 92, GrammarAccuracyScore = 94, VocabularyRangeScore = 92, PragmaticsScore = 92 },
                new PlacementTurnEvidence { TurnIndex = 2, EventCode = "EVT-02", InputClassification = "Valid", DemonstratedBand = "N3", TaskFulfillmentScore = 92, GrammarAccuracyScore = 94, VocabularyRangeScore = 92, PragmaticsScore = 92 },
                new PlacementTurnEvidence { TurnIndex = 3, EventCode = "EVT-03", InputClassification = "Valid", DemonstratedBand = "N3", TaskFulfillmentScore = 92, GrammarAccuracyScore = 94, VocabularyRangeScore = 92, PragmaticsScore = 92 },
                new PlacementTurnEvidence { TurnIndex = 4, EventCode = "EVT-04", InputClassification = "Valid", DemonstratedBand = "N3", TaskFulfillmentScore = 92, GrammarAccuracyScore = 94, VocabularyRangeScore = 92, PragmaticsScore = 92 }
            ],
            EventSummaries =
            [
                new PlacementEventEvidenceSummary { EventCode = "EVT-01", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N3" },
                new PlacementEventEvidenceSummary { EventCode = "EVT-02", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N3" },
                new PlacementEventEvidenceSummary { EventCode = "EVT-03", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N3" },
                new PlacementEventEvidenceSummary { EventCode = "EVT-04", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N3" }
            ]
        };
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 21,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = JsonSerializer.Serialize(state)
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.CompleteSessionAsync("learner-1", 21);

        Assert.True(res.Success);
        Assert.Equal("N3", res.Data!.InitialEstimatedLevel);
        var user = await db.Users.FindAsync("learner-1");
        Assert.Equal("N3", user!.JLPTLevel);
    }

    [Fact]
    public async Task UC83_5_UTCID03_ConsistentN5Session_EstimatesN5()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress"));
        var state = new PlacementAssessmentState
        {
            TurnEvidences =
            [
                new PlacementTurnEvidence { TurnIndex = 1, EventCode = "EVT-01", InputClassification = "Valid", DemonstratedBand = "N5", TaskFulfillmentScore = 88, GrammarAccuracyScore = 90, VocabularyRangeScore = 88, PragmaticsScore = 88 },
                new PlacementTurnEvidence { TurnIndex = 2, EventCode = "EVT-02", InputClassification = "Valid", DemonstratedBand = "N5", TaskFulfillmentScore = 88, GrammarAccuracyScore = 90, VocabularyRangeScore = 88, PragmaticsScore = 88 },
                new PlacementTurnEvidence { TurnIndex = 3, EventCode = "EVT-03", InputClassification = "Valid", DemonstratedBand = "N5", TaskFulfillmentScore = 88, GrammarAccuracyScore = 90, VocabularyRangeScore = 88, PragmaticsScore = 88 }
            ],
            EventSummaries =
            [
                new PlacementEventEvidenceSummary { EventCode = "EVT-01", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N5" },
                new PlacementEventEvidenceSummary { EventCode = "EVT-02", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N5" },
                new PlacementEventEvidenceSummary { EventCode = "EVT-03", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N5" }
            ]
        };
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 22,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = JsonSerializer.Serialize(state)
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.CompleteSessionAsync("learner-1", 22);

        Assert.True(res.Success);
        Assert.Equal("N5", res.Data!.InitialEstimatedLevel);
    }

    [Fact]
    public async Task UC83_5_UTCID04_TwoValidN4TurnsWithoutEventSummaries_LowConfidenceCompoundLevelAndSplitsJlpt()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress", null, "N5"));
        var state = new PlacementAssessmentState
        {
            TurnEvidences =
            [
                new PlacementTurnEvidence { TurnIndex = 1, EventCode = "EVT-01", InputClassification = "Valid", DemonstratedBand = "N4", TaskFulfillmentScore = 90, GrammarAccuracyScore = 90, VocabularyRangeScore = 88, PragmaticsScore = 88 },
                new PlacementTurnEvidence { TurnIndex = 2, EventCode = "EVT-02", InputClassification = "Valid", DemonstratedBand = "N4", TaskFulfillmentScore = 90, GrammarAccuracyScore = 90, VocabularyRangeScore = 88, PragmaticsScore = 88 }
            ],
            EventSummaries = []
        };
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 23,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = JsonSerializer.Serialize(state)
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.CompleteSessionAsync("learner-1", 23);

        Assert.True(res.Success);
        Assert.Equal("Completed", res.Data!.PlacementTestStatus);
        Assert.Equal("Low", res.Data.InitialConfidenceTier);
        Assert.Equal("N4-N3", res.Data.InitialEstimatedLevel);
        var user = await db.Users.FindAsync("learner-1");
        Assert.Equal("N4", user!.JLPTLevel);
    }

    [Fact]
    public async Task UC83_5_UTCID05_OnlyOneValidTurn_ReturnsInsufficientEvidence()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress"));
        var state = new PlacementAssessmentState
        {
            TurnEvidences =
            [
                new PlacementTurnEvidence { TurnIndex = 1, EventCode = "EVT-01", InputClassification = "Valid", DemonstratedBand = "N4", TaskFulfillmentScore = 90, GrammarAccuracyScore = 90, VocabularyRangeScore = 90, PragmaticsScore = 90 }
            ]
        };
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 24,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = JsonSerializer.Serialize(state)
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.CompleteSessionAsync("learner-1", 24);

        Assert.True(res.Success);
        Assert.Equal("InsufficientEvidence", res.Data!.PlacementTestStatus);
        Assert.Equal("Chưa xác định", res.Data.InitialEstimatedLevel);
        Assert.Equal(0, res.Data.OverallScore);
        var session = await db.RoleplaySessions.FindAsync(24);
        Assert.Equal("InsufficientEvidence", session!.Status);
    }

    [Fact]
    public async Task UC83_5_UTCID06_AbuseOrSpamTerminationWithTwoValidTurns_StillReturnsInsufficientEvidence()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "InProgress"));
        var state = new PlacementAssessmentState
        {
            TerminationReason = "AbuseOrSpamLimit",
            TurnEvidences =
            [
                new PlacementTurnEvidence { TurnIndex = 1, InputClassification = "Valid", DemonstratedBand = "N4", TaskFulfillmentScore = 90, GrammarAccuracyScore = 90, VocabularyRangeScore = 90, PragmaticsScore = 90 },
                new PlacementTurnEvidence { TurnIndex = 2, InputClassification = "Valid", DemonstratedBand = "N4", TaskFulfillmentScore = 90, GrammarAccuracyScore = 90, VocabularyRangeScore = 90, PragmaticsScore = 90 }
            ]
        };
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 25,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "TerminatedEarly",
            AssessmentStateJson = JsonSerializer.Serialize(state)
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.CompleteSessionAsync("learner-1", 25);

        Assert.True(res.Success);
        Assert.Equal("InsufficientEvidence", res.Data!.PlacementTestStatus);
        Assert.Equal(0, res.Data.OverallScore);
    }

    [Fact]
    public async Task UC83_5_UTCID07_InsufficientEvidenceRetake_PreservesPriorCompletedUserStatusAndLevel()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1", "Completed", "N4", "N4"));
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 26,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            AssessmentStateJson = JsonSerializer.Serialize(new PlacementAssessmentState())
        });
        await db.SaveChangesAsync();

        var service = CreateService(db, allowRetake: true);
        var res = await service.CompleteSessionAsync("learner-1", 26);

        Assert.True(res.Success);
        Assert.Equal("InsufficientEvidence", res.Data!.PlacementTestStatus);
        var user = await db.Users.FindAsync("learner-1");
        Assert.Equal("Completed", user!.PlacementTestStatus);
        Assert.Equal("N4", user.InitialEstimatedLevel);
    }

    [Fact]
    public async Task UC83_5_UTCID08_NonExistentSession_ReturnsFail()
    {
        using var db = CreateInMemoryContext();
        db.Users.Add(CreateUser("learner-1"));
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.CompleteSessionAsync("learner-1", 404);

        Assert.False(res.Success);
        Assert.Equal("Không tìm thấy phiên kiểm tra xếp lớp.", res.Message);
    }

    [Fact]
    public async Task UC83_5_UTCID09_SessionBelongsToAnotherUser_ReturnsFail()
    {
        using var db = CreateInMemoryContext();
        db.Users.AddRange(CreateUser("learner-1"), CreateUser("learner-2"));
        db.RoleplaySessions.Add(new RoleplaySession { Id = 27, UserId = "learner-2", SessionType = "PlacementTest", Status = "Active" });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.CompleteSessionAsync("learner-1", 27);

        Assert.False(res.Success);
        Assert.Equal("Không tìm thấy phiên kiểm tra xếp lớp.", res.Message);
    }

    [Fact]
    public async Task UC83_5_UTCID10_MissingUserRecord_ReturnsFail()
    {
        using var db = CreateInMemoryContext();
        db.RoleplaySessions.Add(new RoleplaySession { Id = 28, UserId = "ghost-user", SessionType = "PlacementTest", Status = "Active" });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.CompleteSessionAsync("ghost-user", 28);

        Assert.False(res.Success);
        Assert.Equal("Không tìm thấy thông tin người dùng.", res.Message);
    }

    #endregion

    #region UC84.1: GetHistoryListAsync

    [Fact]
    public async Task UC84_1_UTCID01_MultipleCompletedSessions_ReturnsOrderedNewestFirstWithMetrics()
    {
        using var db = CreateInMemoryContext();
        var stateJson = JsonSerializer.Serialize(CreateMixedBandConcludedState());
        db.RoleplaySessions.AddRange(
            new RoleplaySession { Id = 31, UserId = "learner-1", SessionType = "PlacementTest", Status = "Completed", AssessmentStateJson = stateJson, CreatedAt = DateTime.UtcNow.AddDays(-2), CompletedAt = DateTime.UtcNow.AddDays(-2).AddMinutes(5) },
            new RoleplaySession { Id = 32, UserId = "learner-1", SessionType = "PlacementTest", Status = "Completed", AssessmentStateJson = stateJson, CreatedAt = DateTime.UtcNow.AddDays(-1), CompletedAt = DateTime.UtcNow.AddDays(-1).AddMinutes(5) }
        );
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.GetHistoryListAsync("learner-1");

        Assert.True(res.Success);
        Assert.Equal(new[] { 32, 31 }, res.Data!.Select(i => i.SessionId).ToArray());
        Assert.Equal("N4", res.Data[0].InitialEstimatedLevel);
        Assert.Equal(5, res.Data[0].TotalTurns);
        Assert.Equal(5, res.Data[0].FulfilledEventsCount);
    }

    [Fact]
    public async Task UC84_1_UTCID02_MixedStatuses_IncludesCompletedAndTerminatedEarlyExcludesActiveAndAbandoned()
    {
        using var db = CreateInMemoryContext();
        var validStateJson = JsonSerializer.Serialize(CreateMixedBandConcludedState());
        var earlyStateJson = JsonSerializer.Serialize(new PlacementAssessmentState
        {
            TurnEvidences = [new PlacementTurnEvidence { TurnIndex = 1, InputClassification = "AbusiveOrSpam" }]
        });
        db.RoleplaySessions.AddRange(
            new RoleplaySession { Id = 41, UserId = "learner-1", SessionType = "PlacementTest", Status = "Completed", AssessmentStateJson = validStateJson },
            new RoleplaySession { Id = 42, UserId = "learner-1", SessionType = "PlacementTest", Status = "TerminatedEarly", AssessmentStateJson = earlyStateJson },
            new RoleplaySession { Id = 43, UserId = "learner-1", SessionType = "PlacementTest", Status = "Active", AssessmentStateJson = validStateJson },
            new RoleplaySession { Id = 44, UserId = "learner-1", SessionType = "PlacementTest", Status = "Abandoned", AssessmentStateJson = validStateJson }
        );
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.GetHistoryListAsync("learner-1");

        Assert.True(res.Success);
        Assert.Equal(2, res.Data!.Count);
        Assert.DoesNotContain(res.Data, x => x.SessionId is 43 or 44);
    }

    [Fact]
    public async Task UC84_1_UTCID03_EmptyTurnEvidencesWithUserMessages_UsesMessageCountFallbackForTotalTurns()
    {
        using var db = CreateInMemoryContext();
        var session = new RoleplaySession
        {
            Id = 45,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "InsufficientEvidence",
            AssessmentStateJson = JsonSerializer.Serialize(new PlacementAssessmentState())
        };
        db.RoleplaySessions.Add(session);
        db.RoleplayMessages.AddRange(
            new RoleplayMessage { RoleplaySessionId = 45, Sender = "Ai", JapaneseText = "こんにちは" },
            new RoleplayMessage { RoleplaySessionId = 45, Sender = "User", JapaneseText = "こんにちは" },
            new RoleplayMessage { RoleplaySessionId = 45, Sender = "User", JapaneseText = "田中です" }
        );
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.GetHistoryListAsync("learner-1");

        Assert.True(res.Success);
        var item = Assert.Single(res.Data!);
        Assert.Equal(2, item.TotalTurns);
    }

    [Fact]
    public async Task UC84_1_UTCID04_UserWithNoPlacementSessions_ReturnsEmptyList()
    {
        using var db = CreateInMemoryContext();
        var service = CreateService(db);

        var res = await service.GetHistoryListAsync("learner-1");

        Assert.True(res.Success);
        Assert.Empty(res.Data!);
    }

    [Fact]
    public async Task UC84_1_UTCID05_ZeroUserMessagesAndZeroTurnEvidences_FilteredOutAsEmptySession()
    {
        using var db = CreateInMemoryContext();
        var session = new RoleplaySession
        {
            Id = 46,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "InsufficientEvidence",
            AssessmentStateJson = JsonSerializer.Serialize(new PlacementAssessmentState())
        };
        db.RoleplaySessions.Add(session);
        db.RoleplayMessages.Add(new RoleplayMessage { RoleplaySessionId = 46, Sender = "Ai", JapaneseText = "いらっしゃいませ。" });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.GetHistoryListAsync("learner-1");

        Assert.True(res.Success);
        Assert.Empty(res.Data!);
    }

    [Fact]
    public async Task UC84_1_UTCID06_ExcludesOtherUsersAndStandardRoleplaySessions()
    {
        using var db = CreateInMemoryContext();
        var validStateJson = JsonSerializer.Serialize(CreateMixedBandConcludedState());
        db.RoleplaySessions.AddRange(
            new RoleplaySession { Id = 47, UserId = "learner-1", SessionType = "PlacementTest", Status = "Completed", AssessmentStateJson = validStateJson },
            new RoleplaySession { Id = 48, UserId = "learner-2", SessionType = "PlacementTest", Status = "Completed", AssessmentStateJson = validStateJson },
            new RoleplaySession { Id = 49, UserId = "learner-1", SessionType = "Standard", Status = "Completed", AssessmentStateJson = validStateJson }
        );
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.GetHistoryListAsync("learner-1");

        Assert.True(res.Success);
        Assert.Equal(47, Assert.Single(res.Data!).SessionId);
    }

    [Fact]
    public async Task UC84_1_UTCID07_UnknownUserId_ReturnsEmptyListWithoutError()
    {
        using var db = CreateInMemoryContext();
        var service = CreateService(db);

        var res = await service.GetHistoryListAsync("unknown-user-id");

        Assert.True(res.Success);
        Assert.Empty(res.Data!);
    }

    [Fact]
    public async Task UC84_1_UTCID08_NullAssessmentStateJsonWithUserMessage_DoesNotThrow()
    {
        using var db = CreateInMemoryContext();
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 50,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "InsufficientEvidence",
            AssessmentStateJson = null
        });
        db.RoleplayMessages.Add(new RoleplayMessage { RoleplaySessionId = 50, Sender = "User", JapaneseText = "はい" });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.GetHistoryListAsync("learner-1");

        Assert.True(res.Success);
        var item = Assert.Single(res.Data!);
        Assert.Equal("Chưa xác định", item.InitialEstimatedLevel);
        Assert.Equal(1, item.TotalTurns);
    }

    #endregion

    #region UC84.2: GetHistoryDetailAsync

    [Fact]
    public async Task UC84_2_UTCID01_ValidCompletedSession_ReturnsFullDetailWithOrderedMessages()
    {
        using var db = CreateInMemoryContext();
        var t0 = DateTime.UtcNow.AddMinutes(-10);
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 61,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Completed",
            AssessmentStateJson = JsonSerializer.Serialize(CreateMixedBandConcludedState()),
            CreatedAt = t0,
            CompletedAt = t0.AddMinutes(5)
        });
        db.RoleplayMessages.AddRange(
            new RoleplayMessage { Id = 2, RoleplaySessionId = 61, Sender = "User", JapaneseText = "ミンです。", CreatedAt = t0.AddMinutes(2) },
            new RoleplayMessage { Id = 1, RoleplaySessionId = 61, Sender = "Ai", JapaneseText = "いらっしゃいませ。", CreatedAt = t0.AddMinutes(1) }
        );
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.GetHistoryDetailAsync("learner-1", 61);

        Assert.True(res.Success);
        Assert.Equal(61, res.Data!.SessionId);
        Assert.Equal("N4", res.Data.InitialEstimatedLevel);
        Assert.Equal(5, res.Data.EventSummaries.Count);
        Assert.Equal(5, res.Data.TurnEvidences.Count);
        Assert.Equal(new[] { "Ai", "User" }, res.Data.MessageHistory.Select(m => m.Sender).ToArray());
        Assert.False(string.IsNullOrWhiteSpace(res.Data.SummaryFeedback));
        Assert.False(string.IsNullOrWhiteSpace(res.Data.Disclaimer));
    }

    [Fact]
    public async Task UC84_2_UTCID02_NullOverallTurnScoreInEvidence_BackfilledAutomatically()
    {
        using var db = CreateInMemoryContext();
        var state = CreateMixedBandConcludedState();
        state.TurnEvidences[0].OverallTurnScore = null;
        state.TurnEvidences[0].TaskFulfillmentScore = 80;
        state.TurnEvidences[0].GrammarAccuracyScore = 85;
        state.TurnEvidences[0].VocabularyRangeScore = 78;
        state.TurnEvidences[0].PragmaticsScore = 80;

        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 62,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Completed",
            AssessmentStateJson = JsonSerializer.Serialize(state)
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.GetHistoryDetailAsync("learner-1", 62);

        Assert.True(res.Success);
        Assert.Equal(81, res.Data!.TurnEvidences[0].OverallTurnScore);
    }

    [Fact]
    public async Task UC84_2_UTCID03_TerminatedEarlySession_ReturnsInsufficientEvidenceDetail()
    {
        using var db = CreateInMemoryContext();
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 63,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "TerminatedEarly",
            AssessmentStateJson = JsonSerializer.Serialize(new PlacementAssessmentState { TerminationReason = "OffTopicLimit" })
        });
        db.RoleplayMessages.Add(new RoleplayMessage { RoleplaySessionId = 63, Sender = "User", JapaneseText = "ラーメン" });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.GetHistoryDetailAsync("learner-1", 63);

        Assert.True(res.Success);
        Assert.Equal("TerminatedEarly", res.Data!.Status);
        Assert.Equal("Chưa xác định", res.Data.InitialEstimatedLevel);
        Assert.Single(res.Data.MessageHistory);
    }

    [Fact]
    public async Task UC84_2_UTCID04_BlankAssessmentStateAndZeroMessages_ReturnsSafeEmptyDetail()
    {
        using var db = CreateInMemoryContext();
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 64,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "InsufficientEvidence",
            AssessmentStateJson = null
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.GetHistoryDetailAsync("learner-1", 64);

        Assert.True(res.Success);
        Assert.Empty(res.Data!.EventSummaries);
        Assert.Empty(res.Data.TurnEvidences);
        Assert.Empty(res.Data.MessageHistory);
        Assert.Equal("Chưa xác định", res.Data.InitialEstimatedLevel);
    }

    [Fact]
    public async Task UC84_2_UTCID05_TimestampsHaveUtcKindAndNullCompletedAtPreserved()
    {
        using var db = CreateInMemoryContext();
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 65,
            UserId = "learner-1",
            SessionType = "PlacementTest",
            Status = "Active",
            CreatedAt = new DateTime(2026, 11, 11, 10, 0, 0, DateTimeKind.Unspecified),
            CompletedAt = null
        });
        db.RoleplayMessages.Add(new RoleplayMessage
        {
            RoleplaySessionId = 65,
            Sender = "Ai",
            JapaneseText = "ようこそ",
            CreatedAt = new DateTime(2026, 11, 11, 10, 0, 5, DateTimeKind.Unspecified)
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.GetHistoryDetailAsync("learner-1", 65);

        Assert.True(res.Success);
        Assert.Equal(DateTimeKind.Utc, res.Data!.CreatedAt.Kind);
        Assert.Null(res.Data.CompletedAt);
        Assert.Equal(DateTimeKind.Utc, Assert.Single(res.Data.MessageHistory).CreatedAt.Kind);
    }

    [Fact]
    public async Task UC84_2_UTCID06_NonExistentSessionId_ReturnsFail()
    {
        using var db = CreateInMemoryContext();
        var service = CreateService(db);

        var res = await service.GetHistoryDetailAsync("learner-1", 9999);

        Assert.False(res.Success);
        Assert.Equal("Không tìm thấy phiên kiểm tra xếp lớp.", res.Message);
    }

    [Fact]
    public async Task UC84_2_UTCID07_SessionOwnedByAnotherUser_ReturnsFail()
    {
        using var db = CreateInMemoryContext();
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 66,
            UserId = "learner-2",
            SessionType = "PlacementTest",
            Status = "Completed"
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.GetHistoryDetailAsync("learner-1", 66);

        Assert.False(res.Success);
        Assert.Equal("Không tìm thấy phiên kiểm tra xếp lớp.", res.Message);
    }

    [Fact]
    public async Task UC84_2_UTCID08_StandardRoleplaySessionId_ReturnsFail()
    {
        using var db = CreateInMemoryContext();
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 67,
            UserId = "learner-1",
            SessionType = "Standard",
            Status = "Completed"
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var res = await service.GetHistoryDetailAsync("learner-1", 67);

        Assert.False(res.Success);
        Assert.Equal("Không tìm thấy phiên kiểm tra xếp lớp.", res.Message);
    }

    #endregion
}
