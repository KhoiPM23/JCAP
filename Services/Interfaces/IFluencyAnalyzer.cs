using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Shadowing;

namespace JCAP.Services.Interfaces
{
    /// <summary>
    /// Đo các chỉ số nhịp nói (tốc độ, khoảng dừng) từ bản ghi WAV. Cùng một bộ VAD và tiêu chí khoảng dừng
    /// cho cả bản ghi người học lẫn giọng mẫu.
    /// Chỉ trả SỐ LIỆU THÔ đo được từ tín hiệu, KHÔNG cho điểm và KHÔNG đánh giá phát âm đúng/sai.
    /// </summary>
    public interface IFluencyAnalyzer
    {
        /// <summary>Bản ghi người học: WAV PCM 16-bit mono ĐÚNG 16 kHz (sai định dạng thì unavailable).</summary>
        /// <param name="moraCount">Số mora của câu mẫu (null: không tính tốc độ mora/giây).</param>
        FluencyMetricsDto Analyze(byte[] wav, int? moraCount);

        /// <summary>Audio do backend tạo (giọng mẫu): WAV PCM 16-bit mono tần số bất kỳ, được hạ về 16 kHz trước khi đo.</summary>
        FluencyMetricsDto AnalyzeAnyRate(byte[] wav, int? moraCount);
    }

    /// <summary>Cung cấp audio giọng mẫu (WAV) cho câu đang luyện.</summary>
    public interface IReferenceVoiceProvider
    {
        /// <summary>Trả về null nếu không tạo được (engine tắt, quá hạn, câu không hợp lệ). Không bao giờ ném lỗi.</summary>
        Task<ReferenceVoice?> GetAsync(string text, int? preferredSpeakerId, CancellationToken cancellationToken = default);
    }

    public sealed class ReferenceVoice
    {
        public byte[] Wav { get; init; } = System.Array.Empty<byte>();
        public int SpeakerId { get; init; }
        public string Source { get; init; } = "voicevox";

        /// <summary>Mốc thời gian từng mora theo audio_query (ước lượng của engine); null nếu không lấy được.</summary>
        public System.Collections.Generic.IReadOnlyList<MoraTiming>? Timeline { get; init; }
    }
}
