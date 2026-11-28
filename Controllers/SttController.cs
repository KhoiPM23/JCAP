using JCAP.DTOs.Common;
using JCAP.DTOs.Stt;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace JCAP.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SttController : ControllerBase
{
    internal const long MaxAudioUploadBytes = 15 * 1024 * 1024; // 15 MB

    private static readonly HashSet<string> AllowedAudioExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".webm",
        ".wav",
        ".ogg",
        ".mp3",
        ".m4a"
    };

    private readonly IWhisperSttService _whisperService;
    private readonly IWebHostEnvironment _environment;
    private readonly IConfiguration _configuration;
    private readonly ILogger<SttController> _logger;

    public SttController(
        IWhisperSttService whisperService,
        IWebHostEnvironment environment,
        IConfiguration configuration,
        ILogger<SttController> logger)
    {
        _whisperService = whisperService;
        _environment = environment;
        _configuration = configuration;
        _logger = logger;
    }

    private static bool ValidateAudioFile(IFormFile? file, out string? errorMessage, out string normalizedExtension)
    {
        normalizedExtension = ".webm";
        if (file == null || file.Length == 0)
        {
            errorMessage = "File âm thanh không hợp lệ hoặc rỗng.";
            return false;
        }

        if (file.Length > MaxAudioUploadBytes)
        {
            errorMessage = "File âm thanh vượt quá giới hạn cho phép (tối đa 15 MB).";
            return false;
        }

        var rawExt = Path.GetExtension(file.FileName);
        normalizedExtension = string.IsNullOrWhiteSpace(rawExt) ? ".webm" : rawExt.Trim().ToLowerInvariant();
        if (!AllowedAudioExtensions.Contains(normalizedExtension))
        {
            errorMessage = "Định dạng file âm thanh không được hỗ trợ (chỉ chấp nhận .webm, .wav, .ogg, .mp3, .m4a).";
            return false;
        }

        errorMessage = null;
        return true;
    }

    private async Task<string?> SaveAudioFileAsync(IFormFile file, string normalizedExtension, CancellationToken cancellationToken)
    {
        try
        {
            var webRoot = _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
            var folder = Path.Combine(webRoot, "audio", "roleplay");
            if (!Directory.Exists(folder))
            {
                Directory.CreateDirectory(folder);
            }

            var fileName = $"user_{Guid.NewGuid():N}{normalizedExtension}";
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
    [RequestSizeLimit(MaxAudioUploadBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxAudioUploadBytes)]
    [EnableRateLimiting("roleplay-ai")]
    public async Task<ActionResult<ApiResponse<WhisperTranscribeResponseDto>>> Transcribe(
        [FromForm] IFormFile? file,
        [FromQuery] string language = "ja",
        CancellationToken cancellationToken = default)
    {
        if (!ValidateAudioFile(file, out var validationError, out var normalizedExtension))
        {
            return BadRequest(ApiResponse<WhisperTranscribeResponseDto>.Fail(validationError!));
        }

        try
        {
            var savedAudioUrl = await SaveAudioFileAsync(file!, normalizedExtension, cancellationToken);

            await using var stream = file!.OpenReadStream();
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
    [RequestSizeLimit(MaxAudioUploadBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxAudioUploadBytes)]
    [EnableRateLimiting("roleplay-ai")]
    public async Task<ActionResult<ApiResponse<object>>> SaveAudio(
        [FromForm] IFormFile? file,
        CancellationToken cancellationToken = default)
    {
        if (!ValidateAudioFile(file, out var validationError, out var normalizedExtension))
        {
            return BadRequest(ApiResponse<object>.Fail(validationError!));
        }

        var savedUrl = await SaveAudioFileAsync(file!, normalizedExtension, cancellationToken);
        if (string.IsNullOrWhiteSpace(savedUrl))
        {
            return StatusCode(500, ApiResponse<object>.Fail("Không thể lưu file âm thanh vào máy chủ."));
        }

        return Ok(ApiResponse<object>.Ok(new { audioUrl = savedUrl }, "Lưu file âm thanh thành công."));
    }

    /// <summary>
    /// Xóa file âm thanh nháp của học viên trong wwwroot/audio/roleplay khi người học hủy/xóa bản ghi trước khi gửi
    /// </summary>
    [HttpDelete("audio")]
    public ActionResult<ApiResponse<object>> DeleteAudio([FromQuery] string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return BadRequest(ApiResponse<object>.Fail("Đường dẫn file âm thanh không hợp lệ."));
        }

        var trimmed = url.Trim();
        if (!trimmed.StartsWith("/audio/roleplay/", StringComparison.OrdinalIgnoreCase)
            || trimmed.Contains("..", StringComparison.Ordinal)
            || trimmed.Contains('\\', StringComparison.Ordinal)
            || trimmed.Contains('?', StringComparison.Ordinal)
            || trimmed.Contains('#', StringComparison.Ordinal))
        {
            return BadRequest(ApiResponse<object>.Fail("Đường dẫn file âm thanh không được phép."));
        }

        var fileName = Path.GetFileName(trimmed);
        if (string.IsNullOrWhiteSpace(fileName) || !string.Equals(trimmed, $"/audio/roleplay/{fileName}", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(ApiResponse<object>.Fail("Tên file âm thanh không hợp lệ."));
        }

        var webRoot = _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
        var folder = Path.GetFullPath(Path.Combine(webRoot, "audio", "roleplay"));
        var fullPath = Path.GetFullPath(Path.Combine(folder, fileName));

        if (!fullPath.StartsWith(folder + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(ApiResponse<object>.Fail("Đường dẫn file vượt ngoài phạm vi cho phép."));
        }

        var deleted = false;
        if (System.IO.File.Exists(fullPath))
        {
            System.IO.File.Delete(fullPath);
            deleted = true;
        }

        return Ok(ApiResponse<object>.Ok(new { deleted }, deleted ? "Đã xóa file âm thanh tạm." : "File không còn tồn tại."));
    }

    /// <summary>
    /// Kiểm tra trạng thái hoạt động của Whisper Engine
    /// </summary>
    [HttpGet("health")]
    public async Task<ActionResult<ApiResponse<object>>> Health(CancellationToken cancellationToken)
    {
        var rawUrl = _configuration["Whisper:BaseUrl"];
        var configured = !string.IsNullOrWhiteSpace(rawUrl)
            && Uri.TryCreate(rawUrl.Trim(), UriKind.Absolute, out _);
        var effectiveUrl = configured ? rawUrl!.Trim() : "http://127.0.0.1:50022";
        var port = Uri.TryCreate(effectiveUrl, UriKind.Absolute, out var uri) && uri.Port > 0
            ? uri.Port
            : 50022;

        var isAvailable = await _whisperService.IsAvailableAsync(cancellationToken);
        var status = new
        {
            available = isAvailable,
            engine = "faster-whisper",
            port,
            configured
        };

        return Ok(ApiResponse<object>.Ok(status, isAvailable ? "Whisper Engine đang hoạt động." : "Whisper Engine chưa được bật."));
    }

    /// <summary>
    /// Kích hoạt khởi động Whisper Engine ngầm nếu chưa chạy (chỉ cho phép ở Development hoặc Admin)
    /// </summary>
    [HttpPost("start-engine")]
    public async Task<ActionResult<ApiResponse<object>>> StartEngine(CancellationToken cancellationToken)
    {
        var isAdmin = User?.IsInRole("Admin") ?? false;
        if (!_environment.IsDevelopment() && !isAdmin)
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                ApiResponse<object>.Fail("Chỉ quản trị viên hoặc môi trường phát triển mới được kích hoạt tiến trình STT."));
        }

        var started = await _whisperService.TryAutoStartEngineAsync(cancellationToken);
        return Ok(ApiResponse<object>.Ok(new { started }, started ? "Đã gửi lệnh kích hoạt Whisper Engine ngầm." : "Tiến trình Whisper đang được khởi động hoặc đã sẵn sàng."));
    }
}

