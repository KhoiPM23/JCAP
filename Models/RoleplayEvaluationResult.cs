namespace JCAP.Models;

/// <summary>
/// Kết quả tính điểm nội bộ của một phiên roleplay.
/// Đây không phải EF Core entity và không được ánh xạ vào AppDbContext.
/// </summary>
public sealed class RoleplayEvaluationResult
{
    public int OverallScore { get; init; }
    public int GrammarScore { get; init; }
    public int VocabularyScore { get; init; }
    public int ImpressionScore { get; init; }
    public string GeneralFeedbackText { get; init; } = string.Empty;
    public int EvaluatedTurnCount { get; init; }
}
