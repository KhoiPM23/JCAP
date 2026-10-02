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

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly string[] GrammarAspects =
    [
        "ngữ pháp", "ngu phap", "trợ từ", "tro tu", "cấu trúc", "cau truc",
        "chia động từ", "chia dong tu"
    ];

    private static readonly string[] VocabularyAspects =
    [
        "từ vựng", "tu vung", "dùng từ", "dung tu"
    ];

    private static readonly string[] ImpressionAspects =
    [
        "ngữ cảnh", "ngu canh", "văn phong", "van phong", "lịch sự", "lich su"
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

        var missionCompletionScore = totalMissionCount > 0
            ? Math.Clamp(completedMissionCount * 100.0 / totalMissionCount, 0, 100)
            : 0;
        var naturalConclusionScore = isNaturallyConcluded ? 100 : 0;
        var impressionScore = ClampAndRound(
            missionCompletionScore * 0.60
            + naturalConclusionScore * 0.20
            + impressionLanguageScore * 0.20);

        var overallScore = ClampAndRound(
            grammarScore * 0.35
            + vocabularyScore * 0.35
            + impressionScore * 0.30);

        return new RoleplayEvaluationResult
        {
            OverallScore = overallScore,
            GrammarScore = grammarScore,
            VocabularyScore = vocabularyScore,
            ImpressionScore = impressionScore,
            GeneralFeedbackText = BuildGeneralFeedback(feedbacks, overallScore),
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

        return detailScores.Count > 0
            ? detailScores.Average()
            : MapQualityScore(feedback.Status);
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

    private static string BuildGeneralFeedback(
        IReadOnlyCollection<LinguisticFeedbackDto> feedbacks,
        int overallScore)
    {
        var overview = overallScore switch
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
        var naturalAlternative = feedbacks
            .Select(feedback => feedback.NaturalAlternative?.Trim())
            .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
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

        if (!string.IsNullOrWhiteSpace(naturalAlternative))
        {
            sections.Add($"Cách diễn đạt tự nhiên hơn: {naturalAlternative}");
        }

        return string.Join(" ", sections);
    }
}
