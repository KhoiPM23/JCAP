using JCAP.DTOs.Common;
using JCAP.DTOs.Explore;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    /// <summary>Soạn nội dung trong tỉnh (admin): mốc học, bài học tại mốc, "Một từ ở tỉnh".</summary>
    [ApiController]
    [Route("api/admin/explore")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = "Admin")]
    public class AdminExploreSpotController : ControllerBase
    {
        private readonly IAdminExploreSpotService _service;

        public AdminExploreSpotController(IAdminExploreSpotService service)
        {
            _service = service;
        }

        /// <summary>Mọi mốc (nháp và đang dùng) của một tỉnh, kèm "Một từ ở tỉnh".</summary>
        [HttpGet("prefectures/{id:int}/spots")]
        public async Task<ActionResult<ApiResponse<AdminExplorePrefectureContentDto>>> GetPrefectureContent(int id)
        {
            var result = await _service.GetPrefectureContentAsync(id);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPut("prefectures/{id:int}/word")]
        public async Task<ActionResult<ApiResponse<AdminExploreWordDto>>> SaveWord(int id, [FromBody] AdminExploreWordDto dto)
        {
            var result = await _service.SaveWordAsync(id, dto);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        /// <summary>Tạo mốc mới trong tỉnh (trạng thái Nháp).</summary>
        [HttpPost("prefectures/{id:int}/spots")]
        public async Task<ActionResult<ApiResponse<AdminExploreSpotDto>>> CreateSpot(int id, [FromBody] SaveExploreSpotDto dto)
        {
            var result = await _service.CreateSpotAsync(id, dto);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpGet("spots/{id:int}")]
        public async Task<ActionResult<ApiResponse<AdminExploreSpotDto>>> GetSpot(int id)
        {
            var result = await _service.GetSpotAsync(id);
            return result.Success ? Ok(result) : NotFound(result);
        }

        [HttpPut("spots/{id:int}")]
        public async Task<ActionResult<ApiResponse<AdminExploreSpotDto>>> UpdateSpot(int id, [FromBody] SaveExploreSpotDto dto)
        {
            var result = await _service.UpdateSpotAsync(id, dto);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        /// <summary>Chuyển mốc giữa Nháp và Đang dùng.</summary>
        [HttpPut("spots/{id:int}/status")]
        public async Task<ActionResult<ApiResponse<AdminExploreSpotDto>>> SetStatus(int id, [FromBody] SetExploreSpotStatusDto dto)
        {
            var result = await _service.SetStatusAsync(id, dto.Status);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        /// <summary>Ngừng dùng mốc nháp (không xoá cứng).</summary>
        [HttpDelete("spots/{id:int}")]
        public async Task<ActionResult<ApiResponse<bool>>> DeactivateSpot(int id)
        {
            var result = await _service.DeactivateSpotAsync(id);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        /// <summary>Mọi mốc của cả nước kèm nội dung đã gắn (bảng "Nội dung các mốc").</summary>
        [HttpGet("spots")]
        public async Task<ActionResult<ApiResponse<List<AdminExploreSpotRowDto>>>> ListSpots()
        {
            return Ok(await _service.ListSpotsAsync());
        }

        /// <summary>
        /// Các mốc đang dùng một nội dung. Trang Shadowing/Kịch bản có thể gọi để cảnh báo trước khi ngừng dùng nội dung.
        /// kind: grammar | vocabulary | shadowing | roleplay.
        /// </summary>
        [HttpGet("usages")]
        public async Task<ActionResult<ApiResponse<List<ExploreSpotRefDto>>>> GetUsages([FromQuery] string kind, [FromQuery] int id)
        {
            var result = await _service.GetUsagesAsync(kind, id);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        /// <summary>Tìm nội dung để gắn vào bài: grammar | vocabulary | shadowing | roleplay.</summary>
        [HttpGet("lookups/{kind}")]
        public async Task<ActionResult<ApiResponse<List<ExploreLookupItemDto>>>> Lookup(string kind, [FromQuery] string? level, [FromQuery] string? q)
        {
            var result = await _service.LookupAsync(kind, level, q);
            return result.Success ? Ok(result) : BadRequest(result);
        }
    }
}
