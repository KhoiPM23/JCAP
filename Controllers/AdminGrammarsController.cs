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
    [Route("api/admin/grammars")]
    [Authorize(Roles = "Admin")]
    public class AdminGrammarsController : ControllerBase
    {
        private readonly IAdminShadowingService _adminService;

        public AdminGrammarsController(IAdminShadowingService adminService)
        {
            _adminService = adminService;
        }

        /// <summary>
        /// Tìm kiếm / lấy danh sách ngữ pháp dùng chung trong kho Master Data.
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<ApiResponse<List<ShadowingGrammarDto>>>> GetSharedGrammars([FromQuery] string? keyword, [FromQuery] string? jlptLevel)
        {
            var result = await _adminService.GetSharedGrammarsAsync(keyword, jlptLevel);
            return Ok(result);
        }
    }
}
