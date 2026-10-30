using System;
using System.Collections.Generic;

namespace JCAP.DTOs.Shadowing
{
    /// <summary>
    /// Hoàn thành buổi luyện. Client KHÔNG gửi điểm: chỉ gửi Id các kết quả chấm câu (EvaluationId) mà backend đã trả
    /// từ evaluate-audio; backend tự đọc điểm đã lưu, tính điểm tổng và lưu ShadowingPracticeSession.
    /// </summary>
    public class ShadowingSessionCompleteDto
    {
        public int DialogueId { get; set; }

        /// <summary>A | B</summary>
        public string LearnerRole { get; set; } = "A";

        public int DurationSeconds { get; set; }

        /// <summary>Thời điểm bắt đầu luyện (tùy chọn; không hợp lệ thì suy ra từ DurationSeconds).</summary>
        public DateTime? StartedAt { get; set; }

        public List<Guid> EvaluationIds { get; set; } = new();
    }

    public class ShadowingSessionCompleteResponseDto
    {
        public Guid SessionId { get; set; }
        public int DialogueId { get; set; }
        public string DialogueTitle { get; set; } = string.Empty;
        public int OverallAccuracyScore { get; set; }
        public int? OverallFluencyScore { get; set; }
        public string AudioQualityStatus { get; set; } = "unmeasured";
        public int WeightedOverallScore { get; set; }
        public string ScoringVersion { get; set; } = string.Empty;
        public string RankTitle { get; set; } = string.Empty;
        public string SummaryFeedback { get; set; } = string.Empty;
        public int LearnerSentenceCount { get; set; }
        public int ScoredSentenceCount { get; set; }
    }

    /// <summary>Một buổi luyện trong lịch sử (đọc từ CSDL).</summary>
    public class ShadowingPracticeSessionDto
    {
        public Guid Id { get; set; }
        public int DialogueId { get; set; }
        public string DialogueTitle { get; set; } = string.Empty;
        public string ScenarioTitle { get; set; } = string.Empty;
        public string JlptLevel { get; set; } = string.Empty;
        public string LearnerRole { get; set; } = "A";
        public DateTime StartedAt { get; set; }
        public DateTime CompletedAt { get; set; }
        public int DurationSeconds { get; set; }
        public int ContentMatchScore { get; set; }
        public int? FluencyScore { get; set; }
        public int WeightedOverallScore { get; set; }
        public string ScoringVersion { get; set; } = string.Empty;
        public string AudioQualityStatus { get; set; } = "unmeasured";
        public string RankTitle { get; set; } = string.Empty;
        public int LearnerSentenceCount { get; set; }
        public int ScoredSentenceCount { get; set; }
        public List<ShadowingSessionSentenceDto> Sentences { get; set; } = new();
    }

    /// <summary>Kết quả chấm của một câu trong buổi luyện (đã lưu ở backend).</summary>
    public class ShadowingSessionSentenceDto
    {
        public Guid EvaluationId { get; set; }
        public int SentenceId { get; set; }
        public int OrderIndex { get; set; }
        public string TargetText { get; set; } = string.Empty;
        public string RecognizedText { get; set; } = string.Empty;
        public int ContentMatchScore { get; set; }
        public int OverallScore { get; set; }
        public string Tier { get; set; } = string.Empty;
        public string Feedback { get; set; } = string.Empty;
        public string ScoringVersion { get; set; } = string.Empty;
        public List<ShadowingDiffTokenDto> DiffTokens { get; set; } = new();
        public DateTime EvaluatedAt { get; set; }
    }
}
