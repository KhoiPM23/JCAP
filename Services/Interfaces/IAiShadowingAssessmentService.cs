using System.IO;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Shadowing;

namespace JCAP.Services.Interfaces
{
    public interface IAiShadowingAssessmentService
    {
        Task<ShadowingAudioEvaluationResponseDto?> EvaluateAudioAsync(
            Stream audioStream,
            string mimeType,
            string targetText,
            CancellationToken cancellationToken = default);
    }
}

