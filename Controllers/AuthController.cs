using JCAP.DTOs.Auth;
using JCAP.DTOs.Common;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _authService;
        private readonly IConfiguration _configuration;

        public AuthController(IAuthService authService, IConfiguration configuration)
        {
            _authService = authService;
            _configuration = configuration;
        }

        /// <summary>
        /// Đăng ký tài khoản mới
        /// </summary>
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterDto dto)
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage)
                    .ToList();
                return BadRequest(ApiResponse<AuthResponseDto>.Fail("Dữ liệu không hợp lệ.", errors));
            }

            var result = await _authService.RegisterAsync(dto);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// Đăng nhập tài khoản và nhận JWT Bearer token
        /// </summary>
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginDto dto)
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage)
                    .ToList();
                return BadRequest(ApiResponse<AuthResponseDto>.Fail("Dữ liệu không hợp lệ.", errors));
            }

            var result = await _authService.LoginAsync(dto);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// Lấy thông tin user hiện tại (yêu cầu Bearer Token qua header)
        /// </summary>
        [Authorize(AuthenticationSchemes = Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme)]
        [HttpGet("me")]
        public async Task<IActionResult> GetCurrentUser()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("nameid")
                ?? User.FindFirstValue("sub");

            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<AuthResponseDto>.Fail("Chưa đăng nhập hoặc token không hợp lệ."));
            }

            var result = await _authService.GetCurrentUserAsync(userId);
            if (!result.Success)
            {
                return NotFound(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// Đăng xuất tài khoản (Client chủ động xóa Bearer token)
        /// </summary>
        [HttpPost("logout")]
        public IActionResult Logout()
        {
            return Ok(ApiResponse<string?>.Ok(null, "Đăng xuất thành công."));
        }

        /// <summary>
        /// Điều hướng sang trang xác thực Google OAuth 2.0
        /// </summary>
        [HttpGet("google")]
        public IActionResult GoogleLogin()
        {
            var authUrl = _authService.GetGoogleAuthUrl();
            return Redirect(authUrl);
        }

        /// <summary>
        /// Xử lý callback từ Google OAuth 2.0, tự động tạo/liên kết tài khoản và sinh JWT Token
        /// </summary>
        [HttpGet("google/callback")]
        public async Task<IActionResult> GoogleCallback([FromQuery] string? code, [FromQuery] string? error)
        {
            var frontendUrl = _configuration["FrontendUrl"] ?? "http://localhost:5173";

            if (!string.IsNullOrEmpty(error) || string.IsNullOrEmpty(code))
            {
                var errorMsg = error ?? "Google authentication was cancelled.";
                return Redirect($"{frontendUrl}/login?error={Uri.EscapeDataString(errorMsg)}");
            }

            var result = await _authService.ProcessGoogleCallbackAsync(code);
            if (!result.Success || result.Data == null)
            {
                return Redirect($"{frontendUrl}/login?error={Uri.EscapeDataString(result.Message)}");
            }

            var data = result.Data;
            var redirectUrl = $"{frontendUrl}/scenarios?token={Uri.EscapeDataString(data.Token)}" +
                $"&userId={Uri.EscapeDataString(data.UserId)}" +
                $"&email={Uri.EscapeDataString(data.Email)}" +
                $"&fullName={Uri.EscapeDataString(data.FullName)}" +
                $"&role={Uri.EscapeDataString(data.Role)}";

            return Redirect(redirectUrl);
        }
    }
}

