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
        private const int MockScore = 80;
        private const int PassThreshold = 60;

        private readonly AppDbContext _dbContext;
        private readonly IRoleplaySessionSnapshotProvider _sessionSnapshotProvider;
        private readonly ILogger<RoleplayResultService> _logger;

        public RoleplayResultService(
            AppDbContext dbContext,
            IRoleplaySessionSnapshotProvider sessionSnapshotProvider,
            ILogger<RoleplayResultService> logger)
        {
            _dbContext = dbContext;
            _sessionSnapshotProvider = sessionSnapshotProvider;
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
                return BuildCompleteResponse(existingResult.Id, isExistingResult: true);
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

            var result = new RoleplayResult
            {
                RoleplaySessionId = snapshot.SessionId,
                UserId = userId,
                ScenarioTitle = snapshot.ScenarioTitle,
                JLPTLevel = snapshot.JLPTLevel,
                OverallScore = MockScore,
                GrammarScore = MockScore,
                VocabularyScore = MockScore,
                ImpressionScore = MockScore,
                PassStatus = MockScore >= PassThreshold,
                GeneralFeedbackText = "Bạn đã duy trì hội thoại rõ ràng và hoàn thành tốt các mục tiêu chính. Hãy tiếp tục luyện cách diễn đạt tự nhiên hơn trong những lượt nói tiếp theo.",
                CompletedMissionsSummaryJson = JsonSerializer.Serialize(completedMissions),
                CompletedAt = DateTime.UtcNow
            };

            _dbContext.RoleplayResults.Add(result);

            try
            {
                await _dbContext.SaveChangesAsync();
                return BuildCompleteResponse(result.Id, isExistingResult: false);
            }
            catch (DbUpdateException exception)
            {
                _logger.LogWarning(
                    exception,
                    "Phát hiện yêu cầu hoàn tất trùng cho RoleplaySession {SessionId}.",
                    sessionId);

                _dbContext.Entry(result).State = EntityState.Detached;
                var concurrentResult = await _dbContext.RoleplayResults
                    .AsNoTracking()
                    .FirstOrDefaultAsync(item =>
                        item.RoleplaySessionId == sessionId && item.UserId == userId);

                if (concurrentResult != null)
                {
                    return BuildCompleteResponse(concurrentResult.Id, isExistingResult: true);
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
                CompletedAt = result.CompletedAt
            }, "Lấy chi tiết kết quả luyện hội thoại thành công.");
        }

        private static ApiResponse<CompleteRoleplaySessionResponseDto> BuildCompleteResponse(
            int resultId,
            bool isExistingResult)
        {
            var message = isExistingResult
                ? "Phiên luyện tập đã được hoàn tất trước đó."
                : "Hoàn tất và lưu kết quả luyện tập thành công.";

            return ApiResponse<CompleteRoleplaySessionResponseDto>.Ok(new CompleteRoleplaySessionResponseDto
            {
                ResultId = resultId,
                IsExistingResult = isExistingResult,
                IsMockEvaluation = true
            }, message);
        }
    }
}
