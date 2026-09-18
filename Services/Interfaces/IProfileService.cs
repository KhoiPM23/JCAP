using JCAP.DTOs.Common;
using JCAP.DTOs.Profile;

namespace JCAP.Services.Interfaces
{
    public interface IProfileService
    {
        Task<ApiResponse<LearnerProfileDto>> GetProfileAsync(string userId);
        Task<ApiResponse<LearnerProfileDto>> UpdateProfileAsync(string userId, UpdateLearnerProfileDto dto);
    }
}
