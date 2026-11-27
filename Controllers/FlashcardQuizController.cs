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
    [Route("api/flashcard-quiz")]
    [Authorize]
    public class FlashcardQuizController : ControllerBase
    {
        private readonly IFlashcardQuizService _quizService;

        public FlashcardQuizController(IFlashcardQuizService quizService)
        {
            _quizService = quizService;
        }

        /// <summary>
        /// Lưu kết quả một lần làm bài tự đánh giá (Quizlet Test).
        /// </summary>
        [HttpPost("attempts")]
        public async Task<ActionResult<ApiResponse<FlashcardQuizHistoryItemDto>>> SubmitAttempt(
            [FromBody] SubmitFlashcardQuizAttemptRequestDto request)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<FlashcardQuizHistoryItemDto>.Fail("Chưa xác thực người dùng."));
            }

            var result = await _quizService.SubmitAttemptAsync(userId, request);
            if (!result.Success)
            {
                return BadRequest(result);
            }
            return Ok(result);
        }

        /// <summary>
        /// Xem danh sách lịch sử các lần làm bài tự đánh giá (Quizlet Test).
        /// </summary>
        [HttpGet("history")]
        public async Task<ActionResult<ApiResponse<List<FlashcardQuizHistoryItemDto>>>> GetHistory(
            [FromQuery] string? contentType = null,
            [FromQuery] int? topicId = null)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<List<FlashcardQuizHistoryItemDto>>.Fail("Chưa xác thực người dùng."));
            }

            var result = await _quizService.GetHistoryAsync(userId, contentType, topicId);
            return Ok(result);
        }

        /// <summary>
        /// Xem chi tiết từng câu hỏi và đáp án của một lần làm bài tự đánh giá.
        /// </summary>
        [HttpGet("history/{attemptId:int}")]
        public async Task<ActionResult<ApiResponse<FlashcardQuizHistoryDetailDto>>> GetHistoryDetail(
            [FromRoute] int attemptId)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<FlashcardQuizHistoryDetailDto>.Fail("Chưa xác thực người dùng."));
            }

            var result = await _quizService.GetHistoryDetailAsync(userId, attemptId);
            if (!result.Success)
            {
                return NotFound(result);
            }
            return Ok(result);
        }
    }
}
