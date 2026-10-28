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
    private const double MissionProgressWeight = 0.50;
    private const double GrammarWeight = 0.20;
    private const double VocabularyWeight = 0.20;
    private const double ImpressionWeight = 0.10;
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

        var (fluencyScore, confidenceScore, avgLatency, avgPace) = CalculateDeliveryMetrics(feedbacks);

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

        var calculatedOverallScore = ClampAndRound(
            missionCompletionScore * MissionProgressWeight
            + grammarScore * GrammarWeight
            + vocabularyScore * VocabularyWeight
            + impressionScore * ImpressionWeight);
        var overallScore = allMissionsCompleted
            ? calculatedOverallScore
            : Math.Min(calculatedOverallScore, IncompleteMissionScoreCap);

        return new RoleplayEvaluationResult
        {
            OverallScore = overallScore,
            GrammarScore = grammarScore,
            VocabularyScore = vocabularyScore,
            ImpressionScore = impressionScore,
            FluencyScore = fluencyScore,
            SpeechConfidenceScore = confidenceScore,
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
                avgLatency,
                avgPace),
            EvaluatedTurnCount = feedbacks.Count
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

        if (detailScores.Count > 0)
        {
            return detailScores.Average();
        }

        // Không có nhận xét đúng nhóm nghĩa là chưa đủ bằng chứng để trao điểm Good.
        // Vẫn giữ Error/Warning từ AI, nhưng giới hạn Good ở mức Warning.
        return Math.Min(MapQualityScore(feedback.Status), WarningScore);
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

    private static (int FluencyScore, int ConfidenceScore, double AvgLatency, double AvgPace) CalculateDeliveryMetrics(
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

        if (speechDeliveries.Count > 0)
        {
            var validLatencies = speechDeliveries
                .Where(d => d.ResponseLatencySeconds.HasValue && d.ResponseLatencySeconds.Value > 0)
                .Select(d => d.ResponseLatencySeconds!.Value)
                .ToList();
            avgLatency = validLatencies.Count > 0 ? Math.Round(validLatencies.Average(), 1) : 0;

            var validPaces = speechDeliveries
                .Where(d => d.SpeechPace.HasValue && d.SpeechPace.Value > 0)
                .Select(d => d.SpeechPace!.Value)
                .ToList();
            avgPace = validPaces.Count > 0 ? Math.Round(validPaces.Average(), 1) : 0;

            var turnFluencyScores = speechDeliveries
                .Where(d => d.TurnFluencyScore.HasValue)
                .Select(d => (double)d.TurnFluencyScore!.Value)
                .ToList();
            fluencyScore = turnFluencyScores.Count > 0
                ? (int)Math.Round(turnFluencyScores.Average())
                : 85;

            var confidences = speechDeliveries
                .Where(d => d.SpeechConfidence.HasValue)
                .Select(d => d.SpeechConfidence!.Value * 100)
                .ToList();
            confidenceScore = confidences.Count > 0
                ? (int)Math.Round(Math.Clamp(confidences.Average(), 0, 100))
                : 90;
        }
        else
        {
            var goodCount = feedbacks.Count(f => string.Equals(f.Status, "Good", StringComparison.OrdinalIgnoreCase));
            var warningCount = feedbacks.Count(f => string.Equals(f.Status, "Warning", StringComparison.OrdinalIgnoreCase));
            var errorCount = feedbacks.Count(f => string.Equals(f.Status, "Error", StringComparison.OrdinalIgnoreCase));

            fluencyScore = ClampAndRound(85.0 + (goodCount * 3) - (warningCount * 5) - (errorCount * 12));
            confidenceScore = ClampAndRound(88.0 + (goodCount * 2) - (warningCount * 4) - (errorCount * 10));
        }

        return (fluencyScore, confidenceScore, avgLatency, avgPace);
    }

    private static string BuildGeneralFeedback(
        IReadOnlyCollection<LinguisticFeedbackDto> feedbacks,
        int overallScore,
        int completedMissionCount,
        int totalMissionCount,
        bool allMissionsCompleted,
        int fluencyScore,
        int confidenceScore,
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
            if (avgPace > 0)
            {
                deliveryParts.Add($"nhịp nói ~{avgPace:0.0} ký tự/s");
            }
            if (confidenceScore > 0)
            {
                var confDesc = confidenceScore >= 85 ? "rõ ràng, tự tin" : "cần đọc tròn vành rõ chữ hơn";
                deliveryParts.Add($"độ tự tin phát âm {confidenceScore}% ({confDesc})");
            }
            sections.Add($"Độ trôi chảy & Phát âm{jlptPrefix}: Điểm {fluencyScore}/100, {string.Join(", ", deliveryParts)}.");
        }

        return string.Join(" ", sections);
    }
}
