using System.Security.Claims;
using JCAP.DTOs.Common;
using JCAP.DTOs.PlacementTest;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/placement-test")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class PlacementTestController : ControllerBase
    {
        private readonly IPlacementTestService _placementTestService;
        private readonly ILogger<PlacementTestController> _logger;

        public PlacementTestController(
            IPlacementTestService placementTestService,
            ILogger<PlacementTestController> logger)
        {
            _placementTestService = placementTestService;
            _logger = logger;
        }

        /// <summary>
        /// GET /api/placement-test/status
        /// Lấy trạng thái Placement Test của người dùng hiện tại (NotStarted, Skipped, InProgress, Completed).
        /// </summary>
        [HttpGet("status")]
        public async Task<IActionResult> GetStatus(CancellationToken cancellationToken)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<PlacementTestStatusDto>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            var result = await _placementTestService.GetStatusAsync(userId, cancellationToken);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// POST /api/placement-test/start
        /// Bắt đầu hoặc tiếp tục (Resume) bài kiểm tra xếp lớp (0 Credit - BR-PT-05).
        /// </summary>
        [HttpPost("start")]
        public async Task<IActionResult> Start([FromQuery] bool reset = false, CancellationToken cancellationToken = default)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<PlacementTestStartResponseDto>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            var result = await _placementTestService.StartOrResumeSessionAsync(userId, reset, cancellationToken);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// POST /api/placement-test/skip
        /// Bỏ qua bài kiểm tra xếp lớp (BR-PT-03, BR-PT-04).
        /// </summary>
        [HttpPost("skip")]
        public async Task<IActionResult> Skip(CancellationToken cancellationToken)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<bool>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            var result = await _placementTestService.SkipTestAsync(userId, cancellationToken);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// POST /api/placement-test/sessions/{sessionId}/messages
        /// Xử lý một lượt đối thoại trong bài kiểm tra xếp lớp.
        /// </summary>
        [HttpPost("sessions/{sessionId:int}/messages")]
        public async Task<IActionResult> SendMessage(
            int sessionId,
            [FromBody] PlacementTestMessageRequestDto request,
            CancellationToken cancellationToken)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<PlacementTestMessageResponseDto>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            if (sessionId <= 0)
            {
                return BadRequest(ApiResponse<PlacementTestMessageResponseDto>.Fail("SessionId không hợp lệ."));
            }

            var result = await _placementTestService.ProcessMessageAsync(userId, sessionId, request, cancellationToken);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// POST /api/placement-test/sessions/{sessionId}/complete
        /// Kết thúc sớm hoặc tổng hợp kết quả bài kiểm tra xếp lớp.
        /// </summary>
        [HttpPost("sessions/{sessionId:int}/complete")]
        public async Task<IActionResult> Complete(int sessionId, CancellationToken cancellationToken)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<PlacementTestCompleteResponseDto>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            if (sessionId <= 0)
            {
                return BadRequest(ApiResponse<PlacementTestCompleteResponseDto>.Fail("SessionId không hợp lệ."));
            }

            var result = await _placementTestService.CompleteSessionAsync(userId, sessionId, cancellationToken);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// GET /api/placement-test/history
        /// Lấy danh sách lịch sử các phiên kiểm tra xếp lớp của người dùng.
        /// </summary>
        [HttpGet("history")]
        public async Task<IActionResult> GetHistory(CancellationToken cancellationToken)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<List<PlacementTestHistoryItemDto>>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            var result = await _placementTestService.GetHistoryListAsync(userId, cancellationToken);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// GET /api/placement-test/history/{sessionId}
        /// Lấy chi tiết bằng chứng và nhận xét của một phiên kiểm tra xếp lớp cụ thể.
        /// </summary>
        [HttpGet("history/{sessionId:int}")]
        public async Task<IActionResult> GetHistoryDetail(int sessionId, CancellationToken cancellationToken)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<PlacementTestHistoryDetailDto>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            if (sessionId <= 0)
            {
                return BadRequest(ApiResponse<PlacementTestHistoryDetailDto>.Fail("SessionId không hợp lệ."));
            }

            var result = await _placementTestService.GetHistoryDetailAsync(userId, sessionId, cancellationToken);
            if (!result.Success)
            {
                return BadRequest(result);
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
