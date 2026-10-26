using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Flashcard;

namespace JCAP.Services.Interfaces
{
    public interface ILearnerBookmarkService
    {
        Task<ApiResponse<ToggleBookmarkResponseDto>> ToggleBookmarkAsync(string userId, ToggleBookmarkRequestDto request);
        Task<ApiResponse<BookmarkListResponseDto>> GetBookmarksAsync(string userId, string? itemType = null, string? jlptLevel = null, string? keyword = null);
    }
}
