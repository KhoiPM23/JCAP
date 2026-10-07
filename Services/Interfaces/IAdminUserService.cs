using JCAP.DTOs.AdminUser;
using JCAP.DTOs.Common;

namespace JCAP.Services.Interfaces;

public interface IAdminUserService
{
    /// <summary>
    /// UC-54: Tìm kiếm, lọc và phân trang danh sách người dùng (Học viên / Admin).
    /// </summary>
    Task<ApiResponse<AdminUserPagedResponseDto>> SearchAndFilterUsersAsync(
        AdminUserSearchFilterRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Lấy thông tin chi tiết một người dùng theo ID.
    /// </summary>
    Task<ApiResponse<AdminUserListItemDto>> GetUserByIdAsync(
        string userId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// UC-55: Thay đổi trạng thái tài khoản người dùng (Khóa / Mở khóa - Ban / Unban).
    /// </summary>
    Task<ApiResponse<AdminUserListItemDto>> ChangeUserAccountStatusAsync(
        string targetUserId,
        ChangeUserAccountStatusDto dto,
        string? currentAdminUserId = null,
        CancellationToken cancellationToken = default);
}

