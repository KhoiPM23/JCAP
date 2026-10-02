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
    [Route("api/admin/vocabularies")]
    [Authorize(Roles = "Admin")]
    public class AdminVocabulariesController : ControllerBase
    {
        private readonly IAdminShadowingService _adminService;

        public AdminVocabulariesController(IAdminShadowingService adminService)
        {
            _adminService = adminService;
        }

        /// <summary>
        /// Tìm kiếm / lấy danh sách từ vựng dùng chung trong kho Master Data.
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<ApiResponse<List<ShadowingVocabularyDto>>>> GetSharedVocabularies([FromQuery] string? keyword, [FromQuery] string? jlptLevel)
        {
            var result = await _adminService.GetSharedVocabulariesAsync(keyword, jlptLevel);
            return Ok(result);
        }
    }
}
