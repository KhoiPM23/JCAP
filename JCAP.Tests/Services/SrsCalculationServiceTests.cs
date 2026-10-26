using System;
using JCAP.Models;
using JCAP.Services.Implementations;
using Xunit;

namespace JCAP.Tests.Services;

public class SrsCalculationServiceTests
{
    private readonly SrsCalculationService _sut = new();

    [Fact]
    public void CalculateNextReview_FirstTimeGood_SetsRepetitionOneAndOneDayInterval()
    {
        var now = new DateTime(2026, 10, 23, 10, 0, 0, DateTimeKind.Utc);

        var result = _sut.CalculateNextReview(0, 0, 2.5, FlashcardRating.Good, now);

        Assert.Equal(1, result.Repetitions);
        Assert.Equal(1, result.IntervalDays);
        Assert.Equal(2.5, result.EaseFactor);
        Assert.Equal(now.AddDays(1), result.NextReviewAt);
    }

    [Fact]
    public void CalculateNextReview_ConsecutiveGoods_FollowsSm2Progression()
    {
        var now = new DateTime(2026, 10, 23, 10, 0, 0, DateTimeKind.Utc);

        var step1 = _sut.CalculateNextReview(0, 0, 2.5, FlashcardRating.Good, now);
        var step2 = _sut.CalculateNextReview(step1.Repetitions, step1.IntervalDays, step1.EaseFactor, FlashcardRating.Good, now);
        var step3 = _sut.CalculateNextReview(step2.Repetitions, step2.IntervalDays, step2.EaseFactor, FlashcardRating.Good, now);

        Assert.Equal(1, step1.IntervalDays);
        Assert.Equal(3, step2.IntervalDays);
        Assert.Equal(8, step3.IntervalDays); // Round(3 * 2.5) = 8
        Assert.Equal(3, step3.Repetitions);
    }

    [Fact]
    public void CalculateNextReview_EasyRating_IncreasesEaseFactorAndGivesLongerIntervals()
    {
        var now = new DateTime(2026, 10, 23, 10, 0, 0, DateTimeKind.Utc);

        var step1 = _sut.CalculateNextReview(0, 0, 2.5, FlashcardRating.Easy, now);
        var step2 = _sut.CalculateNextReview(step1.Repetitions, step1.IntervalDays, step1.EaseFactor, FlashcardRating.Easy, now);

        Assert.Equal(1, step1.Repetitions);
        Assert.Equal(3, step1.IntervalDays);
        Assert.Equal(2.65, step1.EaseFactor);

        Assert.Equal(2, step2.Repetitions);
        Assert.Equal(6, step2.IntervalDays);
        Assert.Equal(2.8, step2.EaseFactor);
    }

    [Fact]
    public void CalculateNextReview_AgainRating_ResetsRepetitionsAndClampsEaseFactorAtMinimum()
    {
        var now = new DateTime(2026, 10, 23, 10, 0, 0, DateTimeKind.Utc);

        var result = _sut.CalculateNextReview(4, 15, 1.35, FlashcardRating.Again, now);

        Assert.Equal(0, result.Repetitions);
        Assert.Equal(1, result.IntervalDays);
        Assert.Equal(SrsCalculationService.MinEaseFactor, result.EaseFactor);
        Assert.Equal(now.AddDays(1), result.NextReviewAt);
    }

    [Fact]
    public void PreviewIntervals_NewCard_ReturnsExpectedAgainGoodEasyDays()
    {
        var preview = _sut.PreviewIntervals(0, 0, 2.5);

        Assert.Equal(1, preview.AgainIntervalDays);
        Assert.Equal(1, preview.GoodIntervalDays);
        Assert.Equal(3, preview.EasyIntervalDays);
    }
}
