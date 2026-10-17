using JCAP.Services.Implementations;
using Xunit;

namespace JCAP.Tests.Services;

public class ShadowingScoringTests
{
    [Fact]
    public void Overall_EqualsContent_WhenFluencyIsNotMeasured()
    {
        Assert.Equal(73, ShadowingScoring.ComputeOverall(73, null));
        Assert.Equal(0, ShadowingScoring.ComputeOverall(0, null)); // 0 hợp lệ, không phải "thiếu"
    }

    [Fact]
    public void Overall_RenormalizesWeights_AndUsesFullFormulaWhenBothPresent()
    {
        Assert.Equal(80, ShadowingScoring.ComputeOverall(80, 80));
        Assert.Equal(88, ShadowingScoring.ComputeOverall(100, 70)); // 0.6*100 + 0.4*70
        Assert.Null(ShadowingScoring.ComputeOverall(null, null));
        Assert.Equal(60, ShadowingScoring.ComputeOverall(null, 60));
    }

    [Theory]
    [InlineData(100, "green")]
    [InlineData(80, "green")]
    [InlineData(79, "yellow")]
    [InlineData(65, "yellow")]
    [InlineData(64, "red")]
    [InlineData(0, "red")]
    public void Tier_UsesDocumentedThresholds(int score, string expected) =>
        Assert.Equal(expected, ShadowingScoring.TierFor(score));

    [Fact]
    public void Tier_IsEmpty_WhenThereIsNoScore() => Assert.Equal(string.Empty, ShadowingScoring.TierFor(null));
}

