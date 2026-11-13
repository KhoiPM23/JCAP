using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace JCAP.Services.Interfaces
{
    /// <summary>
    /// Nhận dạng NỘI DUNG lời nói (ASR) cho chiều Content Accuracy (Shadowing V2, Decision 1). Không dùng để chấm phát âm.
    /// Nhà cung cấp hiện tại: FasterWhisperSpeechRecognitionService. Thay nhà cung cấp không phải sửa logic đánh giá.
    /// KHÔNG tự chuyển nhà cung cấp khi lỗi: lỗi thì Status = unavailable/failed và chiều Content báo UNAVAILABLE.
    /// </summary>
    public interface ISpeechRecognitionService
    {
        /// <summary>Định danh nhà cung cấp (ghi vào kết quả): "faster-whisper".</summary>
        string Provider { get; }

        Task<SpeechRecognitionResult> RecognizeAsync(SpeechRecognitionRequest request, CancellationToken cancellationToken = default);

        Task<SpeechRecognitionHealth> CheckHealthAsync(CancellationToken cancellationToken = default);
    }

    public sealed class SpeechRecognitionRequest
    {
        /// <summary>WAV PCM 16-bit mono 16 kHz (bản WAV phân tích đã được ShadowingAudioValidator kiểm tra).</summary>
        public byte[] Wav { get; init; } = System.Array.Empty<byte>();

        /// <summary>Luôn "ja".</summary>
        public string Language { get; init; } = "ja";
    }

    public sealed class SpeechRecognitionSegment
    {
        public double Start { get; init; }
        public double End { get; init; }
        public string Text { get; init; } = string.Empty;
        /// <summary>Siêu dữ liệu thô của Whisper — KHÔNG phải xác suất phát âm đúng, chưa hiệu chỉnh.</summary>
        public double? AvgLogprob { get; init; }
        public double? NoSpeechProb { get; init; }
        public double? CompressionRatio { get; init; }
    }

    public sealed class SpeechRecognitionResult
    {
        /// <summary>completed | unavailable (dịch vụ tắt/bận/quá hạn) | failed (lỗi không mong đợi)</summary>
        public string Status { get; init; } = "unavailable";

        /// <summary>ASR_UNAVAILABLE | ASR_TIMEOUT | ASR_BUSY | ASR_REJECTED_AUDIO | ASR_ERROR</summary>
        public string? ErrorCode { get; init; }

        public string Provider { get; init; } = string.Empty;
        public string Text { get; init; } = string.Empty;

        /// <summary>Cách đọc (katakana) của transcript do dịch vụ tính (OpenJTalk); null nếu dịch vụ không cung cấp.</summary>
        public string? Reading { get; init; }

        public string Language { get; init; } = "ja";
        public string Model { get; init; } = string.Empty;
        public string ModelVersion { get; init; } = string.Empty;
        public int ProcessingMs { get; init; }
        public IReadOnlyList<SpeechRecognitionSegment> Segments { get; init; } = new List<SpeechRecognitionSegment>();

        public bool IsCompleted => Status == "completed";

        public static SpeechRecognitionResult Unavailable(string provider, string code) =>
            new() { Status = code == "ASR_ERROR" ? "failed" : "unavailable", ErrorCode = code, Provider = provider };
    }

    public sealed class SpeechRecognitionHealth
    {
        public bool Available { get; init; }
        public string Provider { get; init; } = string.Empty;
        public string? Model { get; init; }
        public bool ReadingAvailable { get; init; }
        public string? Error { get; init; }
    }
}
