using System;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Feedback;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/feedback")]
    [Authorize]
    public class FeedbackController : ControllerBase
    {
        private static readonly string[] AllowedExtensions =
        {
            ".jpg", ".jpeg", ".png", ".webp", ".gif",
            ".pdf", ".txt", ".log", ".json", ".zip", ".doc", ".docx"
        };

        private readonly IFeedbackService _feedbackService;
        private readonly ICloudStorageService _cloudStorageService;

        public FeedbackController(
            IFeedbackService feedbackService,
            ICloudStorageService cloudStorageService)
        {
            _feedbackService = feedbackService;
            _cloudStorageService = cloudStorageService;
        }

        private string? GetCurrentUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier)
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
        /// Dùng chung cho cả Learner và Admin.
        /// </summary>
        [HttpPost("upload-attachment")]
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

            try
            {
                var cloudUrl = await _cloudStorageService.UploadFileAsync(file, "issues");
                var isImage = file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
                    || new[] { ".jpg", ".jpeg", ".png", ".webp", ".gif" }.Contains(ext);

                // Trích xuất publicId hiển thị từ URL hoặc tạo mã chuẩn
                var publicId = ExtractPublicIdFromUrl(cloudUrl, file.FileName);

                var dto = new FeedbackAttachmentDto
                {
                    Id = 0,
                    FileName = file.FileName,
                    FileSize = file.Length,
                    FileType = isImage ? "IMAGE" : "FILE",
                    MimeType = string.IsNullOrWhiteSpace(file.ContentType)
                        ? (isImage ? "image/png" : "application/octet-stream")
                        : file.ContentType,
                    CloudinaryUrl = cloudUrl,
                    CloudinaryPublicId = publicId
                };

                return Ok(ApiResponse<FeedbackAttachmentDto>.Ok(dto, "Tải tệp đính kèm lên Cloudinary thành công."));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<FeedbackAttachmentDto>.Fail($"Lỗi khi tải tệp lên Cloudinary: {ex.Message}"));
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

