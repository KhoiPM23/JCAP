using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ShadowingController : ControllerBase
    {
        // 5MB audio + các trường form; khớp Shadowing:Audio:MaxBytes mặc định trong ShadowingEvaluationService.
        private const int MaxEvaluateRequestBytes = 8 * 1024 * 1024;
        private const int MaxAnalysisWavBytes = 2 * 1024 * 1024; // ~60 s WAV 16 kHz mono 16-bit

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
        /// Đánh giá một câu Shadowing: nhận dạng giọng nói, so khớp với câu mẫu và chấm điểm (backend là nguồn điểm duy nhất).
        /// Yêu cầu đăng nhập (JWT); giới hạn dung lượng và tần suất để tránh lạm dụng API trả phí.
        /// </summary>
        [HttpPost("evaluate-audio")]
        [RequestSizeLimit(MaxEvaluateRequestBytes)]
        [RequestFormLimits(MultipartBodyLengthLimit = MaxEvaluateRequestBytes)]
        [EnableRateLimiting("shadowing-evaluate")]
        public async Task<ActionResult<ApiResponse<ShadowingAudioEvaluationResponseDto>>> EvaluateAudio(
            [FromForm] ShadowingAudioEvaluationRequestDto request,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(request.TargetText))
            {
                return BadRequest(ApiResponse<ShadowingAudioEvaluationResponseDto>.Fail("Thiếu câu mẫu tiếng Nhật cần đánh giá."));
            }

            if (request.Audio == null || request.Audio.Length == 0)
            {
                return Ok(ApiResponse<ShadowingAudioEvaluationResponseDto>.Ok(new ShadowingAudioEvaluationResponseDto
                {
                    EvaluationStatus = "unavailable",
                    RecognitionStatus = "unavailable",
                    RecognitionSource = "none",
                    Source = "none",
                    TargetText = request.TargetText,
                    ErrorCode = "EMPTY_AUDIO",
                    ErrorMessage = "Không tìm thấy dữ liệu âm thanh."
                }, "Dữ liệu âm thanh trống."));
            }

            try
            {
                using var buffer = new MemoryStream();
                await request.Audio.CopyToAsync(buffer, cancellationToken);

                byte[]? analysisWav = null;
                if (request.AnalysisWav is { Length: > 0 and <= MaxAnalysisWavBytes })
                {
                    using var wavBuffer = new MemoryStream();
                    await request.AnalysisWav.CopyToAsync(wavBuffer, cancellationToken);
                    analysisWav = wavBuffer.ToArray();
                }

                var result = await _aiAssessmentService.EvaluateAsync(
                    new ShadowingAudioEvaluationInput
                    {
                        AnalysisWav = analysisWav,
                        ReferenceSpeakerId = request.ReferenceSpeakerId,
                        Audio = buffer.ToArray(),
                        MimeType = request.Audio.ContentType,
                        TargetText = request.TargetText,
                        ClientTranscript = request.ClientTranscript,
                        ClientRecognitionStatus = request.ClientRecognitionStatus,
                        ClientRecognitionError = request.ClientRecognitionError,
                        AudioGateStatus = request.AudioGateStatus,
                        AudioGateDetail = request.AudioGateDetail
                    },
                    cancellationToken);

                return Ok(ApiResponse<ShadowingAudioEvaluationResponseDto>.Ok(result, "Đã xử lý yêu cầu đánh giá."));
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception)
            {
                // Không trả ex.Message cho client để tránh lộ thông tin nội bộ.
                return Ok(ApiResponse<ShadowingAudioEvaluationResponseDto>.Ok(new ShadowingAudioEvaluationResponseDto
                {
                    EvaluationStatus = "failed",
                    RecognitionStatus = "unavailable",
                    RecognitionSource = "none",
                    Source = "none",
                    TargetText = request.TargetText,
                    ErrorCode = "EVALUATION_EXCEPTION",
                    ErrorMessage = "Đã xảy ra lỗi khi đánh giá. Điểm chưa được ghi nhận, hãy thử lại."
                }, "Đã xảy ra lỗi khi phân tích."));
            }
        }

        private string? GetCurrentUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier);
        }
    }
}

