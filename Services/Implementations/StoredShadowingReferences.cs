using System.Threading;
using System.Threading.Tasks;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Nguồn cách đọc ĐẦU TIÊN khi chấm: dữ liệu câu mẫu tính sẵn (ShadowingSentenceAsset), không gọi VOICEVOX.
    /// Không có (câu chưa được tạo dữ liệu, hoặc văn bản không phải câu mẫu) thì trả null để nguồn kế tiếp xử lý —
    /// VoiceVoxKanaReader, có thể tắt bằng `Shadowing:Reading:UseVoiceVox = false` để lúc chấm hoàn toàn không cần VOICEVOX.
    /// </summary>
    public sealed class StoredKanaReader : IKanaReader
    {
        private readonly IShadowingSentenceAssetService _assets;
        public StoredKanaReader(IShadowingSentenceAssetService assets) => _assets = assets;

        public string SourceId => "voicevox-stored";

        public Task<KanaReading?> TryReadAsync(string text, CancellationToken cancellationToken = default) =>
            _assets.FindReadingAsync(text, cancellationToken);
    }

    /// <summary>
    /// Giọng mẫu để so nhịp nói: ưu tiên bản tính sẵn (tệp WAV + mốc mora đã lưu). Không có thì tổng hợp bằng VOICEVOX
    /// như trước, trừ khi `Shadowing:Fluency:UseVoiceVoxAtRuntime = false` (khi đó phần so sánh báo "không có giọng mẫu").
    /// </summary>
    public sealed class StoredReferenceVoiceProvider : IReferenceVoiceProvider
    {
        private readonly IShadowingSentenceAssetService _assets;
        private readonly VoiceVoxReferenceProvider _voiceVox;
        private readonly IConfiguration _configuration;
        private readonly ILogger<StoredReferenceVoiceProvider> _logger;

        public StoredReferenceVoiceProvider(
            IShadowingSentenceAssetService assets, VoiceVoxReferenceProvider voiceVox, IConfiguration configuration, ILogger<StoredReferenceVoiceProvider> logger)
        {
            _assets = assets;
            _voiceVox = voiceVox;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<ReferenceVoice?> GetAsync(string text, int? preferredSpeakerId, CancellationToken cancellationToken = default)
        {
            var speaker = preferredSpeakerId
                ?? _configuration.GetValue<int?>("Shadowing:Fluency:ReferenceSpeaker")
                ?? _configuration.GetValue<int?>("Shadowing:Reading:Speaker")
                ?? 1;
            try
            {
                var stored = await _assets.FindReferenceAsync(text, speaker, cancellationToken);
                if (stored != null) return stored;
            }
            catch (System.Exception ex) when (ex is not System.OperationCanceledException)
            {
                _logger.LogWarning(ex, "Không đọc được giọng mẫu đã lưu; thử nguồn khác.");
            }

            if (_configuration.GetValue<bool?>("Shadowing:Fluency:UseVoiceVoxAtRuntime") == false) return null;
            return await _voiceVox.GetAsync(text, preferredSpeakerId, cancellationToken);
        }
    }
}
