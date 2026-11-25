using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace JCAP.Controllers
{
    /// <summary>
    /// Dữ liệu tham chiếu tính sẵn của câu Shadowing (cách đọc, Furigana, giọng mẫu VOICEVOX). Chỉ Admin.
    /// Dùng sau khi thêm/sửa bài để lúc người học chấm không cần VOICEVOX đang chạy.
    /// </summary>
    [ApiController]
    [Route("api/admin/shadowing-assets")]
    [Authorize(Roles = "Admin")]
    public class ShadowingAssetsController : ControllerBase
    {
        private readonly IShadowingSentenceAssetService _assets;
        private readonly IConfiguration _configuration;

        public ShadowingAssetsController(IShadowingSentenceAssetService assets, IConfiguration configuration)
        {
            _assets = assets;
            _configuration = configuration;
        }

        /// <summary>Tình trạng dữ liệu của một bài.</summary>
        [HttpGet("dialogues/{dialogueId:int}")]
        public async Task<ActionResult<ApiResponse<ShadowingAssetStatusDto>>> GetStatus(int dialogueId, CancellationToken cancellationToken)
        {
            var status = await _assets.GetStatusAsync(dialogueId, ShadowingAssetBackfillService.ConfiguredSpeakers(_configuration), cancellationToken);
            return Ok(ApiResponse<ShadowingAssetStatusDto>.Ok(status));
        }

        /// <summary>
        /// Tạo dữ liệu cho mọi câu của một bài (cần VOICEVOX đang chạy). `force = true` để tạo lại cả dữ liệu chưa cũ;
        /// `speakers` (vd. 3,8) để tạo thêm giọng ngoài các giọng cấu hình.
        /// </summary>
        [HttpPost("dialogues/{dialogueId:int}/generate")]
        public async Task<ActionResult<ApiResponse<ShadowingAssetGenerationReportDto>>> Generate(
            int dialogueId, [FromQuery] bool force = false, [FromQuery] string? speakers = null, CancellationToken cancellationToken = default)
        {
            var ids = ShadowingAssetBackfillService.ConfiguredSpeakers(_configuration).ToList();
            if (!string.IsNullOrWhiteSpace(speakers))
            {
                foreach (var part in speakers.Split(',', System.StringSplitOptions.RemoveEmptyEntries | System.StringSplitOptions.TrimEntries))
                {
                    if (!int.TryParse(part, out var id) || id < 0 || id > 99999)
                        return BadRequest(ApiResponse<ShadowingAssetGenerationReportDto>.Fail($"Mã giọng không hợp lệ: {part}"));
                    if (!ids.Contains(id)) ids.Add(id);
                }
            }
            if (ids.Count > 10) return BadRequest(ApiResponse<ShadowingAssetGenerationReportDto>.Fail("Tối đa 10 giọng mỗi lần."));

            var report = await _assets.GenerateForDialogueAsync(dialogueId, ids, force, cancellationToken);
            if (report.EngineUnavailable)
                return StatusCode(503, ApiResponse<ShadowingAssetGenerationReportDto>.Fail("VOICEVOX chưa chạy; chưa tạo được dữ liệu.", report.Errors));
            return Ok(ApiResponse<ShadowingAssetGenerationReportDto>.Ok(report, "Đã tạo dữ liệu câu mẫu."));
        }
    }
}
