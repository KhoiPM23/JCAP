using System.Text.Json;

using JCAP.Data;

using JCAP.DTOs.Common;

using JCAP.DTOs.Roleplay;

using JCAP.DTOs.Scenario;

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



        private async Task<(string Persona, int Score, string Title)> LoadNpcInfoAsync(string userId, int sessionId)
    {
        var cfg = await _dbContext.RoleplaySessions
            .AsNoTracking()
            .Where(s => s.Id == sessionId)
            .Select(s => new { s.ScenarioLevelConfiguration!.AiPersona, s.ScenarioLevelConfiguration.ScenarioId, s.ScenarioLevelConfigurationId, Code = s.ScenarioLevelConfiguration.Scenario!.ScenarioCode })
            .FirstOrDefaultAsync();
        var persona = string.IsNullOrWhiteSpace(cfg?.AiPersona) ? "Nhân vật AI" : cfg!.AiPersona;
        var npcCode = !string.IsNullOrWhiteSpace(cfg?.Code) ? cfg!.Code : $"NPC_{cfg?.ScenarioLevelConfigurationId}";
        var score = await _dbContext.UserNpcRelationships
            .AsNoTracking()
            .Where(r => r.UserId == userId && r.NpcCode == npcCode)
            .Select(r => (int?)r.AffinityScore)
            .FirstOrDefaultAsync() ?? 10;
        var title = score switch
        {
            >= 80 => "Tri kỷ tâm giao",
            >= 50 => "Thân thiết sâu sắc",
            >= 30 => "Người quen thân thuộc",
            >= 20 => "Đã từng trò chuyện",
            _ => "Lần đầu gặp gỡ"
        };
        return (persona, score, title);
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



            List<TargetVocabularyDto> targetVocabularies = [];

            List<TargetGrammarDto> targetGrammars = [];

            List<RoleplayMessageDto> messages = [];

            List<RoleplayMissionProgressDto> allMissions = [];

            int scenarioId = 0;

            int scenarioLevelConfigId = 0;



            if (result.RoleplaySessionId > 0)

            {

                var sessionData = await _dbContext.RoleplaySessions

                    .AsNoTracking()

                    .Where(s => s.Id == result.RoleplaySessionId)

                    .Select(s => new

                    {

                        Config = s.ScenarioLevelConfiguration,

                        ConfigId = s.ScenarioLevelConfigurationId,

                        SessionMissions = s.SessionMissions

                            .OrderBy(sm => sm.Mission != null ? sm.Mission.Order : 0)

                            .Select(sm => new

                            {

                                sm.MissionId,

                                Content = sm.Mission != null ? sm.Mission.Content : "",

                                CriteriaJson = sm.Mission != null ? sm.Mission.CompletionCriteriaJson : null,

                                Order = sm.Mission != null ? sm.Mission.Order : 0,

                                sm.IsCompleted,

                                sm.CompletedAt

                            })

                            .ToList(),

                        Messages = s.Messages

                            .OrderBy(m => m.CreatedAt)

                            .Select(m => new

                            {

                                m.Id,

                                m.Sender,

                                m.JapaneseText,

                                m.VietnameseMeaning,

                                m.FuriganaHtml,

                                m.LinguisticFeedbackJson,

                                m.CreatedAt

                            })

                            .ToList()

                    })

                    .FirstOrDefaultAsync();



                if (sessionData != null)

                {

                    scenarioId = sessionData.Config?.ScenarioId ?? 0;

                    scenarioLevelConfigId = sessionData.ConfigId;

                    allMissions = sessionData.SessionMissions.Select(sm => new RoleplayMissionProgressDto

                    {

                        MissionId = sm.MissionId,

                        Content = sm.Content,

                        Target = ExtractMissionTarget(sm.CriteriaJson),

                        Order = sm.Order,

                        IsCompleted = sm.IsCompleted,

                        CompletedAt = sm.CompletedAt.HasValue ? AsUtc(sm.CompletedAt.Value) : null

                    }).ToList();



                    if (sessionData.Config != null)

                    {

                        targetVocabularies = sessionData.Config.TargetVocabularies.Select(v => new TargetVocabularyDto

                        {

                            Id = v.Id,

                            Word = v.Word,

                            Reading = v.Reading,

                            Meaning = v.Meaning

                        }).ToList();



                        targetGrammars = sessionData.Config.TargetGrammars.Select(g => new TargetGrammarDto

                        {

                            Id = g.Id,

                            Pattern = g.Pattern,

                            Meaning = g.Meaning,

                            ExampleSentence = g.ExampleSentence

                        }).ToList();

                    }



                    messages = sessionData.Messages.Select(m =>

                    {

                        LinguisticFeedbackDto? parsedFeedback = null;

                        if (!string.IsNullOrWhiteSpace(m.LinguisticFeedbackJson))

                        {

                            try

                            {

                                parsedFeedback = JsonSerializer.Deserialize<LinguisticFeedbackDto>(

                                    m.LinguisticFeedbackJson,

                                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                            }

                            catch

                            {

                                // Safe fallback if json corrupted

                            }

                        }



                        return new RoleplayMessageDto

                        {

                            Id = m.Id,

                            Sender = m.Sender,

                            JapaneseText = m.JapaneseText,

                            VietnameseMeaning = m.VietnameseMeaning,

                            FuriganaHtml = m.FuriganaHtml,

                            LinguisticFeedback = parsedFeedback,

                            AudioUrl = parsedFeedback?.SpeechDelivery?.AudioUrl,

                            CreatedAt = AsUtc(m.CreatedAt)

                        };

                    }).ToList();

                }

            }



            var userFeedbacks = messages

                .Where(m => string.Equals(m.Sender, "User", StringComparison.OrdinalIgnoreCase) && m.LinguisticFeedback != null)

                .Select(m => m.LinguisticFeedback!)

                .ToList();



            var evalResult = userFeedbacks.Count > 0

                ? _evaluationService.Evaluate(

                    userFeedbacks.Select(f => JsonSerializer.Serialize(f, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase })),

                    completedMissions.Count,

                    allMissions.Count,

                    result.PassStatus)

                : null;



            var fluencyScore = evalResult?.FluencyScore ?? 85;

            var confidenceScore = evalResult?.SpeechConfidenceScore ?? 90;

            var avgLatency = evalResult?.AverageResponseLatencySeconds ?? 0;

            var avgPace = evalResult?.AverageSpeechPace ?? 0;



            // Tính toán so sánh tiến độ giữa các lần luyện tập (Attempt Progression Analytics)

            var previousAttempts = await _dbContext.RoleplayResults

                .Where(r => r.UserId == userId && r.ScenarioTitle == result.ScenarioTitle && r.Id != result.Id)

                .OrderByDescending(r => r.CompletedAt)

                .ToListAsync();



            var npcInfo = await LoadNpcInfoAsync(result.UserId, result.RoleplaySessionId);

            RoleplayAttemptComparisonDto attemptComparison;

            var attemptNumber = previousAttempts.Count + 1;

            if (previousAttempts.Count > 0)

            {

                var prev = previousAttempts[0];

                var scoreDiff = result.OverallScore - prev.OverallScore;

                var summary = scoreDiff switch

                {

                    > 0 => $"Tiến bộ vượt bậc! Bạn đã tăng {scoreDiff} điểm so với lần luyện tập trước.",

                    0 => "Phong độ rất ổn định! Bạn duy trì đúng số điểm của lần luyện tập trước.",

                    _ => $"Hãy giữ vững sự tự tin! Lần trước bạn đạt {prev.OverallScore} điểm, hãy chú ý ngắt nghỉ và phản xạ nhé."

                };



                attemptComparison = new RoleplayAttemptComparisonDto

                {

                    AttemptNumber = attemptNumber,

                    PreviousOverallScore = prev.OverallScore,

                    IsPersonalBest = result.OverallScore > previousAttempts.Max(a => a.OverallScore),

                    OverallScore = result.OverallScore,

                    CurrentLatencySeconds = avgLatency,

                    CurrentPace = avgPace,

                    ProgressSummary = summary

                };

            }

            else

            {

                attemptComparison = new RoleplayAttemptComparisonDto

                {

                    AttemptNumber = 1,

                    OverallScore = result.OverallScore,

                    CurrentLatencySeconds = avgLatency,

                    CurrentPace = avgPace,

                    ProgressSummary = "🌟 Đây là lần đầu tiên bạn hoàn thành kịch bản này! Hãy tiếp tục luyện tập để ghi nhận biểu đồ tiến bộ."

                };

            }



            string? awardedEkiStampName = null;

            int? exploreSpotId = null;

            int? explorePrefectureId = null;



            if (result.RoleplaySessionId > 0)

            {

                if (scenarioLevelConfigId <= 0)

                {

                    scenarioLevelConfigId = await _dbContext.RoleplaySessions

                        .AsNoTracking()

                        .Where(s => s.Id == result.RoleplaySessionId)

                        .Select(s => s.ScenarioLevelConfigurationId)

                        .FirstOrDefaultAsync();

                }



                ExploreSpot? linkedSpot = null;



                if (scenarioLevelConfigId > 0)

                {

                    var spotActivity = await _dbContext.ExploreSpotActivities

                        .Include(a => a.Lesson)

                        .AsNoTracking()

                        .FirstOrDefaultAsync(a => a.ActivityType == ExploreActivityType.Roleplay && a.ReferenceId == scenarioLevelConfigId);



                    if (spotActivity?.Lesson != null)

                    {

                        linkedSpot = await _dbContext.ExploreSpots

                            .AsNoTracking()

                            .FirstOrDefaultAsync(s => s.Id == spotActivity.Lesson.SpotId);

                    }

                    else if (spotActivity != null && spotActivity.LessonId > 0)

                    {

                        var lesson = await _dbContext.ExploreSpotLessons.AsNoTracking().FirstOrDefaultAsync(l => l.Id == spotActivity.LessonId);

                        if (lesson != null)

                        {

                            linkedSpot = await _dbContext.ExploreSpots.AsNoTracking().FirstOrDefaultAsync(s => s.Id == lesson.SpotId);

                        }

                    }

                }



                if (linkedSpot == null)

                {

                    var directProg = await _dbContext.Set<ExploreSpotProgress>()

                        .Include(p => p.Spot)

                        .AsNoTracking()

                        .FirstOrDefaultAsync(p => p.UserId == userId && p.RoleplaySessionId == result.RoleplaySessionId);



                    if (directProg?.Spot != null)

                    {

                        linkedSpot = directProg.Spot;

                    }

                }



                if (linkedSpot != null)

                {

                    exploreSpotId = linkedSpot.Id;

                    explorePrefectureId = linkedSpot.PrefectureId;



                    // Chỉ trao con dấu Eki-stamp khi phiên này đạt yêu cầu (PassStatus == true)

                    if (result.PassStatus)

                    {

                        awardedEkiStampName = !string.IsNullOrWhiteSpace(linkedSpot.NameVi)

                            ? linkedSpot.NameVi

                            : linkedSpot.NameJp;

                    }

                }

            }



            return ApiResponse<RoleplayResultDetailDto>.Ok(new RoleplayResultDetailDto

            {

                Id = result.Id,

                RoleplaySessionId = result.RoleplaySessionId,

                ScenarioId = scenarioId,

                ScenarioTitle = result.ScenarioTitle,

                JLPTLevel = result.JLPTLevel,

                OverallScore = result.OverallScore,

                GrammarScore = result.GrammarScore,

                VocabularyScore = result.VocabularyScore,

                ImpressionScore = result.ImpressionScore,

                FluencyScore = fluencyScore,

                SpeechConfidenceScore = confidenceScore,

                AutonomyScore = evalResult?.AutonomyScore ?? 100,

                ScoreBreakdown = evalResult?.ScoreBreakdown,

                AverageResponseLatencySeconds = avgLatency,

                AverageSpeechPace = avgPace,

                PassStatus = result.PassStatus,

                GeneralFeedbackText = result.GeneralFeedbackText,

                CompletedMissions = completedMissions,

                AllMissions = allMissions,

                TargetVocabularies = targetVocabularies,

                TargetGrammars = targetGrammars,

                Messages = messages,

                AttemptComparison = attemptComparison,
                AiPersona = npcInfo.Persona,
                NpcAffinityScore = npcInfo.Score,
                NpcRelationshipTitle = npcInfo.Title,

                AwardedEkiStampName = awardedEkiStampName,

                ExploreSpotId = exploreSpotId,

                ExplorePrefectureId = explorePrefectureId,

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



        private static string ExtractMissionTarget(string? criteriaJson)

        {

            if (string.IsNullOrWhiteSpace(criteriaJson)) return string.Empty;

            try

            {

                using var doc = JsonDocument.Parse(criteriaJson);

                if (doc.RootElement.TryGetProperty("target", out var targetProp))

                {

                    return targetProp.GetString() ?? string.Empty;

                }

            }

            catch

            {

                // Safe fallback

            }

            return string.Empty;

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

