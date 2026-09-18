using JCAP.DTOs.Auth;
using JCAP.DTOs.Common;

namespace JCAP.Services.Interfaces
{
    public interface IAuthService
    {
        Task<ApiResponse<RegisterResponseDto>> RegisterAsync(RegisterDto dto);
        Task<ApiResponse<bool>> ConfirmEmailAsync(string userId, string token);
        Task<ApiResponse<AuthResponseDto>> LoginAsync(LoginDto dto);
        Task<ApiResponse<AuthResponseDto>> GetCurrentUserAsync(string userId);
        Task<ApiResponse<string>> ForgotPasswordAsync(ForgotPasswordDto dto);
        Task<ApiResponse<string>> ResetPasswordAsync(ResetPasswordDto dto);
        Task<ApiResponse<string>> ChangePasswordAsync(string userId, ChangePasswordDto dto);
        string GetGoogleAuthUrl();
        Task<ApiResponse<AuthResponseDto>> ProcessGoogleCallbackAsync(string code);
    }
}

