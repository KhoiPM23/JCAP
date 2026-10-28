using JCAP.DTOs.Common;
using JCAP.DTOs.Explore;

namespace JCAP.Services.Interfaces
{
    /// <summary>Bản đồ Khám phá phía người học: hành trình, các mốc của tỉnh và tiến độ (con dấu, dấu son, chương đã mở).</summary>
    public interface IExploreService
    {
        /// <summary>Các chương và trạng thái 47 tỉnh cho bản đồ toàn quốc, kèm tiến độ của người học.</summary>
        Task<ApiResponse<ExploreJourneyDto>> GetJourneyAsync(string userId);

        /// <summary>
        /// Các mốc đang dùng của một tỉnh kèm tiến độ (chỉ đọc). Tỉnh đóng trả IsOpen = false, tỉnh thuộc chương chưa mở
        /// trả IsLocked = true, cả hai không có mốc; mã tỉnh sai trả lỗi.
        /// </summary>
        Task<ApiResponse<ExplorePrefectureDetailDto>> GetPrefectureAsync(string userId, int prefectureId);

        /// <summary>Xét bằng chứng học của cả tỉnh, cấp những gì vừa đạt, rồi trả dữ liệu tỉnh mới nhất.</summary>
        Task<ApiResponse<ExploreSyncResultDto>> SyncPrefectureAsync(string userId, int prefectureId);

        /// <summary>Một mốc người học vào được (tỉnh mở, chương đã mở), kèm tiến độ.</summary>
        Task<ApiResponse<ExploreSpotDto>> GetSpotAsync(string userId, int spotId);

        /// <summary>Ghi nhận "Đã hiểu" phần câu mẫu của mốc rồi đồng bộ tỉnh của mốc đó.</summary>
        Task<ApiResponse<ExploreSyncResultDto>> MarkUnderstoodAsync(string userId, int spotId);
    }
}
