using System.Collections.Generic;
using Microsoft.AspNetCore.Http;

namespace JCAP.DTOs.Shadowing
{
    public class ShadowingAudioEvaluationRequestDto
    {
        public IFormFile? Audio { get; set; }
        public string TargetText { get; set; } = string.Empty;
    }

    public class ShadowingAudioEvaluationResponseDto
    {
        /// <summary>
        /// Trạng thái đánh giá: completed | partial | unavailable | failed
        /// </summary>
        public string EvaluationStatus { get; set; } = "completed";

        /// <summary>
        /// Nội dung câu nhận diện được từ âm thanh
        /// </summary>
        public string RecognizedText { get; set; } = string.Empty;

        /// <summary>
        /// Điểm khớp nội dung câu chữ (0 - 100)
        /// </summary>
        public int? ContentMatchScore { get; set; }

        /// <summary>
        /// Điểm phát âm chuyên sâu (null nếu chỉ đánh giá khớp câu chữ, không bịa điểm giả)
        /// </summary>
        public int? PronunciationScore { get; set; }

        /// <summary>
        /// Điểm lưu loát khoa học (0 - 100)
        /// </summary>
        public int? FluencyScore { get; set; }

        /// <summary>
        /// Điểm tổng thể có trọng số (60% Content Match + 40% Fluency)
        /// </summary>
        public int? OverallScore { get; set; }

        public string Tier { get; set; } = string.Empty;

        /// <summary>
        /// Nhận xét sư phạm có căn cứ thực tế
        /// </summary>
        public string Feedback { get; set; } = string.Empty;

        /// <summary>
        /// Danh sách từ/cụm từ bị nói thiếu trong câu mẫu
        /// </summary>
        public List<string> MissingWords { get; set; } = new();

        /// <summary>
        /// Danh sách từ/trợ từ bị nói sai hoặc lệch
        /// </summary>
        public List<string> MismatchedWords { get; set; } = new();

        /// <summary>
        /// Nguồn đánh giá: gemini | client_fallback
        /// </summary>
        public string Source { get; set; } = "gemini";

        public string? ErrorCode { get; set; }
        public string? ErrorMessage { get; set; }
    }
}

