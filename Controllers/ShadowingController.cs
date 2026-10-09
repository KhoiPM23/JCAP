using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ShadowingController : ControllerBase
    {
        private readonly IShadowingService _shadowingService;
        private readonly IAiShadowingAssessmentService _aiAssessmentService;

        public ShadowingController(
            IShadowingService shadowingService,
            IAiShadowingAssessmentService aiAssessmentService)
        {
            _shadowingService = shadowingService;
            _aiAssessmentService = aiAssessmentService;
        }

        /// <summary>
        /// UC-25 & UC-26: Lấy danh sách bài học Shadowing (hỗ trợ tìm kiếm từ khóa, lọc theo JLPT Level và ScenarioId).
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<ApiResponse<List<ShadowingDialogueListDto>>>> GetCatalog(
            [FromQuery] string? keyword,
            [FromQuery] string? jlptLevel,
            [FromQuery] int? scenarioId)
        {
            var result = await _shadowingService.GetLearnerCatalogAsync(keyword, jlptLevel, scenarioId);
            return Ok(result);
        }

        /// <summary>
        /// UC-27: Lấy chi tiết bài học Shadowing kèm ngữ cảnh kịch bản, từ vựng, ngữ pháp và danh sách câu đối thoại.
        /// </summary>
        [HttpGet("{id:int}")]
        public async Task<ActionResult<ApiResponse<ShadowingDialogueDetailDto>>> GetDetail(int id)
        {
            var result = await _shadowingService.GetLearnerDetailAsync(id);
            if (!result.Success)
            {
                return NotFound(result);
            }
            return Ok(result);
        }

        /// <summary>
        /// Lưu lại tiến trình hoàn thành buổi luyện tập Shadowing (không tính phí).
        /// </summary>
        [HttpPost("session/complete")]
        public async Task<ActionResult<ApiResponse<ShadowingSessionCompleteResponseDto>>> CompleteSession(
            [FromBody] ShadowingSessionCompleteDto request)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<ShadowingSessionCompleteResponseDto>.Fail("Không xác định được danh tính người dùng."));
            }

            var result = await _shadowingService.CompleteSessionAsync(userId, request);
            if (!result.Success)
            {
                return BadRequest(result);
            }
            return Ok(result);
        }

        /// <summary>
        /// Yêu cầu phân tích phát âm AI chuyên sâu (tính phí 15 AI Credits).
        /// </summary>
        [HttpPost("session/ai-analysis")]
        public async Task<ActionResult<ApiResponse<ShadowingAiAnalysisResponseDto>>> RequestAiAnalysis(
            [FromBody] ShadowingAiAnalysisRequestDto request)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<ShadowingAiAnalysisResponseDto>.Fail("Không xác định được danh tính người dùng."));
            }

            var result = await _shadowingService.RequestAiAnalysisAsync(userId, request);
            if (!result.Success)
            {
                return BadRequest(result);
            }
            return Ok(result);
        }

        /// <summary>
        /// Phân tích và chấm điểm âm thanh của từng câu Shadowing bằng Gemini AI.
        /// </summary>
        [HttpPost("evaluate-audio")]
        [AllowAnonymous]
        public async Task<ActionResult<ApiResponse<ShadowingAudioEvaluationResponseDto>>> EvaluateAudio(
            [FromForm] ShadowingAudioEvaluationRequestDto request,
            CancellationToken cancellationToken)
        {
            if (request.Audio == null || request.Audio.Length == 0)
            {
                return Ok(ApiResponse<ShadowingAudioEvaluationResponseDto>.Ok(new ShadowingAudioEvaluationResponseDto
                {
                    EvaluationStatus = "unavailable",
                    ErrorCode = "EMPTY_AUDIO",
                    ErrorMessage = "Không tìm thấy dữ liệu âm thanh."
                }, "Dữ liệu âm thanh trống."));
            }

            if (string.IsNullOrWhiteSpace(request.TargetText))
            {
                return BadRequest(ApiResponse<ShadowingAudioEvaluationResponseDto>.Fail("Thiếu câu mẫu tiếng Nhật cần đánh giá."));
            }

            try
            {
                using var stream = request.Audio.OpenReadStream();
                var result = await _aiAssessmentService.EvaluateAudioAsync(
                    stream,
                    request.Audio.ContentType,
                    request.TargetText,
                    cancellationToken);

                if (result == null)
                {
                    return Ok(ApiResponse<ShadowingAudioEvaluationResponseDto>.Ok(new ShadowingAudioEvaluationResponseDto
                    {
                        EvaluationStatus = "partial",
                        Source = "client_fallback",
                        ErrorCode = "AI_UNAVAILABLE",
                        ErrorMessage = "Dịch vụ AI không khả dụng, sử dụng bộ đánh giá nội bộ."
                    }, "Chuyển sang bộ đánh giá cục bộ."));
                }

                return Ok(ApiResponse<ShadowingAudioEvaluationResponseDto>.Ok(result, "Phân tích âm thanh thành công."));
            }
            catch (Exception ex)
            {
                return Ok(ApiResponse<ShadowingAudioEvaluationResponseDto>.Ok(new ShadowingAudioEvaluationResponseDto
                {
                    EvaluationStatus = "failed",
                    ErrorCode = "EXCEPTION",
                    ErrorMessage = ex.Message
                }, "Đã xảy ra lỗi khi phân tích."));
            }
        }

        private string? GetCurrentUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier);
        }
    }
}

