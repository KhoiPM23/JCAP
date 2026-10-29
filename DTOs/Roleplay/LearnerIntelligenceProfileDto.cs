using System;
using System.Collections.Generic;

namespace JCAP.DTOs.Roleplay
{
    /// <summary>
    /// DTO bề mặt hồ sơ năng lực và phản xạ giao tiếp ngầm (TikTok-style Linguistic Intelligence Radar)
    /// </summary>
    public class LearnerIntelligenceProfileDto
    {
        public string UserId { get; set; } = string.Empty;

        /// <summary>
        /// Ước lượng năng lực ngôn ngữ theo thuyết IRT (-3.0 đến +3.0)
        /// </summary>
        public double ThetaEstimate { get; set; }

        /// <summary>
        /// Chỉ số phản xạ giao tiếp (0-100)
        /// </summary>
        public double SpeakingReflexIndex { get; set; }

        /// <summary>
        /// Điểm làm chủ Kính ngữ / Thể lịch sự (0-100)
        /// </summary>
        public double KeigoCommandScore { get; set; }

        /// <summary>
        /// Tỉ lệ chính xác trợ từ (0-100%)
        /// </summary>
        public double ParticleAccuracyRate { get; set; }

        /// <summary>
        /// Tốc độ phát âm trung bình (Mora/giây, chuẩn Tokyo ~6.5 - 7.5)
        /// </summary>
        public double AverageMoraRate { get; set; }

        /// <summary>
        /// Tỉ lệ phụ thuộc gợi ý (0-100%)
        /// </summary>
        public double HintDependencyRate { get; set; }

        /// <summary>
        /// Điểm tự tin giao tiếp tổng hợp (0-100)
        /// </summary>
        public double CommunicativeConfidenceScore { get; set; }

        /// <summary>
        /// Chỉ số thành thạo giao tiếp (0-100)
        /// </summary>
        public double CommunicativeProficiencyIndex { get; set; }

        /// <summary>
        /// Tổng số phiên hội thoại đã hoàn thành
        /// </summary>
        public int TotalSessionsCompleted { get; set; }

        /// <summary>
        /// Tổng số lượt nói đã thực hiện
        /// </summary>
        public int TotalPracticeTurns { get; set; }

        /// <summary>
        /// Danh sách điểm mạnh đúc kết
        /// </summary>
        public List<string> Strengths { get; set; } = new();

        /// <summary>
        /// Danh sách điểm cần tôi luyện thêm
        /// </summary>
        public List<string> TargetFocusAreas { get; set; } = new();

        /// <summary>
        /// Xếp hạng quẻ Omikuji hiện tại (Dai-kichi, Chu-kichi, Kichi)
        /// </summary>
        public string OmikujiRank { get; set; } = "Kichi";

        /// <summary>
        /// Câu tục ngữ / Kotowaza truyền cảm hứng
        /// </summary>
        public string KotowazaProverb { get; set; } = "継続は力なり (Kiên trì ắt thành công)";

        public DateTime? LastPracticedAtUtc { get; set; }
    }
}

