using JCAP.DTOs.Common;
using JCAP.DTOs.Explore;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    /// <summary>Bản đồ Khám phá phía người học: hành trình và các mốc học của từng tỉnh (chỉ đọc).</summary>
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

        /// <summary>Các chương và trạng thái 47 tỉnh (mở/đóng, số mốc, "Một từ ở tỉnh").</summary>
        [HttpGet("journey")]
        public async Task<ActionResult<ApiResponse<ExploreJourneyDto>>> GetJourney()
        {
            return Ok(await _exploreService.GetJourneyAsync());
        }

        /// <summary>Các mốc đang dùng của một tỉnh. Tỉnh đóng: IsOpen = false, không có mốc.</summary>
        [HttpGet("prefectures/{id:int}")]
        public async Task<ActionResult<ApiResponse<ExplorePrefectureDetailDto>>> GetPrefecture(int id)
        {
            var result = await _exploreService.GetPrefectureAsync(id);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }
    }
}
