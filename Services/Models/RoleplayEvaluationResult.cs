namespace JCAP.Services.Models;

public sealed class RoleplayEvaluationResult
{
    public int OverallScore { get; init; }
    public int GrammarScore { get; init; }
    public int VocabularyScore { get; init; }
    public int ImpressionScore { get; init; }
    public string GeneralFeedbackText { get; init; } = string.Empty;
    public int EvaluatedTurnCount { get; init; }
}
