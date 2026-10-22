using JCAP.DTOs.Common;
using JCAP.DTOs.Explore;

namespace JCAP.Services.Interfaces
{
    /// <summary>Dữ liệu bản đồ Khám phá phía người học (chỉ đọc).</summary>
    public interface IExploreService
    {
        /// <summary>Các chương và trạng thái 47 tỉnh cho bản đồ toàn quốc.</summary>
        Task<ApiResponse<ExploreJourneyDto>> GetJourneyAsync();

        /// <summary>Các mốc đang dùng của một tỉnh. Tỉnh đóng trả IsOpen = false, không có mốc; mã tỉnh sai trả lỗi.</summary>
        Task<ApiResponse<ExplorePrefectureDetailDto>> GetPrefectureAsync(int prefectureId);
    }
}
