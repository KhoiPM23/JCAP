using JCAP.DTOs.Common;
using JCAP.DTOs.Profile;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Identity;

namespace JCAP.Services.Implementations
{
    public class ProfileService : IProfileService
    {
        private static readonly string[] AllowedJLPTLevels = { "N5", "N4", "N3" };
        private readonly UserManager<ApplicationUser> _userManager;

        public ProfileService(UserManager<ApplicationUser> userManager)
        {
            _userManager = userManager;
        }

        public async Task<ApiResponse<LearnerProfileDto>> GetProfileAsync(string userId)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return ApiResponse<LearnerProfileDto>.Fail("Mã định danh người dùng không hợp lệ.");
            }

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return ApiResponse<LearnerProfileDto>.Fail("Không tìm thấy thông tin học viên.");
            }

            var dto = MapToDto(user);
            return ApiResponse<LearnerProfileDto>.Ok(dto, "Lấy thông tin hồ sơ thành công.");
        }

        public async Task<ApiResponse<LearnerProfileDto>> UpdateProfileAsync(string userId, UpdateLearnerProfileDto dto)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return ApiResponse<LearnerProfileDto>.Fail("Mã định danh người dùng không hợp lệ.");
            }

            // Nghiêm ngặt: JCAP chỉ cho phép N5, N4, N3. Tuyệt đối từ chối N2, N1 hoặc các giá trị khác
            if (string.IsNullOrWhiteSpace(dto.JLPTLevel) || !AllowedJLPTLevels.Contains(dto.JLPTLevel))
            {
                return ApiResponse<LearnerProfileDto>.Fail("Trình độ JLPT không hợp lệ. Hệ thống JCAP chỉ hỗ trợ cấp độ N5, N4 hoặc N3.");
            }

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return ApiResponse<LearnerProfileDto>.Fail("Không tìm thấy thông tin học viên.");
            }

            // Chỉ cập nhật các trường được phép của UC08
            // Tuyệt đối bảo vệ: Id, Email, Role, CreatedAt, IsActive, CreditBalance
            user.FullName = dto.FullName.Trim();
            user.PhoneNumber = string.IsNullOrWhiteSpace(dto.PhoneNumber) ? null : dto.PhoneNumber.Trim();
            user.ProfilePictureUrl = string.IsNullOrWhiteSpace(dto.ProfilePictureUrl) ? null : dto.ProfilePictureUrl.Trim();
            user.JLPTLevel = dto.JLPTLevel;

            var result = await _userManager.UpdateAsync(user);
            if (!result.Succeeded)
            {
                var errors = result.Errors.Select(e => e.Description).ToList();
                return ApiResponse<LearnerProfileDto>.Fail("Cập nhật hồ sơ thất bại.", errors);
            }

            var updatedDto = MapToDto(user);
            return ApiResponse<LearnerProfileDto>.Ok(updatedDto, "Cập nhật hồ sơ học viên thành công.");
        }

        private static LearnerProfileDto MapToDto(ApplicationUser user)
        {
            return new LearnerProfileDto
            {
                Id = user.Id,
                FullName = user.FullName,
                Email = user.Email,
                PhoneNumber = user.PhoneNumber,
                ProfilePictureUrl = user.ProfilePictureUrl,
                JLPTLevel = string.IsNullOrWhiteSpace(user.JLPTLevel) ? "N5" : user.JLPTLevel,
                Role = user.Role ?? "Learner",
                CreatedAt = user.CreatedAt,
            };
        }
    }
}
