using JCAP.DTOs.Common;
using JCAP.DTOs.PlacementTest;

namespace JCAP.Services.Interfaces
{
    public interface IPlacementTestService
    {
        Task<ApiResponse<PlacementTestStatusDto>> GetStatusAsync(string userId, CancellationToken cancellationToken = default);
        Task<ApiResponse<PlacementTestStartResponseDto>> StartOrResumeSessionAsync(string userId, CancellationToken cancellationToken = default);
        Task<ApiResponse<bool>> SkipTestAsync(string userId, CancellationToken cancellationToken = default);
        Task<ApiResponse<PlacementTestMessageResponseDto>> ProcessMessageAsync(string userId, int sessionId, PlacementTestMessageRequestDto request, CancellationToken cancellationToken = default);
        Task<ApiResponse<PlacementTestCompleteResponseDto>> CompleteSessionAsync(string userId, int sessionId, CancellationToken cancellationToken = default);
    }
}
