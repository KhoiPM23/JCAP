using JCAP.DTOs.Common;
using JCAP.DTOs.Stt;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers;

[ApiController]
[Route("api/[controller]")]
[AllowAnonymous]
public class SttController : ControllerBase
{
    private readonly IWhisperSttService _whisperService;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<SttController> _logger;

    public SttController(
        IWhisperSttService whisperService,
        IWebHostEnvironment environment,
        ILogger<SttController> logger)
    {
        _whisperService = whisperService;
        _environment = environment;
        _logger = logger;
    }

    private async Task<string?> SaveAudioFileAsync(IFormFile file, CancellationToken cancellationToken)
    {
        try
        {
            var webRoot = _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
            var folder = Path.Combine(webRoot, "audio", "roleplay");
            if (!Directory.Exists(folder))
            {
                Directory.CreateDirectory(folder);
            }

            var ext = Path.GetExtension(file.FileName);
            if (string.IsNullOrWhiteSpace(ext)) ext = ".webm";
            var fileName = $"user_{Guid.NewGuid():N}{ext}";
            var fullPath = Path.Combine(folder, fileName);

            await using var fileStream = new FileStream(fullPath, FileMode.Create);
            await file.CopyToAsync(fileStream, cancellationToken);
            return $"/audio/roleplay/{fileName}";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Không thể lưu file audio roleplay vào wwwroot");
            return null;
        }
    }

    /// <summary>
    /// Nhận diện giọng nói tiếng Nhật qua Whisper Engine (Local/GPU/CPU) và lưu file âm thanh
    /// </summary>
    [HttpPost("transcribe")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<ApiResponse<WhisperTranscribeResponseDto>>> Transcribe(
        [FromForm] IFormFile? file,
        [FromQuery] string language = "ja",
        CancellationToken cancellationToken = default)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(ApiResponse<WhisperTranscribeResponseDto>.Fail("File âm thanh không hợp lệ hoặc rỗng."));
        }

        try
        {
            var savedAudioUrl = await SaveAudioFileAsync(file, cancellationToken);

            await using var stream = file.OpenReadStream();
            var result = await _whisperService.TranscribeAsync(stream, file.FileName, language, cancellationToken);

            if (result == null || !result.Success)
            {
                return StatusCode(503, ApiResponse<WhisperTranscribeResponseDto>.Fail("Whisper Engine tạm thời không khả dụng hoặc không nhận diện được âm thanh."));
            }

            result.AudioUrl = savedAudioUrl;
            return Ok(ApiResponse<WhisperTranscribeResponseDto>.Ok(result, "Nhận diện giọng nói thành công qua Whisper Engine."));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi xảy ra khi nhận diện file âm thanh qua STT Controller");
            return StatusCode(500, ApiResponse<WhisperTranscribeResponseDto>.Fail("Lỗi nội bộ khi nhận diện giọng nói."));
        }
    }

    /// <summary>
    /// Lưu trữ file âm thanh người học phát âm để xem lại sau này
    /// </summary>
    [HttpPost("save-audio")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<ApiResponse<object>>> SaveAudio(
        [FromForm] IFormFile? file,
        CancellationToken cancellationToken = default)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(ApiResponse<object>.Fail("File âm thanh không hợp lệ hoặc rỗng."));
        }

        var savedUrl = await SaveAudioFileAsync(file, cancellationToken);
        if (string.IsNullOrWhiteSpace(savedUrl))
        {
            return StatusCode(500, ApiResponse<object>.Fail("Không thể lưu file âm thanh vào máy chủ."));
        }

        return Ok(ApiResponse<object>.Ok(new { audioUrl = savedUrl }, "Lưu file âm thanh thành công."));
    }

    /// <summary>
    /// Kiểm tra trạng thái hoạt động của Whisper Engine
    /// </summary>
    [HttpGet("health")]
    public async Task<ActionResult<ApiResponse<object>>> Health(CancellationToken cancellationToken)
    {
        var isAvailable = await _whisperService.IsAvailableAsync(cancellationToken);
        var status = new
        {
            available = isAvailable,
            engine = "faster-whisper",
            port = 50022
        };

        return Ok(ApiResponse<object>.Ok(status, isAvailable ? "Whisper Engine đang hoạt động." : "Whisper Engine chưa được bật."));
    }
}
