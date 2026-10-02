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

        /// <summary>
        /// Tải về tệp mẫu CSV hoặc JSON với Content-Disposition attachment để trình duyệt luôn lưu đúng tên và đuôi file.
        /// </summary>
        [HttpGet("download-template")]
        [AllowAnonymous]
        public IActionResult DownloadTemplate([FromQuery] string? type, [FromServices] Microsoft.AspNetCore.Hosting.IWebHostEnvironment environment)
        {
            var isCsv = !string.Equals(type, "json", System.StringComparison.OrdinalIgnoreCase);
            var fileName = isCsv ? "shadowing_dialogue_template.csv" : "shadowing_full_lesson_template.json";
            var contentType = isCsv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";

            var path1 = System.IO.Path.Combine(environment.ContentRootPath, "wwwroot", "templates", fileName);
            var path2 = System.IO.Path.Combine(environment.ContentRootPath, "jcap-web", "public", "templates", fileName);

            byte[] bytes;
            if (System.IO.File.Exists(path1))
            {
                bytes = System.IO.File.ReadAllBytes(path1);
            }
            else if (System.IO.File.Exists(path2))
            {
                bytes = System.IO.File.ReadAllBytes(path2);
            }
            else
            {
                if (isCsv)
                {
                    var bom = new byte[] { 0xEF, 0xBB, 0xBF };
                    var content = "SpeakerRole,JapaneseText,RomajiText,VietnameseTranslation\r\n" +
                                  "A,\"いらっしゃいませ。ご注文はお決まりですか。\",\"Irasshaimase. Gochuumon wa okimari desu ka.\",\"Xin kính chào quý khách. Quý khách đã chọn được món chưa ạ?\"\r\n" +
                                  "B,\"はい、ラーメンを一つお願いします。\",\"Hai, raamen wo hitotsu onegai shimasu.\",\"Vâng, xin cho tôi một tô mì ramen.\"\r\n" +
                                  "A,\"かしこまりました。少々お待ちください。\",\"Kashikomarimashita. Shoushou omachi kudasai.\",\"Tôi đã rõ. Xin quý khách vui lòng đợi một chút.\"\r\n" +
                                  "B,\"ありがとうございます。\",\"Arigatou gozaimasu.\",\"Xin cảm ơn.\"\r\n";
                    var contentBytes = System.Text.Encoding.UTF8.GetBytes(content);
                    bytes = bom.Concat(contentBytes).ToArray();
                }
                else
                {
                    var json = "{\n  \"$schema\": \"https://jcap.jp/schemas/shadowing-import-v1.json\",\n  \"title\": \"Gọi món tại nhà hàng Nhật\",\n  \"jlptLevel\": \"N4\",\n  \"scenarioCode\": \"SCN_RAMEN_01\",\n  \"contextDescription\": \"Khách hàng vào quán ramen vào giờ trưa và gọi món với nhân viên.\",\n  \"speakerRoles\": [\"Nhân viên\", \"Khách hàng\"],\n  \"sentences\": [\n    {\n      \"orderIndex\": 1,\n      \"speakerRole\": \"A\",\n      \"japaneseText\": \"いらっしゃいませ。ご注文はお決まりですか。\",\n      \"romajiText\": \"Irasshaimase. Gochuumon wa okimari desu ka.\",\n      \"vietnameseTranslation\": \"Xin kính chào quý khách. Quý khách đã chọn được món chưa ạ?\",\n      \"nativeAudioUrl\": null\n    }\n  ],\n  \"targetVocabularies\": [\n    {\n      \"word\": \"注文\",\n      \"reading\": \"ちゅうもん\",\n      \"meaning\": \"Gọi món\",\n      \"jlptLevel\": \"N4\"\n    }\n  ],\n  \"targetGrammars\": [\n    {\n      \"pattern\": \"～お願いします\",\n      \"meaning\": \"Làm ơn / Xin hãy...\",\n      \"exampleSentence\": \"ラーメンを一つお願いします。\",\n      \"jlptLevel\": \"N4\"\n    }\n  ]\n}";
                    bytes = System.Text.Encoding.UTF8.GetBytes(json);
                }
            }

            return File(bytes, contentType, fileName);
        }
    }
}
