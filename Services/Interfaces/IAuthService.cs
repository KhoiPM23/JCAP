using JCAP.DTOs.Auth;
using JCAP.DTOs.Common;

namespace JCAP.Services.Interfaces
{
    public interface IAuthService
    {
        Task<ApiResponse<AuthResponseDto>> RegisterAsync(RegisterDto dto);
        Task<ApiResponse<AuthResponseDto>> LoginAsync(LoginDto dto);
        Task<ApiResponse<AuthResponseDto>> GetCurrentUserAsync(string userId);
    }
}

