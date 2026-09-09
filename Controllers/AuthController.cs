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

        public AuthController(IAuthService authService)
        {
            _authService = authService;
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
        [Authorize]
        [HttpGet("me")]
        public async Task<IActionResult> GetCurrentUser()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
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
    }
}

