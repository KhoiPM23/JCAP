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

        /// <summary>
        /// Tần suất ngập ngừng khi bắt đầu nói (> 4.5s) (0-100%)
        /// </summary>
        public double HesitationRate { get; set; } = 0.0;

        /// <summary>
        /// Thời gian ngập ngừng / suy nghĩ trung bình trước khi phản xạ (giây)
        /// </summary>
        public double AverageHesitationSeconds { get; set; } = 0.0;

        /// <summary>
        /// Cấp độ giàn giáo người học thường phụ thuộc nhất (Tier1_Keywords, Tier2_Cloze, Tier3_FullSentence, Autonomous)
        /// </summary>
        public string ScaffoldTierPreference { get; set; } = "Autonomous";

        /// <summary>
        /// Phong cách đàm thoại nổi trội (Polite_Teineigo, Business_Keigo, Casual_Friendly)
        /// </summary>
        public string PreferredTone { get; set; } = "Polite_Teineigo";

        /// <summary>
        /// Độ nhất quán văn phong và kính ngữ (0-100%)
        /// </summary>
        public double ToneConsistencyScore { get; set; } = 80.0;

        /// <summary>
        /// Vùng ma sát lớn nhất cản trở người học (Particles, Keigo, Reflex_Latency, Vocabulary)
        /// </summary>
        public string DominantWeaknessCategory { get; set; } = "Particles";

        /// <summary>
        /// ID kịch bản tiếp theo AI đề xuất dựa trên điểm yếu vừa phát hiện (TikTok-style Next Best Trajectory)
        /// </summary>
        public int? NextRecommendedScenarioId { get; set; }

        /// <summary>
        /// Mã code kịch bản tiếp theo AI đề xuất
        /// </summary>
        public string? NextRecommendedScenarioCode { get; set; }

        /// <summary>
        /// Tên kịch bản tiếp theo AI đề xuất
        /// </summary>
        public string? NextRecommendedScenarioTitle { get; set; }

        /// <summary>
        /// Lý do AI đề xuất kịch bản này (chiều chuộng và định hướng mục tiêu cá nhân)
        /// </summary>
        public string? NextRecommendedReason { get; set; }

        /// <summary>
        /// Xác suất thành công dự báo cho kịch bản tiếp theo (0-100%)
        /// </summary>
        public double PredictedSuccessRateNextScenario { get; set; } = 85.0;

        /// <summary>
        /// Trạng thái giàn giáo thích ứng hiện tại (Scaffold_Active, Fading_Assistance, Mastery_Autonomous)
        /// </summary>
        public string AdaptiveLearningPathStatus { get; set; } = "Fading_Assistance";

        /// <summary>
        /// Danh sách kỹ năng / từ vựng cần ôn tập hoặc vừa củng cố theo thuật toán FSRS
        /// </summary>
        public List<LearnerSkillMasteryItemDto> DueReviewItems { get; set; } = new();
    }

    /// <summary>
    /// Bản ghi đo lường FSRS của một kỹ năng hoặc từ vựng
    /// </summary>
    public class LearnerSkillMasteryItemDto
    {
        public string SkillCode { get; set; } = string.Empty;
        public string SkillName { get; set; } = string.Empty;
        public string Category { get; set; } = "Grammar";
        public double Stability { get; set; }
        public double Difficulty { get; set; }
        public int Repetitions { get; set; }
        public int Lapses { get; set; }
        public DateTime NextRecommendedReviewUtc { get; set; }
        public bool IsDueForReview { get; set; }
    }
}
