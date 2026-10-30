using JCAP.DTOs.Stt;

namespace JCAP.Services.Interfaces;

public interface IWhisperSttService
{
    Task<WhisperTranscribeResponseDto?> TranscribeAsync(
        Stream audioStream,
        string fileName,
        string language = "ja",
        CancellationToken cancellationToken = default);

    Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default);
}
