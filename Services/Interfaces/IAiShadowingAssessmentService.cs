using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Shadowing;

namespace JCAP.Services.Interfaces
{
    /// <summary>
    /// Điều phối đánh giá một câu Shadowing: kiểm tra audio, nhận dạng, so khớp và chấm điểm.
    /// Backend là nơi duy nhất quyết định điểm cuối cùng.
    /// </summary>
    public interface IAiShadowingAssessmentService
    {
        Task<ShadowingAudioEvaluationResponseDto> EvaluateAsync(
            ShadowingAudioEvaluationInput input,
            CancellationToken cancellationToken = default);
    }

    public sealed class ShadowingAudioEvaluationInput
    {
        public byte[] Audio { get; init; } = System.Array.Empty<byte>();
        public string MimeType { get; init; } = string.Empty;
        public string TargetText { get; init; } = string.Empty;
        public string? ClientTranscript { get; init; }
        public string? ClientRecognitionStatus { get; init; }
        public string? ClientRecognitionError { get; init; }
        public string? AudioGateStatus { get; init; }
        public string? AudioGateDetail { get; init; }

        /// <summary>WAV PCM 16-bit mono 16 kHz để đo nhịp nói (tùy chọn).</summary>
        public byte[]? AnalysisWav { get; init; }

        /// <summary>Giọng VOICEVOX người học đã nghe làm mẫu (tùy chọn; dùng để tạo audio mẫu so nhịp nói).</summary>
        public int? ReferenceSpeakerId { get; init; }
    }
}
