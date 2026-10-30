using System.Threading.Tasks;
using JCAP.Models;

namespace JCAP.Services.Interfaces
{
    public class TurnTelemetryInput
    {
        public int SessionId { get; set; }
        public string UserId { get; set; } = null!;
        public int TurnIndex { get; set; }
        public int LatencyMs { get; set; }
        public double PauseRatio { get; set; }
        public double MoraRate { get; set; }
        public int HintLevelUsed { get; set; }
        public int TranslationPeekCount { get; set; }
        public int RetryCount { get; set; }
        public bool FallbackToTextInput { get; set; }
        public bool BargeInInterrupted { get; set; }
        public string? JapaneseSpoken { get; set; }
        public double TurnScore { get; set; }
    }

    public class DynamicScaffoldingDecision
    {
        public double SpeedScale { get; set; } = 1.0; // 0.85 (chậm lại), 1.0 (chuẩn), 1.15 (tăng tốc)
        public string PromptModifier { get; set; } = string.Empty;
        public int RecommendedHintLevel { get; set; } = 1;
        public bool ShouldOfferEncouragement { get; set; }
    }

    public interface ITelemetryEvaluatorService
    {
        /// <summary>
        /// Ghi nhận tín hiệu hành vi một lượt nói và tính toán điều chỉnh độ khó động (Dynamic Scaffolding / DDA)
        /// </summary>
        Task<DynamicScaffoldingDecision> RecordAndEvaluateTurnAsync(TurnTelemetryInput input);

        /// <summary>
        /// Lấy hoặc khởi tạo Profile trí tuệ học viên ngầm
        /// </summary>
        Task<LearnerIntelligenceProfile> GetOrCreateProfileAsync(string userId);

        /// <summary>
        /// Đồng bộ cập nhật chỉ số trí tuệ sau khi kết thúc một phiên hội thoại
        /// </summary>
        Task FinalizeSessionTelemetryAsync(int sessionId, string userId);
    }
}
