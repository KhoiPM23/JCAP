using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Roleplay;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace JCAP.Tests.Services;

public class AdaptiveProfileServiceTests
{
    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"JCAP_Adaptive_Test_{Guid.NewGuid()}")
            .Options;
        return new AppDbContext(options);
    }

    [Fact]
    public async Task GetAdaptiveContextAsync_ColdStartUser_ReturnsSafeN5Defaults()
    {
        using var db = CreateInMemoryDbContext();
        var service = new AdaptiveProfileService(db);

        var ctx = await service.GetAdaptiveContextAsync("cold-user-1");

        Assert.Equal("cold-user-1", ctx.UserId);
        Assert.Equal("N5", ctx.EstimatedJlptLevel);
        Assert.Equal("N5", ctx.RecommendedDifficulty);
        Assert.Equal("Stable", ctx.RecentTrend);
        Assert.Equal(0, ctx.TotalCompletedSessions);
        Assert.Equal(0, ctx.ConsecutiveFailCount);
        Assert.Empty(ctx.ChronicWeaknesses);
        Assert.Empty(ctx.HotWeaknesses);
    }

    [Fact]
    public async Task GetAdaptiveContextAsync_StrugglingUser_TracksShortTermAndLongTermAndRanksContent()
    {
        using var db = CreateInMemoryDbContext();

        db.LearnerIntelligenceProfiles.Add(new LearnerIntelligenceProfile
        {
            UserId = "learner-adapt-1",
            ThetaEstimate = 0.65,
            CommunicativeProficiencyIndex = 74.0,
            SpeakingReflexIndex = 62.0,
            KeigoCommandScore = 70.0,
            ParticleAccuracyRate = 66.0,
            AverageMoraRate = 4.2,
            CommunicativeConfidenceScore = 72.0,
            HintDependencyRate = 18.0
        });

        var s1 = new Scenario { Id = 1, Title = "Gọi món tại quán Ramen", Description = "Ăn uống N5", IsActive = true };
        var s2 = new Scenario { Id = 2, Title = "Hỏi đường ở ga tàu", Description = "Di chuyển N4", IsActive = true };
        s1.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 11, ScenarioId = 1, JLPTLevel = "N5", Status = "Published" });
        s2.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 12, ScenarioId = 2, JLPTLevel = "N4", Status = "Published" });
        db.Scenarios.AddRange(s1, s2);

        db.ShadowingDialogues.AddRange(
            new ShadowingDialogue { Id = 101, Title = "Đặt món tại quán Ramen", JLPTLevel = "N5", IsActive = true },
            new ShadowingDialogue { Id = 102, Title = "Thuyết trình công việc", JLPTLevel = "N3", IsActive = true }
        );

        var cfgId = 11;
        for (int i = 1; i <= 3; i++)
        {
            var sess = new RoleplaySession
            {
                Id = 200 + i,
                UserId = "learner-adapt-1",
                ScenarioLevelConfigurationId = cfgId,
                Status = "Completed",
                CreatedAt = DateTime.UtcNow.AddDays(-i)
            };
            db.RoleplaySessions.Add(sess);
            db.RoleplayResults.Add(new RoleplayResult
            {
                Id = 300 + i,
                UserId = "learner-adapt-1",
                RoleplaySessionId = sess.Id,
                ScenarioTitle = "Gọi món",
                JLPTLevel = "N4",
                OverallScore = 52 - i,
                PassStatus = false,
                CompletedAt = DateTime.UtcNow.AddHours(-i)
            });
        }

        db.LearnerSkillMasteries.AddRange(
            new LearnerSkillMastery
            {
                UserId = "learner-adapt-1",
                SkillCode = "GRAM_PARTICLE_NI",
                SkillName = "Ngữ pháp: Trợ từ に (chỉ địa điểm)",
                Category = "Grammar",
                Lapses = 3,
                Stability = 1.5,
                LastPracticedUtc = DateTime.UtcNow.AddDays(-1)
            },
            new LearnerSkillMastery
            {
                UserId = "learner-adapt-1",
                SkillCode = "VOCAB_RAMEN",
                SkillName = "Từ vựng: ラーメン (Mì Ramen)",
                Category = "Vocabulary",
                Lapses = 2,
                Stability = 2.0,
                LastPracticedUtc = DateTime.UtcNow.AddDays(-14)
            }
        );

        await db.SaveChangesAsync();

        var service = new AdaptiveProfileService(db);
        var ctx = await service.GetAdaptiveContextAsync("learner-adapt-1");

        Assert.Equal("Struggling", ctx.RecentTrend);
        Assert.Equal(3, ctx.ConsecutiveFailCount);
        Assert.Equal("N5", ctx.RecommendedDifficulty); // Struggling pulls down difficulty cleanly
        Assert.Contains("Trợ từ に", ctx.HotWeaknesses);
        Assert.Contains("ラーメン", ctx.ChronicWeaknesses);
        Assert.Contains(1, ctx.RecommendedScenarioIds);
        Assert.Equal(101, ctx.RecommendedShadowingIds[0]);
        Assert.False(string.IsNullOrWhiteSpace(ctx.AiRuntimeDirective));
    }

    [Fact]
    public async Task GetAdaptiveContextAsync_RanksByKnowledgeGapAndAntiRepetition_NotScenarioId()
    {
        using var db = CreateInMemoryDbContext();

        db.LearnerIntelligenceProfiles.Add(new LearnerIntelligenceProfile
        {
            UserId = "learner-zpd-1",
            ThetaEstimate = -0.35,
            CommunicativeProficiencyIndex = 68.0,
            SpeakingReflexIndex = 70.0,
            KeigoCommandScore = 72.0,
            ParticleAccuracyRate = 68.0,
            AverageMoraRate = 4.0,
            CommunicativeConfidenceScore = 74.0,
            HintDependencyRate = 15.0
        });

        var s1 = new Scenario { Id = 1, Title = "Chào hỏi văn phòng", Description = "Công sở", IsActive = true };
        var cfg1 = new ScenarioLevelConfiguration { Id = 21, ScenarioId = 1, JLPTLevel = "N5", Status = "Published" };
        s1.LevelConfigurations.Add(cfg1);

        var s2 = new Scenario { Id = 2, Title = "Phỏng vấn việc làm", Description = "Thử thách mới", IsActive = true };
        var cfg2 = new ScenarioLevelConfiguration { Id = 22, ScenarioId = 2, JLPTLevel = "N4", Status = "Published" };
        s2.LevelConfigurations.Add(cfg2);

        var s3 = new Scenario { Id = 3, Title = "Gọi món tại quán mì", Description = "Ẩm thực", IsActive = true };
        var cfg3 = new ScenarioLevelConfiguration { Id = 23, ScenarioId = 3, JLPTLevel = "N5", Status = "Published" };
        cfg3.TargetVocabularies.Add(new TargetVocabulary
        {
            Id = 501,
            ScenarioLevelConfigurationId = 23,
            Word = "ラーメン",
            Meaning = "Mì Ramen"
        });
        s3.LevelConfigurations.Add(cfg3);

        db.Scenarios.AddRange(s1, s2, s3);

        // Scenario 1 vừa mới đạt cách đây 2 giờ -> phải bị giảm điểm do anti-repetition cooldown
        var sess1 = new RoleplaySession
        {
            Id = 401,
            UserId = "learner-zpd-1",
            ScenarioLevelConfigurationId = 21,
            Status = "Completed",
            CreatedAt = DateTime.UtcNow.AddHours(-3)
        };
        db.RoleplaySessions.Add(sess1);
        db.RoleplayResults.Add(new RoleplayResult
        {
            Id = 501,
            UserId = "learner-zpd-1",
            RoleplaySessionId = 401,
            ScenarioTitle = "Chào hỏi văn phòng",
            JLPTLevel = "N5",
            OverallScore = 88,
            PassStatus = true,
            CompletedAt = DateTime.UtcNow.AddHours(-2)
        });

        db.LearnerSkillMasteries.Add(new LearnerSkillMastery
        {
            UserId = "learner-zpd-1",
            SkillCode = "VOCAB_RAMEN",
            SkillName = "Từ vựng: ラーメン (Mì Ramen)",
            Category = "Vocabulary",
            Lapses = 3,
            Stability = 1.2,
            LastPracticedUtc = DateTime.UtcNow.AddDays(-1)
        });

        await db.SaveChangesAsync();

        var service = new AdaptiveProfileService(db);
        var ctx = await service.GetAdaptiveContextAsync("learner-zpd-1");

        Assert.Equal(3, ctx.RecommendedScenarios.Count);
        var core = Assert.Single(ctx.RecommendedScenarios, r => r.IsTopPick);
        var consolidate = Assert.Single(ctx.RecommendedScenarios, r => r.Tier == "Consolidate");
        var stretch = Assert.Single(ctx.RecommendedScenarios, r => r.Tier == "Stretch");

        Assert.Equal(3, core.ScenarioId);
        Assert.Equal("Core", core.Tier);
        Assert.Equal(3, ctx.RecommendedScenarioIds[0]);
        Assert.True(core.MatchScore > consolidate.MatchScore);
        Assert.True(core.MatchScore > stretch.MatchScore);

        // Tactical post-session mode: khi vừa hoàn thành xong kịch bản 3 (Pass N5),
        // Trang Kết quả phải loại bỏ kịch bản 3 và đẩy tình huống tiếp theo thay vì lặp lại Trang Năng lực
        var tacticalCtx = await service.GetAdaptiveContextAsync(
            "learner-zpd-1",
            new JCAP.DTOs.Roleplay.AdaptiveContextQuery
            {
                ExcludeScenarioId = 3,
                SessionPassed = true,
                SessionLevel = "N5"
            });

        Assert.DoesNotContain(3, tacticalCtx.RecommendedScenarioIds);
        Assert.All(tacticalCtx.RecommendedScenarios, r => Assert.NotEqual(3, r.ScenarioId));
        var tacticalCore = Assert.Single(tacticalCtx.RecommendedScenarios, r => r.IsTopPick);
        Assert.Equal(2, tacticalCore.ScenarioId);
    }

    [Fact]
    public async Task GenerateAndPersistCoachingSnapshotAsync_GroundsIds_ScrubsJargon_PreservesTraits_AndOverlaysContext()
    {
        using var db = CreateInMemoryDbContext();

        db.LearnerIntelligenceProfiles.Add(new LearnerIntelligenceProfile
        {
            UserId = "learner-ai-1",
            ThetaEstimate = 0.1,
            CommunicativeProficiencyIndex = 68.0,
            SpeakingReflexIndex = 62.0,
            KeigoCommandScore = 76.0,
            ParticleAccuracyRate = 64.0,
            AverageMoraRate = 4.1,
            CommunicativeConfidenceScore = 73.0,
            HintDependencyRate = 15.0,
            InferredTraitsJson = """{"preferredTone":"Polite_Normal","hesitationRate":14.5,"strengths":["Văn phong"]}"""
        });

        var s1 = new Scenario { Id = 10, Title = "Hỏi đường tại Ga Shinjuku", Description = "Chỉ đường và trợ từ địa điểm", IsActive = true };
        s1.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 110, ScenarioId = 10, JLPTLevel = "N5", Status = "Published" });
        var s2 = new Scenario { Id = 11, Title = "Mua sắm tại Cửa hàng tiện lợi", Description = "Thanh toán và đồ ăn", IsActive = true };
        s2.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 111, ScenarioId = 11, JLPTLevel = "N5", Status = "Published" });
        var s3 = new Scenario { Id = 12, Title = "Phỏng vấn Baito", Description = "Công sở", IsActive = true };
        s3.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 112, ScenarioId = 12, JLPTLevel = "N4", Status = "Published" });
        db.Scenarios.AddRange(s1, s2, s3);

        db.ShadowingDialogues.Add(new ShadowingDialogue
        {
            Id = 201,
            Title = "Hỏi đường đến nhà ga",
            SourceDescription = "Thực hành trợ từ chỉ nơi chốn",
            JLPTLevel = "N5",
            IsActive = true
        });

        var session = new RoleplaySession
        {
            Id = 701,
            UserId = "learner-ai-1",
            ScenarioLevelConfigurationId = 111,
            Status = "Completed",
            CreatedAt = DateTime.UtcNow.AddMinutes(-10)
        };
        db.RoleplaySessions.Add(session);
        db.RoleplayMessages.Add(new RoleplayMessage
        {
            Id = 9001,
            RoleplaySessionId = 701,
            Sender = "User",
            JapaneseText = "すみません、駅はここで行きますか。",
            LinguisticFeedbackJson = """{"grammarFeedback":"Dùng に/へ cho hướng đi.","naturalAlternative":"すみません、駅へはどう行きますか。"}"""
        });

        db.LearnerSkillMasteries.Add(new LearnerSkillMastery
        {
            UserId = "learner-ai-1",
            SkillCode = "GRAM_NI_LOCATION",
            SkillName = "Ngữ pháp: Trợ từ に/へ (chỉ hướng đi)",
            Category = "Grammar",
            Lapses = 2,
            Stability = 1.6,
            LastPracticedUtc = DateTime.UtcNow
        });

        await db.SaveChangesAsync();

        var aiJson = """
            ```json
            {
              "executiveDiagnosis": "Dựa trên IRT và ZPD, bạn cần chú ý trợ từ E01 khi chỉ hướng đến nhà ga.",
              "axisInsights": {
                "particle": {
                  "diagnosticVi": "Hay nhầm で và に/へ khi hỏi đường theo FSRS.",
                  "drillMethodVi": "Đặt 3 câu với 駅へ行きます."
                },
                "hallucinatedAxis": {
                  "diagnosticVi": "Trục ảo phải bị loại bỏ",
                  "drillMethodVi": "Không được tồn tại"
                }
              },
              "scenarioReasons": {
                "10": "Luyện chắc trợ từ に/へ tại Ga Shinjuku theo Theta.",
                "9999": "ID bịa đặt phải bị lọc"
              },
              "shadowingReasons": {
                "201": "Nghe nhại đoạn hỏi đường để sửa lỗi trợ từ.",
                "8888": "Shadowing ID ảo phải bị lọc"
              },
              "flashcardAdviceVi": "Ôn kỹ thẻ trợ từ に/へ bằng FSRS mỗi tối.",
              "nextSessionFocus": "Khéo léo gợi mở cho học viên dùng đúng trợ từ に/へ trong tình huống đi lại."
            }
            ```
            """;

        var mockAi = new Mock<IAiClient>();
        mockAi
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AiResponse.Ok(aiJson));

        var service = new AdaptiveProfileService(db, mockAi.Object);

        // Act
        var snapshot = await service.GenerateAndPersistCoachingSnapshotAsync("learner-ai-1", 701);

        // Assert snapshot grounding & jargon scrubbing
        Assert.NotNull(snapshot);
        Assert.Equal("ai", snapshot!.Source);
        Assert.Equal(701, snapshot.SourceSessionId);
        Assert.DoesNotContain("IRT", snapshot.ExecutiveDiagnosis);
        Assert.DoesNotContain("ZPD", snapshot.ExecutiveDiagnosis);
        Assert.DoesNotContain("E01", snapshot.ExecutiveDiagnosis);
        Assert.True(snapshot.AxisInsights.ContainsKey("particle"));
        Assert.False(snapshot.AxisInsights.ContainsKey("hallucinatedAxis"));
        Assert.DoesNotContain("FSRS", snapshot.AxisInsights["particle"].DiagnosticVi);
        Assert.False(snapshot.ScenarioReasons.ContainsKey(9999));
        Assert.False(snapshot.ShadowingReasons.ContainsKey(8888));
        Assert.True(snapshot.ShadowingReasons.ContainsKey(201));
        Assert.DoesNotContain("Theta", snapshot.ScenarioReasons.Values.FirstOrDefault() ?? string.Empty);

        // Verify existing traits in InferredTraitsJson were preserved
        var savedProfile = await db.LearnerIntelligenceProfiles.AsNoTracking().FirstAsync(p => p.UserId == "learner-ai-1");
        using var traitsDoc = JsonDocument.Parse(savedProfile.InferredTraitsJson);
        Assert.Equal("Polite_Normal", traitsDoc.RootElement.GetProperty("preferredTone").GetString());
        Assert.True(traitsDoc.RootElement.TryGetProperty("aiCoaching", out _));
        Assert.False(string.IsNullOrWhiteSpace(AdaptiveProfileService.ExtractNextSessionFocus(savedProfile.InferredTraitsJson)));

        // Verify GetAdaptiveContextAsync overlays AI coaching cleanly
        var ctx = await service.GetAdaptiveContextAsync(
            "learner-ai-1",
            new AdaptiveContextQuery { ExcludeScenarioId = 11 });
        Assert.NotNull(ctx.AiCoaching);
        Assert.Equal("ai", ctx.AiCoaching!.Source);
        Assert.Contains(ctx.RecommendedShadowings, s => s.DialogueId == 201 && s.ReasonVi.Contains("hỏi đường"));
        Assert.False(string.IsNullOrWhiteSpace(ctx.FlashcardAdviceVi));
        Assert.DoesNotContain("FSRS", ctx.FlashcardAdviceVi!);

        // Cache hit: calling again for same sessionId should NOT call AI client again
        await service.GenerateAndPersistCoachingSnapshotAsync("learner-ai-1", 701);
        mockAi.Verify(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GenerateAndPersistCoachingSnapshotAsync_FallsBackCleanly_WhenAiFails()
    {
        using var db = CreateInMemoryDbContext();
        db.LearnerIntelligenceProfiles.Add(new LearnerIntelligenceProfile
        {
            UserId = "learner-fallback-1",
            ThetaEstimate = -0.2,
            CommunicativeProficiencyIndex = 60.0
        });
        var s1 = new Scenario { Id = 20, Title = "Gọi món Ramen", IsActive = true };
        s1.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 220, ScenarioId = 20, JLPTLevel = "N5", Status = "Published" });
        db.Scenarios.Add(s1);
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 801,
            UserId = "learner-fallback-1",
            ScenarioLevelConfigurationId = 220,
            Status = "Completed"
        });
        await db.SaveChangesAsync();

        var mockAi = new Mock<IAiClient>();
        mockAi
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TimeoutException("Gemini timeout"));

        var service = new AdaptiveProfileService(db, mockAi.Object);
        var snapshot = await service.GenerateAndPersistCoachingSnapshotAsync("learner-fallback-1", 801);

        Assert.NotNull(snapshot);
        Assert.Equal("deterministic", snapshot!.Source);
        Assert.False(string.IsNullOrWhiteSpace(snapshot.ExecutiveDiagnosis));
    }

    [Fact]
    public void ExtractSemanticDomainTags_MapsLocationAndServiceTermsAccurately()
    {
        var particleTags = AdaptiveProfileService.ExtractSemanticDomainTags(new[] { "Trợ từ に", "Hỏi đường ga tàu" });
        Assert.Contains("Particles_Location", particleTags);

        var serviceTags = AdaptiveProfileService.ExtractSemanticDomainTags(new[] { "Phỏng vấn Baito", "Kính ngữ công sở" });
        Assert.Contains("Business_Keigo", serviceTags);
    }

    [Fact]
    public async Task GetAdaptiveContextAsync_IgnoresStaleAiCoaching_WhenLastEvaluatedSessionDiffers()
    {
        using var db = CreateInMemoryDbContext();
        db.LearnerIntelligenceProfiles.Add(new LearnerIntelligenceProfile
        {
            UserId = "learner-stale-1",
            ThetaEstimate = -0.1,
            CommunicativeProficiencyIndex = 68.0,
            InferredTraitsJson = """
                {
                  "lastEvaluatedSessionId": 902,
                  "aiCoaching": {
                    "sourceSessionId": 901,
                    "source": "ai",
                    "executiveDiagnosis": "Nhận xét cũ từ phiên 901",
                    "scenarioReasons": { "30": "Lý do cũ từ phiên 901" },
                    "nextSessionFocus": "Mục tiêu cũ từ phiên 901"
                  }
                }
                """
        });

        var s1 = new Scenario { Id = 30, Title = "Gọi món Ramen", IsActive = true };
        s1.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 330, ScenarioId = 30, JLPTLevel = "N5", Status = "Published" });
        db.Scenarios.Add(s1);
        await db.SaveChangesAsync();

        var service = new AdaptiveProfileService(db);
        var ctx = await service.GetAdaptiveContextAsync("learner-stale-1");

        Assert.Null(ctx.AiCoaching);
        Assert.DoesNotContain(ctx.RecommendedScenarios, r => r.ReasonVi.Contains("phiên 901"));

        var profile = await db.LearnerIntelligenceProfiles.AsNoTracking().FirstAsync(p => p.UserId == "learner-stale-1");
        Assert.Null(AdaptiveProfileService.ExtractNextSessionFocus(profile.InferredTraitsJson, "N5"));
    }

    [Fact]
    public void SanitizeNextSessionFocusForJlpt_NeutralizesKeigoDirectiveForN5()
    {
        var keigoFocus = "Ở lượt 2 hãy luyện kính ngữ (Keigo) và câu ghép phức tạp mức N3.";
        var n5Safe = AdaptiveProfileService.SanitizeNextSessionFocusForJlpt(keigoFocus, "N5");
        var n3Allowed = AdaptiveProfileService.SanitizeNextSessionFocusForJlpt(keigoFocus, "N3");

        Assert.NotNull(n5Safe);
        Assert.DoesNotContain("Keigo", n5Safe!, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("kính ngữ", n5Safe!, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("N5", n5Safe!);

        Assert.NotNull(n3Allowed);
        Assert.Contains("kính ngữ", n3Allowed!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GenerateAndPersistCoachingSnapshotAsync_DoesNotContaminateFallbackWithOlderSessionAi()
    {
        using var db = CreateInMemoryDbContext();
        db.LearnerIntelligenceProfiles.Add(new LearnerIntelligenceProfile
        {
            UserId = "learner-clean-fb",
            ThetaEstimate = -0.2,
            CommunicativeProficiencyIndex = 65.0,
            InferredTraitsJson = """
                {
                  "lastEvaluatedSessionId": 1001,
                  "aiCoaching": {
                    "sourceSessionId": 1001,
                    "source": "ai",
                    "executiveDiagnosis": "Chẩn đoán cũ của phiên 1001",
                    "scenarioReasons": { "40": "Lý do cũ từ phiên 1001" },
                    "flashcardAdviceVi": "Lời khuyên cũ từ phiên 1001"
                  }
                }
                """
        });

        var s1 = new Scenario { Id = 40, Title = "Hỏi đường tại ga Shinjuku", IsActive = true };
        s1.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 440, ScenarioId = 40, JLPTLevel = "N5", Status = "Published" });
        db.Scenarios.Add(s1);
        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 1002,
            UserId = "learner-clean-fb",
            ScenarioLevelConfigurationId = 440,
            Status = "Completed"
        });
        await db.SaveChangesAsync();

        var mockAi = new Mock<IAiClient>();
        mockAi
            .Setup(c => c.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TimeoutException("Simulated timeout"));

        var service = new AdaptiveProfileService(db, mockAi.Object);
        var snapshot = await service.GenerateAndPersistCoachingSnapshotAsync("learner-clean-fb", 1002);

        Assert.NotNull(snapshot);
        Assert.Equal(1002, snapshot!.SourceSessionId);
        Assert.Equal("deterministic", snapshot.Source);
        Assert.DoesNotContain("phiên 1001", snapshot.ExecutiveDiagnosis);
        Assert.DoesNotContain("phiên 1001", snapshot.FlashcardAdviceVi ?? string.Empty);
        Assert.All(snapshot.ScenarioReasons.Values, v => Assert.DoesNotContain("phiên 1001", v));
    }

    [Fact]
    public async Task GetAdaptiveContextAsync_FiltersOutInternalRuleErrorCodesFromFlashcardKeywords()
    {
        using var db = CreateInMemoryDbContext();
        db.LearnerSkillMasteries.AddRange(
            new LearnerSkillMastery
            {
                UserId = "learner-clean-kw",
                SkillCode = "E14_OK_DESU_OVERUSE",
                SkillName = "Quy tắc giao tiếp (E14_OK_DESU_OVERUSE)",
                Category = "Grammar",
                Lapses = 4,
                Stability = 1.0,
                LastPracticedUtc = DateTime.UtcNow
            },
            new LearnerSkillMastery
            {
                UserId = "learner-clean-kw",
                SkillCode = "VOCAB_OHIYA",
                SkillName = "Từ vựng: お冷 (Nước lạnh)",
                Category = "Vocabulary",
                Lapses = 2,
                Stability = 1.5,
                LastPracticedUtc = DateTime.UtcNow
            }
        );
        await db.SaveChangesAsync();

        var service = new AdaptiveProfileService(db);
        var ctx = await service.GetAdaptiveContextAsync("learner-clean-kw");

        Assert.Contains("お冷", ctx.RecommendedFlashcardKeywords);
        Assert.DoesNotContain(ctx.RecommendedFlashcardKeywords, k => k.Contains("E14", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(ctx.RecommendedFlashcardKeywords, k => k.Contains("Quy tắc giao tiếp", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task GetAdaptiveContextAsync_ConsolidateNeverPicksFailedN3OverEasyN5()
    {
        using var db = CreateInMemoryDbContext();
        db.LearnerIntelligenceProfiles.Add(new LearnerIntelligenceProfile
        {
            UserId = "learner-n5-only",
            ThetaEstimate = -0.5,
            CommunicativeProficiencyIndex = 58.0
        });

        var sN3Failed = new Scenario { Id = 1, Title = "Tình huống N3 khó", IsActive = true };
        sN3Failed.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 1001, ScenarioId = 1, JLPTLevel = "N3", Status = "Published" });

        var sCore = new Scenario { Id = 2, Title = "Gọi món Ramen", IsActive = true };
        sCore.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 1002, ScenarioId = 2, JLPTLevel = "N5", Status = "Published" });

        var sEasyN5 = new Scenario { Id = 3, Title = "Mua đồ Combini", IsActive = true };
        sEasyN5.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 1003, ScenarioId = 3, JLPTLevel = "N5", Status = "Published" });

        db.Scenarios.AddRange(sN3Failed, sCore, sEasyN5);

        db.RoleplaySessions.Add(new RoleplaySession
        {
            Id = 5001,
            UserId = "learner-n5-only",
            ScenarioLevelConfigurationId = 1001,
            Status = "Completed"
        });
        db.RoleplayResults.Add(new RoleplayResult
        {
            Id = 6001,
            UserId = "learner-n5-only",
            RoleplaySessionId = 5001,
            ScenarioTitle = "Tình huống N3 khó",
            JLPTLevel = "N3",
            OverallScore = 40,
            PassStatus = false,
            CompletedAt = DateTime.UtcNow.AddHours(-2)
        });
        await db.SaveChangesAsync();

        var service = new AdaptiveProfileService(db);
        var ctx = await service.GetAdaptiveContextAsync("learner-n5-only");

        var consolidate = Assert.Single(ctx.RecommendedScenarios, r => r.Tier == "Consolidate");
        Assert.NotEqual("N3", consolidate.RecommendedLevel);
        Assert.Equal("N5", consolidate.RecommendedLevel);
    }

    [Fact]
    public async Task GetAdaptiveContextAsync_FailedN4Session_NeverRecommendsN3InAnyTier()
    {
        using var db = CreateInMemoryDbContext();
        db.LearnerIntelligenceProfiles.Add(new LearnerIntelligenceProfile
        {
            UserId = "learner-fail-n4",
            ThetaEstimate = 0.05,
            CommunicativeProficiencyIndex = 62.0
        });

        var sFailedCurrent = new Scenario { Id = 1, Title = "Hỏi đường ga Shinjuku", IsActive = true };
        sFailedCurrent.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 2001, ScenarioId = 1, JLPTLevel = "N4", Status = "Published" });

        var sN3Unattempted = new Scenario { Id = 2, Title = "Lần đầu đi chợ", IsActive = true };
        sN3Unattempted.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 2002, ScenarioId = 2, JLPTLevel = "N3", Status = "Published" });

        var sN5A = new Scenario { Id = 3, Title = "Đi máy bay", IsActive = true };
        sN5A.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 2003, ScenarioId = 3, JLPTLevel = "N5", Status = "Published" });

        var sN5B = new Scenario { Id = 4, Title = "Gọi món Ramen", IsActive = true };
        sN5B.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 2004, ScenarioId = 4, JLPTLevel = "N5", Status = "Published" });

        var sN4Alt = new Scenario { Id = 5, Title = "Đặt phòng khách sạn", IsActive = true };
        sN4Alt.LevelConfigurations.Add(new ScenarioLevelConfiguration { Id = 2005, ScenarioId = 5, JLPTLevel = "N4", Status = "Published" });

        db.Scenarios.AddRange(sFailedCurrent, sN3Unattempted, sN5A, sN5B, sN4Alt);
        await db.SaveChangesAsync();

        var service = new AdaptiveProfileService(db);
        var ctx = await service.GetAdaptiveContextAsync(
            "learner-fail-n4",
            new JCAP.DTOs.Roleplay.AdaptiveContextQuery
            {
                ExcludeScenarioId = 1,
                SessionPassed = false,
                SessionLevel = "N4"
            });

        Assert.Equal(3, ctx.RecommendedScenarios.Count);
        Assert.All(ctx.RecommendedScenarios, r => Assert.NotEqual("N3", r.RecommendedLevel));
        var stretch = Assert.Single(ctx.RecommendedScenarios, r => r.Tier == "Stretch");
        Assert.Equal("N4", stretch.RecommendedLevel);
    }
}
