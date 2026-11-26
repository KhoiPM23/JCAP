using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Roleplay;

namespace JCAP.Services.Interfaces;

/// <summary>
/// Facade chuẩn hóa cung cấp ngữ cảnh thích ứng 2 khung thời gian (ngắn hạn + dài hạn) cho toàn bộ phân hệ JCAP.
/// </summary>
public interface IAdaptiveProfileService
{
    Task<AdaptiveContextDto> GetAdaptiveContextAsync(
        string userId,
        CancellationToken cancellationToken = default);
}
