using System.Text.Json;
using JCAP.DTOs.Roleplay;
using JCAP.Models;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations;

public sealed class RoleplayEvaluationService : IRoleplayEvaluationService
{
    private const int SuccessScore = 90;
    private const int WarningScore = 65;
    private const int ErrorScore = 30;
    private const int IncompleteMissionScoreCap = 59;
    private const double TaskCompletionWeight = 0.40;   // 40% Nhiệm vụ kịch bản (Task Completion)
    private const double LinguisticWeight = 0.30;       // 30% Chuẩn xác Ngôn ngữ & Kính ngữ (Linguistic Appropriateness & Register)
    private const double FluencyReflexWeight = 0.20;    // 20% Độ trôi chảy & Phản xạ Mora (Fluency & Acoustic Reflex)
    private const double AutonomyWeight = 0.10;         // 10% Tính tự chủ đối thoại (Autonomy)
    private const double ImpressionLanguageWeight = 0.80;
    private const double NaturalConclusionWeight = 0.20;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly string[] GrammarAspects =
    [
        "ngữ pháp", "ngu phap", "trợ từ", "tro tu", "cấu trúc", "cau truc",
        "chia động từ", "chia dong tu", "thể", "the te", "mẫu câu", "mau cau"
    ];

    private static readonly string[] VocabularyAspects =
    [
        "từ vựng", "tu vung", "dùng từ", "dung tu", "từ nối", "tu noi",
        "từ chỉ định", "tu chi dinh", "thuật ngữ", "thuat ngu"
    ];

    private static readonly string[] ImpressionAspects =
    [
        "ngữ cảnh", "ngu canh", "văn phong", "van phong", "lịch sự", "lich su",
        "kính ngữ", "kinh ngu", "keigo", "khiêm nhường", "khiem nhuong", "tôn kính", "ton kinh", "teinei"
    ];

