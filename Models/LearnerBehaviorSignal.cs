using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace JCAP.Models
{
    /// <summary>
    /// Ghi nhận tín hiệu hành vi hội thoại chi tiết của người học trên từng lượt (Turn-level Telemetry S1..S12)
    /// </summary>
    public class LearnerBehaviorSignal
    {
        [Key]
        public long Id { get; set; }

        public int SessionId { get; set; }

        [ForeignKey(nameof(SessionId))]
        public virtual RoleplaySession? Session { get; set; }

        public int TurnIndex { get; set; }

        /// <summary>
        /// S1: Độ trễ phản hồi (ms) tính từ khi AI dứt câu đến khi người học bắt đầu nói
        /// </summary>
        public int LatencyMs { get; set; }

        /// <summary>
        /// S2: Tỉ lệ ngập ngừng/ngừng nghỉ (Pause ratio trong câu nói)
        /// </summary>
        public double PauseRatio { get; set; }

        /// <summary>
        /// S3: Tốc độ phát âm (Mora rate: âm/giây)
        /// </summary>
        public double MoraRate { get; set; }

        /// <summary>
        /// S4: Mức độ xem gợi ý (0 = không xem, 1 = keywords, 2 = cloze, 3 = full model)
        /// </summary>
        public int HintLevelUsed { get; set; }

        /// <summary>
        /// S5: Số lần bấm xem bản dịch tiếng Việt
        /// </summary>
        public int TranslationPeekCount { get; set; }

        /// <summary>
        /// S6: Số lần huỷ và ghi âm lại lượt này (Self-correction / retry)
        /// </summary>
        public int RetryCount { get; set; }

        /// <summary>
        /// S7: Đang dùng nhập phím thay vì nói bằng giọng (0 = Voice, 1 = Keyboard)
        /// </summary>
        public bool FallbackToTextInput { get; set; }

        /// <summary>
        /// S8: Có ngắt lời AI sớm không (Barge-in: true nếu nói chèn khi AI chưa dứt)
        /// </summary>
        public bool BargeInInterrupted { get; set; }

        /// <summary>
        /// S9: Danh sách mã lỗi ngữ pháp/trợ từ phát hiện nhanh (phân cách dấu phẩy, VD: "E01,E02")
        /// </summary>
        [MaxLength(200)]
        public string? DetectedRuleErrorCodes { get; set; }

        /// <summary>
        /// S10: Điểm phát âm/lưu loát của lượt (0-100)
        /// </summary>
        public double TurnScore { get; set; }

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    }
}
