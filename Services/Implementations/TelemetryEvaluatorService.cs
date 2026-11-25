using System;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using JCAP.Data;
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
            _context.LearnerBehaviorSignals.Add(signal);
            await _context.SaveChangesAsync();

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
            else if (input.LatencyMs < 1800 && input.HintLevelUsed == 0 && input.TranslationPeekCount == 0 && input.TurnScore >= 85)
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

            if (signals.Count == 0) return;

            var profile = await GetOrCreateProfileAsync(userId);

            // Cập nhật điểm tự tin (Communicative Confidence Score)
            // CCS giảm nếu độ trễ cao, phụ thuộc hint nhiều, hoặc lặp lại nhiều lần
            double avgLatencySec = signals.Average(s => s.LatencyMs) / 1000.0;
            double avgHintLevel = signals.Average(s => s.HintLevelUsed);
            double avgRetries = signals.Average(s => s.RetryCount);

            double reflexScore = Math.Clamp(100.0 - (avgLatencySec * 15.0), 10.0, 100.0);
            double hintPenalty = avgHintLevel * 12.0;
            double retryPenalty = avgRetries * 8.0;

            double calculatedCcs = Math.Clamp(reflexScore - hintPenalty - retryPenalty + (signals.Average(s => s.TurnScore) * 0.3), 10.0, 99.0);

            // Cập nhật EMA (Exponential Moving Average) 80% cũ, 20% mới
            profile.SpeakingReflexIndex = Math.Round(profile.SpeakingReflexIndex * 0.8 + reflexScore * 0.2, 1);
            profile.CommunicativeConfidenceScore = Math.Round(profile.CommunicativeConfidenceScore * 0.8 + calculatedCcs * 0.2, 1);

            double avgScore = signals.Average(s => s.TurnScore);
            profile.CommunicativeProficiencyIndex = Math.Round(profile.CommunicativeProficiencyIndex * 0.8 + avgScore * 0.2, 1);

            double avgMora = signals.Where(s => s.MoraRate > 0).Select(s => s.MoraRate).DefaultIfEmpty(3.5).Average();
            profile.AverageMoraRate = Math.Round(profile.AverageMoraRate * 0.8 + avgMora * 0.2, 2);

            // 1. Cập nhật ParticleAccuracyRate (Độ chuẩn trợ từ dựa trên quét lỗi E01)
            int particleErrors = signals.Count(s => !string.IsNullOrEmpty(s.DetectedRuleErrorCodes) && s.DetectedRuleErrorCodes.Contains("E01"));
            double sessionParticleAccuracy = Math.Clamp(100.0 - (particleErrors / (double)signals.Count * 50.0), 30.0, 100.0);
            profile.ParticleAccuracyRate = Math.Round(profile.ParticleAccuracyRate * 0.8 + sessionParticleAccuracy * 0.2, 1);

            // 2. Cập nhật HintDependencyRate
            double sessionHintDep = Math.Clamp(avgHintLevel * 33.3, 0.0, 100.0);
            profile.HintDependencyRate = Math.Round(profile.HintDependencyRate * 0.8 + sessionHintDep * 0.2, 1);

            // 3. Tải thông tin Session & Scenario để suy luận SocialRegister phù hợp
            var session = await _context.RoleplaySessions
                .AsSplitQuery()
                .Include(s => s.ScenarioLevelConfiguration)
                    .ThenInclude(c => c!.TargetVocabularies)
                .Include(s => s.ScenarioLevelConfiguration)
                    .ThenInclude(c => c!.TargetGrammars)
                .FirstOrDefaultAsync(s => s.Id == sessionId);

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
            var userMsgs = await _context.RoleplayMessages
                .Where(m => m.RoleplaySessionId == sessionId && m.Sender == "User")
                .Select(m => m.JapaneseText)
                .ToListAsync();
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
                profile.KeigoCommandScore = Math.Round(profile.KeigoCommandScore * 0.8 + sessionKeigoScore * 0.2, 1);
            }

            // 5. Ước lượng Theta (IRT Communicative Ability: -3.0 .. +3.0)
            string jlpt = session?.ScenarioLevelConfiguration?.JLPTLevel ?? "N5";
            double jlptWeight = jlpt == "N3" ? 2.5 : jlpt == "N4" ? 1.5 : 0.5;
            double estimatedTheta = Math.Clamp((avgScore - 70.0) / 25.0 + (jlptWeight - 1.0), -2.5, 2.8);
            profile.ThetaEstimate = Math.Round(profile.ThetaEstimate * 0.8 + estimatedTheta * 0.2, 2);

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
            int hesitationTurns = signals.Count(s => s.LatencyMs > 4500);
            double hesitationRate = signals.Count > 0 ? Math.Round((hesitationTurns / (double)signals.Count) * 100.0, 1) : 0.0;
            double averageHesitationSeconds = Math.Round(avgLatencySec, 2);

            string scaffoldTierPreference = avgHintLevel <= 0.3 ? "Autonomous"
                : avgHintLevel <= 1.2 ? "Tier1_Keywords"
                : avgHintLevel <= 2.2 ? "Tier2_Cloze"
                : "Tier3_FullSentence";

            string dominantWeaknessCategory = particleErrors > 0 ? "Particles"
                : profile.KeigoCommandScore < 60 ? "Keigo"
                : profile.SpeakingReflexIndex < 50 ? "Reflex_Latency"
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
            string nextScenarioCode = nextScenario?.ScenarioCode ?? "SCN_CAFE_01";
            string nextScenarioTitle = nextScenario?.Title ?? "Gọi đồ uống tại Quán Cafe Shibuya";

            string nextReason = dominantWeaknessCategory switch
            {
                "Particles" => "AI nhận thấy bạn cần củng cố phản xạ trợ từ (は/が/に) qua bối cảnh giao tiếp tự nhiên tiếp theo.",
                "Keigo" => "AI đề xuất luyện tập ngữ cảnh lịch sự chuẩn mực để nâng cao độ thành thạo Kính ngữ.",
                "Reflex_Latency" => "AI gợi ý thử sức với nhịp đàm thoại ngắn để rèn luyện tốc độ phản xạ tức thì.",
                _ => "Tiếp tục nâng cao vốn từ vựng và sự tự tin với bối cảnh đời sống thực tế mới."
            };

            double predictedSuccessRate = Math.Round(Math.Clamp(profile.CommunicativeConfidenceScore * 0.85 + 15.0, 65.0, 96.0), 1);

            profile.InferredTraitsJson = JsonSerializer.Serialize(new
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
                lastEvaluatedSessionId = sessionId,
                evaluatedAtUtc = DateTime.UtcNow
            });

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
                    bool userSpoke = combinedUserText.Contains(vocab.Word) ||
                                     (!string.IsNullOrWhiteSpace(vocab.Reading) && combinedUserText.Contains(vocab.Reading));

                    var vCode = "VOCAB_" + vocab.Word.Trim();
                    if (vCode.Length > 100) vCode = vCode[..100];
                    var vName = $"Từ vựng: {vocab.Word} ({vocab.Meaning})";
                    if (vName.Length > 200) vName = vName[..200];

                    if (!masteryMap.TryGetValue(vCode, out var vMastery))
                    {
                        vMastery = new LearnerSkillMastery
                        {
                            UserId = userId,
                            SkillCode = vCode,
                            SkillName = vName,
                            Category = "Vocabulary",
                            Stability = userSpoke ? 2.5 : 1.0,
                            Difficulty = userSpoke ? 3.5 : 5.0,
                            Repetitions = 1,
                            Lapses = userSpoke ? 0 : 1,
                            LastPracticedUtc = DateTime.UtcNow,
                            NextRecommendedReviewUtc = userSpoke ? DateTime.UtcNow.AddDays(2) : DateTime.UtcNow.AddHours(4)
                        };
                        _context.LearnerSkillMasteries.Add(vMastery);
                        masteryMap[vCode] = vMastery;
                    }
                    else
                    {
                        vMastery.Repetitions += 1;
                        if (userSpoke)
                        {
                            vMastery.Difficulty = Math.Max(1.0, Math.Round(vMastery.Difficulty - 0.2, 2));
                            vMastery.Stability = Math.Min(100.0, Math.Round(vMastery.Stability * 1.5, 2));
                            vMastery.LastPracticedUtc = DateTime.UtcNow;
                            vMastery.NextRecommendedReviewUtc = DateTime.UtcNow.AddDays(Math.Max(1.0, Math.Round(vMastery.Stability, 1)));
                        }
                        else
                        {
                            vMastery.Lapses += 1;
                            vMastery.LastPracticedUtc = DateTime.UtcNow;
                            vMastery.NextRecommendedReviewUtc = DateTime.UtcNow.AddHours(6);
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
                    bool userSpoke = combinedUserText.Contains(key);

                    var gCode = grammar.Id > 0 ? $"GRAMMAR_{grammar.Id}" : $"GRAMMAR_{key}";
                    if (gCode.Length > 100) gCode = gCode[..100];
                    var gName = $"Ngữ pháp: {grammar.Pattern} ({grammar.Meaning})";
                    if (gName.Length > 200) gName = gName[..200];

                    if (!masteryMap.TryGetValue(gCode, out var gMastery))
                    {
                        gMastery = new LearnerSkillMastery
                        {
                            UserId = userId,
                            SkillCode = gCode,
                            SkillName = gName,
                            Category = "Grammar",
                            Stability = userSpoke ? 2.5 : 1.0,
                            Difficulty = userSpoke ? 3.5 : 5.0,
                            Repetitions = 1,
                            Lapses = userSpoke ? 0 : 1,
                            LastPracticedUtc = DateTime.UtcNow,
                            NextRecommendedReviewUtc = userSpoke ? DateTime.UtcNow.AddDays(2) : DateTime.UtcNow.AddHours(4)
                        };
                        _context.LearnerSkillMasteries.Add(gMastery);
                        masteryMap[gCode] = gMastery;
                    }
                    else
                    {
                        gMastery.Repetitions += 1;
                        if (userSpoke)
                        {
                            gMastery.Difficulty = Math.Max(1.0, Math.Round(gMastery.Difficulty - 0.2, 2));
                            gMastery.Stability = Math.Min(100.0, Math.Round(gMastery.Stability * 1.4, 2));
                            gMastery.LastPracticedUtc = DateTime.UtcNow;
                            gMastery.NextRecommendedReviewUtc = DateTime.UtcNow.AddDays(Math.Max(1.0, Math.Round(gMastery.Stability, 1)));
                        }
                        else
                        {
                            gMastery.Lapses += 1;
                            gMastery.LastPracticedUtc = DateTime.UtcNow;
                            gMastery.NextRecommendedReviewUtc = DateTime.UtcNow.AddHours(6);
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
                "E01_INTRANSITIVE_WO" or "E01" => ("E01_INTRANSITIVE_WO", "Trợ từ を với tự động từ (E01)", "Grammar"),
                "E02_PLACE_DE_NI" or "E02" => ("E02_PLACE_DE_NI", "Trợ từ tồn tại で vs に (E02)", "Grammar"),
                "E03_ANATA_OVERUSE" or "E03" => ("E03_ANATA_OVERUSE", "Đại từ xưng hô あなた (E03)", "Pragmatics"),
                "E04_ANIMATE_ARU" => ("E04_ANIMATE_ARU", "Động từ tồn tại あります cho sinh vật (E04)", "Grammar"),
                "E04_INANIMATE_IRU" => ("E04_INANIMATE_IRU", "Động từ tồn tại います cho đồ vật (E04)", "Grammar"),
                "E04" => ("E04_ARU_IRU", "Động từ tồn tại あります vs います (E04)", "Grammar"),
                "E05_SHITTEIRU_DEKIRU" or "E05" => ("E05_SHITTEIRU_DEKIRU", "Phân biệt 知っています vs できます (E05)", "Vocabulary"),
                "E06_TA_DESHITA" or "E06" => ("E06_TA_DESHITA", "Hậu tố quá khứ たでした (E06)", "Grammar"),
                "E07_WATASHI_NI_AGEMASU" or "E07" => ("E07_WATASHI_NI_AGEMASU", "Động từ cho nhận 私にあげます (E07)", "Grammar"),
                "E08_SONKEIGO_SELF" => ("E08_SONKEIGO_SELF", "Lẫn lộn Tôn kính ngữ cho bản thân (E08)", "Pragmatics"),
                "E08_KENJOUGO_OTHER" => ("E08_KENJOUGO_OTHER", "Lẫn lộn Khiêm nhường ngữ cho đối phương (E08)", "Pragmatics"),
                "E08" => ("E08_KEIGO_CONFUSION", "Tôn kính ngữ & Khiêm nhường ngữ (E08)", "Pragmatics"),
                "E09_MISSING_DA_KARA" or "E09" => ("E09_MISSING_DA_KARA", "Cấu trúc nguyên nhân だから / なので (E09)", "Grammar"),
                "E10_TRANSPORT_NI_DE" or "E10" => ("E10_TRANSPORT_NI_DE", "Trợ từ phương tiện di chuyển に vs で (E10)", "Grammar"),
                _ => (rawCode, $"Quy tắc giao tiếp ({rawCode})", "Grammar")
            };
        }
    }
}
