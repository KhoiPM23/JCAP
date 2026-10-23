using JCAP.DTOs.Common;
using JCAP.DTOs.Explore;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    /// <summary>Quản lý bản đồ Khám phá (admin): mở tỉnh cho người học và quản lý chương của hành trình.</summary>
    [ApiController]
    [Route("api/admin/explore")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = "Admin")]
    public class AdminExploreController : ControllerBase
    {
        private readonly IAdminExploreService _service;

        public AdminExploreController(IAdminExploreService service)
        {
            _service = service;
        }

        /// <summary>Trạng thái 47 tỉnh (mở/đóng, số mốc, chương) và các chương đang dùng.</summary>
        [HttpGet]
        public async Task<ActionResult<ApiResponse<AdminExploreOverviewDto>>> GetOverview()
        {
            return Ok(await _service.GetOverviewAsync());
        }

        /// <summary>Mở tỉnh cho người học (cần ít nhất 1 mốc đang dùng). Không có thao tác đóng tỉnh.</summary>
        [HttpPost("prefectures/{id:int}/open")]
        public async Task<ActionResult<ApiResponse<AdminExplorePrefectureDto>>> OpenPrefecture(int id)
        {
            var result = await _service.OpenPrefectureAsync(id);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        /// <summary>Đưa tỉnh vào một chương, hoặc bỏ khỏi chương (chapterId = null).</summary>
        [HttpPut("prefectures/{id:int}/chapter")]
        public async Task<ActionResult<ApiResponse<AdminExploreOverviewDto>>> AssignChapter(int id, [FromBody] AssignPrefectureChapterDto dto)
        {
            var result = await _service.AssignPrefectureChapterAsync(id, dto.ChapterId);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPost("chapters")]
        public async Task<ActionResult<ApiResponse<AdminExploreChapterDto>>> CreateChapter([FromBody] SaveExploreChapterDto dto)
        {
            var result = await _service.CreateChapterAsync(dto);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPut("chapters/{id:int}")]
        public async Task<ActionResult<ApiResponse<AdminExploreChapterDto>>> UpdateChapter(int id, [FromBody] SaveExploreChapterDto dto)
        {
            var result = await _service.UpdateChapterAsync(id, dto);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        /// <summary>Sắp lại thứ tự các chương đang dùng.</summary>
        [HttpPut("chapters/order")]
        public async Task<ActionResult<ApiResponse<List<AdminExploreChapterDto>>>> ReorderChapters([FromBody] ReorderExploreChaptersDto dto)
        {
            var result = await _service.ReorderChaptersAsync(dto.ChapterIds);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        /// <summary>Ngừng dùng chương (không xoá cứng).</summary>
        [HttpDelete("chapters/{id:int}")]
        public async Task<ActionResult<ApiResponse<bool>>> DeactivateChapter(int id)
        {
            var result = await _service.DeactivateChapterAsync(id);
            return result.Success ? Ok(result) : BadRequest(result);
        }
    }
}