    public RoleplayEvaluationResult? Evaluate(
        IEnumerable<string?> linguisticFeedbackJsonValues,
        int completedMissionCount,
        int totalMissionCount,
        bool isNaturallyConcluded)
    {
        var feedbacks = linguisticFeedbackJsonValues
            .Select(ParseFeedback)
            .Where(feedback => feedback != null && !IsSimulatorFeedback(feedback))
            .Cast<LinguisticFeedbackDto>()
            .ToList();

        if (feedbacks.Count == 0)
        {
            return null;
        }

        var grammarScore = AverageAndRound(feedbacks.Select(feedback =>
            GetCategoryScore(feedback, GrammarAspects)));
        var vocabularyScore = AverageAndRound(feedbacks.Select(feedback =>
            GetCategoryScore(feedback, VocabularyAspects)));
        var impressionLanguageScore = AverageAndRound(feedbacks.Select(feedback =>
            GetCategoryScore(feedback, ImpressionAspects)));

        var (fluencyScore, confidenceScore, autonomyScore, pronScore, avgLatency, avgPace) = CalculateDeliveryMetrics(feedbacks);

        var normalizedTotalMissionCount = Math.Max(totalMissionCount, 0);
        var normalizedCompletedMissionCount = Math.Clamp(
            completedMissionCount,
            0,
            normalizedTotalMissionCount);
        var allMissionsCompleted = normalizedTotalMissionCount > 0
            && normalizedCompletedMissionCount == normalizedTotalMissionCount;
        var missionCompletionScore = normalizedTotalMissionCount > 0
            ? normalizedCompletedMissionCount * 100.0 / normalizedTotalMissionCount
            : 0;
        var naturalConclusionScore = isNaturallyConcluded ? 100 : 0;
        var impressionScore = ClampAndRound(
            impressionLanguageScore * ImpressionLanguageWeight
            + naturalConclusionScore * NaturalConclusionWeight);

        // Trụ cột 1: Task Completion (Nhiệm vụ kịch bản - 40%)
        var missionCompletionPoints = ClampAndRound(missionCompletionScore * TaskCompletionWeight);

        // Trụ cột 2: Linguistic Appropriateness & Register (Chuẩn xác ngôn ngữ & Kính ngữ - 30%)
        // Kết hợp Ngữ pháp/Trợ từ (40%), Vốn từ vựng (30%), Kính ngữ/Văn phong (30%)
        var linguisticScore = ClampAndRound(grammarScore * 0.40 + vocabularyScore * 0.30 + impressionScore * 0.30);
        var linguisticPoints = ClampAndRound(linguisticScore * LinguisticWeight);
        var grammarPoints = ClampAndRound(grammarScore * 0.12);
        var vocabularyPoints = ClampAndRound(vocabularyScore * 0.09);
        var impressionPoints = ClampAndRound(impressionScore * 0.09);

        // Trụ cột 3: Fluency & Acoustic Reflex (Độ trôi chảy & Phản xạ Mora - 20%)
        var fluencyReflexPoints = ClampAndRound(fluencyScore * FluencyReflexWeight);

        // Trụ cột 4: Autonomy (Tính tự chủ đàm thoại - 10%)
        var autonomyPoints = ClampAndRound(autonomyScore * AutonomyWeight);

        var calculatedOverallScore = ClampAndRound(
            missionCompletionPoints + linguisticPoints + fluencyReflexPoints + autonomyPoints);
        var overallScore = calculatedOverallScore;
        var isCapped = false;

        var adjustments = new List<ScoreAdjustmentItemDto>
        {
            new()
            {
                Category = "Nhiệm vụ kịch bản (40%)",
                Description = allMissionsCompleted
                    ? $"Hoàn thành trọn vẹn {normalizedCompletedMissionCount}/{normalizedTotalMissionCount} mục tiêu kịch bản"
                    : $"Hoàn thành {normalizedCompletedMissionCount}/{normalizedTotalMissionCount} mục tiêu (Cần xong 100% để đạt)",
                DeltaPoints = missionCompletionPoints
            },
            new()
            {
                Category = "Chuẩn xác Ngôn ngữ & Kính ngữ (30%)",
                Description = $"Ngữ pháp & Trợ từ ({grammarScore}/100), Từ vựng ({vocabularyScore}/100), Kính ngữ ({impressionScore}/100)",
                DeltaPoints = linguisticPoints
            },
            new()
            {
                Category = "Độ trôi chảy & Phản xạ (20%)",
                Description = (avgPace >= 1.0 && avgLatency >= 0.8)
                    ? $"Tốc độ phát âm: {avgPace:F1} âm/giây · Phản xạ: ~{avgLatency:F1}s ({fluencyScore}/100)"
                    : (avgPace >= 1.0)
                        ? $"Tốc độ phát âm: {avgPace:F1} âm/giây ({fluencyScore}/100)"
                        : $"Lưu loát và nhịp điệu phát âm tự nhiên ({fluencyScore}/100)",
                DeltaPoints = fluencyReflexPoints
            },
            new()
            {
                Category = "Tự chủ & Khả năng Độc lập (10%)",
                Description = autonomyScore >= 95
                    ? $"Tự chủ đối thoại xuất sắc ({autonomyScore}/100), không phụ thuộc gợi ý"
                    : $"Có dùng trợ giúp gợi ý đối thoại ({autonomyScore}/100)",
                DeltaPoints = autonomyPoints
            }
        };

        // Score cap for incomplete missions removed per pedagogic policy

        var scoreBreakdown = new ScoreBreakdownDto
        {
            MissionCompletionPoints = missionCompletionPoints,
            MissionCount = normalizedCompletedMissionCount,
            TotalMissionCount = normalizedTotalMissionCount,
            LinguisticPoints = linguisticPoints,
            FluencyReflexPoints = fluencyReflexPoints,
            AutonomyPoints = autonomyPoints,
            GrammarPoints = grammarPoints,
            GrammarBaseScore = grammarScore,
            VocabularyPoints = vocabularyPoints,
            VocabularyBaseScore = vocabularyScore,
            ImpressionPoints = impressionPoints,
            ImpressionBaseScore = impressionScore,
            NaturalConclusionBonus = isNaturallyConcluded,
            AutonomyScore = autonomyScore,
            FluencyScore = fluencyScore,
            AverageLatencySeconds = avgLatency,
            AveragePace = avgPace,
            IsCappedDueToIncomplete = isCapped,
            FinalOverallScore = overallScore,
            Adjustments = adjustments
        };

        return new RoleplayEvaluationResult
        {
            OverallScore = overallScore,
            ScoreBreakdown = scoreBreakdown,
            GrammarScore = grammarScore,
            VocabularyScore = vocabularyScore,
            ImpressionScore = impressionScore,
            FluencyScore = fluencyScore,
            SpeechConfidenceScore = confidenceScore,
            AutonomyScore = autonomyScore,
            PronunciationScore = pronScore,
            AverageResponseLatencySeconds = avgLatency,
            AverageSpeechPace = avgPace,
            MissionProgressScore = ClampAndRound(missionCompletionScore),
            AllMissionsCompleted = allMissionsCompleted,
            GeneralFeedbackText = BuildGeneralFeedback(
                feedbacks,
                overallScore,
                normalizedCompletedMissionCount,
                normalizedTotalMissionCount,
                allMissionsCompleted,
                fluencyScore,
                confidenceScore,
                autonomyScore,
                pronScore,
                avgLatency,
                avgPace),
            EvaluatedTurnCount = feedbacks.Count
        };
    }


