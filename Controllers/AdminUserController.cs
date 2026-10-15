using System.Security.Claims;
using JCAP.DTOs.AdminUser;
using JCAP.DTOs.Common;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers;

[ApiController]
[Route("api/admin/users")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = "Admin")]
public class AdminUserController : ControllerBase
{
    private readonly IAdminUserService _adminUserService;

    public AdminUserController(IAdminUserService adminUserService)
    {
        _adminUserService = adminUserService;
    }

    /// <summary>
    /// GET /api/admin/users - UC-54: Tìm kiếm, lọc và phân trang danh sách Học viên / Người dùng.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> SearchAndFilterUsers(
        [FromQuery] AdminUserSearchFilterRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _adminUserService.SearchAndFilterUsersAsync(request, cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// GET /api/admin/users/{userId} - Lấy thông tin chi tiết một người dùng theo ID.
    /// </summary>
    [HttpGet("{userId}")]
    public async Task<IActionResult> GetUserById(
        string userId,
        CancellationToken cancellationToken)
    {
        var result = await _adminUserService.GetUserByIdAsync(userId, cancellationToken);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// PATCH/PUT /api/admin/users/{userId}/status - UC-55: Khóa / Mở khóa tài khoản người dùng (Ban / Unban).
    /// </summary>
    [HttpPatch("{userId}/status")]
    [HttpPut("{userId}/status")]
    public async Task<IActionResult> ChangeUserAccountStatus(
        string userId,
        [FromBody] ChangeUserAccountStatusDto dto,
        CancellationToken cancellationToken)
    {
        if (dto == null)
        {
            return BadRequest(ApiResponse<AdminUserListItemDto>.Fail("Dữ liệu cập nhật trạng thái không hợp lệ."));
        }

        var currentAdminId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub");

        var result = await _adminUserService.ChangeUserAccountStatusAsync(
            userId,
            dto,
            currentAdminId,
            cancellationToken);

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }
}

