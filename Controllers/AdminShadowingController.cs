using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.DTOs.Shadowing.Admin;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/admin/shadowing")]
    [Route("api/admin/[controller]")]
    [Authorize(Roles = "Admin")]
    public class AdminShadowingController : ControllerBase
    {
        private readonly IAdminShadowingService _adminService;

        public AdminShadowingController(IAdminShadowingService adminService)
        {
            _adminService = adminService;
        }

        /// <summary>
        /// Lấy toàn bộ danh sách bài học Shadowing dành cho Admin (bao gồm cả bài đã vô hiệu hóa).
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<ApiResponse<List<ShadowingDialogueListDto>>>> GetAll()
        {
            var result = await _adminService.GetAdminCatalogAsync();
            return Ok(result);
        }

        /// <summary>
        /// Lấy chi tiết một bài học Shadowing kèm danh sách câu thoại để hiển thị lên Form quản trị.
        /// </summary>
        [HttpGet("{id:int}")]
        public async Task<ActionResult<ApiResponse<ShadowingDialogueDetailDto>>> GetById(int id)
        {
            var result = await _adminService.GetAdminDetailAsync(id);
            if (!result.Success)
            {
                return NotFound(result);
            }
            return Ok(result);
        }

        /// <summary>
        /// UC-30: Thêm mới một bài học Shadowing kèm danh sách câu thoại trong 1 Transaction.
        /// </summary>
        [HttpPost]
        public async Task<ActionResult<ApiResponse<ShadowingDialogueDetailDto>>> Create([FromBody] CreateShadowingDialogueDto dto)
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage)
                    .ToList();
                return BadRequest(ApiResponse<ShadowingDialogueDetailDto>.Fail("Dữ liệu gửi lên không hợp lệ.", errors));
            }

            var result = await _adminService.CreateDialogueAsync(dto);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return CreatedAtAction(nameof(GetById), new { id = result.Data!.Id }, result);
        }

        /// <summary>
        /// UC-31: Cập nhật thông tin bài học Shadowing và đồng bộ lại danh sách câu thoại.
        /// </summary>
        [HttpPut("{id:int}")]
        public async Task<ActionResult<ApiResponse<ShadowingDialogueDetailDto>>> Update(int id, [FromBody] UpdateShadowingDialogueDto dto)
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage)
                    .ToList();
                return BadRequest(ApiResponse<ShadowingDialogueDetailDto>.Fail("Dữ liệu gửi lên không hợp lệ.", errors));
            }

            var result = await _adminService.UpdateDialogueAsync(id, dto);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// UC-32: Xóa mềm (Soft Delete) bài học Shadowing - Gán IsActive = false.
        /// </summary>
        [HttpDelete("{id:int}")]
        public async Task<ActionResult<ApiResponse<bool>>> Delete(int id)
        {
            var result = await _adminService.SoftDeleteDialogueAsync(id);
            if (!result.Success)
            {
                return NotFound(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// AI Đề xuất / tạo bài hội thoại Shadowing từ bối cảnh & vai nhân vật.
        /// </summary>
        [HttpPost("generate-dialogue")]
        public async Task<ActionResult<ApiResponse<GeneratedShadowingDialogueDto>>> GenerateDialogue(
            [FromBody] GenerateShadowingDialogueRequest request,
            CancellationToken cancellationToken)
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage)
                    .ToList();
                return BadRequest(ApiResponse<GeneratedShadowingDialogueDto>.Fail("Dữ liệu gửi lên không hợp lệ.", errors));
            }

            var result = await _adminService.GenerateDialogueDraftAsync(request, cancellationToken);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// Hỗ trợ dịch tự động 2 chiều Nhật - Việt & tạo Romaji cho Admin.
        /// </summary>
        [HttpPost("translate-assist")]
        public async Task<ActionResult<ApiResponse<TranslateAssistResponse>>> TranslateAssist(
            [FromBody] TranslateAssistRequest request,
            CancellationToken cancellationToken)
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage)
                    .ToList();
                return BadRequest(ApiResponse<TranslateAssistResponse>.Fail("Dữ liệu gửi lên không hợp lệ.", errors));
            }

            var result = await _adminService.TranslateAssistAsync(request, cancellationToken);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// Tải lên tệp âm thanh ghi âm mẫu bài học Shadowing (local storage wwwroot/audio/shadowing/).
        /// </summary>
        [HttpPost("upload-audio")]
        public async Task<ActionResult<ApiResponse<string>>> UploadAudio(
            IFormFile file,
            CancellationToken cancellationToken)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(ApiResponse<string>.Fail("Vui lòng đính kèm tệp âm thanh."));
            }

            var result = await _adminService.UploadAudioAsync(file, cancellationToken);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// Tìm kiếm / lấy danh sách từ vựng dùng chung trong kho Master Data.
        /// </summary>
        [HttpGet("shared-vocabularies")]
        public async Task<ActionResult<ApiResponse<List<ShadowingVocabularyDto>>>> GetSharedVocabularies([FromQuery] string? keyword, [FromQuery] string? jlptLevel)
        {
            var result = await _adminService.GetSharedVocabulariesAsync(keyword, jlptLevel);
            return Ok(result);
        }

        /// <summary>
        /// Tìm kiếm / lấy danh sách ngữ pháp dùng chung trong kho Master Data.
        /// </summary>
        [HttpGet("shared-grammars")]
        public async Task<ActionResult<ApiResponse<List<ShadowingGrammarDto>>>> GetSharedGrammars([FromQuery] string? keyword, [FromQuery] string? jlptLevel)
        {
            var result = await _adminService.GetSharedGrammarsAsync(keyword, jlptLevel);
            return Ok(result);
        }
    }
}
