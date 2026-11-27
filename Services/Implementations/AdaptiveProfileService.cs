using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Roleplay;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations;

public class AdaptiveProfileService : IAdaptiveProfileService
{
    private static readonly HashSet<string> ValidAxisKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "reflex",
        "style",
        "particle",
        "mora",
        "confidence",
        "autonomy"
    };

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private static readonly Regex JargonRegex = new(
        @"\b(IRT|ZPD|FSRS|EMA|Theta|P\s*\(\s*pass\s*\)|b-value|mora|E0\d|E10)\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex N5UnsafeFocusRegex = new(
        @"(kính ngữ|keigo|sonkeigo|kenjougo|tôn kính|khiêm nhường|câu ghép phức tạp|câu dài|N3|N2|N1|敬語|尊敬語|謙譲語)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private readonly AppDbContext _dbContext;
    private readonly IAiClient? _aiClient;
    private readonly ILogger<AdaptiveProfileService>? _logger;

    public AdaptiveProfileService(
        AppDbContext dbContext,
        IAiClient? aiClient = null,
        ILogger<AdaptiveProfileService>? logger = null)
    {
        _dbContext = dbContext;
        _aiClient = aiClient;
        _logger = logger;
    }

    public Task<AdaptiveContextDto> GetAdaptiveContextAsync(
        string userId,
        CancellationToken cancellationToken = default)
    {
        return GetAdaptiveContextAsync(userId, null, cancellationToken);
    }

    public Task<AdaptiveContextDto> GetAdaptiveContextAsync(
        string userId,
        AdaptiveContextQuery? query,
        CancellationToken cancellationToken = default)
    {
        return GetAdaptiveContextInternalAsync(userId, query, applyCoachingOverlay: true, cancellationToken);
    }

    private async Task<AdaptiveContextDto> GetAdaptiveContextInternalAsync(
        string userId,
        AdaptiveContextQuery? query,
        bool applyCoachingOverlay,
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

        int voiceTurns = await TelemetryEvaluatorService.CountVoiceStandardTurnsAsync(_dbContext, userId, cancellationToken);
        bool hasVoiceData = voiceTurns > 0;

        double theta = profile?.ThetaEstimate ?? 0.0;
        double proficiencyIndex = profile != null
            ? TelemetryEvaluatorService.ComputeEffectiveAlignedProficiency(profile, totalCompleted, hasVoiceData)
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

        var (recommendedScenarios, recommendedScenarioIds, recommendedShadowingIds, recommendedShadowings) =
            await RankRecommendationsAsync(
                userId,
                theta,
                consecutiveFails,
                recommendedDifficulty,
                weakKeywords,
                query,
                cancellationToken);

        double autonomy = profile != null
            ? Math.Clamp(Math.Round(100.0 - profile.HintDependencyRate, 1), 0.0, 100.0)
            : 100.0;
        double fluency = profile != null
            ? Math.Round((profile.SpeakingReflexIndex + Math.Clamp((profile.AverageMoraRate / 6.0) * 100.0, 18.0, 100.0)) / 2.0, 1)
            : 0.0;

        string? directive = BuildRuntimeDirective(recentTrend, consecutiveFails, hotWeaknesses, chronicWeaknesses);

        var dto = new AdaptiveContextDto
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
            RecommendedShadowingIds = recommendedShadowingIds,
            RecommendedShadowings = recommendedShadowings,
            RecommendedFlashcardKeywords = flashcardKeywords,
            FlashcardAdviceVi = BuildDeterministicFlashcardAdvice(flashcardKeywords, recommendedDifficulty),
            AiRuntimeDirective = directive
        };

        // Phủ lớp AI Coaching đã cache từ InferredTraitsJson (nếu còn hợp lệ theo lastEvaluatedSessionId) — giữ nguyên 100% ID tất định
        if (applyCoachingOverlay)
        {
            var cachedCoaching = TryParseAiCoachingFromTraits(profile?.InferredTraitsJson);
            if (cachedCoaching != null && !IsCoachingSnapshotStale(profile?.InferredTraitsJson, cachedCoaching))
            {
                ApplyCoachingOverlay(dto, cachedCoaching);
            }
        }

        return dto;
    }

    public async Task<AiCoachingSnapshotDto?> GenerateAndPersistCoachingSnapshotAsync(
        string userId,
        int sessionId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(userId) || sessionId <= 0)
        {
            return null;
        }

        var profile = await _dbContext.LearnerIntelligenceProfiles
            .FirstOrDefaultAsync(p => p.UserId == userId, cancellationToken);
        if (profile == null)
        {
            return null;
        }

        // Idempotent cache hit: cùng sessionId và đã sinh bằng AI thì không gọi lại LLM
        var existingCached = TryParseAiCoachingFromTraits(profile.InferredTraitsJson);
        if (existingCached != null
            && existingCached.SourceSessionId == sessionId
            && string.Equals(existingCached.Source, "ai", StringComparison.OrdinalIgnoreCase))
        {
            return existingCached;
        }

        var sessionInfo = await _dbContext.RoleplaySessions
            .AsNoTracking()
            .Where(s => s.Id == sessionId && s.UserId == userId)
            .Select(s => new
            {
                s.Id,
                ScenarioId = s.ScenarioLevelConfiguration != null ? s.ScenarioLevelConfiguration.ScenarioId : 0,
                ScenarioTitle = s.ScenarioLevelConfiguration != null && s.ScenarioLevelConfiguration.Scenario != null
                    ? s.ScenarioLevelConfiguration.Scenario.Title
                    : string.Empty,
                JlptLevel = s.ScenarioLevelConfiguration != null ? s.ScenarioLevelConfiguration.JLPTLevel : "N5"
            })
            .FirstOrDefaultAsync(cancellationToken);

        bool? sessionPassed = await _dbContext.RoleplayResults
            .AsNoTracking()
            .Where(r => r.RoleplaySessionId == sessionId && r.UserId == userId)
            .Select(r => (bool?)r.PassStatus)
            .FirstOrDefaultAsync(cancellationToken);

        var adaptiveQuery = sessionInfo != null
            ? new AdaptiveContextQuery
            {
                ExcludeScenarioId = sessionInfo.ScenarioId > 0 ? sessionInfo.ScenarioId : null,
                SessionPassed = sessionPassed,
                SessionLevel = sessionInfo.JlptLevel
            }
            : null;

        var context = await GetAdaptiveContextInternalAsync(userId, adaptiveQuery, applyCoachingOverlay: false, cancellationToken);
        var fallback = BuildDeterministicFallbackSnapshot(sessionId, context);

        if (_aiClient == null)
        {
            profile.InferredTraitsJson = MergeAiCoachingIntoTraitsJson(profile.InferredTraitsJson, fallback);
            profile.UpdatedAtUtc = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(cancellationToken);
            return fallback;
        }

        AiCoachingSnapshotDto finalSnapshot = fallback;

        try
        {
            var recentUserTurns = await _dbContext.RoleplayMessages
                .AsNoTracking()
                .Where(m => m.RoleplaySessionId == sessionId && m.Sender == "User")
                .OrderByDescending(m => m.Id)
                .Take(6)
                .Select(m => new { m.JapaneseText, m.LinguisticFeedbackJson })
                .ToListAsync(cancellationToken);
            recentUserTurns.Reverse();

            var scenarioIds = context.RecommendedScenarios.Select(s => s.ScenarioId).ToList();
            var scenarioTitles = await _dbContext.Scenarios
                .AsNoTracking()
                .Where(s => scenarioIds.Contains(s.Id))
                .ToDictionaryAsync(s => s.Id, s => s.Title, cancellationToken);

            var shadowingIds = context.RecommendedShadowings.Select(s => s.DialogueId).ToList();
            var shadowingTitles = await _dbContext.ShadowingDialogues
                .AsNoTracking()
                .Where(d => shadowingIds.Contains(d.Id))
                .ToDictionaryAsync(d => d.Id, d => d.Title, cancellationToken);

            int voiceTurnsForPrompt = await TelemetryEvaluatorService.CountVoiceStandardTurnsAsync(_dbContext, userId, cancellationToken);
            bool hasVoiceDataForPrompt = voiceTurnsForPrompt > 0;

            var promptPayload = new
            {
                session = new
                {
                    title = sessionInfo?.ScenarioTitle ?? "Hội thoại thực tế",
                    jlptLevel = sessionInfo?.JlptLevel ?? context.RecommendedDifficulty,
                    passed = sessionPassed
                },
                learnerProfile = new
                {
                    estimatedJlptLevel = context.EstimatedJlptLevel,
                    recommendedDifficulty = context.RecommendedDifficulty,
                    proficiencyIndex = Math.Round(context.ProficiencyIndex, 1),
                    recentTrend = context.RecentTrend,
                    consecutiveFailCount = context.ConsecutiveFailCount,
                    hasVoiceData = hasVoiceDataForPrompt,
                    scores = new
                    {
                        reflex = Math.Round(profile.SpeakingReflexIndex, 1),
                        style = Math.Round(profile.KeigoCommandScore, 1),
                        particle = Math.Round(profile.ParticleAccuracyRate, 1),
                        mora = hasVoiceDataForPrompt ? Math.Round(profile.AverageMoraRate, 1) : (double?)null,
                        confidence = Math.Round(profile.CommunicativeConfidenceScore, 1),
                        autonomy = Math.Clamp(Math.Round(100.0 - profile.HintDependencyRate, 1), 0, 100)
                    },
                    hotWeaknesses = context.HotWeaknesses,
                    chronicWeaknesses = context.ChronicWeaknesses,
                    flashcardKeywords = context.RecommendedFlashcardKeywords
                },
                recentTurns = recentUserTurns.Select(t => new
                {
                    utterance = t.JapaneseText,
                    feedback = SummarizeFeedbackJson(t.LinguisticFeedbackJson)
                }).ToList(),
                candidateScenarios = context.RecommendedScenarios.Select(s => new
                {
                    scenarioId = s.ScenarioId,
                    title = scenarioTitles.GetValueOrDefault(s.ScenarioId, $"Kịch bản #{s.ScenarioId}"),
                    tier = s.Tier,
                    level = s.RecommendedLevel
                }).ToList(),
                candidateShadowings = context.RecommendedShadowings.Select(d => new
                {
                    dialogueId = d.DialogueId,
                    title = shadowingTitles.GetValueOrDefault(d.DialogueId, $"Bài Shadowing #{d.DialogueId}"),
                    matchScore = d.MatchScore
                }).ToList()
            };

            const string systemInstruction = """
                You are JCAP's Senior Japanese Speaking Coach. Return strictly valid JSON (no markdown fences, no commentary).
                RULES:
                1. Write all explanations in natural, concise, encouraging Vietnamese grounded strictly in the learner's turns and scores.
                2. NEVER mention internal algorithm or technical terms: IRT, ZPD, FSRS, EMA, Theta, P(pass), b-value, mora, or error codes like E01..E10 (say "nhịp nói" instead of "mora").
                3. "axisInsights" keys MUST only use exact keys: "reflex", "style", "particle", "mora", "confidence", "autonomy". Each needs "diagnosticVi" (<= 180 chars) and "drillMethodVi" (<= 140 chars). Note: "confidence" means communicative confidence/fluency (Độ tự tin giao tiếp), NOT microphone acoustics. If "hasVoiceData" is false, NEVER claim the learner spoke slowly or had pronunciation issues — for "mora", note that no voice recording has been recorded yet.
                4. "scenarioReasons" keys MUST strictly be stringified scenarioIds from candidateScenarios ONLY (do NOT invent new IDs). Each <= 130 chars.
                5. "shadowingReasons" keys MUST strictly be stringified dialogueIds from candidateShadowings ONLY (do NOT invent new IDs). Each <= 130 chars.
                6. "nextSessionFocus" MUST be a single concise coaching focus <= 140 chars for the next conversation (never ask AI to break role or exceed JLPT level).
                SCHEMA:
                {
                  "executiveDiagnosis": "string (1-2 sentences in Vietnamese, <= 240 chars)",
                  "axisInsights": {
                    "reflex": { "diagnosticVi": "...", "drillMethodVi": "..." },
                    "style": { "diagnosticVi": "...", "drillMethodVi": "..." },
                    "particle": { "diagnosticVi": "...", "drillMethodVi": "..." },
                    "mora": { "diagnosticVi": "...", "drillMethodVi": "..." },
                    "confidence": { "diagnosticVi": "...", "drillMethodVi": "..." },
                    "autonomy": { "diagnosticVi": "...", "drillMethodVi": "..." }
                  },
                  "scenarioReasons": { "<scenarioId>": "..." },
                  "shadowingReasons": { "<dialogueId>": "..." },
                  "flashcardAdviceVi": "string (<= 160 chars)",
                  "nextSessionFocus": "string (<= 140 chars)"
                }
                """;

            var userPrompt = JsonSerializer.Serialize(promptPayload, JsonOptions);
            var aiRequest = AiRequest.CreateJson(systemInstruction, userPrompt, temperature: 0.3);

            // Chừa quỹ thời gian lưu DB nếu caller đặt timeout ngắn (ví dụ 4500ms -> gọi AI tối đa 3800ms)
            using var aiTimeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            aiTimeoutCts.CancelAfter(TimeSpan.FromMilliseconds(3800));

            var aiResponse = await _aiClient.GenerateAsync(aiRequest, aiTimeoutCts.Token);
            if (aiResponse.IsSuccess && !string.IsNullOrWhiteSpace(aiResponse.Content))
            {
                var parsed = ParseAndSanitizeAiSnapshot(aiResponse.Content, sessionId, context, fallback);
                if (parsed != null)
                {
                    finalSnapshot = parsed;
                }
            }
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "AI adaptive coaching synthesis fallback to deterministic for session {SessionId}", sessionId);
        }

        try
        {
            profile.InferredTraitsJson = MergeAiCoachingIntoTraitsJson(profile.InferredTraitsJson, finalSnapshot);
            profile.UpdatedAtUtc = DateTime.UtcNow;
            // Dùng CancellationToken.None nếu AI call gần chạm deadline để không làm rớt snapshot
            var saveToken = cancellationToken.IsCancellationRequested ? CancellationToken.None : cancellationToken;
            await _dbContext.SaveChangesAsync(saveToken);
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "Không thể lưu AI coaching snapshot vào InferredTraitsJson cho session {SessionId}", sessionId);
        }

        return finalSnapshot;
    }

    public static string? ExtractNextSessionFocus(string? inferredTraitsJson, string? targetJlptLevel = null)
    {
        var snapshot = TryParseAiCoachingFromTraits(inferredTraitsJson);
        if (snapshot == null || string.IsNullOrWhiteSpace(snapshot.NextSessionFocus))
        {
            return null;
        }

        if (IsCoachingSnapshotStale(inferredTraitsJson, snapshot))
        {
            return null;
        }

        return SanitizeNextSessionFocusForJlpt(snapshot.NextSessionFocus, targetJlptLevel);
    }

    public static string? SanitizeNextSessionFocusForJlpt(string? rawFocus, string? targetJlptLevel)
    {
        var cleaned = ScrubTechnicalJargon(rawFocus);
        if (string.IsNullOrWhiteSpace(cleaned))
        {
            return null;
        }

        var level = (targetJlptLevel ?? string.Empty).Trim().ToUpperInvariant();
        if (level == "N5" && N5UnsafeFocusRegex.IsMatch(cleaned))
        {
            return "Giữ câu lịch sự ngắn gọn (です・ます) và tạo cơ hội thực hành trợ từ cơ bản phù hợp mức N5.";
        }

        return cleaned.Length > 140 ? cleaned[..140].TrimEnd() : cleaned;
    }

    internal static bool IsCoachingSnapshotStale(string? inferredTraitsJson, AiCoachingSnapshotDto snapshot)
    {
        if (string.IsNullOrWhiteSpace(inferredTraitsJson) || snapshot.SourceSessionId <= 0)
        {
            return false;
        }

        try
        {
            using var doc = JsonDocument.Parse(inferredTraitsJson);
            if (doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty("lastEvaluatedSessionId", out var sidProp)
                && sidProp.ValueKind == JsonValueKind.Number
                && sidProp.TryGetInt32(out int lastEvalSessionId)
                && lastEvalSessionId > 0)
            {
                return snapshot.SourceSessionId != lastEvalSessionId;
            }
        }
        catch { }

        return false;
    }

    public static AiCoachingSnapshotDto? TryParseAiCoachingFromTraits(string? inferredTraitsJson)
    {
        if (string.IsNullOrWhiteSpace(inferredTraitsJson))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(inferredTraitsJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            if (!doc.RootElement.TryGetProperty("aiCoaching", out var aiNode)
                || aiNode.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var parsed = JsonSerializer.Deserialize<AiCoachingSnapshotDto>(aiNode.GetRawText(), JsonOptions);
            if (parsed == null)
            {
                return null;
            }

            parsed.ExecutiveDiagnosis = ScrubTechnicalJargon(parsed.ExecutiveDiagnosis);
            parsed.FlashcardAdviceVi = string.IsNullOrWhiteSpace(parsed.FlashcardAdviceVi)
                ? null
                : ScrubTechnicalJargon(parsed.FlashcardAdviceVi);
            parsed.NextSessionFocus = string.IsNullOrWhiteSpace(parsed.NextSessionFocus)
                ? null
                : ClampLength(ScrubTechnicalJargon(parsed.NextSessionFocus), 140);

            var cleanAxes = new Dictionary<string, AiAxisInsightDto>(StringComparer.OrdinalIgnoreCase);
            if (parsed.AxisInsights != null)
            {
                foreach (var kv in parsed.AxisInsights)
                {
                    if (!ValidAxisKeys.Contains(kv.Key) || kv.Value == null) continue;
                    cleanAxes[kv.Key.ToLowerInvariant()] = new AiAxisInsightDto
                    {
                        DiagnosticVi = ScrubTechnicalJargon(kv.Value.DiagnosticVi),
                        DrillMethodVi = ScrubTechnicalJargon(kv.Value.DrillMethodVi)
                    };
                }
            }
            parsed.AxisInsights = cleanAxes;

            var cleanScenarioReasons = new Dictionary<int, string>();
            if (parsed.ScenarioReasons != null)
            {
                foreach (var kv in parsed.ScenarioReasons)
                {
                    var scrubbed = ScrubTechnicalJargon(kv.Value);
                    if (!string.IsNullOrWhiteSpace(scrubbed))
                    {
                        cleanScenarioReasons[kv.Key] = scrubbed;
                    }
                }
            }
            parsed.ScenarioReasons = cleanScenarioReasons;

            var cleanShadowingReasons = new Dictionary<int, string>();
            if (parsed.ShadowingReasons != null)
            {
                foreach (var kv in parsed.ShadowingReasons)
                {
                    var scrubbed = ScrubTechnicalJargon(kv.Value);
                    if (!string.IsNullOrWhiteSpace(scrubbed))
                    {
                        cleanShadowingReasons[kv.Key] = scrubbed;
                    }
                }
            }
            parsed.ShadowingReasons = cleanShadowingReasons;

            return parsed;
        }
        catch
        {
            return null;
        }
    }

    internal static string MergeAiCoachingIntoTraitsJson(string? existingTraitsJson, AiCoachingSnapshotDto snapshot)
    {
        JsonObject rootObj;
        try
        {
            rootObj = !string.IsNullOrWhiteSpace(existingTraitsJson)
                ? (JsonNode.Parse(existingTraitsJson)?.AsObject() ?? new JsonObject())
                : new JsonObject();
        }
        catch
        {
            rootObj = new JsonObject();
        }

        rootObj["aiCoaching"] = JsonSerializer.SerializeToNode(snapshot, JsonOptions);
        return rootObj.ToJsonString();
    }

    internal static HashSet<string> ExtractSemanticDomainTags(IEnumerable<string> corpusTexts)
    {
        var tags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var joined = string.Join(" ", corpusTexts.Where(t => !string.IsNullOrWhiteSpace(t)));
        if (string.IsNullOrWhiteSpace(joined))
        {
            return tags;
        }

        var lower = joined.ToLowerInvariant();
        if (ContainsAny(lower, "trợ từ", "particle", "は", "が", "に", "で", "へ", "を", "e01", "hỏi đường", "chỉ đường", "ga ", "shinjuku", "tàu", "địa điểm", "phương tiện", "di chuyển", "vé", "cổng"))
        {
            tags.Add("Particles_Location");
        }
        if (ContainsAny(lower, "văn phong", "lịch sự", "です", "ます", "thể ngắn", "khách sạn", "kyoto", "check-in", "dịch vụ", "lễ tân", "e03"))
        {
            tags.Add("Polite_Service");
        }
        if (ContainsAny(lower, "kính ngữ", "keigo", "baito", "phỏng vấn", "công sở", "văn phòng", "xin việc", "thu ngân", "khách hàng", "khiêm nhường", "e08"))
        {
            tags.Add("Business_Keigo");
        }
        if (ContainsAny(lower, "gọi món", "ramen", "nhà hàng", "ẩm thực", "quán ăn", "đồ ăn", "bento", "cafe", "nước dùng", "sợi mì", "món"))
        {
            tags.Add("Fast_Order");
        }
        if (ContainsAny(lower, "mua sắm", "tiện lợi", "combini", "konbini", "thanh toán", "giá", "tiền", "thẻ", "suica", "pasmo", "hâm nóng", "túi", "thìa", "đũa", "yen", "円"))
        {
            tags.Add("Shopping_Price");
        }
        if (ContainsAny(lower, "bệnh viện", "bác sĩ", "khám", "thuốc", "đau", "sức khỏe", "triệu chứng"))
        {
            tags.Add("Medical_Daily");
        }
        if (ContainsAny(lower, "phát âm", "mora", "nhịp", "trường âm", "âm ngắt", "shadowing", "e05", "e09", "e10"))
        {
            tags.Add("Pronunciation_Mora");
        }

        return tags;
    }

    private static bool ContainsAny(string lowerText, params string[] terms)
    {
        foreach (var term in terms)
        {
            if (lowerText.Contains(term, StringComparison.Ordinal))
            {
                return true;
            }
        }
        return false;
    }

    private static void ApplyCoachingOverlay(AdaptiveContextDto dto, AiCoachingSnapshotDto snapshot)
    {
        dto.AiCoaching = snapshot;

        if (!string.IsNullOrWhiteSpace(snapshot.FlashcardAdviceVi))
        {
            dto.FlashcardAdviceVi = ScrubTechnicalJargon(snapshot.FlashcardAdviceVi);
        }

        foreach (var rec in dto.RecommendedScenarios)
        {
            if (snapshot.ScenarioReasons.TryGetValue(rec.ScenarioId, out var aiReason)
                && !string.IsNullOrWhiteSpace(aiReason))
            {
                rec.ReasonVi = ScrubTechnicalJargon(aiReason);
            }
        }

        foreach (var shad in dto.RecommendedShadowings)
        {
            if (snapshot.ShadowingReasons.TryGetValue(shad.DialogueId, out var aiReason)
                && !string.IsNullOrWhiteSpace(aiReason))
            {
                shad.ReasonVi = ScrubTechnicalJargon(aiReason);
            }
        }
    }

    private static AiCoachingSnapshotDto BuildDeterministicFallbackSnapshot(int sessionId, AdaptiveContextDto context)
    {
        string weakFocus = context.HotWeaknesses.FirstOrDefault()
            ?? context.ChronicWeaknesses.FirstOrDefault()
            ?? "giữ mạch hội thoại tự nhiên";

        string executiveDiagnosis = context.ConsecutiveFailCount >= 2
            ? $"Ở mức {context.EstimatedJlptLevel}, bạn nên ưu tiên câu ngắn, chắc trợ từ và củng cố phần {weakFocus} trước khi tăng tốc."
            : string.Equals(context.RecentTrend, "Improving", StringComparison.OrdinalIgnoreCase)
                ? $"Phong độ ở mức {context.EstimatedJlptLevel} đang tiến bộ rõ rệt (trung bình {Math.Round(context.ProficiencyIndex)}đ). Hãy tiếp tục rèn thêm phần {weakFocus}."
                : $"Năng lực thực chiến hiện ở mức {context.EstimatedJlptLevel}. Trọng tâm cải thiện hiệu quả nhất lúc này là {weakFocus}.";

        var scenarioReasons = context.RecommendedScenarios
            .ToDictionary(s => s.ScenarioId, s => s.ReasonVi);

        var shadowingReasons = context.RecommendedShadowings
            .ToDictionary(d => d.DialogueId, d => d.ReasonVi);

        string? flashcardAdvice = context.FlashcardAdviceVi
            ?? BuildDeterministicFlashcardAdvice(context.RecommendedFlashcardKeywords, context.RecommendedDifficulty);

        string nextFocus = context.HotWeaknesses.Count > 0
            ? $"Chú ý dùng đúng {context.HotWeaknesses[0]} với câu ngắn rõ ràng."
            : $"Giữ nhịp phản xạ tự nhiên và dùng từ khóa chuẩn ở mức {context.RecommendedDifficulty}.";

        return new AiCoachingSnapshotDto
        {
            SourceSessionId = sessionId,
            GeneratedAtUtc = DateTime.UtcNow,
            Source = "deterministic",
            ExecutiveDiagnosis = ScrubTechnicalJargon(executiveDiagnosis),
            AxisInsights = new Dictionary<string, AiAxisInsightDto>(StringComparer.OrdinalIgnoreCase),
            ScenarioReasons = scenarioReasons,
            ShadowingReasons = shadowingReasons,
            FlashcardAdviceVi = string.IsNullOrWhiteSpace(flashcardAdvice) ? null : ScrubTechnicalJargon(flashcardAdvice),
            NextSessionFocus = ClampLength(ScrubTechnicalJargon(nextFocus), 140)
        };
    }

    private static AiCoachingSnapshotDto? ParseAndSanitizeAiSnapshot(
        string rawJson,
        int sessionId,
        AdaptiveContextDto context,
        AiCoachingSnapshotDto fallback)
    {
        var cleanedJson = StripCodeFences(rawJson);
        if (string.IsNullOrWhiteSpace(cleanedJson))
        {
            return null;
        }

        using var doc = JsonDocument.Parse(cleanedJson);
        if (doc.RootElement.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var root = doc.RootElement;
        var allowedScenarioIds = context.RecommendedScenarios.Select(s => s.ScenarioId).ToHashSet();
        var allowedShadowingIds = context.RecommendedShadowings.Select(s => s.DialogueId).ToHashSet();

        string execDiag = TryReadString(root, "executiveDiagnosis");
        execDiag = !string.IsNullOrWhiteSpace(execDiag)
            ? ClampLength(ScrubTechnicalJargon(execDiag), 260)
            : fallback.ExecutiveDiagnosis;

        var axisInsights = new Dictionary<string, AiAxisInsightDto>(StringComparer.OrdinalIgnoreCase);
        if (root.TryGetProperty("axisInsights", out var axesNode) && axesNode.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in axesNode.EnumerateObject())
            {
                if (!ValidAxisKeys.Contains(prop.Name) || prop.Value.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                string diag = ScrubTechnicalJargon(TryReadString(prop.Value, "diagnosticVi"));
                string drill = ScrubTechnicalJargon(TryReadString(prop.Value, "drillMethodVi"));
                if (string.IsNullOrWhiteSpace(diag) && string.IsNullOrWhiteSpace(drill))
                {
                    continue;
                }

                axisInsights[prop.Name.ToLowerInvariant()] = new AiAxisInsightDto
                {
                    DiagnosticVi = ClampLength(diag, 220),
                    DrillMethodVi = ClampLength(drill, 180)
                };
            }
        }

        var scenarioReasons = new Dictionary<int, string>(fallback.ScenarioReasons);
        if (root.TryGetProperty("scenarioReasons", out var scnNode) && scnNode.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in scnNode.EnumerateObject())
            {
                if (!int.TryParse(prop.Name, out int id) || !allowedScenarioIds.Contains(id))
                {
                    continue;
                }

                var reason = prop.Value.ValueKind == JsonValueKind.String ? prop.Value.GetString() : null;
                var scrubbed = ScrubTechnicalJargon(reason);
                if (!string.IsNullOrWhiteSpace(scrubbed))
                {
                    scenarioReasons[id] = ClampLength(scrubbed, 160);
                }
            }
        }

        var shadowingReasons = new Dictionary<int, string>(fallback.ShadowingReasons);
        if (root.TryGetProperty("shadowingReasons", out var shadNode) && shadNode.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in shadNode.EnumerateObject())
            {
                if (!int.TryParse(prop.Name, out int id) || !allowedShadowingIds.Contains(id))
                {
                    continue;
                }

                var reason = prop.Value.ValueKind == JsonValueKind.String ? prop.Value.GetString() : null;
                var scrubbed = ScrubTechnicalJargon(reason);
                if (!string.IsNullOrWhiteSpace(scrubbed))
                {
                    shadowingReasons[id] = ClampLength(scrubbed, 160);
                }
            }
        }

        string rawFlashcardAdvice = TryReadString(root, "flashcardAdviceVi");
        string flashcardAdvice = !string.IsNullOrWhiteSpace(rawFlashcardAdvice)
            ? ClampLength(ScrubTechnicalJargon(rawFlashcardAdvice), 200)
            : (fallback.FlashcardAdviceVi ?? string.Empty);

        string rawNextFocus = TryReadString(root, "nextSessionFocus");
        string nextFocus = !string.IsNullOrWhiteSpace(rawNextFocus)
            ? ClampLength(ScrubTechnicalJargon(rawNextFocus), 140)
            : (fallback.NextSessionFocus ?? string.Empty);

        bool hasMeaningfulAi = !string.IsNullOrWhiteSpace(TryReadString(root, "executiveDiagnosis"))
            || axisInsights.Count > 0;

        return new AiCoachingSnapshotDto
        {
            SourceSessionId = sessionId,
            GeneratedAtUtc = DateTime.UtcNow,
            Source = hasMeaningfulAi ? "ai" : "deterministic",
            ExecutiveDiagnosis = execDiag,
            AxisInsights = axisInsights,
            ScenarioReasons = scenarioReasons,
            ShadowingReasons = shadowingReasons,
            FlashcardAdviceVi = string.IsNullOrWhiteSpace(flashcardAdvice) ? null : flashcardAdvice,
            NextSessionFocus = string.IsNullOrWhiteSpace(nextFocus) ? null : nextFocus
        };
    }

    private static string StripCodeFences(string raw)
    {
        var trimmed = raw.Trim();
        if (trimmed.StartsWith("```", StringComparison.Ordinal))
        {
            var firstNewLine = trimmed.IndexOf('\n');
            if (firstNewLine >= 0)
            {
                trimmed = trimmed[(firstNewLine + 1)..];
            }
            if (trimmed.EndsWith("```", StringComparison.Ordinal))
            {
                trimmed = trimmed[..^3];
            }
        }
        return trimmed.Trim();
    }

    private static string TryReadString(JsonElement obj, string propertyName)
    {
        if (obj.TryGetProperty(propertyName, out var prop) && prop.ValueKind == JsonValueKind.String)
        {
            return prop.GetString()?.Trim() ?? string.Empty;
        }
        return string.Empty;
    }

    internal static string ScrubTechnicalJargon(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var scrubbed = JargonRegex.Replace(text, "");
        scrubbed = Regex.Replace(scrubbed, @"\(\s*[,;/\-]*\s*\)", "");
        scrubbed = Regex.Replace(scrubbed, @"\s{2,}", " ");
        scrubbed = Regex.Replace(scrubbed, @"\s+([.,!?;:])", "$1");
        return scrubbed.Trim();
    }

    private static string ClampLength(string text, int maxLen)
    {
        if (string.IsNullOrEmpty(text) || text.Length <= maxLen) return text;
        return $"{text[..(maxLen - 1)].TrimEnd()}…";
    }

    private static string SummarizeFeedbackJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return string.Empty;
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var parts = new List<string>();
            if (root.TryGetProperty("grammarFeedback", out var gf) && gf.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(gf.GetString()))
            {
                parts.Add(gf.GetString()!.Trim());
            }
            if (root.TryGetProperty("naturalAlternative", out var na) && na.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(na.GetString()))
            {
                parts.Add($"Mẫu tự nhiên: {na.GetString()!.Trim()}");
            }
            if (parts.Count == 0 && root.TryGetProperty("explanation", out var exp) && exp.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(exp.GetString()))
            {
                parts.Add(exp.GetString()!.Trim());
            }
            return ClampLength(string.Join(" | ", parts), 140);
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string? BuildDeterministicFlashcardAdvice(List<string> keywords, string difficulty)
    {
        if (keywords.Count == 0)
        {
            return null;
        }

        var sample = string.Join(", ", keywords.Take(3));
        return $"Ưu tiên ôn bộ từ & mẫu câu đang cần củng cố ({sample}) để bật lời nhanh hơn trong tình huống mức {difficulty}.";
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
        public int SemanticDomainOverlapCount { get; set; }
        public bool IsFailed { get; set; }
        public bool IsUnattempted { get; set; }
        public int AttemptCount { get; set; }
        public bool SupportsConsolidateLevel { get; set; }
        public bool SupportsStretchLevel { get; set; }
    }

    private async Task<(
        List<AdaptiveScenarioRecommendationDto> Scenarios,
        List<int> ScenarioIds,
        List<int> ShadowingIds,
        List<AdaptiveShadowingRecommendationDto> Shadowings)> RankRecommendationsAsync(
        string userId,
        double theta,
        int consecutiveFails,
        string recommendedDifficulty,
        List<string> weakKeywords,
        AdaptiveContextQuery? query,
        CancellationToken cancellationToken)
    {
        bool isTactical = query != null && (
            query.ExcludeScenarioId.HasValue
            || query.SessionPassed.HasValue
            || !string.IsNullOrWhiteSpace(query.SessionLevel));

        var weakDomainTags = ExtractSemanticDomainTags(weakKeywords);

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

        if (query?.ExcludeScenarioId is int excludedId)
        {
            var withoutCurrent = scenarioRows.Where(s => s.Id != excludedId).ToList();
            if (withoutCurrent.Count > 0)
            {
                scenarioRows = withoutCurrent;
            }
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
        string effectiveTargetDifficulty = recommendedDifficulty;
        if (isTactical)
        {
            if (query!.SessionPassed == false)
            {
                thetaEff -= 0.35;
                if (!string.IsNullOrWhiteSpace(query.SessionLevel))
                {
                    effectiveTargetDifficulty = NormalizeJlptLevel(query.SessionLevel) switch
                    {
                        "N3" => "N4",
                        _ => "N5"
                    };
                }
            }
            else if (query.SessionPassed == true)
            {
                thetaEff += 0.25;
            }
        }

        int recRank = GetLevelRank(effectiveTargetDifficulty);
        int consolidateMaxRank = recRank >= 3 ? 2 : 1;
        int stretchMaxRank = Math.Min(3, recRank + 1);
        if (isTactical && query?.SessionPassed == false && !string.IsNullOrWhiteSpace(query.SessionLevel))
        {
            int failedRank = GetLevelRank(NormalizeJlptLevel(query.SessionLevel));
            stretchMaxRank = Math.Min(stretchMaxRank, failedRank);
        }

        // Cold-start & N5-session guardrail: never jump straight to N3 when learner has < 3 completed sessions
        // or just finished an N5 session (prevents e.g. 1st N5 pass -> Stretch N3 with 32% pass rate).
        bool isColdStartLearner = historyRows.Count < 3;
        bool isPostN5Session = isTactical
            && !string.IsNullOrWhiteSpace(query?.SessionLevel)
            && string.Equals(NormalizeJlptLevel(query!.SessionLevel), "N5", StringComparison.OrdinalIgnoreCase);
        if (isColdStartLearner || isPostN5Session)
        {
            stretchMaxRank = Math.Min(stretchMaxRank, 2);
        }
        DateTime nowUtc = DateTime.UtcNow;

        var scoredCandidates = scenarioRows.Select(s =>
        {
            var levelList = s.Levels.Count > 0
                ? s.Levels.Select(l => NormalizeJlptLevel(l.JLPTLevel)).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
                : new List<string> { effectiveTargetDifficulty };

            var eligibleCoreLevels = levelList.Where(l => GetLevelRank(l) <= stretchMaxRank).ToList();
            if (eligibleCoreLevels.Count == 0)
            {
                eligibleCoreLevels = levelList;
            }

            var bestLevelEval = eligibleCoreLevels
                .Select(lv =>
                {
                    double p = ComputeIrtPassProbability(thetaEff, lv);
                    bool isRec = string.Equals(lv, effectiveTargetDifficulty, StringComparison.OrdinalIgnoreCase);
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

            var candidateDomains = ExtractSemanticDomainTags(searchCorpus);
            int semanticOverlapCount = weakDomainTags.Count > 0
                ? weakDomainTags.Count(tag => candidateDomains.Contains(tag))
                : 0;

            double gapScore = weakKeywords.Count == 0
                ? 60.0
                : Math.Min(100.0, 42.0 + matchedWeakTerms.Count * 22.0 + semanticOverlapCount * 14.0);

            bool hasHistory = historyByScenario.TryGetValue(s.Id, out var hist);
            bool isFailed = hasHistory && !hist.LastPassed;
            bool isUnattempted = !hasHistory;
            double freshnessScore;
            double recentPassCooldownPenalty = 0.0;
            if (isUnattempted)
            {
                freshnessScore = (isTactical && query?.SessionPassed == true) ? 94.0 : 86.0;
            }
            else if (isFailed)
            {
                freshnessScore = 95.0;
            }
            else
            {
                double daysSince = (nowUtc - hist.LastCompletedAt).TotalDays;
                freshnessScore = daysSince > 7.0 ? 65.0 : daysSince >= 3.0 ? 40.0 : 10.0;
                if (daysSince < 3.0)
                {
                    recentPassCooldownPenalty = 18.0;
                }
            }

            double diffBonus = levelList.Any(l => string.Equals(l, effectiveTargetDifficulty, StringComparison.OrdinalIgnoreCase))
                ? 100.0
                : 55.0;

            double rawScore = Math.Max(
                10.0,
                0.35 * zpdScore + 0.35 * gapScore + 0.20 * freshnessScore + 0.10 * diffBonus - recentPassCooldownPenalty);

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
                SemanticDomainOverlapCount = semanticOverlapCount,
                IsFailed = isFailed,
                IsUnattempted = isUnattempted,
                AttemptCount = hasHistory ? hist.AttemptCount : 0,
                SupportsConsolidateLevel = levelList.Any(l => GetLevelRank(l) <= consolidateMaxRank),
                SupportsStretchLevel = levelList.Any(l => GetLevelRank(l) > recRank && GetLevelRank(l) <= stretchMaxRank)
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
            var coreDto = BuildRecommendationDto(core, "Core", core.BestLevel, thetaEff, coreMatch, isTopPick: true, query);

            ScoredScenarioCandidate? consolidate = scoredCandidates
                .Where(c => !usedIds.Contains(c.Id))
                .OrderByDescending(c => c.SupportsConsolidateLevel)
                .ThenByDescending(c => c.IsFailed && c.SupportsConsolidateLevel)
                .ThenByDescending(c => c.PublishedLevels.Any(l => GetLevelRank(l) <= recRank))
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
                consolidateDto = BuildRecommendationDto(consolidate, "Consolidate", consLevel, thetaEff, consMatch, isTopPick: false, query);
            }

            ScoredScenarioCandidate? stretch = scoredCandidates
                .Where(c => !usedIds.Contains(c.Id))
                .OrderByDescending(c => c.SupportsStretchLevel)
                .ThenByDescending(c => c.PublishedLevels.Any(l => GetLevelRank(l) <= stretchMaxRank))
                .ThenByDescending(c => c.IsUnattempted)
                .ThenByDescending(c => c.RawScore)
                .ThenBy(c => c.Id)
                .FirstOrDefault();

            AdaptiveScenarioRecommendationDto? stretchDto = null;
            if (stretch != null)
            {
                usedIds.Add(stretch.Id);
                string stretchLevel = stretch.PublishedLevels
                    .Where(l => GetLevelRank(l) > recRank && GetLevelRank(l) <= stretchMaxRank)
                    .OrderBy(GetLevelRank)
                    .FirstOrDefault()
                    ?? stretch.PublishedLevels
                        .Where(l => GetLevelRank(l) <= stretchMaxRank)
                        .OrderByDescending(GetLevelRank)
                        .FirstOrDefault()
                    ?? stretch.BestLevel;
                int stretchMatch = (int)Math.Clamp(Math.Round(stretch.RawScore), 60, Math.Max(60, coreMatch - 5));
                stretchDto = BuildRecommendationDto(stretch, "Stretch", stretchLevel, thetaEff, stretchMatch, isTopPick: false, query);
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

        var rankedShadowingItems = shadowingRows
            .Select(d =>
            {
                string level = NormalizeJlptLevel(d.JLPTLevel);
                double pPass = ComputeIrtPassProbability(thetaEff, level);
                double zpdScore = 100.0 * Math.Max(0.0, 1.0 - Math.Abs(pPass - 0.72) / 0.50);
                int literalMatched = weakKeywords.Count(kw =>
                    (d.Title?.Contains(kw, StringComparison.OrdinalIgnoreCase) ?? false)
                    || (d.Description?.Contains(kw, StringComparison.OrdinalIgnoreCase) ?? false));
                var shadDomains = ExtractSemanticDomainTags(new[] { d.Title ?? string.Empty, d.Description ?? string.Empty });
                int domainMatched = weakDomainTags.Count > 0
                    ? weakDomainTags.Count(tag => shadDomains.Contains(tag))
                    : 0;
                double gapScore = weakKeywords.Count == 0
                    ? 55.0
                    : Math.Min(100.0, 40.0 + literalMatched * 22.0 + domainMatched * 16.0);
                double diffBonus = string.Equals(level, effectiveTargetDifficulty, StringComparison.OrdinalIgnoreCase) ? 100.0 : 50.0;
                double totalScore = 0.45 * zpdScore + 0.35 * gapScore + 0.20 * diffBonus;
                int matchScore = (int)Math.Clamp(Math.Round(totalScore), 64, 97);
                string fallbackReason = domainMatched > 0 || literalMatched > 0
                    ? $"Luyện nhịp nói chuẩn bản xứ bám sát điểm cần củng cố ở mức {level}."
                    : $"Bài đọc mức {level} phù hợp nhịp độ tiếp thu hiện tại để rèn ngữ điệu tự nhiên.";
                return new
                {
                    d.Id,
                    Score = totalScore,
                    Dto = new AdaptiveShadowingRecommendationDto
                    {
                        DialogueId = d.Id,
                        MatchScore = matchScore,
                        ReasonVi = fallbackReason
                    }
                };
            })
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Id)
            .Take(3)
            .ToList();

        var rankedShadowingIds = rankedShadowingItems.Select(x => x.Id).ToList();
        var rankedShadowingDtos = rankedShadowingItems.Select(x => x.Dto).ToList();

        return (recommendations, idOrder, rankedShadowingIds, rankedShadowingDtos);
    }

    private static AdaptiveScenarioRecommendationDto BuildRecommendationDto(
        ScoredScenarioCandidate candidate,
        string tier,
        string chosenLevel,
        double thetaEff,
        int matchScore,
        bool isTopPick,
        AdaptiveContextQuery? query)
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
        else if (candidate.SemanticDomainOverlapCount > 0)
        {
            reasonVi = $"Tình huống mức {chosenLevel} giúp luyện đúng nhóm mẫu câu bạn đang cần củng cố.";
        }
        else if (candidate.IsFailed)
        {
            reasonVi = $"Luyện lại tình huống chưa đạt gần đây để củng cố mức {chosenLevel}.";
        }
        else if (query?.SessionPassed == true)
        {
            string sessionLv = NormalizeJlptLevel(query.SessionLevel);
            reasonVi = tier switch
            {
                "Core" => $"Tiếp nối đà đạt mức {sessionLv} với tình huống mới phù hợp ở mức {chosenLevel}.",
                "Stretch" => $"Đang có phong độ tốt — thử thách lên mức {chosenLevel} để bứt phá.",
                _ => $"Củng cố nền tảng giao tiếp chắc chắn ở mức {chosenLevel}."
            };
        }
        else if (query?.SessionPassed == false)
        {
            reasonVi = tier switch
            {
                "Core" or "Consolidate" => $"Chuyển sang tình huống vừa sức hơn ở mức {chosenLevel} để lấy lại nhịp.",
                _ => $"Thử thách tình huống mới ở mức {chosenLevel} khi bạn sẵn sàng."
            };
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
        raw = Regex.Replace(raw, @"^Quy tắc giao tiếp\s*[:\-]?\s*", "", RegexOptions.IgnoreCase).Trim();
        raw = Regex.Replace(raw, @"\(\s*E\d{2}[A-Z0-9_]*\s*\)", "", RegexOptions.IgnoreCase).Trim();
        var parenIdx = raw.IndexOf('(');
        if (parenIdx > 0) raw = raw[..parenIdx].Trim();
        if (string.IsNullOrWhiteSpace(raw)
            || string.Equals(raw, "Quy tắc giao tiếp", StringComparison.OrdinalIgnoreCase)
            || Regex.IsMatch(raw, @"^\(?E\d{2}[A-Z0-9_]*\)?$", RegexOptions.IgnoreCase))
        {
            return string.Empty;
        }
        return raw;
    }

    private static string ExtractKeyword(string? skillName)
    {
        return FormatDisplayName(skillName, null);
    }
}
