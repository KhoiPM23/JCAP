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
}
