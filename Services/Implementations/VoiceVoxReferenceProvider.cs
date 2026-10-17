using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Giọng mẫu để so nhịp nói: tái sử dụng VoiceVoxService (đã có cache RAM + đĩa). Thường người học vừa nghe đúng giọng này
    /// nên audio đã nằm sẵn trong cache. Không bao giờ ném lỗi: không tạo được thì trả null và phần so sánh báo "không có giọng mẫu".
    /// </summary>
    public sealed class VoiceVoxReferenceProvider : IReferenceVoiceProvider
    {
        private const int MaxTextLength = 300;
        private const int MaxSpeakerId = 99999;
        private const int DefaultSpeaker = 1;
        private const int DefaultTimeoutMs = 3000;

        private readonly IVoiceVoxService _voiceVox;
        private readonly IConfiguration _configuration;
        private readonly ILogger<VoiceVoxReferenceProvider> _logger;

        public VoiceVoxReferenceProvider(
            IVoiceVoxService voiceVox,
            IConfiguration configuration,
            ILogger<VoiceVoxReferenceProvider> logger)
        {
            _voiceVox = voiceVox;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<ReferenceVoice?> GetAsync(string text, int? preferredSpeakerId, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(text) || text.Length > MaxTextLength) return null;

            var speaker = preferredSpeakerId is >= 0 and <= MaxSpeakerId
                ? preferredSpeakerId.Value
                : _configuration.GetValue<int?>("Shadowing:Fluency:ReferenceSpeaker")
                  ?? _configuration.GetValue<int?>("Shadowing:Reading:Speaker")
                  ?? DefaultSpeaker;

            var timeoutMs = _configuration.GetValue<int?>("Shadowing:Fluency:ReferenceTimeoutMs") ?? DefaultTimeoutMs;
            using var timeout = new CancellationTokenSource(timeoutMs);
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeout.Token);

            try
            {
                var wav = await _voiceVox.SynthesizeAsync(text, speaker, linked.Token).WaitAsync(linked.Token);
                if (wav.Length == 0) return null;

                // Mốc mora chỉ để đo thời lượng trường âm (thử nghiệm); thiếu thì chỉ mất phần đó.
                IReadOnlyList<MoraTiming>? timeline = null;
                try
                {
                    timeline = await _voiceVox.GetMoraTimelineAsync(text, speaker, linked.Token).WaitAsync(linked.Token);
                }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                {
                    _logger.LogWarning("Không lấy được mốc mora của giọng mẫu: {Message}", ex.Message);
                }

                return new ReferenceVoice { Wav = wav, SpeakerId = speaker, Timeline = timeline };
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw; // người gọi hủy: không nuốt
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Không tạo được giọng mẫu để so nhịp nói (speaker {Speaker}): {Message}", speaker, ex.Message);
                return null;
            }
        }
    }
}
