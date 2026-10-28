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
            var profile = await _context.LearnerIntelligenceProfiles
                .FirstOrDefaultAsync(p => p.UserId == userId);

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
                await _context.SaveChangesAsync();
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

            profile.UpdatedAtUtc = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }
    }
}
