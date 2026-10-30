using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace JCAP.Models
{
    /// <summary>
    /// Lưu trữ hồ sơ năng lực và thói quen hội thoại ngầm của học viên (TikTok-style implicit profile).
    /// Các chỉ số được cập nhật liên tục sau mỗi lượt nói mà không cần khảo sát người dùng.
    /// </summary>
    public class LearnerIntelligenceProfile
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string UserId { get; set; } = null!;

        [ForeignKey(nameof(UserId))]
        public virtual ApplicationUser? User { get; set; }

        /// <summary>
        /// Ước lượng năng lực ngôn ngữ theo thuyết IRT (Item Response Theory: -3.0 đến +3.0)
        /// </summary>
        public double ThetaEstimate { get; set; } = 0.0;

        /// <summary>
        /// Chỉ số phản xạ giao tiếp (0-100), tính từ độ trễ phản hồi (Response Latency)
        /// </summary>
        public double SpeakingReflexIndex { get; set; } = 50.0;

        /// <summary>
        /// Điểm sử dụng Kính ngữ / Thể lịch sự (0-100)
        /// </summary>
        public double KeigoCommandScore { get; set; } = 50.0;

        /// <summary>
        /// Tỉ lệ chính xác trợ từ tiếng Nhật (0-100%)
        /// </summary>
        public double ParticleAccuracyRate { get; set; } = 70.0;

        /// <summary>
        /// Tốc độ nói trung bình (Mora per second: âm/giây, chuẩn người bản xứ ~6.5 - 7.5, người học ~3.0 - 5.0)
        /// </summary>
        public double AverageMoraRate { get; set; } = 3.5;

        /// <summary>
        /// Tỉ lệ phụ thuộc vào gợi ý (0-100%)
        /// </summary>
        public double HintDependencyRate { get; set; } = 20.0;

        /// <summary>
        /// Điểm tự tin giao tiếp tổng hợp (Communicative Confidence Score: 0-100)
        /// </summary>
        public double CommunicativeConfidenceScore { get; set; } = 60.0;

        /// <summary>
        /// Điểm thành thạo giao tiếp (Communicative Proficiency Index: 0-100)
        /// </summary>
        public double CommunicativeProficiencyIndex { get; set; } = 50.0;

        /// <summary>
        /// Chuỗi JSON lưu các đặc trưng cá nhân hoá đã suy luận (điểm yếu trợ từ, sở thích, chủ đề ưa thích)
        /// </summary>
        public string InferredTraitsJson { get; set; } = "{}";

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    }
}
