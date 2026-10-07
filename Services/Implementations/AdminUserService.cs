using JCAP.Data;
using JCAP.Data.Static;
using JCAP.DTOs.AdminUser;
using JCAP.DTOs.Common;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations;

public class AdminUserService : IAdminUserService
{
    private readonly AppDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;

    public AdminUserService(AppDbContext dbContext, UserManager<ApplicationUser> userManager)
    {
        _dbContext = dbContext;
        _userManager = userManager;
    }

    public async Task<ApiResponse<AdminUserPagedResponseDto>> SearchAndFilterUsersAsync(
        AdminUserSearchFilterRequest request,
        CancellationToken cancellationToken = default)
    {
        request ??= new AdminUserSearchFilterRequest();
        int page = request.Page <= 0 ? 1 : request.Page;
        int pageSize = request.PageSize <= 0 ? 10 : Math.Min(request.PageSize, 100);

        var allUsersQuery = _dbContext.Users.AsNoTracking();

        // Tổng thống kê trên toàn hệ thống
        int totalUsersCount = await allUsersQuery.CountAsync(cancellationToken);
        int activeUsersCount = await allUsersQuery.CountAsync(u => u.IsActive, cancellationToken);
        int bannedUsersCount = await allUsersQuery.CountAsync(u => !u.IsActive, cancellationToken);
        int learnerUsersCount = await allUsersQuery.CountAsync(u => u.Role == UserRoles.Learner, cancellationToken);

        var filteredQuery = allUsersQuery;

        // 1. Lọc theo từ khóa tìm kiếm (Họ tên, Email, UserName, ID)
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var kw = request.Search.Trim();
            filteredQuery = filteredQuery.Where(u =>
                (u.FullName != null && EF.Functions.Like(u.FullName, $"%{kw}%")) ||
                (u.Email != null && EF.Functions.Like(u.Email, $"%{kw}%")) ||
                (u.UserName != null && EF.Functions.Like(u.UserName, $"%{kw}%")) ||
                EF.Functions.Like(u.Id, $"%{kw}%"));
        }

        // 2. Lọc theo trạng thái tài khoản (active / banned)
        if (!string.IsNullOrWhiteSpace(request.Status) &&
            !request.Status.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            var st = request.Status.Trim().ToLowerInvariant();
            if (st is "active" or "true" or "unbanned")
            {
                filteredQuery = filteredQuery.Where(u => u.IsActive);
            }
            else if (st is "banned" or "inactive" or "false" or "locked")
            {
                filteredQuery = filteredQuery.Where(u => !u.IsActive);
            }
        }

        // 3. Lọc theo trình độ JLPT (N5, N4, N3)
        if (!string.IsNullOrWhiteSpace(request.JlptLevel) &&
            !request.JlptLevel.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            var lvl = request.JlptLevel.Trim().ToUpperInvariant();
            filteredQuery = filteredQuery.Where(u => u.JLPTLevel == lvl);
        }

        // 4. Lọc theo vai trò (Learner / Admin)
        if (!string.IsNullOrWhiteSpace(request.Role) &&
            !request.Role.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            var roleFilter = request.Role.Trim();
            filteredQuery = filteredQuery.Where(u => u.Role == roleFilter);
        }

        int filteredCount = await filteredQuery.CountAsync(cancellationToken);
        int totalPages = Math.Max(1, (int)Math.Ceiling((double)filteredCount / pageSize));
        if (page > totalPages)
        {
            page = totalPages;
        }

        var users = await filteredQuery
            .OrderByDescending(u => u.CreatedAt)
            .ThenBy(u => u.Email)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var userIds = users.Select(u => u.Id).ToList();

        // Đếm số phiên luyện tập Roleplay của từng học viên trong trang hiện tại
        var sessionCounts = await _dbContext.RoleplaySessions
            .AsNoTracking()
            .Where(s => userIds.Contains(s.UserId))
            .GroupBy(s => s.UserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count, cancellationToken);

        var items = users.Select(u => new AdminUserListItemDto
        {
            Id = u.Id,
            Email = u.Email ?? string.Empty,
            FullName = !string.IsNullOrWhiteSpace(u.FullName) ? u.FullName : (u.Email ?? "Chưa cập nhật"),
            Role = string.IsNullOrWhiteSpace(u.Role) ? UserRoles.Learner : u.Role,
            JlptLevel = string.IsNullOrWhiteSpace(u.JLPTLevel) ? "N5" : u.JLPTLevel,
            CreditBalance = u.CreditBalance,
            IsActive = u.IsActive,
            EmailConfirmed = u.EmailConfirmed,
            ProfilePictureUrl = u.ProfilePictureUrl,
            CreatedAt = u.CreatedAt,
            TotalRoleplaySessions = sessionCounts.TryGetValue(u.Id, out var c) ? c : 0
        }).ToList();

        var responseDto = new AdminUserPagedResponseDto
        {
            Items = items,
            TotalCount = filteredCount,
            ActiveCount = activeUsersCount,
            BannedCount = bannedUsersCount,
            LearnerCount = learnerUsersCount,
            Page = page,
            PageSize = pageSize,
            TotalPages = totalPages
        };

