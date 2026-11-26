using System;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;
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
    }
}
