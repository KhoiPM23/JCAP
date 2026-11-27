using System;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using JCAP.Data;
using JCAP.DTOs.Roleplay;
using JCAP.Models;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations
{
    public class TelemetryEvaluatorService : ITelemetryEvaluatorService
    {
        private readonly AppDbContext _context;
        private readonly IVietnameseLearnerErrorDetector _errorDetector;

        public TelemetryEvaluatorService(AppDbContext context, IVietnameseLearnerErrorDetector errorDetector)
        {
            _context = context;
            _errorDetector = errorDetector;
        }

        public async Task<LearnerIntelligenceProfile> GetOrCreateProfileAsync(string userId)
        {
            var profile = _context.LearnerIntelligenceProfiles.Local.FirstOrDefault(p => p.UserId == userId)
                ?? await _context.LearnerIntelligenceProfiles.FirstOrDefaultAsync(p => p.UserId == userId);

            if (profile == null)
            {
                profile = new LearnerIntelligenceProfile
                {
                    UserId = userId,
                    ThetaEstimate = 0.0,
                    SpeakingReflexIndex = 50.0,
                    KeigoCommandScore = 50.0,
                    ParticleAccuracyRate = 70.0,
                    AverageMoraRate = 3.5,
                    HintDependencyRate = 20.0,
                    CommunicativeConfidenceScore = 60.0,
                    CommunicativeProficiencyIndex = 50.0,
                    InferredTraitsJson = JsonSerializer.Serialize(new { strengths = new string[] { }, weaknesses = new string[] { } }),
                    CreatedAtUtc = DateTime.UtcNow,
                    UpdatedAtUtc = DateTime.UtcNow
                };
                _context.LearnerIntelligenceProfiles.Add(profile);
                try
                {
                    await _context.SaveChangesAsync();
                }
                catch (DbUpdateException)
                {
                    // Concurrency race: record already created by concurrent request
                    profile = _context.LearnerIntelligenceProfiles.Local.FirstOrDefault(p => p.UserId == userId)
                        ?? await _context.LearnerIntelligenceProfiles.FirstOrDefaultAsync(p => p.UserId == userId)
                        ?? profile;
                }
            }

            return profile;
        }

        public async Task<DynamicScaffoldingDecision> RecordAndEvaluateTurnAsync(TurnTelemetryInput input)
        {
            // 1. Quét lỗi nhanh E01-E10
            string? detectedCodes = null;
            if (!string.IsNullOrWhiteSpace(input.JapaneseSpoken))
            {
                var issues = _errorDetector.DetectErrors(input.JapaneseSpoken);
                if (issues.Count > 0)
                {
                    detectedCodes = string.Join(",", issues.Select(i => i.Code));
                }
            }

            // 2. Lưu tín hiệu hành vi lượt (Turn Telemetry S1..S12)
            var signal = new LearnerBehaviorSignal
            {
                SessionId = input.SessionId,
                TurnIndex = input.TurnIndex,
                LatencyMs = input.LatencyMs,
                PauseRatio = input.PauseRatio,
                MoraRate = input.MoraRate,
                HintLevelUsed = input.HintLevelUsed,
                TranslationPeekCount = input.TranslationPeekCount,
                RetryCount = input.RetryCount,
                FallbackToTextInput = input.FallbackToTextInput,
                BargeInInterrupted = input.BargeInInterrupted,
                DetectedRuleErrorCodes = detectedCodes,
                TurnScore = input.TurnScore,
                CreatedAtUtc = DateTime.UtcNow
            };
            input.PendingSignal = signal;
            if (!input.DeferPersistence)
            {
                _context.LearnerBehaviorSignals.Add(signal);
                await _context.SaveChangesAsync();
            }

            // 3. Tính toán điều chỉnh nhịp độ (DDA: Dynamic Scaffolding)
            var decision = new DynamicScaffoldingDecision();

            // Nếu người học phản hồi chậm (>4.5s) hoặc xem bản dịch tiếng Việt nhiều, hoặc dùng gợi ý mức cao:
            if (input.LatencyMs > 4500 || input.TranslationPeekCount > 1 || input.HintLevelUsed >= 2)
            {
                decision.SpeedScale = 0.85; // Nói chậm lại một chút để người học theo kịp
                decision.PromptModifier = "[DDA: Học viên đang lưỡng lự hoặc cần hỗ trợ. Hãy nói câu ngắn hơn, rõ ràng, dùng từ vựng cơ bản và thể hiện sự khích lệ ấm áp.]";
                decision.RecommendedHintLevel = 2; // Tự động chuẩn bị gợi ý điền khuyết
                decision.ShouldOfferEncouragement = true;
            }
            // Nếu phản xạ nhanh (<1.8s), không xem hint, điểm cao (>85):
            else if (input.LatencyMs > 0 && input.LatencyMs < 1800 && input.HintLevelUsed == 0 && input.TranslationPeekCount == 0 && (input.TurnScore >= 85 || (input.TurnScore == 0 && string.IsNullOrEmpty(detectedCodes))))
            {
                decision.SpeedScale = 1.05; // Đẩy nhanh nhịp điệu tự nhiên như người bản xứ
                decision.PromptModifier = "[DDA: Học viên phản xạ rất tốt và tự tin. Hãy đưa ra câu đối đáp tự nhiên, phong phú ngữ điệu, có thể mở rộng chủ đề nhẹ nhàng.]";
                decision.RecommendedHintLevel = 1;
                decision.ShouldOfferEncouragement = false;
            }

            return decision;
        }

        public async Task FinalizeSessionTelemetryAsync(int sessionId, string userId)
        {
            var signals = await _context.LearnerBehaviorSignals
                .Where(s => s.SessionId == sessionId)
                .ToListAsync();

            var userMsgEntities = await _context.RoleplayMessages
                .AsNoTracking()
                .Where(m => m.RoleplaySessionId == sessionId && m.Sender == "User")
                .OrderBy(m => m.CreatedAt)
                .ToListAsync();

            var roleplayResult = await _context.RoleplayResults
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.RoleplaySessionId == sessionId && r.UserId == userId);

            if (signals.Count == 0 && userMsgEntities.Count == 0) return;

            var profile = await GetOrCreateProfileAsync(userId);

            if (signals.Count == 0)
            {
                if (userMsgEntities.Count > 0)
                {
                    int idx = 1;
                    foreach (var msg in userMsgEntities)
                    {
                        LinguisticFeedbackDto? fb = null;
                        if (!string.IsNullOrWhiteSpace(msg.LinguisticFeedbackJson))
                        {
                            try
                            {
                                fb = JsonSerializer.Deserialize<LinguisticFeedbackDto>(
                                    msg.LinguisticFeedbackJson,
                                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                            }
                            catch { }
                        }

                        var detected = !string.IsNullOrWhiteSpace(msg.JapaneseText)
                            ? _errorDetector.DetectErrors(msg.JapaneseText)
                            : new System.Collections.Generic.List<DetectedGrammarIssue>();
                        var statusScore = fb?.Status?.ToLowerInvariant() switch
                        {
                            "good" or "success" => 90.0,
                            "error" => 35.0,
                            "warning" => 65.0,
                            _ => roleplayResult != null ? (double)roleplayResult.OverallScore : 75.0
                        };

                        signals.Add(new LearnerBehaviorSignal
                        {
                            SessionId = sessionId,
                            TurnIndex = idx++,
                            LatencyMs = fb?.SpeechDelivery?.ResponseLatencySeconds is double lat && lat > 0
                                ? (int)Math.Round(lat * 1000)
                                : 0,
                            MoraRate = fb?.SpeechDelivery?.MoraRate ?? fb?.SpeechDelivery?.SpeechPace ?? 0,
                            HintLevelUsed = fb?.SpeechDelivery?.HintLevelUsed ?? 0,
                            FallbackToTextInput = fb?.SpeechDelivery?.IsTextInput ?? true,
                            DetectedRuleErrorCodes = detected.Count > 0 ? string.Join(",", detected.Select(i => i.Code)) : null,
                            TurnScore = fb?.SpeechDelivery?.TurnFluencyScore ?? statusScore
                        });
                    }
                }
            }

            // Tải thông tin Session & Scenario trước để áp dụng đúng đường cong phản xạ theo JLPT và SocialRegister
            var session = await _context.RoleplaySessions
                .AsSplitQuery()
                .Include(s => s.ScenarioLevelConfiguration)
                    .ThenInclude(c => c!.Scenario)
                .Include(s => s.ScenarioLevelConfiguration)
                    .ThenInclude(c => c!.TargetVocabularies)
                .Include(s => s.ScenarioLevelConfiguration)
                    .ThenInclude(c => c!.TargetGrammars)
                .FirstOrDefaultAsync(s => s.Id == sessionId);

            var sessionJlpt = session?.ScenarioLevelConfiguration?.JLPTLevel ?? roleplayResult?.JLPTLevel ?? "N5";

            // Cập nhật điểm tự tin (Communicative Confidence Score)
            // CCS giảm nếu độ trễ cao, phụ thuộc hint nhiều, hoặc lặp lại nhiều lần
            var validLatencySignals = signals.Where(s => s.LatencyMs > 0).ToList();
            double? avgLatencySec = validLatencySignals.Count > 0
                ? validLatencySignals.Average(s => Math.Clamp(s.LatencyMs, 200, 30000)) / 1000.0
                : null;
            double avgHintLevel = signals.Average(s => s.HintLevelUsed);
            double avgRetries = signals.Average(s => s.RetryCount);

            // Dùng Single Source of Truth AssistancePolicy cho điểm phản xạ theo cấp JLPT (chỉ tính khi có dữ liệu độ trễ thực)
            double reflexScore = avgLatencySec.HasValue
                ? AssistancePolicy.CalculateReflexScore(avgLatencySec.Value, sessionJlpt)
                : profile.SpeakingReflexIndex;
            double hintPenalty = avgHintLevel * 12.0;
            double retryPenalty = avgRetries * 8.0;

            var scoredSignals = signals.Where(s => s.TurnScore > 0).ToList();
            double rawAvgSignalScore = scoredSignals.Count > 0
                ? scoredSignals.Average(s => s.TurnScore)
                : (roleplayResult?.OverallScore ?? 70.0);
            double avgScore = roleplayResult != null
                ? Math.Round((rawAvgSignalScore * 0.30) + (roleplayResult.OverallScore * 0.70), 1)
                : rawAvgSignalScore;

            double calculatedCcs = Math.Clamp(reflexScore - hintPenalty - retryPenalty + (avgScore * 0.3), 10.0, 99.0);

            // Cập nhật EMA (Exponential Moving Average) 80% cũ, 20% mới
            if (avgLatencySec.HasValue)
            {
                profile.SpeakingReflexIndex = Math.Round(profile.SpeakingReflexIndex * 0.8 + reflexScore * 0.2, 1);
            }
            profile.CommunicativeConfidenceScore = Math.Round(profile.CommunicativeConfidenceScore * 0.8 + calculatedCcs * 0.2, 1);
            profile.CommunicativeProficiencyIndex = Math.Round(profile.CommunicativeProficiencyIndex * 0.8 + avgScore * 0.2, 1);

            var voiceMoraValues = signals
                .Where(s => !s.FallbackToTextInput && s.MoraRate > 0)
                .Select(s => s.MoraRate)
                .ToList();
            if (voiceMoraValues.Count > 0)
            {
                double avgMora = voiceMoraValues.Average();
                profile.AverageMoraRate = Math.Round(profile.AverageMoraRate * 0.8 + avgMora * 0.2, 2);
            }

            // 1. Cập nhật ParticleAccuracyRate (Độ chuẩn trợ từ dựa trên quét lỗi E01 và GrammarScore thực tế)
            int particleErrors = signals.Count(s => !string.IsNullOrEmpty(s.DetectedRuleErrorCodes) && s.DetectedRuleErrorCodes.Contains("E01"));
            double sessionParticleAccuracy = Math.Clamp(100.0 - (particleErrors / (double)signals.Count * 50.0), 30.0, 100.0);
            if (roleplayResult != null && roleplayResult.GrammarScore > 0)
            {
                sessionParticleAccuracy = Math.Clamp((sessionParticleAccuracy * 0.6) + (roleplayResult.GrammarScore * 0.4), 20.0, 100.0);
            }
            profile.ParticleAccuracyRate = Math.Round(profile.ParticleAccuracyRate * 0.8 + sessionParticleAccuracy * 0.2, 1);

            // 2. Cập nhật HintDependencyRate
            double sessionHintDep = Math.Clamp(avgHintLevel * 33.3, 0.0, 100.0);
            profile.HintDependencyRate = Math.Round(profile.HintDependencyRate * 0.8 + sessionHintDep * 0.2, 1);

            // 3. Suy luận SocialRegister phù hợp từ Session & Scenario đã tải

            var scenarioTitle = session?.ScenarioLevelConfiguration?.Scenario?.Title ?? string.Empty;
            if (string.IsNullOrEmpty(scenarioTitle) && session?.ScenarioLevelConfiguration?.ScenarioId > 0)
            {
                var scenario = await _context.Scenarios.FindAsync(session.ScenarioLevelConfiguration.ScenarioId);
                scenarioTitle = scenario?.Title ?? string.Empty;
            }

            var aiPersona = session?.ScenarioLevelConfiguration?.AiPersona ?? string.Empty;
            var description = session?.ScenarioLevelConfiguration?.Description ?? string.Empty;
            var reg = RoleplaySocialRegister.Deduce(scenarioTitle, aiPersona, description);
            // 4. Cập nhật KeigoCommandScore (Kiểm tra thể lịch sự / kính ngữ thích ứng theo vai vế xã hội)
            var userMsgs = userMsgEntities.Select(m => m.JapaneseText).ToList();
            if (userMsgs.Count > 0)
            {
                double sessionKeigoScore;
                if (reg.RegisterType == SocialRegisterType.PeerFriend)
                {
                    // Với bối cảnh bạn bè thân mật (PeerFriend): Thể thân mật (Tamego) là tự nhiên và đúng chuẩn văn hóa.
                    // Đánh giá dựa trên độ tự nhiên của văn phong thân mật (hạt từ đệm, liên từ, câu hội thoại tự nhiên)
                    int naturalCasualCount = userMsgs.Count(t =>
                        t.Contains("ね") || t.Contains("よ") || t.Contains("かな") || t.Contains("うん") ||
                        t.Contains("だ") || t.Contains("ありがとう") || t.Contains("そう") || t.Contains("いい") ||
                        t.Contains("です") || t.Contains("ます"));
                    sessionKeigoScore = Math.Clamp(naturalCasualCount / (double)userMsgs.Count * 100.0, 60.0, 100.0);
                }
                else
                {
                    int politeCount = userMsgs.Count(t => t.Contains("です") || t.Contains("ます") || t.Contains("ございます") || t.Contains("でした") || t.Contains("ません") || t.Contains("ください"));
                    sessionKeigoScore = Math.Clamp(politeCount / (double)userMsgs.Count * 100.0, 20.0, 100.0);
                }

                if (roleplayResult != null && roleplayResult.ImpressionScore > 0)
                {
                    sessionKeigoScore = Math.Clamp((sessionKeigoScore * 0.6) + (roleplayResult.ImpressionScore * 0.4), 20.0, 100.0);
                }
                profile.KeigoCommandScore = Math.Round(profile.KeigoCommandScore * 0.8 + sessionKeigoScore * 0.2, 1);
            }

            // 5. Ước lượng Theta động (IRT Communicative Ability: -3.0 .. +3.0) phản ánh cả kết quả Đạt/Chưa đạt
            string jlpt = session?.ScenarioLevelConfiguration?.JLPTLevel ?? roleplayResult?.JLPTLevel ?? "N5";
            double jlptWeight = jlpt == "N3" ? 2.5 : jlpt == "N4" ? 1.5 : 0.5;
            double passModifier = roleplayResult == null ? 0.0 : (roleplayResult.PassStatus ? 0.25 : -0.45);
            double estimatedTheta = Math.Clamp((avgScore - 70.0) / 25.0 + (jlptWeight - 1.0) + passModifier, -2.5, 2.8);
            profile.ThetaEstimate = Math.Round(profile.ThetaEstimate * 0.75 + estimatedTheta * 0.25, 2);

            int totalCompletedSessions = await CountCompletedStandardSessionsAsync(_context, userId);
            var recentResults = await GetRecentStandardResultsAsync(_context, userId, 6);
            int consecutiveFailCount = recentResults.TakeWhile(r => !r.PassStatus).Count();
            double alignedProficiency = ComputeEffectiveAlignedProficiency(profile, totalCompletedSessions);
            string estimatedJlptLevel = DeriveDynamicJlptLevel(profile.ThetaEstimate, alignedProficiency, consecutiveFailCount);

            // 6. Cập nhật InferredTraitsJson (TikTok-style deep behavioral profile & trajectory)
            var strengths = new System.Collections.Generic.List<string>();
            var weaknesses = new System.Collections.Generic.List<string>();

            if (profile.SpeakingReflexIndex >= 65) strengths.Add("Phản xạ giao tiếp nhanh nhạy");
            else if (profile.SpeakingReflexIndex < 45) weaknesses.Add("Còn ngập ngừng khi bắt đầu câu");

            if (profile.ParticleAccuracyRate >= 75) strengths.Add("Dùng chuẩn xác trợ từ は/が/を/に");
            else weaknesses.Add("Dễ nhầm lẫn cặp trợ từ に vs で, は vs が");

            if (profile.KeigoCommandScore >= 70) strengths.Add("Làm chủ tốt thể lịch sự và văn phong ngữ cảnh");
            else weaknesses.Add("Cần củng cố văn phong giao tiếp phù hợp đối tượng");

            if (profile.AverageMoraRate >= 4.2) strengths.Add("Tốc độ phát âm tự nhiên theo nhịp phách Tokyo");
            if (profile.HintDependencyRate <= 20) strengths.Add("Tự tin đối thoại chủ động không lệ thuộc gợi ý");

            // Đo lường hành vi ngầm bổ sung (TikTok-Style Telemetry):
            int hesitationTurns = validLatencySignals.Count(s => s.LatencyMs > 4500);
            double? hesitationRate = validLatencySignals.Count > 0
                ? Math.Round((hesitationTurns / (double)validLatencySignals.Count) * 100.0, 1)
                : null;
            double? averageHesitationSeconds = avgLatencySec.HasValue
                ? Math.Round(avgLatencySec.Value, 2)
                : null;

            string scaffoldTierPreference = avgHintLevel <= 0.3 ? "Autonomous"
                : avgHintLevel <= 1.2 ? "Tier1_Keywords"
                : avgHintLevel <= 2.2 ? "Tier2_Cloze"
                : "Tier3_FullSentence";

            string dominantWeaknessCategory = (particleErrors > 0 || profile.ParticleAccuracyRate < 70) ? "Particles"
                : profile.KeigoCommandScore < 65 ? "Keigo"
                : profile.SpeakingReflexIndex < 55 ? "Reflex_Latency"
                : "Vocabulary";

            string preferredTone = userMsgs.Any(t => t.Contains("存じます") || t.Contains("いたします") || t.Contains("参ります"))
                ? "Business_Keigo"
                : profile.KeigoCommandScore >= 60 ? "Polite_Teineigo" : "Casual_Friendly";

            double toneConsistencyScore = Math.Round(Math.Clamp(profile.KeigoCommandScore * 0.9 + 10.0, 50.0, 99.0), 1);

            string adaptivePathStatus = profile.HintDependencyRate <= 15 ? "Mastery_Autonomous"
                : profile.HintDependencyRate <= 45 ? "Fading_Assistance"
                : "Scaffold_Active";

            // Tìm kịch bản tối ưu tiếp theo cho người học dựa trên điểm yếu thực tế (Next Best Scenario Recommendation)
            var currentScenarioId = session?.ScenarioLevelConfiguration?.ScenarioId ?? 0;
            var availableScenarios = await _context.Scenarios
                .AsNoTracking()
                .Where(sc => sc.Id != currentScenarioId && sc.IsActive)
                .ToListAsync();

            Scenario? nextScenario = null;
            if (dominantWeaknessCategory == "Particles")
            {
                nextScenario = availableScenarios.FirstOrDefault(sc =>
                    (sc.ScenarioCode != null && (sc.ScenarioCode.Contains("RAMEN") || sc.ScenarioCode.Contains("TRANSIT") || sc.ScenarioCode.Contains("CAFE"))) ||
                    sc.Title.Contains("Ramen") || sc.Title.Contains("tàu") || sc.Title.Contains("đường"));
            }
            else if (dominantWeaknessCategory == "Keigo")
            {
                nextScenario = availableScenarios.FirstOrDefault(sc =>
                    (sc.ScenarioCode != null && (sc.ScenarioCode.Contains("BAITO") || sc.ScenarioCode.Contains("OFFICE"))) ||
                    sc.Title.Contains("phỏng vấn") || sc.Title.Contains("công sở"));
            }
            else if (dominantWeaknessCategory == "Reflex_Latency")
            {
                nextScenario = availableScenarios.FirstOrDefault(sc =>
                    (sc.ScenarioCode != null && (sc.ScenarioCode.Contains("KONBINI") || sc.ScenarioCode.Contains("CAFE"))) ||
                    sc.Title.Contains("tiện lợi") || sc.Title.Contains("Cafe"));
            }

            nextScenario ??= availableScenarios.OrderBy(sc => sc.Id).FirstOrDefault();

            int? nextScenarioId = nextScenario?.Id;
            string? nextScenarioCode = nextScenario?.ScenarioCode;
            string? nextScenarioTitle = nextScenario?.Title;

            string nextReason = dominantWeaknessCategory switch
            {
                "Particles" => "AI nhận thấy bạn cần củng cố phản xạ trợ từ (は/が/に) qua bối cảnh giao tiếp tự nhiên tiếp theo.",
                "Keigo" => "AI đề xuất luyện tập ngữ cảnh lịch sự chuẩn mực để nâng cao độ thành thạo Kính ngữ.",
                "Reflex_Latency" => "AI gợi ý thử sức với nhịp đàm thoại ngắn để rèn luyện tốc độ phản xạ tức thì.",
                _ => "Tiếp tục nâng cao vốn từ vựng và sự tự tin với bối cảnh đời sống thực tế mới."
            };

            double predictedSuccessRate = Math.Round(Math.Clamp(profile.CommunicativeConfidenceScore * 0.85 + 15.0, 65.0, 96.0), 1);

            string? existingAiCoachingRaw = null;
            if (!string.IsNullOrWhiteSpace(profile.InferredTraitsJson))
            {
                try
                {
                    using var existingDoc = JsonDocument.Parse(profile.InferredTraitsJson);
                    if (existingDoc.RootElement.ValueKind == JsonValueKind.Object
                        && existingDoc.RootElement.TryGetProperty("aiCoaching", out var aiNode))
                    {
                        existingAiCoachingRaw = aiNode.GetRawText();
                    }
                }
                catch { }
            }

            var serializedTraits = JsonSerializer.Serialize(new
            {
                strengths,
                weaknesses,
                hesitationRate,
                averageHesitationSeconds,
                scaffoldTierPreference,
                preferredTone,
                toneConsistencyScore,
                dominantWeaknessCategory,
                nextRecommendedScenarioId = nextScenarioId,
                nextRecommendedScenarioCode = nextScenarioCode,
                nextRecommendedScenarioTitle = nextScenarioTitle,
                nextRecommendedReason = nextReason,
                predictedSuccessRateNextScenario = predictedSuccessRate,
                adaptiveLearningPathStatus = adaptivePathStatus,
                estimatedJlptLevel,
                consecutiveFailCount,
                lastEvaluatedSessionId = sessionId,
                evaluatedAtUtc = DateTime.UtcNow
            });

            if (!string.IsNullOrWhiteSpace(existingAiCoachingRaw))
            {
                try
                {
                    var rootObj = System.Text.Json.Nodes.JsonNode.Parse(serializedTraits)?.AsObject();
                    var coachingNode = System.Text.Json.Nodes.JsonNode.Parse(existingAiCoachingRaw);
                    if (rootObj != null && coachingNode != null)
                    {
                        rootObj["aiCoaching"] = coachingNode;
                        serializedTraits = rootObj.ToJsonString();
                    }
                }
                catch { }
            }

            profile.InferredTraitsJson = serializedTraits;

            // 6. Kích hoạt cập nhật FSRS LearnerSkillMastery (Spaced Repetition Mastery Tracking)
            // Tải trước danh sách SkillMastery hiện có của user vào dictionary để tránh N+1 query và triệt tiêu lỗi duplicate key
            var existingMasteries = await _context.LearnerSkillMasteries
                .Where(m => m.UserId == userId)
                .ToListAsync();
            var masteryMap = existingMasteries
                .GroupBy(m => m.SkillCode, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            // (a) Duyệt qua các lỗi sai phát hiện E01-E10 trong phiên để ghi nhận Lapses
            var detectedErrorCodes = signals
                .Where(s => !string.IsNullOrWhiteSpace(s.DetectedRuleErrorCodes))
                .SelectMany(s => s.DetectedRuleErrorCodes!.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                .Distinct()
                .ToList();

            foreach (var rawCode in detectedErrorCodes)
            {
                var (code, name, category) = ResolveSkillInfo(rawCode);
                if (code.Length > 100) code = code[..100];
                if (name.Length > 200) name = name[..200];

                if (!masteryMap.TryGetValue(code, out var mastery))
                {
                    mastery = new LearnerSkillMastery
                    {
                        UserId = userId,
                        SkillCode = code,
                        SkillName = name,
                        Category = category,
                        Stability = 0.8,
                        Difficulty = 6.0,
                        Repetitions = 1,
                        Lapses = 1,
                        LastPracticedUtc = DateTime.UtcNow,
                        NextRecommendedReviewUtc = DateTime.UtcNow.AddHours(12)
                    };
                    _context.LearnerSkillMasteries.Add(mastery);
                    masteryMap[code] = mastery;
                }
                else
                {
                    mastery.Repetitions += 1;
                    mastery.Lapses += 1;
                    mastery.Difficulty = Math.Min(10.0, Math.Round(mastery.Difficulty + 0.5, 2));
                    mastery.Stability = Math.Max(0.5, Math.Round(mastery.Stability * 0.6, 2));
                    mastery.LastPracticedUtc = DateTime.UtcNow;
                    mastery.NextRecommendedReviewUtc = DateTime.UtcNow.AddDays(Math.Max(0.5, Math.Round(mastery.Stability * 0.8, 1)));
                }
            }

            // (b) Duyệt qua các Từ vựng & Ngữ pháp mục tiêu của kịch bản để cập nhật vòng đời FSRS
            var combinedUserText = string.Join(" ", userMsgs);
            if (session?.ScenarioLevelConfiguration?.TargetVocabularies != null)
            {
                var distinctVocabs = session.ScenarioLevelConfiguration.TargetVocabularies
                    .Where(v => !string.IsNullOrWhiteSpace(v.Word))
                    .GroupBy(v => v.Word.Trim(), StringComparer.OrdinalIgnoreCase)
                    .Select(g => g.First())
                    .ToList();

                foreach (var vocab in distinctVocabs)
                {
                    var cleanWord = System.Text.RegularExpressions.Regex.Replace(vocab.Word, @"[\(（].*?[\)）]", "").Trim();
                    bool userSpoke = combinedUserText.Contains(vocab.Word) ||
                                     (!string.IsNullOrWhiteSpace(cleanWord) && combinedUserText.Contains(cleanWord)) ||
                                     (!string.IsNullOrWhiteSpace(vocab.Reading) && combinedUserText.Contains(vocab.Reading));

                    var vCode = "VOCAB_" + vocab.Word.Trim();
                    if (vCode.Length > 100) vCode = vCode[..100];
                    var cleanVMeaning = CleanSkillMeaning(vocab.Meaning);
                    if (cleanVMeaning.Length > 120) cleanVMeaning = cleanVMeaning[..117].TrimEnd() + "...";
                    var vName = $"Từ vựng: {vocab.Word} ({cleanVMeaning})";
                    if (vName.Length > 200) vName = vName[..199] + ")";

                    if (!masteryMap.TryGetValue(vCode, out var vMastery))
                    {
                        vMastery = new LearnerSkillMastery
                        {
                            UserId = userId,
                            SkillCode = vCode,
                            SkillName = vName,
                            Category = "Vocabulary",
                            Stability = userSpoke ? 2.5 : 1.8,
                            Difficulty = userSpoke ? 3.5 : 4.5,
                            Repetitions = 1,
                            Lapses = 0,
                            LastPracticedUtc = DateTime.UtcNow,
                            NextRecommendedReviewUtc = userSpoke ? DateTime.UtcNow.AddDays(2) : DateTime.UtcNow.AddDays(1)
                        };
                        _context.LearnerSkillMasteries.Add(vMastery);
                        masteryMap[vCode] = vMastery;
                    }
                    else
                    {
                        vMastery.SkillName = vName;
                        vMastery.Repetitions += 1;
                        if (userSpoke)
                        {
                            vMastery.Difficulty = Math.Max(1.0, Math.Round(vMastery.Difficulty - 0.2, 2));
                            vMastery.Stability = Math.Max(2.5, Math.Min(100.0, Math.Round(vMastery.Stability * 1.5, 2)));
                            vMastery.Lapses = Math.Max(0, vMastery.Lapses - 1);
                            vMastery.LastPracticedUtc = DateTime.UtcNow;
                            vMastery.NextRecommendedReviewUtc = DateTime.UtcNow.AddDays(Math.Max(1.0, Math.Round(vMastery.Stability, 1)));
                        }
                        else
                        {
                            vMastery.LastPracticedUtc = DateTime.UtcNow;
                            vMastery.NextRecommendedReviewUtc = DateTime.UtcNow.AddHours(12);
                        }
                    }
                }
            }

            if (session?.ScenarioLevelConfiguration?.TargetGrammars != null)
            {
                var distinctGrammars = session.ScenarioLevelConfiguration.TargetGrammars
                    .Where(g => !string.IsNullOrWhiteSpace(g.Pattern) &&
                                !string.IsNullOrWhiteSpace(string.Concat(g.Pattern.Where(c => c != '～' && c != '~')).Trim()))
                    .GroupBy(g => string.Concat(g.Pattern.Where(c => c != '～' && c != '~')).Trim(), StringComparer.OrdinalIgnoreCase)
                    .Select(g => g.First())
                    .ToList();

                foreach (var grammar in distinctGrammars)
                {
                    var key = string.Concat(grammar.Pattern.Where(c => c != '～' && c != '~')).Trim();
                    if (string.IsNullOrWhiteSpace(key)) continue;
                    bool userSpoke = combinedUserText.Contains(key) ||
                                     (key == "をください" && (combinedUserText.Contains("をお願いします") || combinedUserText.Contains("ていただけますか"))) ||
                                     (key == "をお願いします" && combinedUserText.Contains("をください"));

                    var gCode = grammar.Id > 0 ? $"GRAMMAR_{grammar.Id}" : $"GRAMMAR_{key}";
                    if (gCode.Length > 100) gCode = gCode[..100];
                    var cleanGMeaning = CleanSkillMeaning(grammar.Meaning);
                    if (cleanGMeaning.Length > 120) cleanGMeaning = cleanGMeaning[..117].TrimEnd() + "...";
                    var gName = $"Ngữ pháp: {grammar.Pattern} ({cleanGMeaning})";
                    if (gName.Length > 200) gName = gName[..199] + ")";

                    if (!masteryMap.TryGetValue(gCode, out var gMastery))
                    {
                        gMastery = new LearnerSkillMastery
                        {
                            UserId = userId,
                            SkillCode = gCode,
                            SkillName = gName,
                            Category = "Grammar",
                            Stability = userSpoke ? 2.5 : 1.8,
                            Difficulty = userSpoke ? 3.5 : 4.5,
                            Repetitions = 1,
                            Lapses = 0,
                            LastPracticedUtc = DateTime.UtcNow,
                            NextRecommendedReviewUtc = userSpoke ? DateTime.UtcNow.AddDays(2) : DateTime.UtcNow.AddDays(1)
                        };
                        _context.LearnerSkillMasteries.Add(gMastery);
                        masteryMap[gCode] = gMastery;
                    }
                    else
                    {
                        gMastery.SkillName = gName;
                        gMastery.Repetitions += 1;
                        if (userSpoke)
                        {
                            gMastery.Difficulty = Math.Max(1.0, Math.Round(gMastery.Difficulty - 0.2, 2));
                            gMastery.Stability = Math.Max(2.5, Math.Min(100.0, Math.Round(gMastery.Stability * 1.4, 2)));
                            gMastery.Lapses = Math.Max(0, gMastery.Lapses - 1);
                            gMastery.LastPracticedUtc = DateTime.UtcNow;
                            gMastery.NextRecommendedReviewUtc = DateTime.UtcNow.AddDays(Math.Max(1.0, Math.Round(gMastery.Stability, 1)));
                        }
                        else
                        {
                            gMastery.LastPracticedUtc = DateTime.UtcNow;
                            gMastery.NextRecommendedReviewUtc = DateTime.UtcNow.AddHours(12);
                        }
                    }
                }
            }

            profile.UpdatedAtUtc = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }

        private static (string Code, string Name, string Category) ResolveSkillInfo(string rawCode)
        {
            return rawCode switch
            {
                "E01_INTRANSITIVE_WO" or "E01" => ("E01_INTRANSITIVE_WO", "Trợ từ を với tự động từ", "Grammar"),
                "E02_PLACE_DE_NI" or "E02" => ("E02_PLACE_DE_NI", "Trợ từ nơi chốn で vs に", "Grammar"),
                "E03_ANATA_OVERUSE" or "E03" => ("E03_ANATA_OVERUSE", "Lạm dụng đại từ あなた", "Pragmatics"),
                "E04_ANIMATE_ARU" => ("E04_ANIMATE_ARU", "Động từ tồn tại あります cho sinh vật", "Grammar"),
                "E04_INANIMATE_IRU" => ("E04_INANIMATE_IRU", "Động từ tồn tại います cho đồ vật", "Grammar"),
                "E04" => ("E04_ARU_IRU", "Động từ tồn tại あります vs います", "Grammar"),
                "E05_SHITTEIRU_DEKIRU" or "E05" => ("E05_SHITTEIRU_DEKIRU", "Phân biệt 知っています vs できます", "Vocabulary"),
                "E06_TA_DESHITA" or "E06" => ("E06_TA_DESHITA", "Chồng thì quá khứ たでした", "Grammar"),
                "E07_WATASHI_NI_AGEMASU" or "E07" => ("E07_WATASHI_NI_AGEMASU", "Động từ cho nhận 私にあげます", "Grammar"),
                "E08_SONKEIGO_SELF" => ("E08_SONKEIGO_SELF", "Tôn kính ngữ cho chính mình", "Pragmatics"),
                "E08_KENJOUGO_OTHER" => ("E08_KENJOUGO_OTHER", "Khiêm nhường ngữ cho đối phương", "Pragmatics"),
                "E08" => ("E08_KEIGO_CONFUSION", "Tôn kính ngữ & Khiêm nhường ngữ", "Pragmatics"),
                "E09_MISSING_DA_KARA" or "E09" => ("E09_MISSING_DA_KARA", "Cấu trúc nguyên nhân だから / なので", "Grammar"),
                "E10_TRANSPORT_NI_DE" or "E10" => ("E10_TRANSPORT_NI_DE", "Trợ từ phương tiện di chuyển に vs で", "Grammar"),
                "E11_BARE_NOUN_ORDER" or "E11" => ("E11_BARE_NOUN_ORDER", "Diễn đạt gọi món cộc lốc", "Pragmatics"),
                "E12_VERBLESS_ORDER" or "E12" => ("E12_VERBLESS_ORDER", "Đoản ngữ thiếu vị ngữ hoàn chỉnh", "Grammar"),
                "E13_KOTO_DESU_KA_POTENTIAL" or "E13" => ("E13_KOTO_DESU_KA_POTENTIAL", "Hỏi khả năng bằng thể nguyên mẫu", "Grammar"),
                "E14_OK_DESU_OVERUSE" or "E14" => ("E14_OK_DESU_OVERUSE", "Lạm dụng cụm 'OK / OKです'", "Pragmatics"),
                _ => (rawCode, CleanTechnicalCodeName(rawCode), "Grammar")
            };
        }

        private static string CleanTechnicalCodeName(string code)
        {
            if (string.IsNullOrWhiteSpace(code)) return "Quy tắc ngữ pháp";
            var clean = System.Text.RegularExpressions.Regex.Replace(code, @"^E\d+_", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            clean = clean.Replace("_", " ").Trim();
            return string.IsNullOrWhiteSpace(clean) ? "Quy tắc giao tiếp" : clean;
        }

        private static string CleanSkillMeaning(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
            var s = raw.Trim();
            if (s.Contains('•')) s = s.Split('•')[0].Trim();
            s = System.Text.RegularExpressions.Regex.Replace(s, @"\[.*?\]", "").Trim();
            s = System.Text.RegularExpressions.Regex.Replace(s, @"[\(（].*?[\)）]", "").Trim();
            return string.IsNullOrWhiteSpace(s) ? raw.Trim() : s;
        }

        public static async Task<int> CountCompletedStandardSessionsAsync(
            AppDbContext context,
            string userId,
            System.Threading.CancellationToken cancellationToken = default)
        {
            return await context.RoleplaySessions
                .AsNoTracking()
                .CountAsync(
                    s => s.UserId == userId && s.SessionType != "PlacementTest" && s.Status == "Completed",
                    cancellationToken);
        }

        public static async Task<System.Collections.Generic.List<(int OverallScore, bool PassStatus)>> GetRecentStandardResultsAsync(
            AppDbContext context,
            string userId,
            int take = 6,
            System.Threading.CancellationToken cancellationToken = default)
        {
            var rows = await (
                from r in context.RoleplayResults.AsNoTracking()
                join s in context.RoleplaySessions.AsNoTracking() on r.RoleplaySessionId equals s.Id into sj
                from s in sj.DefaultIfEmpty()
                where r.UserId == userId && (s == null || s.SessionType != "PlacementTest")
                orderby r.CompletedAt descending, r.Id descending
                select new { r.OverallScore, r.PassStatus })
                .Take(take)
                .ToListAsync(cancellationToken);

            return rows.Select(x => (x.OverallScore, x.PassStatus)).ToList();
        }

        public static double ComputeEffectiveAlignedProficiency(
            LearnerIntelligenceProfile profile,
            int totalCompletedStandardSessions)
        {
            return totalCompletedStandardSessions > 0
                ? ComputeAlignedProficiency(profile)
                : profile.CommunicativeProficiencyIndex;
        }

        public static double ComputeAlignedProficiency(LearnerIntelligenceProfile profile)
        {
            double moraNorm = Math.Clamp((profile.AverageMoraRate / 6.0) * 100.0, 18.0, 100.0);
            double autonomyScore = Math.Clamp(100.0 - profile.HintDependencyRate, 0.0, 100.0);
            return Math.Round((
                profile.SpeakingReflexIndex +
                profile.KeigoCommandScore +
                profile.ParticleAccuracyRate +
                moraNorm +
                profile.CommunicativeConfidenceScore +
                autonomyScore) / 6.0, 1);
        }

        public static (string Level, string Label) DeriveDynamicJlptDetails(
            double thetaEstimate,
            double proficiencyIndex,
            int consecutiveFailCount = 0)
        {
            if (proficiencyIndex >= 80.0 && thetaEstimate >= 1.2 && consecutiveFailCount < 2)
                return ("N3", "N3 (Thành thạo)");
            if (proficiencyIndex >= 72.0 && thetaEstimate >= 0.5 && consecutiveFailCount < 2)
                return ("N4", "N4 (Vững)");
            if (proficiencyIndex >= 62.0 && thetaEstimate >= 0.0 && consecutiveFailCount < 2)
                return ("N4", "N4 (Cơ bản)");
            if (proficiencyIndex >= 55.0 && consecutiveFailCount < 2)
                return ("N5", "N5 (Vững)");
            return ("N5", "N5 (Cơ bản)");
        }

        public static string DeriveDynamicJlptLevel(
            double thetaEstimate,
            double proficiencyIndex,
            int consecutiveFailCount = 0)
            => DeriveDynamicJlptDetails(thetaEstimate, proficiencyIndex, consecutiveFailCount).Level;
    }
}
