using JCAP.Services.Implementations;
using Xunit;

namespace JCAP.Tests.Services
{
    public class AssistancePolicyTests
    {
        [Theory]
        [InlineData(1, false, 0)]   // Lần 1: Miễn phí
        [InlineData(1, true, 0)]    // Lần 1: Miễn phí
        [InlineData(2, true, 5)]    // Lần 2: Trừ 5đ
        [InlineData(3, true, 10)]   // Lần 3: Trừ 10đ
        [InlineData(5, true, 20)]   // Lần 5: Chạm trần 20đ
        [InlineData(8, true, 20)]   // Lần 8: Không vượt trần 20đ
        public void CalculatePeekPenalty_ShouldEnforcePricingAndCeiling(
            int currentPeekCount, bool hasUsedFreeQuota, int expectedPenalty)
        {
            var penalty = AssistancePolicy.CalculatePeekPenalty(currentPeekCount, hasUsedFreeQuota);
            Assert.Equal(expectedPenalty, penalty);
        }

        [Theory]
        [InlineData(1, 1, 0, 90)]    // Cấp 1 lần đầu: 0đ, trần 90
        [InlineData(1, 2, 10, 85)]   // Cấp 1 lần 2: 10đ, trần 85
        [InlineData(2, 1, 15, 80)]   // Cấp 2 lần đầu: 15đ, trần 80
        [InlineData(2, 2, 30, 70)]   // Cấp 2 lần 2: 30đ, trần 70
        [InlineData(3, 1, 40, 60)]   // Cấp 3 lần đầu: 40đ, trần 60
        [InlineData(3, 2, 60, 50)]   // Cấp 3 lần 2: 60đ, trần 50
        public void GetHintTierCost_ShouldMatchStandardTable(
            int tier, int timesUsed, int expectedPenalty, int expectedCeiling)
        {
            var (penalty, ceiling) = AssistancePolicy.GetHintTierCost(tier, timesUsed);
            Assert.Equal(expectedPenalty, penalty);
            Assert.Equal(expectedCeiling, ceiling);
        }

        [Fact]
        public void ApplyEffortRebate_WhenSimilarityLow_ShouldRebate50Percent()
        {
            // Cấp 2 lần đầu: phạt 15đ, nhưng nói sáng tạo (similarity 0.35)
            var (finalPenalty, isRebated) = AssistancePolicy.ApplyEffortRebate(15, 2, 0.35);
            Assert.True(isRebated);
            Assert.Equal(8, finalPenalty); // 15 * 0.5 = 7.5 -> làm tròn 8
        }

        [Fact]
        public void ApplyEffortRebate_WhenSimilarityHigh_ShouldKeepRawPenalty()
        {
            // Cấp 3 lần đầu: phạt 40đ, chép y nguyên câu mẫu (similarity 0.95)
            var (finalPenalty, isRebated) = AssistancePolicy.ApplyEffortRebate(40, 3, 0.95);
            Assert.False(isRebated);
            Assert.Equal(40, finalPenalty);
        }

        [Theory]
        [InlineData(2, false)]
        [InlineData(3, true)]
        [InlineData(5, true)]
        public void QualifiesForBonusPeekToken_ShouldRequireStreakOfThree(int streak, bool expected)
        {
            var qualifies = AssistancePolicy.QualifiesForBonusPeekToken(streak);
            Assert.Equal(expected, qualifies);
        }

        [Theory]
        [InlineData(2.5, "N5", 100)] // N5: <= 5s buffer
        [InlineData(5.0, "N5", 100)]
        [InlineData(5.5, "N3", 93)]  // N3: <= 3s buffer, 5.5s đang giảm
        [InlineData(20.0, "N5", 50)] // 20s chạm sàn 50
        [InlineData(35.0, "N4", 50)] // > 20s giữ sàn 50
        public void CalculateReflexScore_ShouldRespectLevelBuffersAndFloor(
            double latency, string level, int expectedScore)
        {
            var score = AssistancePolicy.CalculateReflexScore(latency, level);
            Assert.Equal(expectedScore, score);
        }

        [Theory]
        [InlineData(0.85, "spoken", true, 1.0)]
        [InlineData(0.40, "hybrid", true, 0.40)]
        [InlineData(0.10, "typed", false, 0.0)]
        public void EvaluateModality_ShouldDifferentiateSpokenVsTyped(
            double spokenShare, string expectedModality, bool expectedInOral, double expectedWeight)
        {
            var (modality, inOral, weight) = AssistancePolicy.EvaluateModality(spokenShare);
            Assert.Equal(expectedModality, modality);
            Assert.Equal(expectedInOral, inOral);
            Assert.Equal(expectedWeight, weight, 2);
        }
    }
}

