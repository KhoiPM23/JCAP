using JCAP.DTOs.Common;
using JCAP.DTOs.Roleplay;

namespace JCAP.Services.Interfaces
{
    public interface IRoleplayResultService
    {
        Task<ApiResponse<CompleteRoleplaySessionResponseDto>> CompleteSessionAsync(string userId, int sessionId);
        Task<ApiResponse<RoleplayResultHistoryResponseDto>> GetHistoryAsync(
            string userId,
            int page = 1,
            int pageSize = 10,
            bool? passStatus = null);
        Task<ApiResponse<RoleplayResultDetailDto>> GetDetailAsync(string userId, int resultId);
    }
}
