using JCAP.DTOs.Common;
using JCAP.DTOs.Explore;

namespace JCAP.Services.Interfaces
{
    /// <summary>
    /// Soạn nội dung trong tỉnh (admin): mốc học, bài học tại mốc, "Một từ ở tỉnh".
    /// Nội dung sửa trực tiếp (chưa có phiên bản); người học chỉ thấy mốc ở trạng thái "Đang dùng".
    /// </summary>
    public interface IAdminExploreSpotService
    {
        Task<ApiResponse<AdminExplorePrefectureContentDto>> GetPrefectureContentAsync(int prefectureId);
        Task<ApiResponse<AdminExploreWordDto>> SaveWordAsync(int prefectureId, AdminExploreWordDto dto);

        Task<ApiResponse<AdminExploreSpotDto>> GetSpotAsync(int spotId);

        /// <summary>Tạo mốc mới (luôn ở trạng thái Nháp).</summary>
        Task<ApiResponse<AdminExploreSpotDto>> CreateSpotAsync(int prefectureId, SaveExploreSpotDto dto);

        /// <summary>
        /// Lưu mốc. Mốc đang dùng không được để trống những gì người học đang thấy (tên, vị trí, câu mẫu, tình huống, cách dùng).
        /// </summary>
        Task<ApiResponse<AdminExploreSpotDto>> UpdateSpotAsync(int spotId, SaveExploreSpotDto dto);

        /// <summary>
        /// Chuyển Nháp ↔ Đang dùng. Sang "Đang dùng" phải qua đủ danh sách kiểm tra;
        /// về "Nháp" không được làm tỉnh đang mở mất mốc đang dùng cuối cùng.
        /// </summary>
        Task<ApiResponse<AdminExploreSpotDto>> SetStatusAsync(int spotId, string status);

        /// <summary>Ngừng dùng mốc (IsActive = false). Chỉ áp dụng cho mốc đang ở trạng thái Nháp.</summary>
        Task<ApiResponse<bool>> DeactivateSpotAsync(int spotId);

        /// <summary>Tìm nội dung để gắn vào bài: grammar | vocabulary | shadowing | roleplay.</summary>
        Task<ApiResponse<List<ExploreLookupItemDto>>> LookupAsync(string kind, string? level, string? query);
    }
}
