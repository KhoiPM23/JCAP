using System;
using JCAP.DTOs.Flashcard;
using JCAP.Models;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Thuật toán SM-2 rút gọn với 3 mức đánh giá: Again / Good / Easy.
    /// Có thể tái sử dụng cho cả Flashcard và Quiz/Adaptive Learning sau này.
    /// </summary>
    public class SrsCalculationService : ISrsCalculationService
    {
        public const double MinEaseFactor = 1.3;
        public const double DefaultEaseFactor = 2.5;

        public SrsCalculationResult CalculateNextReview(
            int currentRepetitions,
            int currentIntervalDays,
            double currentEaseFactor,
            string rating,
            DateTime nowUtc)
        {
            double ease = currentEaseFactor < MinEaseFactor ? DefaultEaseFactor : currentEaseFactor;
            int reps = Math.Max(0, currentRepetitions);
            int interval = Math.Max(0, currentIntervalDays);

            string normalized = NormalizeRating(rating);

            switch (normalized)
            {
                case FlashcardRating.Again:
                    reps = 0;
                    interval = 1;
                    ease = Math.Max(MinEaseFactor, Math.Round(ease - 0.2, 2));
                    break;

                case FlashcardRating.Easy:
                    reps += 1;
                    if (reps == 1)
                    {
                        interval = 3;
                    }
                    else if (reps == 2)
                    {
                        interval = 6;
                    }
                    else
                    {
                        interval = Math.Max(interval + 1, (int)Math.Round(interval * ease * 1.3));
                    }
                    ease = Math.Round(ease + 0.15, 2);
                    break;

                case FlashcardRating.Good:
                default:
                    reps += 1;
                    if (reps == 1)
                    {
                        interval = 1;
                    }
                    else if (reps == 2)
                    {
                        interval = 3;
                    }
                    else
                    {
                        interval = Math.Max(interval + 1, (int)Math.Round(interval * ease));
                    }
                    break;
            }

            DateTime nextReviewAt = nowUtc.AddDays(interval);
            return new SrsCalculationResult(reps, interval, ease, nextReviewAt);
        }

        public SrsIntervalPreviewDto PreviewIntervals(
            int currentRepetitions,
            int currentIntervalDays,
            double currentEaseFactor)
        {
            var now = DateTime.UtcNow;
            var again = CalculateNextReview(currentRepetitions, currentIntervalDays, currentEaseFactor, FlashcardRating.Again, now);
            var good = CalculateNextReview(currentRepetitions, currentIntervalDays, currentEaseFactor, FlashcardRating.Good, now);
            var easy = CalculateNextReview(currentRepetitions, currentIntervalDays, currentEaseFactor, FlashcardRating.Easy, now);

            return new SrsIntervalPreviewDto
            {
                AgainIntervalDays = again.IntervalDays,
                GoodIntervalDays = good.IntervalDays,
                EasyIntervalDays = easy.IntervalDays
            };
        }

        private static string NormalizeRating(string? rating)
        {
            if (string.Equals(rating, FlashcardRating.Again, StringComparison.OrdinalIgnoreCase))
                return FlashcardRating.Again;
            if (string.Equals(rating, FlashcardRating.Easy, StringComparison.OrdinalIgnoreCase))
                return FlashcardRating.Easy;
            return FlashcardRating.Good;
        }
    }
}
