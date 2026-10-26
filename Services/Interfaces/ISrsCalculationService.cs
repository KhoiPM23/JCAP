using System;
using JCAP.DTOs.Flashcard;

namespace JCAP.Services.Interfaces
{
    public record SrsCalculationResult(
        int Repetitions,
        int IntervalDays,
        double EaseFactor,
        DateTime NextReviewAt);

    public interface ISrsCalculationService
    {
        SrsCalculationResult CalculateNextReview(
            int currentRepetitions,
            int currentIntervalDays,
            double currentEaseFactor,
            string rating,
            DateTime nowUtc);

        SrsIntervalPreviewDto PreviewIntervals(
            int currentRepetitions,
            int currentIntervalDays,
            double currentEaseFactor);
    }
}