    private static RoleplayEvaluationResult BuildEarlyTerminationResult(
        int completedMissionCount,
        int totalMissionCount,
        bool isNaturallyConcluded)
    {
        var normalizedTotalMissionCount = Math.Max(totalMissionCount, 0);
        var normalizedCompletedMissionCount = Math.Clamp(
            completedMissionCount,
            0,
            normalizedTotalMissionCount);
        var allMissionsCompleted = normalizedTotalMissionCount > 0
            && normalizedCompletedMissionCount == normalizedTotalMissionCount;
        var missionCompletionScore = normalizedTotalMissionCount > 0
            ? normalizedCompletedMissionCount * 100.0 / normalizedTotalMissionCount
            : 0;
        var missionCompletionPoints = ClampAndRound(missionCompletionScore * TaskCompletionWeight);
        var overallScore = allMissionsCompleted
            ? ClampAndRound(missionCompletionPoints)
            : Math.Min(ClampAndRound(missionCompletionPoints), IncompleteMissionScoreCap);

        var scoreBreakdown = new ScoreBreakdownDto
        {
            MissionCompletionPoints = missionCompletionPoints,
            MissionCount = normalizedCompletedMissionCount,
            TotalMissionCount = normalizedTotalMissionCount,
            LinguisticPoints = 0,
            FluencyReflexPoints = 0,
            AutonomyPoints = 0,
            GrammarPoints = 0,
            GrammarBaseScore = 0,
            VocabularyPoints = 0,
            VocabularyBaseScore = 0,
            ImpressionPoints = 0,
            ImpressionBaseScore = 0,
            NaturalConclusionBonus = isNaturallyConcluded,
            AutonomyScore = 100,
            FluencyScore = 0,
            AverageLatencySeconds = 0,
            AveragePace = 0,
            IsCappedDueToIncomplete = !allMissionsCompleted,
            FinalOverallScore = overallScore,
            Adjustments = new List<ScoreAdjustmentItemDto>
            {
                new()
                {
                    Category = "Nhiệm vụ kịch bản (40%)",
                    Description = $"Hoàn thành {normalizedCompletedMissionCount}/{normalizedTotalMissionCount} mục tiêu trước khi kết thúc",
                    DeltaPoints = missionCompletionPoints
                },
                new()
                {
                    Category = "Kết thúc sớm",
                    Description = "Phiên hội thoại kết thúc khi chưa ghi nhận đủ lượt đàm thoại để phân tích sâu ngữ âm và ngữ pháp",
                    DeltaPoints = 0
                }
            }
        };

        return new RoleplayEvaluationResult
        {
            OverallScore = overallScore,
            ScoreBreakdown = scoreBreakdown,
            GrammarScore = 0,
            VocabularyScore = 0,
            ImpressionScore = 0,
            FluencyScore = 0,
            SpeechConfidenceScore = 0,
            AutonomyScore = 100,
            PronunciationScore = 0,
            AverageResponseLatencySeconds = 0,
            AverageSpeechPace = 0,
            MissionProgressScore = ClampAndRound(missionCompletionScore),
            AllMissionsCompleted = allMissionsCompleted,
            GeneralFeedbackText = "Phiên hội thoại đã kết thúc. Bạn có thể luyện tập lại bất cứ lúc nào để đạt đủ các mục tiêu giao tiếp!",
            EvaluatedTurnCount = 0
        };
    }

