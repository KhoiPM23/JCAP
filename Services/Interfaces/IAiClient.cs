using JCAP.Services.Models;

namespace JCAP.Services.Interfaces;

public interface IAiClient
{
    Task<AiResponse> GenerateAsync(AiRequest request, CancellationToken cancellationToken = default);
}
