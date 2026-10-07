using System.Text.Json;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Roleplay;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations
{
    public class RoleplayResultService : IRoleplayResultService
    {
        private const int PassThreshold = 60;
        private const string LegacyMockFeedback = "Bạn đã duy trì hội thoại rõ ràng và hoàn thành tốt các mục tiêu chính. Hãy tiếp tục luyện cách diễn đạt tự nhiên hơn trong những lượt nói tiếp theo.";

        private readonly AppDbContext _dbContext;
        private readonly IRoleplaySessionSnapshotProvider _sessionSnapshotProvider;
        private readonly IRoleplayEvaluationService _evaluationService;
        private readonly ILogger<RoleplayResultService> _logger;

        public RoleplayResultService(
            AppDbContext dbContext,
            IRoleplaySessionSnapshotProvider sessionSnapshotProvider,
            IRoleplayEvaluationService evaluationService,
            ILogger<RoleplayResultService> logger)
        {
            _dbContext = dbContext;
            _sessionSnapshotProvider = sessionSnapshotProvider;
            _evaluationService = evaluationService;
            _logger = logger;
        }

        public async Task<ApiResponse<CompleteRoleplaySessionResponseDto>> CompleteSessionAsync(
            string userId,
            int sessionId)
        {
            if (string.IsNullOrWhiteSpace(userId) || sessionId <= 0)
            {
                return ApiResponse<CompleteRoleplaySessionResponseDto>.Fail("Phiên luyện tập không hợp lệ.");
            }

            var existingResult = await _dbContext.RoleplayResults
                .AsNoTracking()
                .FirstOrDefaultAsync(result =>
                    result.RoleplaySessionId == sessionId && result.UserId == userId);

            if (existingResult != null)
            {
                return BuildCompleteResponse(
                    existingResult.Id,
                    isExistingResult: true,
                    isMockEvaluation: IsLegacyMockResult(existingResult));
            }

            var snapshot = await _sessionSnapshotProvider.GetCompletableSessionAsync(sessionId, userId);
            if (snapshot == null || !string.Equals(snapshot.UserId, userId, StringComparison.Ordinal))
            {
                return ApiResponse<CompleteRoleplaySessionResponseDto>.Fail(
                    "Không tìm thấy phiên luyện tập hoặc bạn không có quyền hoàn tất phiên này.");
            }

            var completedMissions = snapshot.CompletedMissions.Select(mission => new CompletedMissionResultDto
            {
                MissionId = mission.MissionId,
                Title = mission.Title
            }).ToList();

            var session = await _dbContext.RoleplaySessions
                .Include(item => item.Messages)
                .Include(item => item.SessionMissions)
                .FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId);

            if (session == null)
            {
                return ApiResponse<CompleteRoleplaySessionResponseDto>.Fail(
                    "Không tìm thấy phiên luyện tập hoặc bạn không có quyền hoàn tất phiên này.");
            }

            var userMessages = session.Messages
                .Where(message => string.Equals(message.Sender, "User", StringComparison.OrdinalIgnoreCase))
                .OrderBy(message => message.CreatedAt)
                .ToList();

            if (userMessages.Count == 0)
            {
                return ApiResponse<CompleteRoleplaySessionResponseDto>.Fail(
                    "Bạn cần gửi ít nhất một câu hội thoại trước khi hoàn tất phiên luyện tập.");
            }

            var evaluation = _evaluationService.Evaluate(
                userMessages.Select(message => message.LinguisticFeedbackJson),
                session.SessionMissions.Count(mission => mission.IsCompleted),
                session.SessionMissions.Count,
                session.IsNaturallyConcluded);

            if (evaluation == null)
            {
                return ApiResponse<CompleteRoleplaySessionResponseDto>.Fail(
                    "Chưa đủ dữ liệu đánh giá từ Gemini. Vui lòng tiếp tục hội thoại và thử hoàn tất lại.");
            }

            var completedAt = DateTime.UtcNow;
            session.Status = "Completed";
            session.CompletedAt ??= completedAt;
            session.UpdatedAt = completedAt;

            var result = new RoleplayResult
            {
                RoleplaySessionId = snapshot.SessionId,
                UserId = userId,
                ScenarioTitle = snapshot.ScenarioTitle,
                JLPTLevel = snapshot.JLPTLevel,
                OverallScore = evaluation.OverallScore,
                GrammarScore = evaluation.GrammarScore,
                VocabularyScore = evaluation.VocabularyScore,
                ImpressionScore = evaluation.ImpressionScore,
                PassStatus = evaluation.AllMissionsCompleted
                    && evaluation.OverallScore >= PassThreshold,
                GeneralFeedbackText = evaluation.GeneralFeedbackText,
                CompletedMissionsSummaryJson = JsonSerializer.Serialize(completedMissions),
                CompletedAt = session.CompletedAt.Value
            };

            _dbContext.RoleplayResults.Add(result);

            try
            {
                await _dbContext.SaveChangesAsync();
                return BuildCompleteResponse(
                    result.Id,
                    isExistingResult: false,
                    isMockEvaluation: false);
            }
            catch (DbUpdateException exception)
            {
                _logger.LogWarning(
                    exception,
                    "Phát hiện yêu cầu hoàn tất trùng cho RoleplaySession {SessionId}.",
                    sessionId);

                _dbContext.Entry(result).State = EntityState.Detached;
                _dbContext.Entry(session).State = EntityState.Detached;
                var concurrentResult = await _dbContext.RoleplayResults
                    .AsNoTracking()
                    .FirstOrDefaultAsync(item =>
                        item.RoleplaySessionId == sessionId && item.UserId == userId);

                if (concurrentResult != null)
                {
                    return BuildCompleteResponse(
                        concurrentResult.Id,
                        isExistingResult: true,
                        isMockEvaluation: IsLegacyMockResult(concurrentResult));
                }

                throw;
            }
        }

        public async Task<ApiResponse<RoleplayResultHistoryResponseDto>> GetHistoryAsync(
            string userId,
            int page = 1,
            int pageSize = 10,
            bool? passStatus = null)
        {
            page = Math.Max(page, 1);
            pageSize = Math.Clamp(pageSize, 1, 50);

            var query = _dbContext.RoleplayResults
                .AsNoTracking()
                .Where(result => result.UserId == userId);

            if (passStatus.HasValue)
            {
                query = query.Where(result => result.PassStatus == passStatus.Value);
            }

            var totalCount = await query.CountAsync();
            var items = await query
                .OrderByDescending(result => result.CompletedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(result => new RoleplayResultSummaryDto
                {
                    Id = result.Id,
                    RoleplaySessionId = result.RoleplaySessionId,
                    ScenarioTitle = result.ScenarioTitle,
                    JLPTLevel = result.JLPTLevel,
                    OverallScore = result.OverallScore,
                    PassStatus = result.PassStatus,
                    CompletedAt = result.CompletedAt
                })
                .ToListAsync();

            foreach (var item in items)
            {
                item.CompletedAt = AsUtc(item.CompletedAt);
            }

            return ApiResponse<RoleplayResultHistoryResponseDto>.Ok(new RoleplayResultHistoryResponseDto
            {
                Items = items,
                TotalCount = totalCount,
                Page = page,
                PageSize = pageSize,
                TotalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize)
            }, "Lấy lịch sử luyện hội thoại thành công.");
        }

        public async Task<ApiResponse<RoleplayResultDetailDto>> GetDetailAsync(string userId, int resultId)
        {
            var result = await _dbContext.RoleplayResults
                .AsNoTracking()
                .FirstOrDefaultAsync(item => item.Id == resultId && item.UserId == userId);

            if (result == null)
            {
                return ApiResponse<RoleplayResultDetailDto>.Fail(
                    "Không tìm thấy kết quả luyện tập hoặc bạn không có quyền xem kết quả này.");
            }

            List<CompletedMissionResultDto> completedMissions;
            try
            {
                completedMissions = JsonSerializer.Deserialize<List<CompletedMissionResultDto>>(
                    result.CompletedMissionsSummaryJson) ?? [];
            }
            catch (JsonException exception)
            {
                _logger.LogWarning(
                    exception,
                    "Không thể đọc snapshot mission của RoleplayResult {ResultId}.",
                    result.Id);
                completedMissions = [];
            }

            return ApiResponse<RoleplayResultDetailDto>.Ok(new RoleplayResultDetailDto
            {
                Id = result.Id,
                RoleplaySessionId = result.RoleplaySessionId,
                ScenarioTitle = result.ScenarioTitle,
                JLPTLevel = result.JLPTLevel,
                OverallScore = result.OverallScore,
                GrammarScore = result.GrammarScore,
                VocabularyScore = result.VocabularyScore,
                ImpressionScore = result.ImpressionScore,
                PassStatus = result.PassStatus,
                GeneralFeedbackText = result.GeneralFeedbackText,
                CompletedMissions = completedMissions,
                CompletedAt = AsUtc(result.CompletedAt)
            }, "Lấy chi tiết kết quả luyện hội thoại thành công.");
        }

        private static DateTime AsUtc(DateTime value)
        {
            // SQL Server datetime2 does not preserve DateTime.Kind. Roleplay timestamps are
            // stored in UTC, so restore the kind before JSON serialization to emit the "Z"
            // suffix and prevent browsers from interpreting UTC values as local time.
            return value.Kind == DateTimeKind.Utc
                ? value
                : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        }

        private static ApiResponse<CompleteRoleplaySessionResponseDto> BuildCompleteResponse(
            int resultId,
            bool isExistingResult,
            bool isMockEvaluation)
        {
            var message = isExistingResult
                ? "Phiên luyện tập đã được hoàn tất trước đó."
                : "Hoàn tất và lưu kết quả luyện tập thành công.";

            return ApiResponse<CompleteRoleplaySessionResponseDto>.Ok(new CompleteRoleplaySessionResponseDto
            {
                ResultId = resultId,
                IsExistingResult = isExistingResult,
                IsMockEvaluation = isMockEvaluation
            }, message);
        }

        private static bool IsLegacyMockResult(RoleplayResult result)
        {
            return result.OverallScore == 80
                && result.GrammarScore == 80
                && result.VocabularyScore == 80
                && result.ImpressionScore == 80
                && string.Equals(
                    result.GeneralFeedbackText,
                    LegacyMockFeedback,
                    StringComparison.Ordinal);
        }
    }
}
