using System;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.Models;

namespace JCAP.Services.Interfaces
{
    /// <summary>
    /// Phiên luyện Shadowing đang diễn ra ở server (ShadowingPracticeProgress): bắt đầu, tiếp tục, làm lại, cập nhật vị trí.
    /// Server là nguồn chính thức; dữ liệu trong trình duyệt chỉ là lớp tương thích.
    /// </summary>
    public interface IShadowingPracticeProgressService
    {
        /// <summary>
        /// Trả phiên in_progress của bài + vai nếu đã có, không thì tạo mới. Restart: chuyển phiên cũ sang abandoned rồi tạo mới.
        /// An toàn khi hai request đồng thời: chỉ một phiên được tạo, request còn lại nhận chính phiên đó.
        /// </summary>
        Task<ApiResponse<ShadowingPracticeProgressDto>> StartAsync(string userId, StartShadowingProgressDto dto);

        /// <summary>Phiên in_progress của bài + vai; Data = null nếu không có.</summary>
        Task<ApiResponse<ShadowingPracticeProgressDto?>> GetActiveAsync(string userId, int dialogueId, string learnerRole);

        /// <summary>Phiên in_progress hoạt động gần nhất của người dùng (cho "Tiếp tục"); Data = null nếu không có.</summary>
        Task<ApiResponse<ShadowingPracticeProgressDto?>> GetLatestAsync(string userId);

        Task<ApiResponse<ShadowingPracticeProgressDto>> UpdatePositionAsync(string userId, Guid progressId, UpdateShadowingProgressDto dto);

        /// <summary>
        /// Kiểm tra một lần chấm có được gắn vào phiên không: phiên của đúng người dùng, đang luyện, câu thuộc đúng bài và vai.
        /// Hợp lệ thì cập nhật thời điểm hoạt động. Trả về thông báo lỗi, hoặc null nếu hợp lệ.
        /// </summary>
        Task<string?> ValidateForEvaluationAsync(string userId, Guid progressId, ShadowingSentence sentence);
    }
}