        return ApiResponse<AdminUserPagedResponseDto>.Ok(
            responseDto,
            "Lấy danh sách học viên thành công.");
    }

    public async Task<ApiResponse<AdminUserListItemDto>> GetUserByIdAsync(
        string userId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            return ApiResponse<AdminUserListItemDto>.Fail("Mã người dùng không hợp lệ.");
        }

        var user = await _dbContext.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);

        if (user == null)
        {
            return ApiResponse<AdminUserListItemDto>.Fail("Không tìm thấy tài khoản người dùng.");
        }

        var sessionsCount = await _dbContext.RoleplaySessions
            .AsNoTracking()
            .CountAsync(s => s.UserId == user.Id, cancellationToken);

        var dto = new AdminUserListItemDto
        {
            Id = user.Id,
            Email = user.Email ?? string.Empty,
            FullName = !string.IsNullOrWhiteSpace(user.FullName) ? user.FullName : (user.Email ?? "Chưa cập nhật"),
            Role = string.IsNullOrWhiteSpace(user.Role) ? UserRoles.Learner : user.Role,
            JlptLevel = string.IsNullOrWhiteSpace(user.JLPTLevel) ? "N5" : user.JLPTLevel,
            CreditBalance = user.CreditBalance,
            IsActive = user.IsActive,
            EmailConfirmed = user.EmailConfirmed,
            ProfilePictureUrl = user.ProfilePictureUrl,
            CreatedAt = user.CreatedAt,
            TotalRoleplaySessions = sessionsCount
        };

        return ApiResponse<AdminUserListItemDto>.Ok(dto, "Lấy thông tin chi tiết học viên thành công.");
    }

    public async Task<ApiResponse<AdminUserListItemDto>> ChangeUserAccountStatusAsync(
        string targetUserId,
        ChangeUserAccountStatusDto dto,
        string? currentAdminUserId = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(targetUserId))
        {
            return ApiResponse<AdminUserListItemDto>.Fail("Mã người dùng không hợp lệ.");
        }

        var user = await _userManager.FindByIdAsync(targetUserId);
        if (user == null)
        {
            return ApiResponse<AdminUserListItemDto>.Fail("Không tìm thấy tài khoản người dùng cần cập nhật.");
        }

        // Không cho phép Admin tự khóa chính mình hoặc khóa tài khoản Admin khác
        if (!dto.IsActive)
        {
            if (!string.IsNullOrWhiteSpace(currentAdminUserId) &&
                string.Equals(user.Id, currentAdminUserId, StringComparison.OrdinalIgnoreCase))
            {
                return ApiResponse<AdminUserListItemDto>.Fail("Không thể tự khóa tài khoản Quản trị viên đang đăng nhập.");
            }

            var roles = await _userManager.GetRolesAsync(user);
            if (string.Equals(user.Role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase) ||
                roles.Any(r => string.Equals(r, UserRoles.Admin, StringComparison.OrdinalIgnoreCase)))
            {
                return ApiResponse<AdminUserListItemDto>.Fail("Không thể khóa tài khoản có vai trò Quản trị viên (Admin).");
            }
        }

        user.IsActive = dto.IsActive;

        // Cập nhật SecurityStamp khi khóa tài khoản để tăng tính bảo mật
        if (!dto.IsActive)
        {
            user.SecurityStamp = Guid.NewGuid().ToString();
        }

        var updateResult = await _userManager.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            var errors = updateResult.Errors.Select(e => e.Description).ToList();
            return ApiResponse<AdminUserListItemDto>.Fail("Cập nhật trạng thái tài khoản thất bại.", errors);
        }

        var sessionsCount = await _dbContext.RoleplaySessions
            .AsNoTracking()
            .CountAsync(s => s.UserId == user.Id, cancellationToken);

        var updatedDto = new AdminUserListItemDto
        {
            Id = user.Id,
            Email = user.Email ?? string.Empty,
            FullName = !string.IsNullOrWhiteSpace(user.FullName) ? user.FullName : (user.Email ?? "Chưa cập nhật"),
            Role = string.IsNullOrWhiteSpace(user.Role) ? UserRoles.Learner : user.Role,
            JlptLevel = string.IsNullOrWhiteSpace(user.JLPTLevel) ? "N5" : user.JLPTLevel,
            CreditBalance = user.CreditBalance,
            IsActive = user.IsActive,
            EmailConfirmed = user.EmailConfirmed,
            ProfilePictureUrl = user.ProfilePictureUrl,
            CreatedAt = user.CreatedAt,
            TotalRoleplaySessions = sessionsCount
        };

        var actionText = dto.IsActive
            ? $"Đã mở khóa (Unban) tài khoản '{updatedDto.FullName}' ({updatedDto.Email}) thành công."
            : $"Đã khóa (Ban) tài khoản '{updatedDto.FullName}' ({updatedDto.Email}) thành công.";

        return ApiResponse<AdminUserListItemDto>.Ok(updatedDto, actionText);
    }
}

