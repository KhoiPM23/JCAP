using System.Threading;
using System.Threading.Tasks;

namespace JCAP.Services.Interfaces
{
    public enum SpeechRecognitionOutcome
    {
        Recognized,
        NoSpeech,
        NotConfigured,
        Timeout,
        QuotaExceeded,
        ProviderError,
        MalformedResponse
    }

    public sealed class SpeechRecognitionResult
    {
        public SpeechRecognitionOutcome Outcome { get; init; }
        public string Text { get; init; } = string.Empty;
        public string? ErrorCode { get; init; }
    }

    /// <summary>Chỉ nhận dạng giọng nói (STT). Không chấm điểm và không biết câu mẫu.</summary>
    public interface IShadowingSpeechRecognizer
    {
        /// <param name="timeout">Ghi đè thời gian chờ mặc định (null = dùng cấu hình). Dùng chờ ngắn hơn khi đã có nguồn dự phòng.</param>
        Task<SpeechRecognitionResult> TranscribeAsync(
            byte[] audio,
            string mimeType,
            CancellationToken cancellationToken = default,
            TimeSpan? timeout = null);
    }
}
