using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Flashcard;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/flashcards")]
    [Authorize]
    public class LearnerFlashcardsController : ControllerBase
    {
        private readonly ILearnerFlashcardService _flashcardService;

        public LearnerFlashcardsController(ILearnerFlashcardService flashcardService)
        {
            _flashcardService = flashcardService;
        }

        /// <summary>
        /// Lấy hạn mức (quota) thẻ mới trong ngày của học viên.
        /// </summary>
        [HttpGet("quota")]
        public async Task<ActionResult<ApiResponse<FlashcardQuotaDto>>> GetQuota()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<FlashcardQuotaDto>.Fail("Chưa xác thực người dùng."));
            }

            var result = await _flashcardService.GetDailyQuotaAsync(userId);
            if (!result.Success)
            {
                return BadRequest(result);
            }
            return Ok(result);
        }

        /// <summary>
        /// Mở khóa thêm thẻ mới trong ngày bằng Credit.
        /// </summary>
        [HttpPost("quota/unlock")]
        public async Task<ActionResult<ApiResponse<FlashcardQuotaDto>>> UnlockExtraQuota()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<FlashcardQuotaDto>.Fail("Chưa xác thực người dùng."));
            }

            var result = await _flashcardService.UnlockExtraQuotaAsync(userId);
            if (!result.Success)
            {
                return BadRequest(result);
            }
            return Ok(result);
        }

        /// <summary>
        /// UC-55: Xem danh sách các bộ thẻ Flashcard sinh tự động từ các Chủ đề (Topics).
        /// </summary>
        [HttpGet("sets")]
        public async Task<ActionResult<ApiResponse<List<FlashcardSetSummaryDto>>>> GetSets(
            [FromQuery] string? contentType = null,
            [FromQuery] string? jlptLevel = null,
            [FromQuery] string? keyword = null)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<List<FlashcardSetSummaryDto>>.Fail("Chưa xác thực người dùng."));
            }

            var result = await _flashcardService.GetFlashcardSetsAsync(userId, contentType, jlptLevel, keyword);
            return Ok(result);
        }

        /// <summary>
        /// UC-56: Xem chi tiết các thẻ bên trong một bộ thẻ Flashcard kèm trạng thái SRS.
        /// </summary>
        [HttpGet("sets/{topicId:int}/{contentType}")]
        public async Task<ActionResult<ApiResponse<FlashcardSetDetailDto>>> GetSetDetail(
            [FromRoute] int topicId,
            [FromRoute] string contentType)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<FlashcardSetDetailDto>.Fail("Chưa xác thực người dùng."));
            }

            var result = await _flashcardService.GetFlashcardSetDetailAsync(userId, topicId, contentType);
            if (!result.Success)
            {
                return NotFound(result);
            }
            return Ok(result);
        }

        /// <summary>
        /// UC-54 & UC-57: Bắt đầu một phiên học Flashcard (từ Bộ thẻ Topic hoặc từ Bookmark).
        /// </summary>
        [HttpPost("sessions/start")]
        public async Task<ActionResult<ApiResponse<FlashcardSessionDto>>> StartSession([FromBody] StartFlashcardSessionRequestDto request)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<FlashcardSessionDto>.Fail("Chưa xác thực người dùng."));
            }

            var result = await _flashcardService.StartSessionAsync(userId, request);
            if (!result.Success)
            {
                return BadRequest(result);
            }
            return Ok(result);
        }

        /// <summary>
        /// Chấm điểm một thẻ (Again / Good / Easy) ngay trong phiên học.
        /// </summary>
        [HttpPost("sessions/{sessionId:int}/review")]
        public async Task<ActionResult<ApiResponse<FlashcardReviewResultDto>>> SubmitReview(
            [FromRoute] int sessionId,
            [FromBody] SubmitFlashcardReviewRequestDto request)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<FlashcardReviewResultDto>.Fail("Chưa xác thực người dùng."));
            }

            var result = await _flashcardService.SubmitCardReviewAsync(userId, sessionId, request);
            if (!result.Success)
            {
                return BadRequest(result);
            }
            return Ok(result);
        }

        /// <summary>
        /// Kết thúc phiên học và nhận bảng tổng kết.
        /// </summary>
        [HttpPost("sessions/{sessionId:int}/complete")]
        public async Task<ActionResult<ApiResponse<CompleteFlashcardSessionResponseDto>>> CompleteSession([FromRoute] int sessionId)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<CompleteFlashcardSessionResponseDto>.Fail("Chưa xác thực người dùng."));
            }

            var result = await _flashcardService.CompleteSessionAsync(userId, sessionId);
            if (!result.Success)
            {
                return BadRequest(result);
            }
            return Ok(result);
        }

        /// <summary>
        /// UC-58: Xem danh sách lịch sử các phiên ôn tập Flashcard.
        /// </summary>
        [HttpGet("history")]
        public async Task<ActionResult<ApiResponse<List<FlashcardSessionHistoryItemDto>>>> GetHistory()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<List<FlashcardSessionHistoryItemDto>>.Fail("Chưa xác thực người dùng."));
            }

            var result = await _flashcardService.GetSessionHistoryAsync(userId);
            return Ok(result);
        }

        /// <summary>
        /// UC-58: Xem chi tiết từng lượt lật/chấm thẻ trong một phiên ôn tập.
        /// </summary>
        [HttpGet("history/{sessionId:int}")]
        public async Task<ActionResult<ApiResponse<FlashcardSessionHistoryDetailDto>>> GetHistoryDetail([FromRoute] int sessionId)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<FlashcardSessionHistoryDetailDto>.Fail("Chưa xác thực người dùng."));
            }

            var result = await _flashcardService.GetSessionHistoryDetailAsync(userId, sessionId);
            if (!result.Success)
            {
                return NotFound(result);
            }
            return Ok(result);
        }
    }
}
