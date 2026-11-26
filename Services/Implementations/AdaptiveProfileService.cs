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

        var weakKeywords = masteries
            .Where(m => m.Lapses >= 1 || m.Stability < 3.0)
            .OrderByDescending(m => m.Lapses)
            .ThenBy(m => m.Stability)
            .Select(m => FormatDisplayName(m.SkillName, m.SkillCode))
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(12)
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

        var (recommendedScenarios, recommendedScenarioIds, recommendedShadowings) = await RankRecommendationsAsync(
            userId,
            theta,
            consecutiveFails,
            recommendedDifficulty,
            weakKeywords,
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
            RecommendedScenarioIds = recommendedScenarioIds,
            RecommendedScenarios = recommendedScenarios,
            RecommendedShadowingIds = recommendedShadowings,
            RecommendedFlashcardKeywords = flashcardKeywords,
            AiRuntimeDirective = directive
        };
    }

    private sealed class ScenarioCandidateRaw
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public List<ScenarioLevelCandidateRaw> Levels { get; set; } = new();
    }

    private sealed class ScenarioLevelCandidateRaw
    {
        public int Id { get; set; }
        public string JLPTLevel { get; set; } = "N5";
        public List<string> VocabWords { get; set; } = new();
        public List<string> GrammarPatterns { get; set; } = new();
    }

    private sealed class ScoredScenarioCandidate
    {
        public int Id { get; set; }
        public List<string> PublishedLevels { get; set; } = new();
        public string BestLevel { get; set; } = "N5";
        public double BestPassProbability { get; set; }
        public double RawScore { get; set; }
        public double GapScore { get; set; }
        public double FreshnessScore { get; set; }
        public List<string> MatchedWeakTerms { get; set; } = new();
        public bool IsFailed { get; set; }
        public bool IsUnattempted { get; set; }
        public int AttemptCount { get; set; }
        public bool SupportsConsolidateLevel { get; set; }
        public bool SupportsStretchLevel { get; set; }
    }

    private async Task<(
        List<AdaptiveScenarioRecommendationDto> Scenarios,
        List<int> ScenarioIds,
        List<int> ShadowingIds)> RankRecommendationsAsync(
        string userId,
        double theta,
        int consecutiveFails,
        string recommendedDifficulty,
        List<string> weakKeywords,
        CancellationToken cancellationToken)
    {
        var scenarioRows = await _dbContext.Scenarios
            .AsNoTracking()
            .Where(s => s.IsActive)
            .Select(s => new ScenarioCandidateRaw
            {
                Id = s.Id,
                Title = s.Title,
                Description = s.Description,
                Levels = s.LevelConfigurations
                    .Where(l => l.Status == "Published")
                    .Select(l => new ScenarioLevelCandidateRaw
                    {
                        Id = l.Id,
                        JLPTLevel = l.JLPTLevel,
                        VocabWords = l.TargetVocabularies.Select(v => v.Word).ToList(),
                        GrammarPatterns = l.TargetGrammars.Select(g => g.Pattern).ToList()
                    })
                    .ToList()
            })
            .Take(60)
            .ToListAsync(cancellationToken);

        var nonTestScenarios = scenarioRows
            .Where(s => !Regex.IsMatch(s.Title ?? string.Empty, @"master data|shared test", RegexOptions.IgnoreCase))
            .ToList();
        if (nonTestScenarios.Count > 0)
        {
            scenarioRows = nonTestScenarios;
        }

        var publishedOnly = scenarioRows.Where(s => s.Levels.Count > 0).ToList();
        if (publishedOnly.Count > 0)
        {
            scenarioRows = publishedOnly;
        }

        var historyRows = await (
            from r in _dbContext.RoleplayResults.AsNoTracking()
            join sess in _dbContext.RoleplaySessions.AsNoTracking() on r.RoleplaySessionId equals sess.Id
            join cfg in _dbContext.ScenarioLevelConfigurations.AsNoTracking() on sess.ScenarioLevelConfigurationId equals cfg.Id
            where r.UserId == userId
            orderby r.CompletedAt descending
            select new
            {
                cfg.ScenarioId,
                r.CompletedAt,
                r.PassStatus,
                r.OverallScore
            })
            .Take(100)
            .ToListAsync(cancellationToken);

        var historyByScenario = historyRows
            .GroupBy(h => h.ScenarioId)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var latest = g.First();
                    return (
                        LastCompletedAt: latest.CompletedAt,
                        LastPassed: latest.PassStatus,
                        AttemptCount: g.Count(),
                        BestScore: g.Max(x => x.OverallScore)
                    );
                });

        double thetaEff = theta - (consecutiveFails >= 2 ? 0.45 : 0.0);
        int recRank = GetLevelRank(recommendedDifficulty);
        int consolidateMaxRank = recRank >= 3 ? 2 : 1;
        DateTime nowUtc = DateTime.UtcNow;

        var scoredCandidates = scenarioRows.Select(s =>
        {
            var levelList = s.Levels.Count > 0
                ? s.Levels.Select(l => NormalizeJlptLevel(l.JLPTLevel)).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
                : new List<string> { recommendedDifficulty };

            var bestLevelEval = levelList
                .Select(lv =>
                {
                    double p = ComputeIrtPassProbability(thetaEff, lv);
                    bool isRec = string.Equals(lv, recommendedDifficulty, StringComparison.OrdinalIgnoreCase);
                    return (Level: lv, PPass: p, Dist: Math.Abs(p - 0.72), IsRec: isRec);
                })
                .OrderBy(x => x.Dist)
                .ThenByDescending(x => x.IsRec)
                .First();

            double zpdScore = 100.0 * Math.Max(0.0, 1.0 - Math.Abs(bestLevelEval.PPass - 0.72) / 0.50);

            var searchCorpus = new List<string>();
            if (!string.IsNullOrWhiteSpace(s.Title)) searchCorpus.Add(s.Title);
            if (!string.IsNullOrWhiteSpace(s.Description)) searchCorpus.Add(s.Description);
            foreach (var lvl in s.Levels)
            {
                searchCorpus.AddRange(lvl.VocabWords.Where(w => !string.IsNullOrWhiteSpace(w)));
                searchCorpus.AddRange(lvl.GrammarPatterns.Where(g => !string.IsNullOrWhiteSpace(g)));
            }

            var matchedWeakTerms = weakKeywords
                .Where(kw => searchCorpus.Any(text => text.Contains(kw, StringComparison.OrdinalIgnoreCase)))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            double gapScore = weakKeywords.Count == 0
                ? 60.0
                : Math.Min(100.0, 42.0 + matchedWeakTerms.Count * 24.0);

            bool hasHistory = historyByScenario.TryGetValue(s.Id, out var hist);
            bool isFailed = hasHistory && !hist.LastPassed;
            bool isUnattempted = !hasHistory;
            double freshnessScore;
            if (isUnattempted)
            {
                freshnessScore = 86.0;
            }
            else if (isFailed)
            {
                freshnessScore = 95.0;
            }
            else
            {
                double daysSince = (nowUtc - hist.LastCompletedAt).TotalDays;
                freshnessScore = daysSince > 7.0 ? 65.0 : daysSince >= 3.0 ? 40.0 : 15.0;
            }

            double diffBonus = levelList.Any(l => string.Equals(l, recommendedDifficulty, StringComparison.OrdinalIgnoreCase))
                ? 100.0
                : 55.0;

            double rawScore = 0.35 * zpdScore + 0.35 * gapScore + 0.20 * freshnessScore + 0.10 * diffBonus;

            return new ScoredScenarioCandidate
            {
                Id = s.Id,
                PublishedLevels = levelList,
                BestLevel = bestLevelEval.Level,
                BestPassProbability = bestLevelEval.PPass,
                RawScore = rawScore,
                GapScore = gapScore,
                FreshnessScore = freshnessScore,
                MatchedWeakTerms = matchedWeakTerms,
                IsFailed = isFailed,
                IsUnattempted = isUnattempted,
                AttemptCount = hasHistory ? hist.AttemptCount : 0,
                SupportsConsolidateLevel = levelList.Any(l => GetLevelRank(l) <= consolidateMaxRank),
                SupportsStretchLevel = levelList.Any(l => GetLevelRank(l) > recRank)
            };
        }).ToList();

        var recommendations = new List<AdaptiveScenarioRecommendationDto>();
        var idOrder = new List<int>();

        if (scoredCandidates.Count > 0)
        {
            var usedIds = new HashSet<int>();

            var core = scoredCandidates
                .OrderByDescending(c => c.RawScore)
                .ThenByDescending(c => c.GapScore)
                .ThenByDescending(c => c.FreshnessScore)
                .ThenBy(c => c.AttemptCount)
                .ThenBy(c => c.Id)
                .First();
            usedIds.Add(core.Id);

            int coreMatch = (int)Math.Clamp(Math.Round(core.RawScore), 78, 97);
            var coreDto = BuildRecommendationDto(core, "Core", core.BestLevel, thetaEff, coreMatch, isTopPick: true);

            ScoredScenarioCandidate? consolidate = scoredCandidates
                .Where(c => !usedIds.Contains(c.Id))
                .OrderByDescending(c => c.IsFailed)
                .ThenByDescending(c => c.SupportsConsolidateLevel)
                .ThenByDescending(c => c.RawScore)
                .ThenBy(c => c.Id)
                .FirstOrDefault();

            AdaptiveScenarioRecommendationDto? consolidateDto = null;
            if (consolidate != null)
            {
                usedIds.Add(consolidate.Id);
                string consLevel = consolidate.PublishedLevels
                    .Where(l => GetLevelRank(l) <= consolidateMaxRank)
                    .OrderByDescending(GetLevelRank)
                    .FirstOrDefault() ?? consolidate.BestLevel;
                int consMatch = (int)Math.Clamp(Math.Round(consolidate.RawScore), 64, Math.Max(64, coreMatch - 3));
                consolidateDto = BuildRecommendationDto(consolidate, "Consolidate", consLevel, thetaEff, consMatch, isTopPick: false);
            }

            ScoredScenarioCandidate? stretch = scoredCandidates
                .Where(c => !usedIds.Contains(c.Id))
                .OrderByDescending(c => c.SupportsStretchLevel)
                .ThenByDescending(c => c.IsUnattempted)
                .ThenByDescending(c => c.RawScore)
                .ThenBy(c => c.Id)
                .FirstOrDefault();

            AdaptiveScenarioRecommendationDto? stretchDto = null;
            if (stretch != null)
            {
                usedIds.Add(stretch.Id);
                string stretchLevel = stretch.PublishedLevels
                    .Where(l => GetLevelRank(l) > recRank)
                    .OrderBy(GetLevelRank)
                    .FirstOrDefault() ?? stretch.BestLevel;
                int stretchMatch = (int)Math.Clamp(Math.Round(stretch.RawScore), 60, Math.Max(60, coreMatch - 5));
                stretchDto = BuildRecommendationDto(stretch, "Stretch", stretchLevel, thetaEff, stretchMatch, isTopPick: false);
            }

            if (consolidateDto != null) recommendations.Add(consolidateDto);
            recommendations.Add(coreDto);
            if (stretchDto != null) recommendations.Add(stretchDto);

            idOrder.Add(coreDto.ScenarioId);
            if (consolidateDto != null) idOrder.Add(consolidateDto.ScenarioId);
            if (stretchDto != null) idOrder.Add(stretchDto.ScenarioId);
        }

        var shadowingRows = await _dbContext.ShadowingDialogues
            .AsNoTracking()
            .Where(d => d.IsActive)
            .Select(d => new { d.Id, d.JLPTLevel, d.Title, Description = d.SourceDescription })
            .Take(40)
            .ToListAsync(cancellationToken);

        var rankedShadowing = shadowingRows
            .Select(d =>
            {
                string level = NormalizeJlptLevel(d.JLPTLevel);
                double pPass = ComputeIrtPassProbability(thetaEff, level);
                double zpdScore = 100.0 * Math.Max(0.0, 1.0 - Math.Abs(pPass - 0.72) / 0.50);
                int matched = weakKeywords.Count(kw =>
                    (d.Title?.Contains(kw, StringComparison.OrdinalIgnoreCase) ?? false)
                    || (d.Description?.Contains(kw, StringComparison.OrdinalIgnoreCase) ?? false));
                double gapScore = weakKeywords.Count == 0 ? 55.0 : Math.Min(100.0, 40.0 + matched * 25.0);
                double diffBonus = string.Equals(level, recommendedDifficulty, StringComparison.OrdinalIgnoreCase) ? 100.0 : 50.0;
                double totalScore = 0.45 * zpdScore + 0.35 * gapScore + 0.20 * diffBonus;
                return (d.Id, Score: totalScore);
            })
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Id)
            .Take(3)
            .Select(x => x.Id)
            .ToList();

        return (recommendations, idOrder, rankedShadowing);
    }

    private static AdaptiveScenarioRecommendationDto BuildRecommendationDto(
        ScoredScenarioCandidate candidate,
        string tier,
        string chosenLevel,
        double thetaEff,
        int matchScore,
        bool isTopPick)
    {
        int predictedPassRate = (int)Math.Clamp(
            Math.Round(ComputeIrtPassProbability(thetaEff, chosenLevel) * 100.0),
            10,
            98);

        string reasonVi;
        if (candidate.MatchedWeakTerms.Count > 0)
        {
            reasonVi = $"Ôn trúng {candidate.MatchedWeakTerms.Count} điểm còn yếu ({candidate.MatchedWeakTerms[0]}) ở mức {chosenLevel}.";
        }
        else if (candidate.IsFailed)
        {
            reasonVi = $"Luyện lại tình huống chưa đạt gần đây để củng cố mức {chosenLevel}.";
        }
        else
        {
            reasonVi = tier switch
            {
                "Core" => $"Độ khó {chosenLevel} khớp vùng năng lực tối ưu (dự báo đạt {predictedPassRate}%).",
                "Consolidate" => $"Củng cố nền tảng giao tiếp chắc chắn ở mức {chosenLevel}.",
                _ => $"Thử thách tình huống mới ở mức {chosenLevel} để bứt phá."
            };
        }

        return new AdaptiveScenarioRecommendationDto
        {
            ScenarioId = candidate.Id,
            RecommendedLevel = chosenLevel,
            Tier = tier,
            MatchScore = matchScore,
            PredictedPassRate = predictedPassRate,
            ReasonVi = reasonVi,
            IsTopPick = isTopPick
        };
    }

    private static string NormalizeJlptLevel(string? level)
    {
        if (string.IsNullOrWhiteSpace(level)) return "N5";
        var upper = level.Trim().ToUpperInvariant();
        return upper is "N5" or "N4" or "N3" ? upper : "N5";
    }

    private static int GetLevelRank(string? level)
    {
        return NormalizeJlptLevel(level) switch
        {
            "N3" => 3,
            "N4" => 2,
            _ => 1
        };
    }

    private static double GetLevelDifficulty(string? level)
    {
        return NormalizeJlptLevel(level) switch
        {
            "N3" => 1.2,
            "N4" => 0.2,
            _ => -0.8
        };
    }

    private static double ComputeIrtPassProbability(double thetaEff, string? level)
    {
        double b = GetLevelDifficulty(level);
        return 1.0 / (1.0 + Math.Exp(-(thetaEff - b)));
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
