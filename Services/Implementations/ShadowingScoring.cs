namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Công thức chấm điểm Shadowing DUY NHẤT của hệ thống. Frontend chỉ hiển thị kết quả, không tự tính lại.
    ///
    /// Phiên bản p1: chỉ có Content Match được đo. Overall = trung bình có trọng số của các chiều ĐÃ ĐO,
    /// trọng số được chia lại khi một chiều là null. Vì Fluency chưa đo được đáng tin cậy nên Overall = Content Match.
    /// (Công thức cũ 60% Content + 40% Fluency với Fluency gán cứng 88 đã bị bỏ: hành vi này thay đổi điểm hiển thị.)
    /// </summary>
    public static class ShadowingScoring
    {
        public const string Version = "shadowing-score/p2-content-word";

        public const double ContentWeight = 0.60;
        public const double FluencyWeight = 0.40;

        public const int GreenMinScore = 80;
        public const int YellowMinScore = 65;

        public static int? ComputeOverall(int? contentMatch, int? fluency)
        {
            double weightSum = 0;
            double total = 0;

            if (contentMatch.HasValue)
            {
                total += contentMatch.Value * ContentWeight;
                weightSum += ContentWeight;
            }
            if (fluency.HasValue)
            {
                total += fluency.Value * FluencyWeight;
                weightSum += FluencyWeight;
            }

            if (weightSum == 0) return null;
            return (int)System.Math.Round(total / weightSum, System.MidpointRounding.AwayFromZero);
        }

        public static string TierFor(int? overall)
        {
            if (!overall.HasValue) return string.Empty;
            return overall.Value >= GreenMinScore ? "green"
                : overall.Value >= YellowMinScore ? "yellow"
                : "red";
        }
    }
}
