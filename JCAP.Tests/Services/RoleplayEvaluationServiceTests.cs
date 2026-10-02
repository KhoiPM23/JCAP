using JCAP.Services.Implementations;

namespace JCAP.Tests.Services;

public class RoleplayEvaluationServiceTests
{
    private readonly RoleplayEvaluationService _service = new();

    [Fact]
    public void Evaluate_AggregatesSuccessfulAiFeedbackAndMissionProgress()
    {
        var result = _service.Evaluate(
            [GoodFeedbackJson],
            completedMissionCount: 3,
            totalMissionCount: 3,
            isNaturallyConcluded: true);

        Assert.NotNull(result);
        Assert.Equal(90, result.GrammarScore);
        Assert.Equal(90, result.VocabularyScore);
        Assert.Equal(92, result.ImpressionScore);
        Assert.Equal(100, result.MissionProgressScore);
        Assert.Equal(95, result.OverallScore);
        Assert.True(result.AllMissionsCompleted);
        Assert.Equal(1, result.EvaluatedTurnCount);
        Assert.Contains("Điểm làm tốt", result.GeneralFeedbackText);
    }

    [Fact]
    public void Evaluate_CapsOverallScoreAndMarksIncompleteMissions()
    {
        var result = _service.Evaluate(
            [GoodFeedbackJson],
            completedMissionCount: 2,
            totalMissionCount: 3,
            isNaturallyConcluded: true);

        Assert.NotNull(result);
        Assert.Equal(90, result.GrammarScore);
        Assert.Equal(90, result.VocabularyScore);
        Assert.Equal(92, result.ImpressionScore);
        Assert.Equal(67, result.MissionProgressScore);
        Assert.Equal(59, result.OverallScore);
        Assert.False(result.AllMissionsCompleted);
        Assert.Contains("2/3", result.GeneralFeedbackText);
        Assert.Contains("Chưa đạt", result.GeneralFeedbackText);
    }

    [Fact]
    public void Evaluate_GivesZeroMissionContributionWhenNoMissionIsCompleted()
    {
        var result = _service.Evaluate(
            [GoodFeedbackJson],
            completedMissionCount: 0,
            totalMissionCount: 3,
            isNaturallyConcluded: true);

        Assert.NotNull(result);
        Assert.Equal(0, result.MissionProgressScore);
        Assert.Equal(45, result.OverallScore);
        Assert.False(result.AllMissionsCompleted);
    }

    [Fact]
    public void Evaluate_UsesAllTurnsAndLowersScoresForWarningsAndErrors()
    {
        var result = _service.Evaluate(
            [WarningAndErrorFeedbackJson, MixedFeedbackJson],
            completedMissionCount: 1,
            totalMissionCount: 2,
            isNaturallyConcluded: false);

        Assert.NotNull(result);
        Assert.Equal(78, result.GrammarScore);
        Assert.Equal(48, result.VocabularyScore);
        Assert.Equal(62, result.ImpressionScore);
        Assert.Equal(50, result.MissionProgressScore);
        Assert.Equal(56, result.OverallScore);
        Assert.Contains("Điểm cần cải thiện", result.GeneralFeedbackText);
        Assert.Contains("Cách diễn đạt tự nhiên hơn", result.GeneralFeedbackText);
    }

    [Fact]
    public void Evaluate_FallsBackToTurnStatusWhenCategoryDetailIsMissing()
    {
        var result = _service.Evaluate(
            [MissingCategoryFeedbackJson],
            completedMissionCount: 1,
            totalMissionCount: 1,
            isNaturallyConcluded: true);

        Assert.NotNull(result);
        Assert.Equal(65, result.GrammarScore);
        Assert.Equal(90, result.VocabularyScore);
        Assert.Equal(72, result.ImpressionScore);
        Assert.Equal(88, result.OverallScore);
    }

    [Fact]
    public void Evaluate_DoesNotAwardGoodScoreWhenCategoryEvidenceIsMissing()
    {
        var result = _service.Evaluate(
            [GoodButMissingCategoryFeedbackJson],
            completedMissionCount: 1,
            totalMissionCount: 1,
            isNaturallyConcluded: true);

        Assert.NotNull(result);
        Assert.Equal(65, result.GrammarScore);
        Assert.Equal(90, result.VocabularyScore);
        Assert.Equal(72, result.ImpressionScore);
        Assert.Equal(88, result.OverallScore);
    }

    [Fact]
    public void Evaluate_IgnoresSimulatorMalformedAndMissingFeedback()
    {
        var result = _service.Evaluate(
            [SimulatorFeedbackJson, "{invalid-json", null, ""],
            completedMissionCount: 1,
            totalMissionCount: 1,
            isNaturallyConcluded: true);

        Assert.Null(result);
    }

    private const string GoodFeedbackJson = """
    {
      "evaluationSource": "AI",
      "status": "Good",
      "summary": "Rất tốt",
      "details": [
        { "type": "success", "aspect": "Ngữ pháp", "comment": "Cấu trúc câu chính xác." },
        { "type": "success", "aspect": "Từ vựng", "comment": "Dùng từ phù hợp." },
        { "type": "success", "aspect": "Ngữ cảnh", "comment": "Phản hồi đúng tình huống." }
      ]
    }
    """;

    private const string WarningAndErrorFeedbackJson = """
    {
      "evaluationSource": "AI",
      "status": "Warning",
      "summary": "Cần điều chỉnh",
      "details": [
        { "type": "warning", "aspect": "Trợ từ", "comment": "Cần sửa trợ từ は thành が." },
        { "type": "error", "aspect": "Từ vựng", "comment": "Từ được chọn chưa đúng nghĩa." },
        { "type": "success", "aspect": "Ngữ cảnh", "comment": "Câu trả lời đúng ngữ cảnh." }
      ],
      "naturalAlternative": "ラーメンをお願いします。"
    }
    """;

    private const string MixedFeedbackJson = """
    {
      "evaluationSource": "AI",
      "status": "Good",
      "summary": "Khá tốt",
      "details": [
        { "type": "success", "aspect": "Cấu trúc", "comment": "Cấu trúc dễ hiểu." },
        { "type": "warning", "aspect": "Dùng từ", "comment": "Có thể chọn từ tự nhiên hơn." },
        { "type": "warning", "aspect": "Lịch sự", "comment": "Nên dùng thể lịch sự hơn." }
      ]
    }
    """;

    private const string MissingCategoryFeedbackJson = """
    {
      "evaluationSource": "AI",
      "status": "Warning",
      "summary": "Khá tốt",
      "details": [
        { "type": "success", "aspect": "Từ vựng", "comment": "Dùng từ phù hợp." }
      ]
    }
    """;

    private const string GoodButMissingCategoryFeedbackJson = """
    {
      "evaluationSource": "AI",
      "status": "Good",
      "summary": "Rất tốt",
      "details": [
        { "type": "success", "aspect": "Từ vựng", "comment": "Dùng từ phù hợp." }
      ]
    }
    """;

    private const string SimulatorFeedbackJson = """
    {
      "evaluationSource": "Simulator",
      "status": "Good",
      "summary": "Phản xạ tự nhiên • Đúng ngữ cảnh",
      "details": [
        { "type": "success", "aspect": "Ngữ cảnh", "comment": "Câu trả lời phù hợp." }
      ]
    }
    """;
}
