using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Shadowing;

namespace JCAP.Services.Interfaces
{
    /// <summary>Tổng kết buổi luyện, lịch sử chi tiết các lần gửi chấm và gợi ý luyện tập theo quy tắc.</summary>
    public interface IShadowingSessionInsightsService
    {
        Task<ShadowingSessionSummaryDto?> BuildSummaryAsync(Guid sessionId, CancellationToken cancellationToken = default);

        /// <summary>Chi tiết một buổi của chính người dùng (null nếu không có hoặc của người khác).</summary>
        Task<ShadowingSessionDetailDto?> GetSessionDetailAsync(string userId, Guid sessionId, ShadowingPracticeSessionDto sessionDto, CancellationToken cancellationToken = default);

        /// <summary>Số lần gửi chấm của các buổi có phiên server (buổi cũ không có trong kết quả).</summary>
        Task<Dictionary<Guid, int>> CountSubmissionsAsync(IReadOnlyCollection<Guid> sessionIds, CancellationToken cancellationToken = default);

        Task<ShadowingRecommendationDto> GetRecommendationsAsync(string userId, int? excludeDialogueId, CancellationToken cancellationToken = default);
    }
}
