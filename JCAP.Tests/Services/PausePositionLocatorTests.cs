using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Xunit;

namespace JCAP.Tests.Services;

/// <summary>Khoảng dừng được nêu theo TỪ (sau từ nào, trước từ nào). Tín hiệu là tổng hợp, không phải giọng người thật.</summary>
public class PausePositionLocatorTests
{
    // おばあさん|が|います  (9 mora: オ バ ア サ ン | ガ | イ マ ス)
    private static readonly TargetWordSpan[] Words =
    {
        new("おばあさん", 0, 5), new("が", 5, 6), new("います。", 6, 9),
    };

    // ---- gióng số mora với ranh giới từ ----

    [Fact]
    public void PauseOnAWordBoundary_IsDescribedAsAfterAndBeforeWords()
    {
        var p = PausePositionLocator.Place(5, Words)!;
        Assert.Equal("おばあさん", p.PreviousWord);
        Assert.Equal("が", p.NextWord);
        Assert.Null(p.InsideWord);
        Assert.Equal("sau 「おばあさん」, trước 「が」", p.Describe());
    }

    [Fact]
    public void PunctuationIsNotShownInTheQuotedWord()
    {
        var p = PausePositionLocator.Place(6, Words)!;
        Assert.Equal("sau 「おばあさんが」, trước 「います」", p.Describe()); // trợ từ đơn が được ghép với từ đứng trước
        Assert.Equal("sau 「います」", PausePositionLocator.Place(9, Words)!.Describe());
    }

    [Fact]
    public void ALoneParticleBeforeThePause_IsShownTogetherWithItsHostWord()
    {
        var words = new TargetWordSpan[] { new("上の棚", 0, 4), new("に", 4, 5), new("入れても", 5, 9) };
        Assert.Equal("sau 「上の棚に」, trước 「入れても」", PausePositionLocator.Place(5, words)!.Describe());
    }

    [Fact]
    public void PauseAtTheVeryStart_OnlyHasANextWord()
    {
        Assert.Equal("trước 「おばあさん」", PausePositionLocator.Place(0, Words)!.Describe());
    }

    [Fact]
    public void OneMoraOffABoundary_IsSnappedBecauseAlignmentIsApproximate()
    {
        var p = PausePositionLocator.Place(4, Words)!; // lệch 1 mora so với ranh giới 5
        Assert.Equal(5, p.MoraIndex);
        Assert.Equal("sau 「おばあさん」, trước 「が」", p.Describe());
    }

    [Fact]
    public void PauseFarFromAnyBoundary_IsReportedInsideTheWord()
    {
        var words = new TargetWordSpan[] { new("カウンター席", 0, 7), new("で", 7, 8) };
        var p = PausePositionLocator.Place(3, words)!;
        Assert.Equal("カウンター席", p.InsideWord);
        Assert.Equal("ngay giữa từ 「カウンター席」", p.Describe());
    }

    [Fact]
    public void NoWords_GivesNoPlacement()
    {
        Assert.Null(PausePositionLocator.Place(3, Array.Empty<TargetWordSpan>()));
    }

    // ---- xác định số mora đã đọc xong từ tín hiệu ----

    private static readonly MoraDurationOptions Options = new();

    [Theory]
    [InlineData(4, 5)] // dừng sau ン (mora thứ 5)
    [InlineData(5, 6)] // dừng sau ガ
    [InlineData(6, 7)] // dừng sau イ (giữa います)
    public void LearnerPause_IsMappedToTheNumberOfMorasAlreadySpoken(int gapAfterMora, int expectedCompleted)
    {
        const int gapMs = 900;
        var learner = MoraDurationTests.Render(_ => 1.0, gapAfterMora: gapAfterMora, gapMs: gapMs);
        var reference = MoraDurationTests.Render(_ => 1.0);

        var pauseStartMs = LearnerPauseStartMs(learner);
        var completed = Completed(
            learner, reference, MoraDurationTests.Timeline(), 9, pauseStartMs, Options);

        Assert.NotNull(completed);
        Assert.InRange(completed!.Value, expectedCompleted - 1, expectedCompleted + 1);
    }

    [Fact]
    public void SlowerLearner_PauseIsStillPlacedAfterTheSameWord()
    {
        // Người học nói chậm 1.3 lần và dừng sau "おばあさん": vị trí theo từ vẫn đúng.
        var learner = MoraDurationTests.Render(_ => 1.0, tempo: 1.3, gapAfterMora: 4, gapMs: 900);
        var reference = MoraDurationTests.Render(_ => 1.0);

        var completed = Completed(
            learner, reference, MoraDurationTests.Timeline(), 9, LearnerPauseStartMs(learner), Options);

        Assert.NotNull(completed);
        var placement = PausePositionLocator.Place(completed!.Value, Words)!;
        Assert.Equal("おばあさん", placement.PreviousWord);
    }

    [Fact]
    public void MoraCountMismatch_IsRejected_SoNoWordIsGuessed()
    {
        var learner = MoraDurationTests.Render(_ => 1.0, gapAfterMora: 4, gapMs: 900);
        var completed = Completed(
            learner, MoraDurationTests.Render(_ => 1.0), MoraDurationTests.Timeline(), 12, LearnerPauseStartMs(learner), Options);
        Assert.Null(completed);
    }

    [Fact]
    public void UnreliableAlignment_ReturnsNull()
    {
        var learner = MoraDurationTests.Render(_ => 1.0, gapAfterMora: 4, gapMs: 900);
        Assert.Null(Completed(
            learner, MoraDurationTests.Render(_ => 1.0), MoraDurationTests.Timeline(), 9, LearnerPauseStartMs(learner), Options,
            maxAlignmentCost: 0.0001));
    }

    [Fact]
    public void SilentLearner_ReturnsNull()
    {
        Assert.Null(Completed(
            TestAudio.Zeros(3000), MoraDurationTests.Render(_ => 1.0), MoraDurationTests.Timeline(), 9, 1500, Options));
    }

    private static int? Completed(float[] learner, float[] reference, IReadOnlyList<MoraTiming> timeline, int moras, int pauseStartMs,
        MoraDurationOptions o, double maxAlignmentCost = PausePositionLocator.DefaultMaxAlignmentCost) =>
        PausePositionLocator.Locate(learner, reference, timeline, moras, pauseStartMs, o, maxAlignmentCost).CompletedMoras;

    /// <summary>Điểm bắt đầu khoảng dừng dài nhất theo chính bộ đo nhịp của hệ thống (cùng hệ toạ độ với FluencyPauseDto).</summary>
    private static int LearnerPauseStartMs(float[] learner)
    {
        var metrics = new FluencyAnalyzer().Analyze(TestAudio.Wav(learner), 9);
        Assert.Equal("available", metrics.Status);
        return metrics.Pauses.OrderByDescending(p => p.DurationMs).First().StartMs;
    }
}
