using System;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Shadowing;

namespace JCAP.Services.Interfaces
{
    /// <summary>Kết quả tạo nhận xét AI: Review có giá trị khi thành công; NotFound khi buổi không thuộc người học.</summary>
    public sealed record ShadowingSessionReviewResult(ShadowingSessionAiReviewDto? Review, bool NotFound, string? ErrorMessage);

    /// <summary>Nhận xét tổng hợp buổi Shadowing bằng AI (Gemini qua IAiClient), chỉ dựa trên số liệu đã lưu.</summary>
    public interface IShadowingSessionReviewService
    {
        Task<ShadowingSessionReviewResult> GenerateAsync(string userId, Guid sessionId, CancellationToken cancellationToken = default);
    }
}
