using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Logging;

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
        private readonly IShadowingPracticeProgressService _progressService;
        private readonly IShadowingSentenceAssetService _assets;
        private readonly ILogger<ShadowingController> _logger;

        public ShadowingController(
            IShadowingService shadowingService,
            IAiShadowingAssessmentService aiAssessmentService,
            IShadowingPracticeProgressService progressService,
            IShadowingSentenceAssetService assets,
            ILogger<ShadowingController> logger)
        {
            _shadowingService = shadowingService;
            _aiAssessmentService = aiAssessmentService;
            _progressService = progressService;
            _assets = assets;
            _logger = logger;
        }

        /// <summary>
        /// UC-25 và UC-26: Lấy danh sách bài học Shadowing (hỗ trợ tìm kiếm từ khóa, lọc theo JLPT Level và ScenarioId).
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
        /// Hoàn thành buổi luyện: backend lấy điểm từ các kết quả chấm câu đã lưu (theo EvaluationIds), tính điểm tổng
        /// và lưu ShadowingPracticeSession vào lịch sử. Không nhận điểm từ client.
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
        /// Lịch sử các buổi luyện Shadowing đã hoàn thành của người dùng hiện tại (mới nhất trước).
        /// </summary>
        [HttpGet("history")]
        public async Task<ActionResult<ApiResponse<List<ShadowingPracticeSessionDto>>>> GetHistory()
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<List<ShadowingPracticeSessionDto>>.Fail("Không xác định được danh tính người dùng."));
            }

            return Ok(await _shadowingService.GetHistoryAsync(userId));
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
            var userId = GetCurrentUserId();

            // Có SentenceId: câu mẫu lấy từ CSDL (không tin câu mẫu do client gửi) và kết quả chấm được lưu lại.
            ShadowingSentence? sentence = null;
            if (request.SentenceId is { } sentenceId)
            {
                sentence = await _shadowingService.FindPracticeSentenceAsync(sentenceId);
                if (sentence == null)
                {
                    return BadRequest(ApiResponse<ShadowingAudioEvaluationResponseDto>.Fail("Không tìm thấy câu luyện tập."));
                }
                request.TargetText = sentence.JapaneseText;
            }

            if (string.IsNullOrWhiteSpace(request.TargetText))
            {
                return BadRequest(ApiResponse<ShadowingAudioEvaluationResponseDto>.Fail("Thiếu câu mẫu tiếng Nhật cần đánh giá."));
            }

            var canRecord = sentence != null && !string.IsNullOrEmpty(userId);

            // Gửi lại cùng một lần chấm (mất mạng, quá hạn): trả kết quả đã lưu, không chấm và không lưu thêm.
            if (canRecord && request.ClientSubmissionId is { } submissionId)
            {
                var existing = await _shadowingService.FindEvaluationBySubmissionAsync(userId!, submissionId);
                if (existing != null)
                {
                    if (existing.ShadowingSentenceId != sentence!.Id)
                        return BadRequest(ApiResponse<ShadowingAudioEvaluationResponseDto>.Fail("Mã lần gửi đã dùng cho câu khác."));
                    return Ok(ApiResponse<ShadowingAudioEvaluationResponseDto>.Ok(
                        ShadowingService.ToStoredResult(existing, sentence.JapaneseText), "Lần gửi này đã được chấm trước đó."));
                }
            }

            // Lần chấm thuộc phiên luyện: phiên phải của người dùng này, đang luyện, đúng bài và vai của câu.
            if (request.ProgressId is { } progressId)
            {
                if (!canRecord)
                    return BadRequest(ApiResponse<ShadowingAudioEvaluationResponseDto>.Fail("Cần mã câu luyện tập khi gửi kèm phiên luyện."));
                var progressError = await _progressService.ValidateForEvaluationAsync(userId!, progressId, sentence!);
                if (progressError != null)
                    return BadRequest(ApiResponse<ShadowingAudioEvaluationResponseDto>.Fail(progressError));
            }

            ShadowingAudioEvaluationResponseDto result;
            try
            {
                // Kích thước tổng đã bị chặn bởi RequestSizeLimit; định dạng/thời lượng/tín hiệu do ShadowingAudioValidator kiểm tra.
                var audio = await ReadAllAsync(request.Audio, MaxEvaluateRequestBytes, cancellationToken);
                var analysisWav = await ReadAllAsync(request.AnalysisWav, MaxAnalysisWavBytes + 1, cancellationToken);

                result = await _aiAssessmentService.EvaluateAsync(
                    new ShadowingAudioEvaluationInput
                    {
                        AnalysisWav = analysisWav,
                        ReferenceSpeakerId = request.ReferenceSpeakerId,
                        Audio = audio ?? Array.Empty<byte>(),
                        MimeType = request.Audio?.ContentType ?? string.Empty,
                        TargetText = request.TargetText,
                        // Chỉ để ghi nhận; KHÔNG dùng để chấm.
                        ClientTranscript = request.ClientTranscript,
                        ClientRecognitionStatus = request.ClientRecognitionStatus,
                        ClientRecognitionError = request.ClientRecognitionError,
                        AudioGateStatus = request.AudioGateStatus,
                        AudioGateDetail = request.AudioGateDetail
                    },
                    cancellationToken);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Không trả ex.Message cho client để tránh lộ thông tin nội bộ.
                _logger.LogError(ex, "Lỗi khi chấm câu Shadowing.");
                result = new ShadowingAudioEvaluationResponseDto
                {
                    EvaluationStatus = "failed",
                    RecognitionStatus = "unavailable",
                    RecognitionSource = "none",
                    Source = "none",
                    TargetText = request.TargetText,
                    ErrorCode = "EVALUATION_EXCEPTION",
                    ErrorMessage = "Đã xảy ra lỗi khi đánh giá. Điểm chưa được ghi nhận, hãy thử lại."
                };
            }

            // MỖI lần gửi chấm đều được lưu (kể cả chưa chấm được: điểm null + mã lỗi).
            if (canRecord)
            {
                result.SentenceId = sentence!.Id;
                try
                {
                    result.EvaluationId = await _shadowingService.RecordSentenceEvaluationAsync(
                        userId!, sentence.Id, result, request.ProgressId, request.ClientSubmissionId);
                }
                catch (Exception ex)
                {
                    // Không lưu được chỉ làm lần này không vào được lịch sử; người học vẫn thấy kết quả.
                    _logger.LogError(ex, "Không lưu được kết quả chấm câu {SentenceId}.", sentence.Id);
                }
            }

            return Ok(ApiResponse<ShadowingAudioEvaluationResponseDto>.Ok(result, "Đã xử lý yêu cầu đánh giá."));
        }

        /// <summary>Đọc tệp tải lên, tối đa <paramref name="maxBytes"/> byte (phần thừa bị cắt, bộ kiểm tra sẽ báo quá lớn/sai định dạng).</summary>
        private static async Task<byte[]?> ReadAllAsync(IFormFile? file, int maxBytes, CancellationToken cancellationToken)
        {
            if (file == null || file.Length == 0) return null;
            if (file.Length > maxBytes)
            {
                // Không đọc hết tệp quá lớn: trả về đủ lớn để bộ kiểm tra báo AUDIO_TOO_LARGE.
                return new byte[maxBytes];
            }
            using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer, cancellationToken);
            return buffer.ToArray();
        }

        /// <summary>
        /// Furigana của các câu trong bài (từ dữ liệu câu mẫu tính sẵn: cách đọc G2P gióng với chữ viết, không đoán).
        /// Câu chưa có dữ liệu thì không có trong kết quả (hiển thị chữ thường).
        /// </summary>
        [HttpGet("{id:int}/furigana")]
        public async Task<ActionResult<ApiResponse<Dictionary<int, List<FuriganaSegmentDto>>>>> GetFurigana(int id, CancellationToken cancellationToken)
        {
            var sentenceIds = await _shadowingService.GetActiveSentenceIdsAsync(id);
            var furigana = sentenceIds.Count == 0
                ? new Dictionary<int, List<FuriganaSegmentDto>>()
                : await _assets.FindFuriganaAsync(sentenceIds, cancellationToken);
            return Ok(ApiResponse<Dictionary<int, List<FuriganaSegmentDto>>>.Ok(furigana));
        }

        // ---- Phiên luyện ở server (ShadowingPracticeProgress) ----

        /// <summary>Bắt đầu hoặc tiếp tục phiên luyện cho một bài + vai (làm lại khi Restart = true).</summary>
        [HttpPost("progress")]
        public async Task<ActionResult<ApiResponse<ShadowingPracticeProgressDto>>> StartProgress([FromBody] StartShadowingProgressDto dto)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized(ApiResponse<ShadowingPracticeProgressDto>.Fail("Không xác định được danh tính người dùng."));

            var result = await _progressService.StartAsync(userId, dto);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        /// <summary>Phiên đang luyện của một bài + vai (Data = null nếu chưa có).</summary>
        [HttpGet("progress")]
        public async Task<ActionResult<ApiResponse<ShadowingPracticeProgressDto?>>> GetActiveProgress([FromQuery] int dialogueId, [FromQuery] string role)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized(ApiResponse<ShadowingPracticeProgressDto?>.Fail("Không xác định được danh tính người dùng."));

            var result = await _progressService.GetActiveAsync(userId, dialogueId, role);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        /// <summary>Phiên đang luyện gần nhất của người dùng (cho "Tiếp tục").</summary>
        [HttpGet("progress/latest")]
        public async Task<ActionResult<ApiResponse<ShadowingPracticeProgressDto?>>> GetLatestProgress()
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized(ApiResponse<ShadowingPracticeProgressDto?>.Fail("Không xác định được danh tính người dùng."));

            return Ok(await _progressService.GetLatestAsync(userId));
        }

        /// <summary>Cập nhật vị trí câu đang luyện.</summary>
        [HttpPut("progress/{id:guid}")]
        public async Task<ActionResult<ApiResponse<ShadowingPracticeProgressDto>>> UpdateProgress(Guid id, [FromBody] UpdateShadowingProgressDto dto)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized(ApiResponse<ShadowingPracticeProgressDto>.Fail("Không xác định được danh tính người dùng."));

            var result = await _progressService.UpdatePositionAsync(userId, id, dto);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        private string? GetCurrentUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier);
        }
    }
}

