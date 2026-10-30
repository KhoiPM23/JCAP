using JCAP.DTOs.Tts;

namespace JCAP.Services.Interfaces
{
    public interface IVoiceVoxService
    {
        Task<List<FlattenedVoiceDto>> GetAvailableVoicesAsync(CancellationToken cancellationToken = default);
        Task<byte[]> SynthesizeAsync(string text, int speakerId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Mốc thời gian từng mora của giọng mẫu theo `audio_query` (ước lượng của engine, không phải đo từ audio).
        /// Trả về null nếu không lấy được. Kết quả được cache theo (giọng, văn bản).
        /// </summary>
        Task<IReadOnlyList<MoraTiming>?> GetMoraTimelineAsync(string text, int speakerId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Lấy chuỗi JSON mảng viseme khẩu hình (t: giây, v: viseme A/I/U/E/O/N/closed) đã được tính toán từ audio_query.
        /// </summary>
        string? GetVisemesJson(string text, int speakerId);
    }

    /// <summary>Một mora trong audio_query, tính bằng giây kể từ đầu audio (đã gồm khoảng lặng đầu).</summary>
    public sealed record MoraTiming(string Text, double StartSec, double ConsonantSec, double VowelSec, bool IsPause, string Vowel = "")
    {
        public double EndSec => StartSec + ConsonantSec + VowelSec;
        public double VowelStartSec => StartSec + ConsonantSec;
    }
}
