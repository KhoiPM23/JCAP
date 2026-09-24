using System.Collections.Generic;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ShadowingController : ControllerBase
    {
        private readonly IShadowingService _shadowingService;

        public ShadowingController(IShadowingService shadowingService)
        {
            _shadowingService = shadowingService;
        }

        /// <summary>
        /// UC-25 & UC-26: Lấy danh sách bài học Shadowing (hỗ trợ tìm kiếm từ khóa, lọc theo JLPT Level và ScenarioId).
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<ApiResponse<List<ShadowingDialogueListDto>>>> GetCatalog(
            [FromQuery] string? keyword,
            [FromQuery] string? jlptLevel,
            [FromQuery] int? scenarioId)
        {
            var result = await _shadowingService.GetLearnerCatalogAsync(keyword, jlptLevel, scenarioId);
            return Ok(result);
        }

        /// <summary>
        /// UC-27: Lấy chi tiết bài học Shadowing kèm danh sách câu đối thoại và audio URL để nghe thử / chọn vai.
        /// </summary>
        [HttpGet("{id:int}")]
        public async Task<ActionResult<ApiResponse<ShadowingDialogueDetailDto>>> GetDetail(int id)
        {
            var result = await _shadowingService.GetLearnerDetailAsync(id);
            if (!result.Success)
            {
                return NotFound(result);
            }
            return Ok(result);
        }
    }
}
