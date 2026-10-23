using JCAP.DTOs.Common;
using JCAP.DTOs.Explore;

namespace JCAP.Services.Interfaces
{
    /// <summary>Quản lý bản đồ Khám phá phía admin: mở tỉnh và quản lý chương.</summary>
    public interface IAdminExploreService
    {
        Task<ApiResponse<AdminExploreOverviewDto>> GetOverviewAsync();

        /// <summary>
        /// Mở tỉnh cho người học. Chỉ mở được khi tỉnh có ít nhất một mốc đang dùng.
        /// Không có thao tác đóng: tỉnh đã công khai chỉ tạm ngưng được qua chế độ bảo trì (phát triển sau).
        /// </summary>
        Task<ApiResponse<AdminExplorePrefectureDto>> OpenPrefectureAsync(int prefectureId);

        /// <summary>Đưa tỉnh vào một chương, hoặc bỏ khỏi chương (chapterId = null).</summary>
        Task<ApiResponse<AdminExploreOverviewDto>> AssignPrefectureChapterAsync(int prefectureId, int? chapterId);

        Task<ApiResponse<AdminExploreChapterDto>> CreateChapterAsync(SaveExploreChapterDto dto);
        Task<ApiResponse<AdminExploreChapterDto>> UpdateChapterAsync(int chapterId, SaveExploreChapterDto dto);

        /// <summary>Sắp lại thứ tự các chương đang dùng (danh sách phải đủ và không trùng).</summary>
        Task<ApiResponse<List<AdminExploreChapterDto>>> ReorderChaptersAsync(List<int> chapterIds);

        /// <summary>Ngừng dùng chương (IsActive = false); các tỉnh của chương được trả về trạng thái chưa thuộc chương nào.</summary>
        Task<ApiResponse<bool>> DeactivateChapterAsync(int chapterId);
    }
}
