using System.Collections.Generic;

namespace JCAP.DTOs.Roleplay;

/// <summary>
/// Ngữ cảnh thích ứng thống nhất (Long-term + Recent Window) dùng chung cho FE-03, Roadmap, Shadowing, Flashcard & Explore.
/// Không biến đổi nội dung tĩnh; chỉ cung cấp tín hiệu xếp hạng và gợi ý thích ứng.
/// </summary>
public sealed class AdaptiveContextDto
{
    public string UserId { get; set; } = string.Empty;

    // 1. Dài hạn (Toàn bộ quá trình học)
    public string EstimatedJlptLevel { get; set; } = "N5";
    public string EstimatedJlptLabel { get; set; } = "N5 (Cơ bản)";
    public double ThetaEstimate { get; set; }
    public double ProficiencyIndex { get; set; }
    public int TotalCompletedSessions { get; set; }
    public AdaptiveSkillScoresDto SkillScores { get; set; } = new();
    public List<string> ChronicWeaknesses { get; set; } = new();

    // 2. Ngắn hạn (6 phiên gần nhất & 7 ngày qua)
    public string RecentTrend { get; set; } = "Stable"; // Improving | Stable | Struggling
    public int ConsecutiveFailCount { get; set; }
    public double? RecentAverageScore { get; set; }
    public List<string> HotWeaknesses { get; set; } = new();

    // 3. Đề xuất thống nhất cho các phân hệ
    public string RecommendedDifficulty { get; set; } = "N5";
    public List<string> FocusSkillTags { get; set; } = new();
    public List<int> RecommendedScenarioIds { get; set; } = new();
    public List<AdaptiveScenarioRecommendationDto> RecommendedScenarios { get; set; } = new();
    public List<int> RecommendedShadowingIds { get; set; } = new();
    public List<string> RecommendedFlashcardKeywords { get; set; } = new();
    public string? AiRuntimeDirective { get; set; }
}

public sealed class AdaptiveScenarioRecommendationDto
{
    public int ScenarioId { get; set; }
    public string RecommendedLevel { get; set; } = "N5";
    public string Tier { get; set; } = "Core"; // Consolidate | Core | Stretch
    public int MatchScore { get; set; }        // 0..98 real computed match %
    public int PredictedPassRate { get; set; } // 0..100 IRT P(pass)
    public string ReasonVi { get; set; } = string.Empty;
    public bool IsTopPick { get; set; }
}

public sealed class AdaptiveSkillScoresDto
{
    public double Grammar { get; set; }
    public double Vocabulary { get; set; }
    public double Fluency { get; set; }
    public double Pronunciation { get; set; }
    public double Autonomy { get; set; }
}
