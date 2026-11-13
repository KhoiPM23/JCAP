using System;

namespace JCAP.Models
{
    /// <summary>
    /// Kết quả chấm một câu Shadowing do CHÍNH backend tạo ra (qua evaluate-audio) và lưu lại.
    /// Đây là nguồn điểm duy nhất khi hoàn thành buổi luyện: client chỉ gửi Id, không gửi điểm.
    /// MỖI lần gửi chấm (có SentenceId) là một dòng mới, kể cả lần "chưa chấm được" (điểm null + ErrorCode, KHÔNG phải 0).
    /// Buổi luyện chỉ tính các dòng có điểm.
    /// </summary>
    public class ShadowingSentenceEvaluation
    {
        public Guid Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public int ShadowingSentenceId { get; set; }

        /// <summary>Buổi luyện đã dùng kết quả này; null khi chưa được gắn vào buổi nào.</summary>
        public Guid? ShadowingPracticeSessionId { get; set; }

        /// <summary>Tiến độ (phiên đang luyện) mà lần chấm này thuộc về; null với client cũ không gửi progressId.</summary>
        public Guid? ShadowingPracticeProgressId { get; set; }

        /// <summary>
        /// Id do client sinh cho MỘT lần bấm "Gửi chấm". Gửi lại cùng Id (mất mạng, quá hạn) không tạo dòng mới.
        /// </summary>
        public Guid? ClientSubmissionId { get; set; }

        public string RecognizedText { get; set; } = string.Empty;

        /// <summary>null = không chấm được (không phải 0).</summary>
        public int? ContentMatchScore { get; set; }

        /// <summary>null = không chấm được (không phải 0).</summary>
        public int? OverallScore { get; set; }

        /// <summary>green | yellow | red; rỗng nếu không có điểm.</summary>
        public string Tier { get; set; } = string.Empty;

        /// <summary>completed | partial (dữ liệu cũ) | unavailable | failed</summary>
        public string EvaluationStatus { get; set; } = string.Empty;

        /// <summary>Lý do không chấm được (NO_SPEECH_DETECTED, AUDIO_TOO_QUIET, RECOGNIZER_UNAVAILABLE…); null nếu có điểm.</summary>
        public string? ErrorCode { get; set; }

        /// <summary>phoneme | web_speech (dữ liệu cũ) | gemini (dữ liệu cũ) | none</summary>
        public string RecognitionSource { get; set; } = string.Empty;

        /// <summary>aligned | free (khi RecognitionSource = phoneme) | asr; rỗng với dữ liệu cũ.</summary>
        public string RecognitionMode { get; set; } = string.Empty;

        /// <summary>JSON trạng thái/điểm từng chiều (EvaluationDimensionsDto); null với dữ liệu trước Shadowing V2 M4.</summary>
        public string? DimensionsJson { get; set; }

        /// <summary>
        /// Số liệu Lưu loát rút gọn của lần chấm (ShadowingFluencySnapshotDto, JSON): tốc độ so với mẫu, chỗ ngừng, ngập ngừng,
        /// nói liền trung bình, nhận xét. Null nếu không so được với giọng mẫu hoặc lần chấm trước khi có cột này.
        /// </summary>
        public string? FluencyJson { get; set; }

        /// <summary>Mô hình ASR đã dùng (vd. faster-whisper:small).</summary>
        public string? AsrModel { get; set; }

        /// <summary>Thời gian backend xử lý lượt chấm (ms).</summary>
        public int? ProcessingMs { get; set; }

        public string ScoringVersion { get; set; } = string.Empty;
        public string ComparisonMethod { get; set; } = string.Empty;
        public string AudioQualityStatus { get; set; } = "unmeasured";
        public string Feedback { get; set; } = string.Empty;

        /// <summary>Danh sách ShadowingDiffTokenDto (JSON) để hiển thị lại trong lịch sử.</summary>
        public string DiffTokensJson { get; set; } = "[]";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ApplicationUser? User { get; set; }
        public ShadowingSentence? ShadowingSentence { get; set; }
        public ShadowingPracticeSession? ShadowingPracticeSession { get; set; }
        public ShadowingPracticeProgress? ShadowingPracticeProgress { get; set; }
    }
}
