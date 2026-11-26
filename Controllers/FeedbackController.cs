using System;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Feedback;
using JCAP.Services.Helpers;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Logging;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/feedback")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class FeedbackController : ControllerBase
    {
        private static readonly string[] AllowedExtensions =
        {
            ".jpg", ".jpeg", ".png", ".webp", ".gif",
            ".pdf", ".txt", ".log", ".json", ".zip", ".doc", ".docx"
        };

        private readonly IFeedbackService _feedbackService;
        private readonly ICloudStorageService _cloudStorageService;
        private readonly ILogger<FeedbackController> _logger;

        public FeedbackController(
            IFeedbackService feedbackService,
            ICloudStorageService cloudStorageService,
            ILogger<FeedbackController> logger)
        {
            _feedbackService = feedbackService;
            _cloudStorageService = cloudStorageService;
            _logger = logger;
        }

        private string? GetCurrentUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("nameid")
                ?? User.FindFirstValue("sub");
        }

        [HttpGet("my")]
        public async Task<IActionResult> GetMyTickets(CancellationToken cancellationToken)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ."));
            }

            var response = await _feedbackService.GetMyTicketsAsync(userId, cancellationToken);
            return response.Success ? Ok(response) : BadRequest(response);
        }

        [HttpGet("my/{id:int}")]
        public async Task<IActionResult> GetMyTicketById(int id, CancellationToken cancellationToken)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ."));
            }

            var response = await _feedbackService.GetMyTicketByIdAsync(userId, id, cancellationToken);
            return response.Success ? Ok(response) : NotFound(response);
        }

        [HttpPost]
        [EnableRateLimiting("feedback-write")]
        public async Task<IActionResult> CreateTicket(
            [FromBody] CreateFeedbackTicketDto dto,
            CancellationToken cancellationToken)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ."));
            }

            var response = await _feedbackService.CreateTicketAsync(userId, dto, cancellationToken);
            return response.Success ? Ok(response) : BadRequest(response);
        }

        [HttpPost("{id:int}/reply")]
        [EnableRateLimiting("feedback-write")]
        public async Task<IActionResult> ReplyTicket(
            int id,
            [FromBody] ReplyFeedbackTicketDto dto,
            CancellationToken cancellationToken)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ."));
            }

            var response = await _feedbackService.ReplyAsLearnerAsync(userId, id, dto, cancellationToken);
            return response.Success ? Ok(response) : BadRequest(response);
        }

        /// <summary>
        /// Tải tệp đính kèm (ảnh hoặc tệp dung lượng nhỏ <= 5MB) lên Cloudinary (folder: issues/)
        /// và trả về đường dẫn CloudinaryUrl để lưu vào Database khi gửi tin nhắn.
        /// Yêu cầu đăng nhập JWT và áp dụng giới hạn tần suất (Rate Limiting).
        /// </summary>
        [HttpPost("upload-attachment")]
        [EnableRateLimiting("attachment-upload")]
        public async Task<IActionResult> UploadAttachment(IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(ApiResponse<FeedbackAttachmentDto>.Fail("Vui lòng chọn một tệp hoặc hình ảnh hợp lệ."));
            }

            if (file.Length > 5 * 1024 * 1024)
            {
                return BadRequest(ApiResponse<FeedbackAttachmentDto>.Fail("Dung lượng tệp đính kèm không được vượt quá 5MB."));
            }

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedExtensions.Contains(ext))
            {
                return BadRequest(ApiResponse<FeedbackAttachmentDto>.Fail(
                    "Định dạng tệp không hỗ trợ. Chỉ chấp nhận ảnh (PNG, JPG, WEBP, GIF) hoặc tệp nhỏ (PDF, TXT, LOG, JSON, ZIP, DOC, DOCX)."));
            }

            if (!await AttachmentSecurityHelper.HasValidFileSignatureAsync(file, ext))
            {
                return BadRequest(ApiResponse<FeedbackAttachmentDto>.Fail(
                    "Nội dung tệp không khớp với định dạng khai báo hoặc không hợp lệ."));
            }

            try
            {
                var cloudUrl = await _cloudStorageService.UploadFileAsync(file, "issues");
                var isImage = new[] { ".jpg", ".jpeg", ".png", ".webp", ".gif" }.Contains(ext);

                var publicId = ExtractPublicIdFromUrl(cloudUrl, file.FileName);
                var safeFileName = string.IsNullOrWhiteSpace(file.FileName) ? "attachment" : Path.GetFileName(file.FileName).Trim();
                if (safeFileName.Length > 260) safeFileName = safeFileName[..260];

                var safeMimeType = string.IsNullOrWhiteSpace(file.ContentType)
                    ? (isImage ? "image/png" : "application/octet-stream")
                    : file.ContentType.Trim();
                if (safeMimeType.Length > 120) safeMimeType = safeMimeType[..120];
                if (publicId.Length > 300) publicId = publicId[..300];

                var dto = new FeedbackAttachmentDto
                {
                    Id = 0,
                    FileName = safeFileName,
                    FileSize = file.Length,
                    FileType = isImage ? "IMAGE" : "FILE",
                    MimeType = safeMimeType,
                    CloudinaryUrl = cloudUrl,
                    CloudinaryPublicId = publicId
                };

                return Ok(ApiResponse<FeedbackAttachmentDto>.Ok(dto, "Tải tệp đính kèm lên thành công."));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi tải tệp đính kèm {FileName} cho người dùng {UserId}", file.FileName, GetCurrentUserId());
                return StatusCode(500, ApiResponse<FeedbackAttachmentDto>.Fail("Không thể tải tệp đính kèm lên lúc này. Vui lòng thử lại sau."));
            }
        }

        private static string ExtractPublicIdFromUrl(string url, string fallbackFileName)
        {
            try
            {
                var idx = url.IndexOf("/issues/", StringComparison.OrdinalIgnoreCase);
                if (idx >= 0)
                {
                    return url[(idx + 1)..];
                }
            }
            catch
            {
                // Ignore
            }
            return $"issues/{Path.GetFileNameWithoutExtension(fallbackFileName)}";
        }
    }
}
