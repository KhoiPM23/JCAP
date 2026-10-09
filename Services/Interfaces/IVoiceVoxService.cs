using JCAP.DTOs.Tts;

namespace JCAP.Services.Interfaces
{
    public interface IVoiceVoxService
    {
        Task<List<FlattenedVoiceDto>> GetAvailableVoicesAsync(CancellationToken cancellationToken = default);
        Task<byte[]> SynthesizeAsync(string text, int speakerId, CancellationToken cancellationToken = default);
    }
}

