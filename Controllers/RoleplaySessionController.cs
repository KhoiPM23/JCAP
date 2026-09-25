using System.Security.Claims;
using JCAP.DTOs.Common;
using JCAP.DTOs.Roleplay;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers;

[ApiController]
[Route("api/roleplay")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class RoleplaySessionController : ControllerBase
{
    private readonly IRoleplaySessionService _roleplaySessionService;
    private readonly ILogger<RoleplaySessionController> _logger;

    public RoleplaySessionController(
        IRoleplaySessionService roleplaySessionService,
        ILogger<RoleplaySessionController> logger)
    {
        _roleplaySessionService = roleplaySessionService;
        _logger = logger;
    }

    /// <summary>
    /// GET /api/roleplay/scenarios/{scenarioId}/active-session
    /// Kiểm tra xem người học có phiên luyện tập đang dở (Active) đối với kịch bản này hay không.
    /// </summary>
    [HttpGet("scenarios/{scenarioId:int}/active-session")]
    public async Task<IActionResult> GetActiveSession(int scenarioId, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized(ApiResponse<ActiveRoleplaySessionDto?>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
        }

        if (scenarioId <= 0)
        {
            return BadRequest(ApiResponse<ActiveRoleplaySessionDto?>.Fail("Scenario ID không hợp lệ."));
        }

        var result = await _roleplaySessionService.GetActiveSessionAsync(userId, scenarioId, cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// POST /api/roleplay/scenarios/{scenarioId}/levels/{level}/sessions
    /// Bắt đầu một phiên luyện tập mới (hoặc tiếp tục phiên dở dang nếu không chọn forceRestart).
    /// </summary>
    [HttpPost("scenarios/{scenarioId:int}/levels/{level}/sessions")]
    public async Task<IActionResult> StartSession(
        int scenarioId,
        string level,
        [FromBody] StartRoleplaySessionRequestDto? request,
        CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized(ApiResponse<RoleplaySessionDetailsDto>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
        }

        if (scenarioId <= 0 || string.IsNullOrWhiteSpace(level))
        {
            return BadRequest(ApiResponse<RoleplaySessionDetailsDto>.Fail("Thông tin Scenario ID hoặc Level không hợp lệ."));
        }

        var req = request ?? new StartRoleplaySessionRequestDto();
        var result = await _roleplaySessionService.StartSessionAsync(userId, scenarioId, level, req, cancellationToken);

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// GET /api/roleplay/sessions/{sessionId}
    /// Lấy chi tiết phiên luyện tập (lịch sử tin nhắn, trạng thái các nhiệm vụ, thông tin persona).
    /// </summary>
    [HttpGet("sessions/{sessionId:int}")]
    public async Task<IActionResult> GetSessionDetails(int sessionId, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized(ApiResponse<RoleplaySessionDetailsDto>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
        }

        if (sessionId <= 0)
        {
            return BadRequest(ApiResponse<RoleplaySessionDetailsDto>.Fail("Session ID không hợp lệ."));
        }

        var result = await _roleplaySessionService.GetSessionDetailsAsync(userId, sessionId, cancellationToken);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// POST /api/roleplay/sessions/{sessionId}/messages
    /// Gửi tin nhắn học viên, kích hoạt AI phản hồi, cập nhật mission tự động và kiểm tra kết thúc tự nhiên.
    /// </summary>
    [HttpPost("sessions/{sessionId:int}/messages")]
    public async Task<IActionResult> SendMessage(
        int sessionId,
        [FromBody] SendRoleplayMessageRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized(ApiResponse<RoleplayTurnResponseDto>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
        }

        if (sessionId <= 0)
        {
            return BadRequest(ApiResponse<RoleplayTurnResponseDto>.Fail("Session ID không hợp lệ."));
        }

        if (string.IsNullOrWhiteSpace(request?.Message))
        {
            return BadRequest(ApiResponse<RoleplayTurnResponseDto>.Fail("Nội dung tin nhắn không được để trống."));
        }

        var result = await _roleplaySessionService.SendMessageAsync(userId, sessionId, request, cancellationToken);
        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// POST /api/roleplay/sessions/{sessionId}/hint
    /// Yêu cầu AI gợi ý câu nói tiếp theo (On-demand Hint, không trừ credit).
    /// </summary>
    [HttpPost("sessions/{sessionId:int}/hint")]
    public async Task<IActionResult> GetHint(int sessionId, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized(ApiResponse<RoleplayHintDto>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
        }

        if (sessionId <= 0)
        {
            return BadRequest(ApiResponse<RoleplayHintDto>.Fail("Session ID không hợp lệ."));
        }

        var result = await _roleplaySessionService.GetHintAsync(userId, sessionId, cancellationToken);
        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// POST /api/roleplay/sessions/{sessionId}/end
    /// Kết thúc phiên luyện tập, chuyển trạng thái phiên sang Completed.
    /// </summary>
    [HttpPost("sessions/{sessionId:int}/end")]
    public async Task<IActionResult> EndSession(int sessionId, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized(ApiResponse<bool>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
        }

        if (sessionId <= 0)
        {
            return BadRequest(ApiResponse<bool>.Fail("Session ID không hợp lệ."));
        }

        var result = await _roleplaySessionService.EndSessionAsync(userId, sessionId, cancellationToken);
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
