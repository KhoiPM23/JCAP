using JCAP.DTOs.Common;
using JCAP.DTOs.Roleplay;

namespace JCAP.Services.Interfaces;

public interface IRoleplaySessionService
{
    /// <summary>
    /// Lấy thông tin phiên luyện tập đang dở (Active) của người dùng đối với kịch bản (áp dụng cho mọi level của kịch bản).
    /// </summary>
    Task<ApiResponse<ActiveRoleplaySessionDto?>> GetActiveSessionAsync(
        string userId,
        int scenarioId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Khởi tạo phiên luyện tập mới (hoặc tiếp tục phiên dở dang nếu không forceRestart), trừ credit theo Model A.
    /// </summary>
    Task<ApiResponse<RoleplaySessionDetailsDto>> StartSessionAsync(
        string userId,
        int scenarioId,
        string jlptLevel,
        StartRoleplaySessionRequestDto request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Lấy toàn bộ thông tin phiên luyện tập để hiển thị trong phòng chat.
    /// </summary>
    Task<ApiResponse<RoleplaySessionDetailsDto>> GetSessionDetailsAsync(
        string userId,
        int sessionId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gửi tin nhắn học viên, kích hoạt AI phản hồi, cập nhật mission tự động và kiểm tra kết thúc tự nhiên.
    /// </summary>
    Task<ApiResponse<RoleplayTurnResponseDto>> SendMessageAsync(
        string userId,
        int sessionId,
        SendRoleplayMessageRequestDto request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Yêu cầu AI gợi ý câu nói tiếp theo (On-demand Hint).
    /// </summary>
    Task<ApiResponse<RoleplayHintDto>> GetHintAsync(
        string userId,
        int sessionId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Kết thúc phiên luyện tập, chuyển trạng thái sang Completed.
    /// </summary>
    Task<ApiResponse<bool>> EndSessionAsync(
        string userId,
        int sessionId,
        CancellationToken cancellationToken = default);
}
