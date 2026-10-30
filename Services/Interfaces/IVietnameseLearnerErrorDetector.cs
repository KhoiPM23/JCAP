using System.Collections.Generic;

namespace JCAP.Services.Interfaces
{
    public class DetectedGrammarIssue
    {
        public string Code { get; set; } = null!;
        public string Title { get; set; } = null!;
        public string Severity { get; set; } = "warning"; // info, warning, error
        public string MatchedSnippet { get; set; } = null!;
        public string SuggestedFix { get; set; } = null!;
        public string ExplanationVi { get; set; } = null!;
    }

    public interface IVietnameseLearnerErrorDetector
    {
        /// <summary>
        /// Quét nhanh lỗi chuyển dịch Việt-Nhật (E01-E10) trong <5ms bằng Regex và từ điển phân tích trước khi gọi LLM.
        /// </summary>
        IReadOnlyList<DetectedGrammarIssue> DetectErrors(string japaneseText);
    }
}
