using System.Security.Claims;
using JCAP.DTOs.Common;
using JCAP.DTOs.Explore;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    /// <summary>Bản đồ Khám phá phía người học: hành trình, các mốc học của từng tỉnh và con dấu của người học.</summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ExploreController : ControllerBase
    {
        private readonly IExploreService _exploreService;

        public ExploreController(IExploreService exploreService)
        {
            _exploreService = exploreService;
        }

        /// <summary>Các chương và trạng thái 47 tỉnh (mở/đóng, khoá theo chương, số mốc, số con dấu, "Một từ ở tỉnh").</summary>
        [HttpGet("journey")]
        public async Task<ActionResult<ApiResponse<ExploreJourneyDto>>> GetJourney()
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized(ApiResponse<ExploreJourneyDto>.Fail("Không xác định được danh tính người dùng."));
            return Ok(await _exploreService.GetJourneyAsync(userId));
        }

        /// <summary>Sổ con dấu: các mốc đã có con dấu của người học (chỉ đọc, không cấp dấu).</summary>
        [HttpGet("stamps")]
        public async Task<ActionResult<ApiResponse<ExploreStampBookDto>>> GetStampBook()
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized(ApiResponse<ExploreStampBookDto>.Fail("Không xác định được danh tính người dùng."));
            return Ok(await _exploreService.GetStampBookAsync(userId));
        }

        /// <summary>Các mốc đang dùng của một tỉnh kèm tiến độ. Tỉnh đóng: IsOpen = false; chương chưa mở: IsLocked = true; cả hai không có mốc.</summary>
        [HttpGet("prefectures/{id:int}")]
        public async Task<ActionResult<ApiResponse<ExplorePrefectureDetailDto>>> GetPrefecture(int id)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized(ApiResponse<ExplorePrefectureDetailDto>.Fail("Không xác định được danh tính người dùng."));
            var result = await _exploreService.GetPrefectureAsync(userId, id);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        /// <summary>Xét bằng chứng học (Shadowing, Hội thoại AI) của cả tỉnh, cấp con dấu vừa đạt, trả dữ liệu tỉnh mới nhất.</summary>
        [HttpPost("prefectures/{id:int}/sync")]
        public async Task<ActionResult<ApiResponse<ExploreSyncResultDto>>> SyncPrefecture(int id)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized(ApiResponse<ExploreSyncResultDto>.Fail("Không xác định được danh tính người dùng."));
            var result = await _exploreService.SyncPrefectureAsync(userId, id);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        /// <summary>Một mốc kèm bài học và tiến độ của người học.</summary>
        [HttpGet("spots/{id:int}")]
        public async Task<ActionResult<ApiResponse<ExploreSpotDto>>> GetSpot(int id)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized(ApiResponse<ExploreSpotDto>.Fail("Không xác định được danh tính người dùng."));
            var result = await _exploreService.GetSpotAsync(userId, id);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        /// <summary>Người học bấm "Đã hiểu" phần câu mẫu của mốc.</summary>
        [HttpPost("spots/{id:int}/understood")]
        public async Task<ActionResult<ApiResponse<ExploreSyncResultDto>>> MarkUnderstood(int id)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized(ApiResponse<ExploreSyncResultDto>.Fail("Không xác định được danh tính người dùng."));
            var result = await _exploreService.MarkUnderstoodAsync(userId, id);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        private string? GetCurrentUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier);
    }
}
