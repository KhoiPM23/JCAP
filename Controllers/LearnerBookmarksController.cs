using System.Security.Claims;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Flashcard;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/bookmarks")]
    [Authorize]
    public class LearnerBookmarksController : ControllerBase
    {
        private readonly ILearnerBookmarkService _bookmarkService;

        public LearnerBookmarksController(ILearnerBookmarkService bookmarkService)
        {
            _bookmarkService = bookmarkService;
        }

        /// <summary>
        /// UC-52: Bật/tắt lưu (bookmark) một từ vựng hoặc mẫu ngữ pháp.
        /// </summary>
        [HttpPost("toggle")]
        public async Task<ActionResult<ApiResponse<ToggleBookmarkResponseDto>>> ToggleBookmark([FromBody] ToggleBookmarkRequestDto request)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<ToggleBookmarkResponseDto>.Fail("Chưa xác thực người dùng."));
            }

            var result = await _bookmarkService.ToggleBookmarkAsync(userId, request);
            if (!result.Success)
            {
                return BadRequest(result);
            }
            return Ok(result);
        }

        /// <summary>
        /// UC-53: Xem danh sách nội dung đã lưu (hỗ trợ lọc theo loại, JLPT, từ khóa).
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<ApiResponse<BookmarkListResponseDto>>> GetBookmarks(
            [FromQuery] string? itemType = null,
            [FromQuery] string? jlptLevel = null,
            [FromQuery] string? keyword = null)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<BookmarkListResponseDto>.Fail("Chưa xác thực người dùng."));
            }

            var result = await _bookmarkService.GetBookmarksAsync(userId, itemType, jlptLevel, keyword);
            return Ok(result);
        }
    }
}
