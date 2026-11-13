using System;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Nguồn chân lý duy nhất (Single Source of Truth) cho toàn bộ quy tắc:
    /// - Giá trợ giúp (Soi nghĩa, Gợi ý 3 cấp)
    /// - Trần điểm thành phần theo lượt
    /// - Đường cong phản xạ công bằng theo cấp JLPT
    /// - Tam giác Tự chủ: (A) Trung bình sòng phẳng, (B) Hoàn phí nỗ lực biến tấu 50%, (C) Vé soi nghĩa liên phiên
    /// </summary>
    public static class AssistancePolicy
    {
        // ---------------------------------------------------------
        // 1. BẢNG GIÁ SOI NGHĨA (TRANSLATION PEEK)
        // ---------------------------------------------------------
        public const int FreePeekQuotaPerSession = 1;
        public const int PeekPenaltySubsequent = 5;
        public const int MaxPeekPenaltyPerSession = 20;

        /// <summary>
        /// Tính mức phạt tự chủ khi xem bản dịch tiếng Việt của câu AI.
        /// Lần đầu trong phiên: 0đ. Từ lần 2: 5đ. Tối đa cả phiên trừ 20đ.
        /// </summary>
        public static int CalculatePeekPenalty(int currentPeekCountInSession, bool hasUsedFreeQuota)
        {
            if (!hasUsedFreeQuota || currentPeekCountInSession <= 1)
            {
                return 0;
            }

            int penalty = (currentPeekCountInSession - 1) * PeekPenaltySubsequent;
            return Math.Min(penalty, MaxPeekPenaltyPerSession);
        }

        // ---------------------------------------------------------
        // 2. BẢNG GIÁ GỢI Ý ĐA CẤP (GRADUATED HINTS)
        // ---------------------------------------------------------
        // Cấp 1: Ý tưởng tiếng Việt (Concept / Active Recall)
        public const int HintTier1PenaltyFirst = 0;
        public const int HintTier1PenaltySubsequent = 10;
        public const int HintTier1CeilingFirst = 90;
        public const int HintTier1CeilingSubsequent = 85;

        // Cấp 2: Từ khóa cốt lõi (Keywords)
        public const int HintTier2PenaltyFirst = 15;
        public const int HintTier2PenaltySubsequent = 30;
        public const int HintTier2CeilingFirst = 80;
        public const int HintTier2CeilingSubsequent = 70;

        // Cấp 3: Trọn câu mẫu Tokyo (Full Model Utterance)
        public const int HintTier3PenaltyFirst = 40;
        public const int HintTier3PenaltySubsequent = 60;
        public const int HintTier3CeilingFirst = 60;
        public const int HintTier3CeilingSubsequent = 50;

        public static (int Penalty, int Ceiling) GetHintTierCost(int tier, int timesTierUsedInSession)
        {
            bool isFirstTime = timesTierUsedInSession <= 1;

            return tier switch
            {
                1 => (isFirstTime ? HintTier1PenaltyFirst : HintTier1PenaltySubsequent,
                      isFirstTime ? HintTier1CeilingFirst : HintTier1CeilingSubsequent),
                2 => (isFirstTime ? HintTier2PenaltyFirst : HintTier2PenaltySubsequent,
                      isFirstTime ? HintTier2CeilingFirst : HintTier2CeilingSubsequent),
                3 => (isFirstTime ? HintTier3PenaltyFirst : HintTier3PenaltySubsequent,
                      isFirstTime ? HintTier3CeilingFirst : HintTier3CeilingSubsequent),
                _ => (0, 100)
            };
        }

        // ---------------------------------------------------------
        // 3. TAM GIÁC TỰ CHỦ — TRỤ CỘT B: HOÀN PHÍ NỖ LỰC BIẾN TẤU (EFFORT REBATE)
        // ---------------------------------------------------------
        /// <summary>
        /// Khi học viên mở gợi ý Cấp 2 hoặc Cấp 3, nhưng câu nói thực tế khác biệt câu mẫu
        /// (similarity < 0.60), học viên được hoàn lại 50% mức phạt tự chủ của lượt đó.
        /// </summary>
        public static (int FinalPenalty, bool IsRebateApplied) ApplyEffortRebate(
            int rawPenalty,
            int hintTier,
            double similarityToSample)
        {
            // Chỉ áp dụng hoàn phí cho Cấp 2 và Cấp 3 (nơi có câu mẫu/từ khóa để đối chiếu)
            if (hintTier < 2 || rawPenalty <= 0)
            {
                return (rawPenalty, false);
            }

            // Nếu mức độ trùng lặp < 60% (học viên đã tự triển khai cách diễn đạt riêng)
            if (similarityToSample < 0.60)
            {
                int rebatedPenalty = (int)Math.Round(rawPenalty * 0.5, MidpointRounding.AwayFromZero);
                return (rebatedPenalty, true);
            }

            return (rawPenalty, false);
        }

        // ---------------------------------------------------------
        // 4. TAM GIÁC TỰ CHỦ — TRỤ CỘT C: VÉ SOI NGHĨA DỰ PHÒNG (CROSS-SESSION TOKEN)
        // ---------------------------------------------------------
        public const int RequiredStreakForBonusToken = 3;

        /// <summary>
        /// Kiểm tra xem học viên có đạt điều kiện nhận thêm Vé soi nghĩa dự phòng hay không.
        /// Điều kiện: chuỗi tự lực liên tiếp trong phiên >= 3 lượt.
        /// </summary>
        public static bool QualifiesForBonusPeekToken(int maxConsecutiveSelfRelianceStreak)
        {
            return maxConsecutiveSelfRelianceStreak >= RequiredStreakForBonusToken;
        }

        // ---------------------------------------------------------
        // 5. ĐƯỜNG CONG PHẢN XẠ CÔNG BẰNG THEO JLPT (REFLEX BUFFER & DECAY)
        // ---------------------------------------------------------
        /// <summary>
        /// Tính điểm phản xạ dựa trên độ trễ thực tế (đã trừ thời gian đọc gợi ý/soi nghĩa).
        /// Có vùng đệm 100đ theo cấp: N5 <= 5s, N4 <= 4s, N3 <= 3s.
        /// Sau vùng đệm, điểm giảm tuyến tính dần về mức sàn 50đ tại mốc 20s.
        /// </summary>
        public static int CalculateReflexScore(double latencySeconds, string? jlptLevel)
        {
            double safeLatency = Math.Max(0.0, latencySeconds);
            string level = (jlptLevel ?? "N5").ToUpperInvariant().Trim();

            // Vùng đệm 100đ
            double bufferSeconds = level switch
            {
                "N3" => 3.0,
                "N4" => 4.0,
                _ => 5.0 // Mặc định N5
            };

            if (safeLatency <= bufferSeconds)
            {
                return 100;
            }

            // Mốc chạm sàn 50đ tại 20s
            const double floorSeconds = 20.0;
            const int floorScore = 50;

            if (safeLatency >= floorSeconds)
            {
                return floorScore;
            }

            // Tuyến tính suy giảm từ 100 về 50 trong khoảng (bufferSeconds -> 20.0s)
            double decayProgress = (safeLatency - bufferSeconds) / (floorSeconds - bufferSeconds);
            int calculatedScore = 100 - (int)Math.Round(decayProgress * (100 - floorScore));

            return Math.Clamp(calculatedScore, floorScore, 100);
        }

        // ---------------------------------------------------------
        // 6. PHÂN LOẠI LƯỢT NÓI / GÕ (HYBRID SPOKEN SHARE)
        // ---------------------------------------------------------
        public const double SpokenShareFullThreshold = 0.60;   // >= 60% tính là lượt nói chuẩn
        public const double SpokenShareMinThreshold = 0.20;    // < 20% tính là lượt gõ thuần

        public static (string Modality, bool IncludeInOralMetrics, double Weight) EvaluateModality(double spokenShare)
        {
            if (spokenShare >= SpokenShareFullThreshold)
            {
                return ("spoken", true, 1.0);
            }

            if (spokenShare >= SpokenShareMinThreshold)
            {
                return ("hybrid", true, spokenShare);
            }

            return ("typed", false, 0.0);
        }
    }
}

