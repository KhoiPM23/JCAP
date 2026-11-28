using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Roleplay;
using JCAP.DTOs.Scenario;
using JCAP.Models;
using JCAP.Services.Interfaces;
using JCAP.Services.Subscriptions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace JCAP.Services.Implementations;

public partial class RoleplaySessionService : IRoleplaySessionService
{
    public async Task<ApiResponse<RoleplayHintDto>> GetHintAsync(
        string userId,
        int sessionId,
        CancellationToken cancellationToken = default)
    {
        var session = await _dbContext.RoleplaySessions
            .AsNoTracking()
            .AsSplitQuery()
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.Scenario)
            .Include(s => s.SessionMissions)
                .ThenInclude(sm => sm.Mission)
            .Include(s => s.Messages)
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.SessionType != "PlacementTest", cancellationToken);

        if (session == null || session.ScenarioLevelConfiguration?.Scenario == null)
        {
            return ApiResponse<RoleplayHintDto>.Fail("Không tìm thấy phiên luyện tập.");
        }

        if (session.UserId != userId)
        {
            return ApiResponse<RoleplayHintDto>.Fail("Bạn không có quyền thực hiện thao tác này.");
        }

        var pendingMissions = session.SessionMissions
            .Where(sm => !sm.IsCompleted && sm.Mission != null)
            .Select(sm => sm.Mission!)
            .ToList();

        var hint = await _aiRoleplayService.GenerateHintAsync(
            session.ScenarioLevelConfiguration.Scenario,
            session.ScenarioLevelConfiguration,
            session.Messages.ToList(),
            pendingMissions,
            cancellationToken);

        return ApiResponse<RoleplayHintDto>.Ok(hint);
    }

    public async Task<ApiResponse<bool>> EndSessionAsync(
        string userId,
        int sessionId,
        CancellationToken cancellationToken = default)
    {
        var session = await _dbContext.RoleplaySessions
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.SessionType != "PlacementTest", cancellationToken);

        if (session == null)
        {
            return ApiResponse<bool>.Fail("Không tìm thấy phiên luyện tập.");
        }

        if (session.UserId != userId)
        {
            return ApiResponse<bool>.Fail("Bạn không có quyền thao tác trên phiên này.");
        }

        session.Status = "Completed";
        session.CompletedAt = DateTime.UtcNow;
        session.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);

        // Finalize Telemetry & Persona Memory
        await _telemetryEvaluator.FinalizeSessionTelemetryAsync(sessionId, userId);

        var sessionWithConfig = await _dbContext.RoleplaySessions
            .AsSplitQuery()
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.Scenario)
            .Include(s => s.SessionMissions)
            .FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken);

        if (sessionWithConfig?.ScenarioLevelConfiguration?.Scenario != null)
        {
            bool allDone = sessionWithConfig.SessionMissions.Count > 0 && sessionWithConfig.SessionMissions.All(m => m.IsCompleted);
            string npcCode = ResolveNpcCode(
                sessionWithConfig.ScenarioLevelConfiguration.Scenario.ScenarioCode,
                sessionWithConfig.ScenarioLevelConfiguration.Scenario.Id,
                sessionWithConfig.ScenarioLevelConfigurationId);
            await _personaMemory.RecordSessionAffinityAsync(userId, npcCode, allDone);

        }

        // Cập nhật và lưu ký ức liên phiên vào LearnerMemory & CharacterMemory
        try
        {
            var userTexts = await _dbContext.RoleplayMessages
                .Where(m => m.RoleplaySessionId == sessionId && m.Sender == "User")
                .Select(m => m.JapaneseText)
                .ToListAsync(cancellationToken);

            foreach (var ut in userTexts)
            {
                var fact = _factExtractor.ExtractFact(ut);
                if (!string.IsNullOrWhiteSpace(fact))
                {
                    var cat = fact.Contains("ramen") || fact.Contains("sushi") || fact.Contains("ăn") || fact.Contains("uống")
                        ? "FoodPreference"
                        : fact.Contains("quê") || fact.Contains("sống") || fact.Contains("ở")
                            ? "Origin"
                            : "Hobby";
                    var parts = fact.Split(':');
                    var k = (parts.Length > 0 ? parts[0] : "general").Trim().ToLowerInvariant();
                    var v = (parts.Length > 1 ? parts[1] : fact).Trim();

                    var existing = await _dbContext.LearnerMemories
                        .FirstOrDefaultAsync(lm => lm.UserId == userId && lm.Key == k, cancellationToken);
                    if (existing == null)
                    {
                        _dbContext.LearnerMemories.Add(new LearnerMemory
                        {
                            UserId = userId,
                            Category = cat,
                            Key = k,
                            Value = v,
                            Confidence = 0.95,
                            Visibility = "WorldKnown",
                            SourceSessionId = sessionId,
                            CreatedAtUtc = DateTime.UtcNow,
                            LastConfirmedAtUtc = DateTime.UtcNow
                        });
                    }
                    else
                    {
                        existing.Value = v;
                        existing.LastConfirmedAtUtc = DateTime.UtcNow;
                    }
                }
            }

            if (sessionWithConfig?.ScenarioLevelConfiguration?.Scenario != null)
            {
                string npcKey = ResolveNpcCode(
                    sessionWithConfig.ScenarioLevelConfiguration.Scenario.ScenarioCode,
                    sessionWithConfig.ScenarioLevelConfiguration.Scenario.Id,
                    sessionWithConfig.ScenarioLevelConfigurationId);
                bool allDone = sessionWithConfig.SessionMissions.Count > 0 && sessionWithConfig.SessionMissions.All(m => m.IsCompleted);

                var cm = await _dbContext.CharacterMemories
                    .FirstOrDefaultAsync(c => c.UserId == userId && c.CharacterPersonaKey == npcKey, cancellationToken);
                if (cm == null)
                {
                    _dbContext.CharacterMemories.Add(new CharacterMemory
                    {
                        UserId = userId,
                        CharacterPersonaKey = npcKey,
                        EncounterCount = 1,
                        AffinityScore = allDone ? 20 : 10,
                        LastInteractionSummary = $"Hoàn thành phiên {sessionWithConfig.ScenarioLevelConfiguration.Scenario.Title}",
                        LastMetAtUtc = DateTime.UtcNow
                    });
                }
                else
                {
                    cm.AffinityScore += allDone ? 15 : 5;
                    cm.LastInteractionSummary = $"Luyện tập {sessionWithConfig.ScenarioLevelConfiguration.Scenario.Title} ({DateTime.UtcNow:dd/MM})";
                    cm.LastMetAtUtc = DateTime.UtcNow;
                }
            }
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Lỗi khi lưu LearnerMemory/CharacterMemory khi kết thúc phiên {SessionId}", sessionId);
        }

        // Tổng hợp AI Coaching Snapshot một lần lúc kết thúc phiên (strict 4000ms timeout, tự động fallback an toàn)
        if (_adaptiveProfileService != null)
        {
            try
            {
                using var coachingCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                coachingCts.CancelAfter(TimeSpan.FromMilliseconds(4000));
                await _adaptiveProfileService.GenerateAndPersistCoachingSnapshotAsync(
                    userId,
                    sessionId,
                    coachingCts.Token);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Bỏ qua hoặc timeout khi tổng hợp AI Adaptive Coaching cho phiên {SessionId}", sessionId);
            }
        }

        return ApiResponse<bool>.Ok(true, "Phiên luyện tập đã kết thúc thành công.");
    }

    public async Task<ApiResponse<LearnerIntelligenceProfileDto>> GetIntelligenceProfileAsync(
        string userId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            return ApiResponse<LearnerIntelligenceProfileDto>.Fail("UserId không hợp lệ.");
        }

        var profile = await _telemetryEvaluator.GetOrCreateProfileAsync(userId);

        int totalSessions = await TelemetryEvaluatorService.CountCompletedStandardSessionsAsync(
            _dbContext,
            userId,
            cancellationToken);

        int totalTurns = await _dbContext.LearnerBehaviorSignals
            .Join(_dbContext.RoleplaySessions, sig => sig.SessionId, ses => ses.Id, (sig, ses) => new { sig, ses })
            .CountAsync(x => x.ses.UserId == userId && x.ses.SessionType != "PlacementTest", cancellationToken);

        int voiceTurns = await TelemetryEvaluatorService.CountVoiceStandardTurnsAsync(
            _dbContext,
            userId,
            cancellationToken);
        bool hasVoiceData = voiceTurns > 0;

        DateTime? lastPracticed = await _dbContext.RoleplaySessions
            .Where(s => s.UserId == userId && s.SessionType != "PlacementTest" && s.CompletedAt != null)
            .OrderByDescending(s => s.CompletedAt)
            .Select(s => s.CompletedAt)
            .FirstOrDefaultAsync(cancellationToken);

        // Suy luận điểm mạnh & điểm cần tôi luyện từ chỉ số thực
        var strengths = new List<string>();
        var focusAreas = new List<string>();

        if (profile.SpeakingReflexIndex >= 65)
            strengths.Add("Phản xạ hội thoại nhạy bén");
        else
            focusAreas.Add("Cải thiện tốc độ phản xạ khởi đầu câu");

        if (profile.KeigoCommandScore >= 65)
            strengths.Add("Dùng thể lịch sự tự nhiên đúng vai vế");
        else
            focusAreas.Add("Củng cố thể lịch sự trong giao tiếp");

        if (profile.ParticleAccuracyRate >= 70)
            strengths.Add("Làm chủ chính xác trợ từ は, が, に, で");
        else
            focusAreas.Add("Chú ý phân biệt cặp trợ từ に vs で, は vs が");

        if (hasVoiceData)
        {
            if (profile.AverageMoraRate >= 4.0)
                strengths.Add("Nhịp điệu phát âm lưu loát (≥ 4.0 âm/giây)");
            else
                focusAreas.Add("Luyện tập nối âm và ngắt nghỉ tự nhiên hơn");
        }

        if (profile.HintDependencyRate <= 25)
            strengths.Add("Tự chủ giao tiếp cao (ít dựa gợi ý)");
        else
            focusAreas.Add("Thử thách tự diễn đạt trước khi mở thẻ gợi ý");

        string omikujiRank = profile.CommunicativeProficiencyIndex >= 85 ? "大吉 (Đại Cát)"
            : profile.CommunicativeProficiencyIndex >= 70 ? "中吉 (Trung Cát)" : "吉 (Cát)";

        var nowUtc = DateTime.UtcNow;
        var dueItemsQuery = await _dbContext.LearnerSkillMasteries
            .AsNoTracking()
            .Where(m => m.UserId == userId && m.NextRecommendedReviewUtc <= nowUtc)
            .OrderBy(m => m.NextRecommendedReviewUtc)
            .Take(20)
            .ToListAsync(cancellationToken);

        var masteredItemsQuery = await _dbContext.LearnerSkillMasteries
            .AsNoTracking()
            .Where(m => m.UserId == userId && m.NextRecommendedReviewUtc > nowUtc)
            .OrderByDescending(m => m.Stability)
            .ThenByDescending(m => m.LastPracticedUtc)
            .Take(16)
            .ToListAsync(cancellationToken);

        var dueMasteries = dueItemsQuery
            .Concat(masteredItemsQuery)
            .Select(m => new LearnerSkillMasteryItemDto
            {
                SkillCode = m.SkillCode,
                SkillName = m.SkillName,
                Category = m.Category,
                Stability = m.Stability,
                Difficulty = m.Difficulty,
                Repetitions = m.Repetitions,
                Lapses = m.Lapses,
                NextRecommendedReviewUtc = m.NextRecommendedReviewUtc,
                IsDueForReview = m.NextRecommendedReviewUtc <= nowUtc
            })
            .ToList();

        // Đồng bộ chỉ số tổng quát với các trục năng lực thực sự đã đo (5 trục nếu chưa thu âm, 6 trục nếu đã nói qua micro)
        double alignedProficiency = TelemetryEvaluatorService.ComputeEffectiveAlignedProficiency(profile, totalSessions, hasVoiceData);

        omikujiRank = alignedProficiency >= 85 ? "大吉 (Đại Cát)"
            : alignedProficiency >= 70 ? "中吉 (Trung Cát)" : "吉 (Cát)";

        var recentResults = await TelemetryEvaluatorService.GetRecentStandardResultsAsync(
            _dbContext,
            userId,
            6,
            cancellationToken);

        int consecutiveFailCount = recentResults.TakeWhile(r => !r.PassStatus).Count();

        string proficiencyTrend = "Stable";
        if (recentResults.Count >= 4)
        {
            int splitCount = Math.Min(3, recentResults.Count / 2);
            double newerAvg = recentResults.Take(splitCount).Average(r => r.OverallScore);
            double olderAvg = recentResults.Skip(splitCount).Take(splitCount).Average(r => r.OverallScore);
            double trendDelta = newerAvg - olderAvg;
            if (trendDelta >= 5.0) proficiencyTrend = "Improving";
            else if (trendDelta <= -5.0) proficiencyTrend = "Declining";
        }

        var (estimatedJlptLevel, estimatedJlptLabel) = TelemetryEvaluatorService.DeriveDynamicJlptDetails(
            profile.ThetaEstimate,
            alignedProficiency,
            consecutiveFailCount);

        var recurringMistakes = await _dbContext.LearnerSkillMasteries
            .AsNoTracking()
            .Where(m => m.UserId == userId && m.Lapses >= 2)
            .OrderByDescending(m => m.Lapses)
            .ThenByDescending(m => m.LastPracticedUtc)
            .Take(3)
            .Select(m => new RecurringMistakeDto
            {
                SkillCode = m.SkillCode,
                SkillName = m.SkillName,
                Lapses = m.Lapses
            })
            .ToListAsync(cancellationToken);

        var coachingAlerts = new List<LearnerCoachingAlertDto>();
        if (consecutiveFailCount >= 2)
        {
            coachingAlerts.Add(new LearnerCoachingAlertDto
            {
                Severity = "danger",
                Title = $"Chưa đạt {consecutiveFailCount} phiên liên tiếp",
                Message = "Bạn nên ôn lại cấp dễ hơn hoặc bật gợi ý Cấp 1 để lấy lại nhịp nói.",
                SuggestedAction = "Luyện củng cố"
            });
        }
        if (recurringMistakes.Count > 0)
        {
            var concreteMistake = recurringMistakes
                .Select(m => new
                {
                    Item = m,
                    Display = ResolveRecurringSkillDisplay(m.SkillCode, m.SkillName)
                })
                .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x.Display));

            if (concreteMistake != null)
            {
                coachingAlerts.Add(new LearnerCoachingAlertDto
                {
                    Severity = "warning",
                    Title = $"Lỗi hay gặp: {concreteMistake.Display} ({concreteMistake.Item.Lapses} lần)",
                    Message = "Bạn thường vướng phần này ở các phiên gần đây — hãy để ý tránh lặp lại trong phiên tới.",
                    SuggestedAction = "Xem sổ tay ôn tập"
                });
            }
        }
        if (coachingAlerts.Count < 3 && proficiencyTrend == "Declining")
        {
            coachingAlerts.Add(new LearnerCoachingAlertDto
            {
                Severity = "warning",
                Title = "Phong độ gần đây đang giảm",
                Message = "Điểm các phiên gần đây giảm nhẹ. Hãy nói chậm rãi và hoàn thiện trọn câu lịch sự."
            });
        }
        else if (coachingAlerts.Count == 0 && proficiencyTrend == "Improving" && totalSessions >= 3 && alignedProficiency >= 78)
        {
            coachingAlerts.Add(new LearnerCoachingAlertDto
            {
                Severity = "positive",
                Title = "Phong độ đang tiến bộ rõ rệt",
                Message = $"Thực lực hiện tại ở mức {estimatedJlptLabel} — bạn có thể thử cấp độ cao hơn."
            });
        }

        var dto = new LearnerIntelligenceProfileDto
        {
            UserId = userId,
            ThetaEstimate = profile.ThetaEstimate,
            SpeakingReflexIndex = profile.SpeakingReflexIndex,
            KeigoCommandScore = profile.KeigoCommandScore,
            ParticleAccuracyRate = profile.ParticleAccuracyRate,
            AverageMoraRate = hasVoiceData ? profile.AverageMoraRate : 0.0,
            HintDependencyRate = profile.HintDependencyRate,
            CommunicativeConfidenceScore = profile.CommunicativeConfidenceScore,
            CommunicativeProficiencyIndex = alignedProficiency,
            TotalSessionsCompleted = totalSessions,
            TotalPracticeTurns = totalTurns,
            VoicePracticeTurns = voiceTurns,
            HasVoiceData = hasVoiceData,
            Strengths = strengths,
            TargetFocusAreas = focusAreas,
            OmikujiRank = omikujiRank,
            KotowazaProverb = "継続は力なり — Kiên trì mỗi ngày chính là cội nguồn của sức mạnh giao tiếp.",
            LastPracticedAtUtc = lastPracticed,
            DueReviewItems = dueMasteries,
            EstimatedJlptLevel = estimatedJlptLevel,
            EstimatedJlptLabel = estimatedJlptLabel,
            ProficiencyTrend = proficiencyTrend,
            ConsecutiveFailCount = consecutiveFailCount,
            RecurringMistakes = recurringMistakes,
            CoachingAlerts = coachingAlerts.Take(3).ToList()
        };

        // Trích xuất các đặc trưng hành vi và lộ trình thích ứng ngầm (TikTok-style Trajectory)
        if (!string.IsNullOrWhiteSpace(profile.InferredTraitsJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(profile.InferredTraitsJson);
                var root = doc.RootElement;
                if (root.TryGetProperty("hesitationRate", out var hr) && hr.ValueKind == JsonValueKind.Number)
                    dto.HesitationRate = Math.Clamp(hr.GetDouble(), 0.0, 100.0);
                if (root.TryGetProperty("averageHesitationSeconds", out var ahs) && ahs.ValueKind == JsonValueKind.Number)
                    dto.AverageHesitationSeconds = Math.Clamp(ahs.GetDouble(), 0.2, 30.0);
                if (root.TryGetProperty("scaffoldTierPreference", out var stp) && stp.ValueKind == JsonValueKind.String)
                    dto.ScaffoldTierPreference = stp.GetString() ?? "Autonomous";
                if (root.TryGetProperty("preferredTone", out var pt) && pt.ValueKind == JsonValueKind.String)
                    dto.PreferredTone = pt.GetString() ?? "Polite_Teineigo";
                if (root.TryGetProperty("toneConsistencyScore", out var tcs) && tcs.ValueKind == JsonValueKind.Number)
                    dto.ToneConsistencyScore = tcs.GetDouble();
                if (root.TryGetProperty("dominantWeaknessCategory", out var dwc) && dwc.ValueKind == JsonValueKind.String)
                    dto.DominantWeaknessCategory = dwc.GetString() ?? "Particles";
                if (root.TryGetProperty("nextRecommendedScenarioId", out var nsi) && nsi.ValueKind == JsonValueKind.Number)
                    dto.NextRecommendedScenarioId = nsi.GetInt32();
                if (root.TryGetProperty("nextRecommendedScenarioCode", out var nsc) && nsc.ValueKind == JsonValueKind.String)
                    dto.NextRecommendedScenarioCode = nsc.GetString();
                if (root.TryGetProperty("nextRecommendedScenarioTitle", out var nst) && nst.ValueKind == JsonValueKind.String)
                    dto.NextRecommendedScenarioTitle = nst.GetString();
                if (root.TryGetProperty("nextRecommendedReason", out var nrr) && nrr.ValueKind == JsonValueKind.String)
                    dto.NextRecommendedReason = nrr.GetString();
                if (root.TryGetProperty("predictedSuccessRateNextScenario", out var psr) && psr.ValueKind == JsonValueKind.Number)
                {
                    var rawPsr = psr.GetDouble();
                    dto.PredictedSuccessRateNextScenario = rawPsr <= 1.0 ? Math.Round(rawPsr * 100.0, 1) : Math.Round(rawPsr, 1);
                }
                if (root.TryGetProperty("adaptiveLearningPathStatus", out var alps) && alps.ValueKind == JsonValueKind.String)
                    dto.AdaptiveLearningPathStatus = alps.GetString() ?? "Fading_Assistance";
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Không thể parse InferredTraitsJson: {Msg}", ex.Message);
            }
        }

        return ApiResponse<LearnerIntelligenceProfileDto>.Ok(dto);
    }

    private static string? ResolveRecurringSkillDisplay(string? skillCode, string? rawName)
    {
        if (!string.IsNullOrWhiteSpace(skillCode))
        {
            var (_, resolvedName, _) = TelemetryEvaluatorService.ResolveSkillInfo(skillCode.Trim().ToUpperInvariant());
            if (!IsGenericSkillPlaceholder(resolvedName))
                return resolvedName;
        }

        if (string.IsNullOrWhiteSpace(rawName)) return null;
        var codeMatch = System.Text.RegularExpressions.Regex.Match(rawName, @"\(([A-Z]\d+(?:_[A-Z0-9_]+)?)\)");
        if (codeMatch.Success)
        {
            var (_, resolvedFromParen, _) = TelemetryEvaluatorService.ResolveSkillInfo(codeMatch.Groups[1].Value.ToUpperInvariant());
            if (!IsGenericSkillPlaceholder(resolvedFromParen))
                return resolvedFromParen;
        }

        var cleaned = System.Text.RegularExpressions.Regex.Replace(rawName, @"\s*\([A-Z0-9_]+\)\s*", " ").Trim();
        cleaned = System.Text.RegularExpressions.Regex.Replace(cleaned, @"^Quy tắc giao tiếp\s*[:\-]?\s*", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase).Trim();
        cleaned = System.Text.RegularExpressions.Regex.Replace(cleaned, @"^(Từ vựng|Ngữ pháp)\s*:\s*", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase).Trim();
        return IsGenericSkillPlaceholder(cleaned) ? null : cleaned;
    }

    private static bool IsGenericSkillPlaceholder(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return true;
        var normalized = text.Trim();
        return normalized.Equals("quy tắc giao tiếp", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("quy tắc ngữ pháp", StringComparison.OrdinalIgnoreCase)
            || System.Text.RegularExpressions.Regex.IsMatch(normalized, @"^E\d+$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    }
}
