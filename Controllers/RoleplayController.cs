using System.Security.Claims;
using JCAP.DTOs.Common;
using JCAP.DTOs.Roleplay;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/roleplay")]
    [Authorize(Roles = "Learner")]
    public class RoleplayController : ControllerBase
    {
        private readonly IRoleplayResultService _roleplayResultService;

        public RoleplayController(IRoleplayResultService roleplayResultService)
        {
            _roleplayResultService = roleplayResultService;
        }

        /// <summary>
        /// Bước chốt UC-19: Hoàn tất phiên và tạo snapshot kết quả. Phase 1 dùng mock evaluation.
        /// </summary>
        [HttpPost("sessions/{id:int}/complete")]
        public async Task<IActionResult> CompleteSession(int id)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized(ApiResponse<CompleteRoleplaySessionResponseDto>.Fail(
                    "Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            var result = await _roleplayResultService.CompleteSessionAsync(userId, id);
            if (!result.Success)
            {
                return NotFound(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// UC-20: Xem lịch sử kết quả hội thoại của learner đang đăng nhập.
        /// </summary>
        [HttpGet("results")]
        public async Task<IActionResult> GetHistory(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] bool? passStatus = null)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized(ApiResponse<RoleplayResultHistoryResponseDto>.Fail(
                    "Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            var result = await _roleplayResultService.GetHistoryAsync(userId, page, pageSize, passStatus);
            return Ok(result);
        }

        /// <summary>
        /// UC-21: Xem chi tiết một kết quả hội thoại thuộc learner đang đăng nhập.
        /// </summary>
        [HttpGet("results/{resultId:int}")]
        public async Task<IActionResult> GetDetail(int resultId)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized(ApiResponse<RoleplayResultDetailDto>.Fail(
                    "Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            var result = await _roleplayResultService.GetDetailAsync(userId, resultId);
            if (!result.Success)
            {
                return NotFound(result);
            }

            return Ok(result);
        }

        private string? GetCurrentUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("nameid")
                ?? User.FindFirstValue("sub");
        }
    }
}
