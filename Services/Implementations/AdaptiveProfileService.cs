using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Roleplay;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations;

public class AdaptiveProfileService : IAdaptiveProfileService
{
    private readonly AppDbContext _dbContext;

    public AdaptiveProfileService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<AdaptiveContextDto> GetAdaptiveContextAsync(
        string userId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            return new AdaptiveContextDto();
        }

        var profile = await _dbContext.LearnerIntelligenceProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.UserId == userId, cancellationToken);

        int totalCompleted = await TelemetryEvaluatorService.CountCompletedStandardSessionsAsync(
            _dbContext,
            userId,
            cancellationToken);

        var recentResults = await TelemetryEvaluatorService.GetRecentStandardResultsAsync(
            _dbContext,
            userId,
            take: 6,
            cancellationToken);

        var masteries = await _dbContext.LearnerSkillMasteries
            .AsNoTracking()
            .Where(m => m.UserId == userId)
            .OrderByDescending(m => m.Lapses)
            .ThenBy(m => m.Stability)
            .ThenByDescending(m => m.LastPracticedUtc)
            .Take(40)
            .ToListAsync(cancellationToken);

        double theta = profile?.ThetaEstimate ?? 0.0;
        double proficiencyIndex = profile != null
            ? TelemetryEvaluatorService.ComputeEffectiveAlignedProficiency(profile, totalCompleted)
            : 50.0;

        int consecutiveFails = recentResults.TakeWhile(r => !r.PassStatus).Count();
        var (estimatedLevel, estimatedLabel) = TelemetryEvaluatorService.DeriveDynamicJlptDetails(
            theta,
            proficiencyIndex,
            consecutiveFails);

        double? recentAvg = recentResults.Count > 0
            ? Math.Round(recentResults.Average(r => r.OverallScore), 1)
            : null;

        string recentTrend = ComputeRecentTrend(recentResults, consecutiveFails);

        // Khung dài hạn: các điểm yếu tích lũy bền vững (Lapses >= 2)
        var chronicWeaknesses = masteries
            .Where(m => m.Lapses >= 2)
            .OrderByDescending(m => m.Lapses)
            .ThenBy(m => m.Stability)
            .Select(m => FormatDisplayName(m.SkillName, m.SkillCode))
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(3)
            .ToList();

        // Khung ngắn hạn (7 ngày qua): các lỗi mới tái phát hoặc còn yếu gần đây
        var sevenDaysAgo = DateTime.UtcNow.AddDays(-7);
        var hotWeaknesses = masteries
            .Where(m => m.LastPracticedUtc >= sevenDaysAgo && (m.Lapses >= 1 || m.Stability < 3.0))
            .OrderByDescending(m => m.Lapses)
            .ThenBy(m => m.Stability)
            .Select(m => FormatDisplayName(m.SkillName, m.SkillCode))
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(3)
            .ToList();

        var focusTags = hotWeaknesses.Concat(chronicWeaknesses)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(4)
            .ToList();

        var flashcardKeywords = masteries
            .Where(m => (string.Equals(m.Category, "Vocabulary", StringComparison.OrdinalIgnoreCase)
                         || string.Equals(m.Category, "Grammar", StringComparison.OrdinalIgnoreCase))
                        && (m.Lapses >= 1 || m.Stability < 3.0))
            .OrderByDescending(m => m.Lapses)
            .ThenBy(m => m.Stability)
            .Select(m => ExtractKeyword(m.SkillName))
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(5)
            .ToList();

        string recommendedDifficulty = DeriveRecommendedDifficulty(estimatedLevel, recentTrend, consecutiveFails);

        var (recommendedScenarios, recommendedShadowings) = await RankRecommendationsAsync(
            recommendedDifficulty,
            flashcardKeywords,
            cancellationToken);

        double autonomy = profile != null
            ? Math.Clamp(Math.Round(100.0 - profile.HintDependencyRate, 1), 0.0, 100.0)
            : 100.0;
        double fluency = profile != null
            ? Math.Round((profile.SpeakingReflexIndex + Math.Clamp((profile.AverageMoraRate / 6.0) * 100.0, 18.0, 100.0)) / 2.0, 1)
            : 0.0;

        string? directive = BuildRuntimeDirective(recentTrend, consecutiveFails, hotWeaknesses, chronicWeaknesses);

        return new AdaptiveContextDto
        {
            UserId = userId,
            EstimatedJlptLevel = estimatedLevel,
            EstimatedJlptLabel = estimatedLabel,
            ThetaEstimate = theta,
            ProficiencyIndex = proficiencyIndex,
            TotalCompletedSessions = totalCompleted,
            SkillScores = new AdaptiveSkillScoresDto
            {
                Grammar = profile?.ParticleAccuracyRate ?? 0.0,
                Vocabulary = profile?.KeigoCommandScore ?? 0.0,
                Fluency = fluency,
                Pronunciation = profile?.CommunicativeConfidenceScore ?? 0.0,
                Autonomy = autonomy
            },
            ChronicWeaknesses = chronicWeaknesses,
            RecentTrend = recentTrend,
            ConsecutiveFailCount = consecutiveFails,
            RecentAverageScore = recentAvg,
            HotWeaknesses = hotWeaknesses,
            RecommendedDifficulty = recommendedDifficulty,
            FocusSkillTags = focusTags,
            RecommendedScenarioIds = recommendedScenarios,
            RecommendedShadowingIds = recommendedShadowings,
            RecommendedFlashcardKeywords = flashcardKeywords,
            AiRuntimeDirective = directive
        };
    }

    private async Task<(List<int> ScenarioIds, List<int> ShadowingIds)> RankRecommendationsAsync(
        string targetLevel,
        List<string> keywords,
        CancellationToken cancellationToken)
    {
        var scenarioRows = await _dbContext.Scenarios
            .AsNoTracking()
            .Where(s => s.IsActive)
            .Select(s => new
            {
                s.Id,
                s.Title,
                s.Description,
                Levels = s.LevelConfigurations
                    .Where(l => l.Status == "Published")
                    .Select(l => l.JLPTLevel)
                    .ToList()
            })
            .Take(40)
            .ToListAsync(cancellationToken);

        var rankedScenarios = scenarioRows
            .Select(s =>
            {
                int score = s.Levels.Any(l => string.Equals(l, targetLevel, StringComparison.OrdinalIgnoreCase)) ? 10 : 0;
                foreach (var kw in keywords)
                {
                    if ((s.Title?.Contains(kw, StringComparison.OrdinalIgnoreCase) ?? false)
                        || (s.Description?.Contains(kw, StringComparison.OrdinalIgnoreCase) ?? false))
                    {
                        score += 3;
                    }
                }
                return (s.Id, Score: score);
            })
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Id)
            .Take(3)
            .Select(x => x.Id)
            .ToList();

        var shadowingRows = await _dbContext.ShadowingDialogues
            .AsNoTracking()
            .Where(d => d.IsActive)
            .Select(d => new { d.Id, d.JLPTLevel, d.Title, Description = d.SourceDescription })
            .Take(40)
            .ToListAsync(cancellationToken);

        var rankedShadowing = shadowingRows
            .Select(d =>
            {
                int score = string.Equals(d.JLPTLevel, targetLevel, StringComparison.OrdinalIgnoreCase) ? 10 : 0;
                foreach (var kw in keywords)
                {
                    if ((d.Title?.Contains(kw, StringComparison.OrdinalIgnoreCase) ?? false)
                        || (d.Description?.Contains(kw, StringComparison.OrdinalIgnoreCase) ?? false))
                    {
                        score += 3;
                    }
                }
                return (d.Id, Score: score);
            })
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Id)
            .Take(3)
            .Select(x => x.Id)
            .ToList();

        return (rankedScenarios, rankedShadowing);
    }

    private static string ComputeRecentTrend(
        List<(int OverallScore, bool PassStatus)> recentResults,
        int consecutiveFails)
    {
        if (consecutiveFails >= 2) return "Struggling";
        if (recentResults.Count < 4) return "Stable";

        var newestHalf = recentResults.Take(3).Average(r => r.OverallScore);
        var olderHalf = recentResults.Skip(3).Take(3).Average(r => r.OverallScore);
        var delta = newestHalf - olderHalf;

        if (delta >= 5.0) return "Improving";
        if (delta <= -6.0) return "Struggling";
        return "Stable";
    }

    private static string DeriveRecommendedDifficulty(
        string estimatedLevel,
        string recentTrend,
        int consecutiveFails)
    {
        if (consecutiveFails >= 2 || string.Equals(recentTrend, "Struggling", StringComparison.OrdinalIgnoreCase))
        {
            return estimatedLevel switch
            {
                "N3" => "N4",
                _ => "N5"
            };
        }
        return estimatedLevel is "N3" or "N4" or "N5" ? estimatedLevel : "N5";
    }

    private static string? BuildRuntimeDirective(
        string recentTrend,
        int consecutiveFails,
        List<string> hotWeaknesses,
        List<string> chronicWeaknesses)
    {
        var parts = new List<string>();
        if (consecutiveFails >= 2 || string.Equals(recentTrend, "Struggling", StringComparison.OrdinalIgnoreCase))
        {
            parts.Add("Keep replies slightly shorter, slower-paced, and supportive.");
        }

        var topIssues = hotWeaknesses.Concat(chronicWeaknesses)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(2)
            .ToList();
        if (topIssues.Count > 0)
        {
            parts.Add($"Gently model and reinforce: {string.Join(", ", topIssues)}.");
        }

        return parts.Count > 0 ? string.Join(" ", parts) : null;
    }

    private static string FormatDisplayName(string? skillName, string? skillCode)
    {
        var raw = !string.IsNullOrWhiteSpace(skillName) ? skillName.Trim() : (skillCode ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        raw = Regex.Replace(raw, @"^(Từ vựng|Ngữ pháp)\s*:\s*", "", RegexOptions.IgnoreCase).Trim();
        var parenIdx = raw.IndexOf('(');
        if (parenIdx > 0) raw = raw[..parenIdx].Trim();
        return raw;
    }

    private static string ExtractKeyword(string? skillName)
    {
        return FormatDisplayName(skillName, null);
    }
}
