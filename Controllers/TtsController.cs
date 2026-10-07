using JCAP.DTOs.Common;
using JCAP.DTOs.Tts;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [AllowAnonymous]
    public class TtsController : ControllerBase
    {
        private readonly IVoiceVoxService _voiceVoxService;
        private readonly ILogger<TtsController> _logger;

        public TtsController(IVoiceVoxService voiceVoxService, ILogger<TtsController> logger)
        {
            _voiceVoxService = voiceVoxService;
            _logger = logger;
        }

        /// <summary>
        /// Lấy danh sách giọng đọc (Speaker & Style) có sẵn từ VOICEVOX Engine
        /// </summary>
        [HttpGet("voices")]
        public async Task<ActionResult<ApiResponse<List<FlattenedVoiceDto>>>> GetVoices(CancellationToken cancellationToken)
        {
            try
            {
                var voices = await _voiceVoxService.GetAvailableVoicesAsync(cancellationToken);
                return Ok(ApiResponse<List<FlattenedVoiceDto>>.Ok(voices, "Lấy danh sách giọng đọc thành công."));
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(503, ApiResponse<List<FlattenedVoiceDto>>.Fail(ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi hệ thống khi lấy danh sách voice từ VOICEVOX");
                return StatusCode(500, ApiResponse<List<FlattenedVoiceDto>>.Fail("Lỗi hệ thống khi kết nối đến bộ đọc giọng."));
            }
        }

        /// <summary>
        /// Tổng hợp văn bản tiếng Nhật thành file âm thanh WAV qua VOICEVOX Engine
        /// </summary>
        [HttpPost("synthesize")]
        public async Task<IActionResult> Synthesize([FromBody] TtsSynthesizeRequestDto request, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(request.Text))
            {
                return BadRequest(ApiResponse<string>.Fail("Văn bản tiếng Nhật không được để trống."));
            }

            try
            {
                var wavBytes = await _voiceVoxService.SynthesizeAsync(request.Text, request.SpeakerId, cancellationToken);
                return File(wavBytes, "audio/wav", "voicevox_sample.wav");
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(503, Problem(detail: ex.Message, statusCode: 503, title: "VOICEVOX Unavailable"));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi tổng hợp âm thanh VOICEVOX cho câu: {Text}", request.Text);
                return StatusCode(500, Problem(detail: "Lỗi nội bộ khi tổng hợp âm thanh.", statusCode: 500));
            }
        }
    }
}