    private static LinguisticFeedbackDto? ParseFeedback(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<LinguisticFeedbackDto>(json, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool IsSimulatorFeedback(LinguisticFeedbackDto feedback)
    {
        return string.Equals(
            feedback.EvaluationSource,
            "Simulator",
            StringComparison.OrdinalIgnoreCase);
    }

    private static double GetCategoryScore(
        LinguisticFeedbackDto feedback,
        IReadOnlyCollection<string> categoryAspects)
    {
        var detailScores = (feedback.Details ?? [])
            .Where(detail => MatchesAspect(detail.Aspect, categoryAspects))
            .Select(detail => MapQualityScore(detail.Type))
            .ToList();


        // Nếu không có lỗi chi tiết trong nhóm này, áp dụng trạng thái tổng quan của lượt thoại (Good = 90, Warning = 65, Error = 40)
        double score;
        if (detailScores.Count > 0)
        {
            score = detailScores.Average();
        }
        else
        {
            score = MapQualityScore(feedback.Status);
        }

        // Grade Ceiling (Khóa trần điểm kiến thức ngôn ngữ):
        // Nếu người học dùng Mẫu câu trọn vẹn (Tier 3), khóa trần điểm Ngữ pháp và Từ vựng
        // Lần 1 trong phiên (TurnAutonomyScore <= 60): trần 60đ; Từ lần 2 trở đi (TurnAutonomyScore <= 50): trần 50đ.
        if (!IsSurvivalPhraseFeedback(feedback)
            && feedback.SpeechDelivery?.TurnAutonomyScore.HasValue == true)
        {
            var autonomy = feedback.SpeechDelivery.TurnAutonomyScore.Value;
            if (autonomy <= 50)
            {
                score = Math.Min(score, 50.0);
            }
            else if (autonomy <= 60)
            {
                score = Math.Min(score, 60.0);
            }
        }

        return score;
    }

    private static bool MatchesAspect(
        string? aspect,
        IEnumerable<string> categoryAspects)
    {
        if (string.IsNullOrWhiteSpace(aspect))
        {
            return false;
        }

        return categoryAspects.Any(keyword =>
            aspect.Contains(keyword, StringComparison.OrdinalIgnoreCase));
    }

    private static int MapQualityScore(string? quality)
    {
        if (string.Equals(quality, "success", StringComparison.OrdinalIgnoreCase)
            || string.Equals(quality, "good", StringComparison.OrdinalIgnoreCase))
        {
            return SuccessScore;
        }

        if (string.Equals(quality, "error", StringComparison.OrdinalIgnoreCase))
        {
            return ErrorScore;
        }

        return WarningScore;
    }

    private static int AverageAndRound(IEnumerable<double> values)
    {
        return ClampAndRound(values.Average());
    }

    private static int ClampAndRound(double value)
    {
        return (int)Math.Round(Math.Clamp(value, 0, 100), MidpointRounding.AwayFromZero);
    }

    private static bool IsSurvivalPhraseFeedback(LinguisticFeedbackDto feedback)
    {
        if (feedback.SumiInk?.IsSurvivalPhrase == true) return true;

        if (feedback.Details.Any(d =>
            d.Comment.Contains("sinh tồn", StringComparison.OrdinalIgnoreCase) ||
            d.Aspect.Contains("sinh tồn", StringComparison.OrdinalIgnoreCase)))
            return true;

        var alt = feedback.NaturalAlternative ?? string.Empty;
        string[] survivalPatterns = ["もう一度", "ゆっくり", "わかりません", "すみません", "ちょっと待って", "聞き取れ"];
        return survivalPatterns.Any(alt.Contains);
    }

    private static (int FluencyScore, int ConfidenceScore, int AutonomyScore, int PronScore, double AvgLatency, double AvgPace) CalculateDeliveryMetrics(
        IReadOnlyCollection<LinguisticFeedbackDto> feedbacks)
    {
        var speechDeliveries = feedbacks
            .Select(f => f.SpeechDelivery)
            .Where(d => d != null)
            .Cast<SpeechDeliveryMetricsDto>()
            .ToList();

        double avgLatency = 0;
        double avgPace = 0;
        int fluencyScore;
        int confidenceScore;
        int autonomyScore;
        int pronScore;

        if (speechDeliveries.Count > 0 && speechDeliveries.Any(d => !d.IsTextInput && ((d.SpeechConfidence.HasValue && d.SpeechConfidence.Value > 0) || !string.IsNullOrEmpty(d.AudioUrl))))
        {
            var validLatencies = speechDeliveries
                .Where(d => !d.IsTextInput && d.ResponseLatencySeconds.HasValue && d.ResponseLatencySeconds.Value >= 0.8)
                .Select(d => d.ResponseLatencySeconds!.Value)
                .ToList();
            avgLatency = validLatencies.Count > 0 ? Math.Round(validLatencies.Average(), 1) : 0;

            var validPaces = speechDeliveries
                .Where(d => !d.IsTextInput && ((d.MoraRate.HasValue && d.MoraRate.Value >= 1.0) || (d.SpeechPace.HasValue && d.SpeechPace.Value >= 1.0)))
                .Select(d => d.MoraRate ?? d.SpeechPace!.Value)
                .ToList();
            avgPace = validPaces.Count > 0 ? Math.Round(validPaces.Average(), 1) : 0;

            var turnFluencyScores = speechDeliveries
                .Where(d => !d.IsTextInput && d.TurnFluencyScore.HasValue)
                .Select(d => (double)d.TurnFluencyScore!.Value)
                .ToList();
            if (turnFluencyScores.Count > 0)
            {
                fluencyScore = (int)Math.Round(turnFluencyScores.Average());
            }
            else
            {
                double baseFluency = 85;
                if (avgPace >= 3.0 && avgPace <= 5.5) baseFluency += 5;
                else if (avgPace > 5.5 && avgPace <= 7.5) baseFluency += 10;
                else if (avgPace > 0 && avgPace < 2.5) baseFluency -= 10;

                if (avgLatency > 0 && avgLatency < 2.0) baseFluency += 5;
                else if (avgLatency > 4.5) baseFluency -= 15;

                fluencyScore = ClampAndRound(baseFluency);
            }

            var confidences = speechDeliveries
                .Where(d => !d.IsTextInput && d.SpeechConfidence.HasValue)
                .Select(d => d.SpeechConfidence!.Value * 100)
                .ToList();
            confidenceScore = confidences.Count > 0
                ? (int)Math.Round(Math.Clamp(confidences.Average(), 0, 100))
                : 90;

            var autonomyScores = feedbacks
                .Select(f =>
                {
                    // Waive scaffolding penalty if the turn used a survival / repair strategy
                    if (IsSurvivalPhraseFeedback(f))
                    {
                        return 100.0;
                    }
                    if (f.SpeechDelivery?.TurnAutonomyScore.HasValue == true)
                    {
                        return (double)f.SpeechDelivery.TurnAutonomyScore.Value;
                    }
                    return 100.0;
                })
                .ToList();
            autonomyScore = autonomyScores.Count > 0
                ? (int)Math.Round(Math.Clamp(autonomyScores.Average(), 20, 100))
                : 100;

            var pronScores = speechDeliveries
                .Where(d => !d.IsTextInput && d.PronunciationClarityScore.HasValue)
                .Select(d => (double)d.PronunciationClarityScore!.Value)
                .ToList();
            pronScore = pronScores.Count > 0
                ? (int)Math.Round(Math.Clamp(pronScores.Average(), 30, 100))
                : confidenceScore;
        }
        else if (speechDeliveries.Count > 0 && speechDeliveries.All(d => d.IsTextInput))
        {
            // Trường hợp học viên chỉ gõ phím / chèn gợi ý mà không nói qua micro:
            // Không tự ý chấm điểm âm học (rõ âm, phản xạ thoại) để đảm bảo tính trung thực sư phạm
            fluencyScore = 0;
            confidenceScore = 0;
            pronScore = 0;
            avgLatency = 0;
            avgPace = 0;

            var autonomyScores = feedbacks
                .Select(f =>
                {
                    if (IsSurvivalPhraseFeedback(f)) return 100.0;
                    if (f.SpeechDelivery?.TurnAutonomyScore.HasValue == true) return (double)f.SpeechDelivery.TurnAutonomyScore.Value;
                    return 100.0;
                })
                .ToList();
            autonomyScore = autonomyScores.Count > 0
                ? (int)Math.Round(Math.Clamp(autonomyScores.Average(), 20, 100))
                : 100;
        }
        else
        {
            // Trường hợp không có dữ liệu âm học (test cases, simulator hoặc cấu hình văn bản cơ bản):
            // Sử dụng thuật toán suy diễn sư phạm từ độ chuẩn xác ngữ nghĩa của các lượt thoại
            var goodCount = feedbacks.Count(f => string.Equals(f.Status, "Good", StringComparison.OrdinalIgnoreCase));
            var warningCount = feedbacks.Count(f => string.Equals(f.Status, "Warning", StringComparison.OrdinalIgnoreCase));
            var errorCount = feedbacks.Count(f => string.Equals(f.Status, "Error", StringComparison.OrdinalIgnoreCase));

            fluencyScore = ClampAndRound(85.0 + (goodCount * 3) - (warningCount * 5) - (errorCount * 12));
            confidenceScore = ClampAndRound(88.0 + (goodCount * 2) - (warningCount * 4) - (errorCount * 10));
            var autonomyScores = feedbacks
                .Select(f =>
                {
                    if (IsSurvivalPhraseFeedback(f)) return 100.0;
                    if (f.SpeechDelivery?.TurnAutonomyScore.HasValue == true) return (double)f.SpeechDelivery.TurnAutonomyScore.Value;
                    return 100.0;
                })
                .ToList();
            autonomyScore = autonomyScores.Count > 0
                ? (int)Math.Round(Math.Clamp(autonomyScores.Average(), 20, 100))
                : 100;
            pronScore = 80;
        }

        return (fluencyScore, confidenceScore, autonomyScore, pronScore, avgLatency, avgPace);
    }

    private static string BuildGeneralFeedback(
        IReadOnlyCollection<LinguisticFeedbackDto> feedbacks,
        int overallScore,
        int completedMissionCount,
        int totalMissionCount,
        bool allMissionsCompleted,
        int fluencyScore,
        int confidenceScore,
        int autonomyScore,
        int pronScore,
        double avgLatency,
        double avgPace)
    {
        var overview = !allMissionsCompleted
            ? totalMissionCount > 0
                ? $"Bạn chưa hoàn thành đủ nhiệm vụ ({completedMissionCount}/{totalMissionCount}), nên kết quả phiên này là Chưa đạt."
                : "Phiên luyện tập chưa có nhiệm vụ hợp lệ, nên kết quả phiên này là Chưa đạt."
            : overallScore switch
        {
            >= 85 => "Bạn giao tiếp rất tốt và duy trì hội thoại tự nhiên.",
            >= 70 => "Bạn giao tiếp khá tốt và đã xử lý phần lớn tình huống phù hợp.",
            >= 60 => "Bạn đã hoàn thành hội thoại, nhưng vẫn còn một số điểm cần cải thiện.",
            _ => "Bạn cần luyện tập thêm để diễn đạt chính xác và tự nhiên hơn."
        };

        var details = feedbacks
            .SelectMany(feedback => feedback.Details ?? [])
            .ToList();
        var strengths = details
            .Where(detail => string.Equals(detail.Type, "success", StringComparison.OrdinalIgnoreCase))
            .Select(detail => detail.Comment?.Trim())
            .Where(comment => !string.IsNullOrWhiteSpace(comment))
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(2)
            .ToList();
        var improvements = details
            .Where(detail => string.Equals(detail.Type, "warning", StringComparison.OrdinalIgnoreCase)
                || string.Equals(detail.Type, "error", StringComparison.OrdinalIgnoreCase))
            .Select(detail => detail.Comment?.Trim())
            .Where(comment => !string.IsNullOrWhiteSpace(comment))
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(2)
            .ToList();
        var naturalAlternatives = feedbacks
            .Select(feedback => feedback.NaturalAlternative?.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(3)
            .ToList();
        var turnSummaries = feedbacks
            .Select(feedback => feedback.Summary?.Trim())
            .Where(summary => !string.IsNullOrWhiteSpace(summary))
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(2)
            .ToList();

        var sections = new List<string> { overview };
        if (turnSummaries.Count > 0)
        {
            sections.Add($"Nhận xét theo lượt: {string.Join("; ", turnSummaries)}");
        }

        if (strengths.Count > 0)
        {
            sections.Add($"Điểm làm tốt: {string.Join("; ", strengths)}");
        }

        if (improvements.Count > 0)
        {
            sections.Add($"Điểm cần cải thiện: {string.Join("; ", improvements)}");
        }

        if (naturalAlternatives.Count > 0)
        {
            sections.Add($"Cách diễn đạt tự nhiên hơn: {string.Join(" | ", naturalAlternatives)}");
        }

        if (avgLatency > 0 || avgPace > 0)
        {
            var jlpt = feedbacks
                .Select(f => f.SpeechDelivery?.JlptLevel)
                .FirstOrDefault(l => !string.IsNullOrWhiteSpace(l));
            var jlptPrefix = !string.IsNullOrWhiteSpace(jlpt) ? $" (Chuẩn {jlpt})" : "";

            var deliveryParts = new List<string>();
            if (avgLatency > 0)
            {
                var latencyComment = avgLatency <= 4.0
                    ? "phản xạ đối đáp nhanh nhẹn"
                    : avgLatency <= 8.0
                        ? "tốc độ phản xạ ổn định"
                        : "cần phản xạ nhanh hơn khi giao tiếp";
                deliveryParts.Add($"phản xạ trung bình {avgLatency:0.0}s ({latencyComment})");
            }
            if (avgPace >= 1.0)
            {
                var paceDesc = avgPace >= 3.0 && avgPace <= 5.5
                    ? "nhịp độ vừa vặn, tự nhiên"
                    : avgPace > 5.5
                        ? "tiệm cận người bản xứ"
                        : "điềm đạm, nắn nót";
                deliveryParts.Add($"nhịp nói ~{avgPace:0.0} âm/giây ({paceDesc})");
            }
            if (confidenceScore > 0)
            {
                var confDesc = confidenceScore >= 85 ? "rõ ràng, tự tin" : "cần đọc tròn vành rõ chữ hơn";
                deliveryParts.Add($"độ tự tin phát âm {confidenceScore}% ({confDesc})");
            }
            sections.Add($"Độ trôi chảy & Phát âm{jlptPrefix}: Điểm {fluencyScore}/100, {string.Join(", ", deliveryParts)}.");
        }

        if (autonomyScore < 95)
        {
            sections.Add($"Mức độ tự chủ giao tiếp: {autonomyScore}/100 (Có dùng gợi ý đối thoại hoặc hỗ trợ bản dịch).");
        }
        else
        {
            sections.Add($"Mức độ tự chủ giao tiếp: {autonomyScore}/100 (Rất tốt, phản xạ độc lập không dựa dẫm gợi ý).");
        }

        return string.Join(" ", sections);
    }
}
