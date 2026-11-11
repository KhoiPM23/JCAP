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

        private readonly ITelemetryEvaluatorService? _telemetryEvaluator;

        private readonly IPersonaMemoryService? _personaMemory;

        public RoleplayResultService(

            AppDbContext dbContext,

            IRoleplaySessionSnapshotProvider sessionSnapshotProvider,

            IRoleplayEvaluationService evaluationService,

            ILogger<RoleplayResultService> logger,

            ITelemetryEvaluatorService? telemetryEvaluator = null,

            IPersonaMemoryService? personaMemory = null)

        {

            _dbContext = dbContext;

            _sessionSnapshotProvider = sessionSnapshotProvider;

            _evaluationService = evaluationService;

            _logger = logger;

            _telemetryEvaluator = telemetryEvaluator;

            _personaMemory = personaMemory;

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
        int targetScenarioId = cfg?.ScenarioId ?? 0;
        var scenario = targetScenarioId > 0
            ? await _dbContext.Scenarios.AsNoTracking().FirstOrDefaultAsync(s => s.Id == targetScenarioId)
            : null;
        var reg = RoleplaySocialRegister.Deduce(scenario?.Title, cfg?.AiPersona, scenario?.Description);
        var title = RoleplaySocialRegister.GetContextualRelationshipTitle(reg.RegisterType, score);
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

                // Hoàn tất Telemetry ngầm và Hồ sơ năng lực (FSRS + IRT Theta + TikTok-style profile)
                if (_telemetryEvaluator != null)
                {
                    try
                    {
                        await _telemetryEvaluator.FinalizeSessionTelemetryAsync(sessionId, userId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Lỗi khi tổng hợp FinalizeSessionTelemetry cho session {SessionId}", sessionId);
                    }
                }

                // Ghi nhận NPC Affinity và số buổi luyện tập hoàn thành
                if (_personaMemory != null)
                {
                    try
                    {
                        string npcCode = !string.IsNullOrWhiteSpace(snapshot.ScenarioTitle)
                            ? $"SCN_{session.ScenarioLevelConfigurationId}"
                            : $"NPC_{session.ScenarioLevelConfigurationId}";
                        await _personaMemory.RecordSessionAffinityAsync(userId, npcCode, result.PassStatus);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Lỗi khi ghi nhận PersonaMemory cho session {SessionId}", sessionId);
                    }
                }

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

                .Where(item => item.UserId == userId && (item.Id == resultId || item.RoleplaySessionId == resultId))
                .OrderByDescending(item => item.Id == resultId)
                .ThenByDescending(item => item.CompletedAt)
                .FirstOrDefaultAsync();

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

                    if (scenarioLevelConfigId > 0)
                    {
                        var fullConfig = await _dbContext.ScenarioLevelConfigurations
                            .AsSplitQuery()
                            .Include(c => c.TargetVocabularies)
                            .Include(c => c.TargetGrammars)
                            .AsNoTracking()
                            .FirstOrDefaultAsync(c => c.Id == scenarioLevelConfigId);

                        if (fullConfig != null)
                        {
                            targetVocabularies = fullConfig.TargetVocabularies.Select(v => new TargetVocabularyDto
                            {
                                Id = v.Id,
                                Word = v.Word,
                                Reading = v.Reading,
                                Meaning = v.Meaning
                            }).ToList();

                            targetGrammars = fullConfig.TargetGrammars.Select(g => new TargetGrammarDto
                            {
                                Id = g.Id,
                                Pattern = g.Pattern,
                                Meaning = g.Meaning,
                                ExampleSentence = g.ExampleSentence
                            }).ToList();
                        }
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

            bool hasVoiceTurns = userFeedbacks.Any(f => f.SpeechDelivery != null && !f.SpeechDelivery.IsTextInput && (!string.IsNullOrEmpty(f.SpeechDelivery.AudioUrl) || (f.SpeechDelivery.SpeechConfidence.HasValue && f.SpeechDelivery.SpeechConfidence.Value > 0.4)));

            var fluencyScore = hasVoiceTurns ? (evalResult?.FluencyScore ?? 85) : 0;

            var confidenceScore = hasVoiceTurns ? (evalResult?.SpeechConfidenceScore ?? 90) : 0;

            var avgLatency = hasVoiceTurns ? (evalResult?.AverageResponseLatencySeconds ?? 0) : 0;

            var avgPace = hasVoiceTurns ? (evalResult?.AverageSpeechPace ?? 0) : 0;

            var pronScore = hasVoiceTurns ? (evalResult?.PronunciationScore ?? 85) : 0;

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

                    ProgressSummary = "Đây là lần đầu tiên bạn hoàn thành kịch bản này! Hãy tiếp tục luyện tập để ghi nhận biểu đồ tiến bộ."

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

                if (linkedSpot != null)
                {
                    exploreSpotId = linkedSpot.Id;
                    explorePrefectureId = linkedSpot.PrefectureId;

                    // Chỉ hiển thị con dấu Eki-stamp nếu đã được AwardAsync cấp thật sự
                    var spotProgress = await _dbContext.Set<ExploreSpotProgress>()
                        .AsNoTracking()
                        .FirstOrDefaultAsync(p => p.UserId == userId && p.SpotId == linkedSpot.Id);

                    if (spotProgress?.RedStampedAt != null)
                    {
                        awardedEkiStampName = !string.IsNullOrWhiteSpace(linkedSpot.NameVi)
                            ? linkedSpot.NameVi
                            : linkedSpot.NameJp;
                    }
                }

            }

            if (scenarioLevelConfigId <= 0 && result.RoleplaySessionId > 0)
            {
                scenarioLevelConfigId = await _dbContext.RoleplaySessions
                    .AsNoTracking()
                    .Where(s => s.Id == result.RoleplaySessionId)
                    .Select(s => s.ScenarioLevelConfigurationId)
                    .FirstOrDefaultAsync();
            }

            if (scenarioId <= 0 && scenarioLevelConfigId > 0)
            {
                scenarioId = await _dbContext.ScenarioLevelConfigurations
                    .AsNoTracking()
                    .Where(c => c.Id == scenarioLevelConfigId)
                    .Select(c => c.ScenarioId)
                    .FirstOrDefaultAsync();
            }

            if (targetVocabularies.Count == 0 && targetGrammars.Count == 0 && scenarioLevelConfigId > 0)
            {
                var fullConfig = await _dbContext.ScenarioLevelConfigurations
                    .AsSplitQuery()
                    .Include(c => c.TargetVocabularies)
                    .Include(c => c.TargetGrammars)
                    .AsNoTracking()
                    .FirstOrDefaultAsync(c => c.Id == scenarioLevelConfigId);

                if (fullConfig != null)
                {
                    targetVocabularies = fullConfig.TargetVocabularies.Select(v => new TargetVocabularyDto
                    {
                        Id = v.Id,
                        Word = v.Word,
                        Reading = v.Reading,
                        Meaning = v.Meaning
                    }).ToList();

                    targetGrammars = fullConfig.TargetGrammars.Select(g => new TargetGrammarDto
                    {
                        Id = g.Id,
                        Pattern = g.Pattern,
                        Meaning = g.Meaning,
                        ExampleSentence = g.ExampleSentence
                    }).ToList();
                }
            }

            // Gợi ý kịch bản tiếp theo (Next Best Challenge Recommendation)
            int? nextScenarioId = null;
            string? nextScenarioTitle = null;
            string? nextReason = null;
            double? predictedSuccessRate = null;

            if (scenarioId > 0)
            {
                var nextScenario = await _dbContext.Scenarios
                    .AsNoTracking()
                    .Where(s => s.Id != scenarioId && s.IsActive)
                    .OrderBy(s => s.Id > scenarioId ? 0 : 1)
                    .ThenBy(s => s.Id)
                    .FirstOrDefaultAsync();

                if (nextScenario != null)
                {
                    nextScenarioId = nextScenario.Id;
                    nextScenarioTitle = nextScenario.Title;
                    predictedSuccessRate = result.PassStatus ? 0.85 : 0.65;
                    nextReason = result.PassStatus
                        ? $"Bạn đã làm chủ kịch bản '{result.ScenarioTitle}' ({result.OverallScore}đ)! Thử thách tiếp theo phù hợp nhất cho bạn là '{nextScenario.Title}'."
                        : $"Để củng cố thêm kỹ năng giao tiếp, bạn có thể thử sức với kịch bản '{nextScenario.Title}' hoặc luyện lại tình huống hiện tại.";
                }
            }

            
            var finalScore = result.OverallScore;
            string hankoType;
            string kanjiRank;
            string hankoText;

            if (finalScore >= 90)
            {
                hankoType = "Master";
                kanjiRank = finalScore >= 95 ? "極" : "優";
                hankoText = "大変よくできました";
            }
            else if (finalScore >= 70)
            {
                hankoType = "Pass";
                kanjiRank = finalScore >= 80 ? "良" : "可";
                hankoText = "合格";
            }
            else
            {
                hankoType = "Improve";
                kanjiRank = "研";
                hankoText = "精進";
            }

            List<LearnerBehaviorSignal> signals = [];
            if (result.RoleplaySessionId > 0)
            {
                signals = await _dbContext.LearnerBehaviorSignals
                    .AsNoTracking()
                    .Where(s => s.SessionId == result.RoleplaySessionId)
                    .OrderBy(s => s.TurnIndex)
                    .ToListAsync();
            }

            bool usedAnyHint = signals.Any(s => s.HintLevelUsed > 0);
            var badges = new List<string>();
            if (result.ImpressionScore >= 85) badges.Add("Văn phong Chuẩn mực");
            if (!usedAnyHint && (evalResult?.AutonomyScore ?? 100) >= 95) badges.Add("Tự chủ Không gợi ý");
            else if (usedAnyHint && (evalResult?.AutonomyScore ?? 100) >= 80) badges.Add("Chủ động Khám phá");
            if (!usedAnyHint && hasVoiceTurns && fluencyScore >= 80) badges.Add("Phản xạ Tức thì");
            else if (!usedAnyHint && (evalResult?.AutonomyScore ?? 100) >= 90) badges.Add("Phản xạ Độc lập");
            else if (!hasVoiceTurns && result.PassStatus) badges.Add("Đối đáp Chuẩn xác");
            if (result.GrammarScore >= 85) badges.Add("Ngữ pháp Chuẩn xác");
            if (result.VocabularyScore >= 85) badges.Add("Vốn từ Phong phú");
            if (badges.Count == 0) badges.Add("Tiến bộ Từng bước");

            var weakVocabularies = DetectWeakVocabularies(targetVocabularies, messages, signals);
            var weakGrammars = DetectWeakGrammars(targetGrammars, messages, signals);
            var recommendedShadowingDialogues = await RecommendShadowingDialoguesAsync(
                scenarioId,
                result.ScenarioTitle,
                result.JLPTLevel,
                weakVocabularies,
                weakGrammars);

            // Đề xuất từ vựng & ngữ pháp mở rộng theo chủ đề (Adaptive Topic Reinforcement)
            var topicCode = "DAILY_LIFE";
            var scenarioEntity = await _dbContext.Scenarios.AsNoTracking().FirstOrDefaultAsync(s => s.Id == scenarioId);
            if (scenarioEntity != null)
            {
                topicCode = ScenarioService.ResolveScenarioTopicCode(scenarioEntity);
            }
            var topicMeta = ScenarioService.GetTopicMetadata(topicCode);
            var dbTopic = await _dbContext.LearningTopics
                .AsNoTracking()
                .Include(t => t.TopicVocabularies).ThenInclude(tv => tv.Vocabulary)
                .Include(t => t.TopicGrammars).ThenInclude(tg => tg.Grammar)
                .FirstOrDefaultAsync(t => (t.Code == topicCode || t.Code.StartsWith(topicCode + "_")) && t.JLPTLevel == result.JLPTLevel)
                ?? await _dbContext.LearningTopics.AsNoTracking().Include(t => t.TopicVocabularies).ThenInclude(tv => tv.Vocabulary).Include(t => t.TopicGrammars).ThenInclude(tg => tg.Grammar).FirstOrDefaultAsync(t => t.Code == topicCode);

            var topicRecommendedVocabs = new List<WeakVocabularyDto>();
            var topicRecommendedGrammars = new List<WeakGrammarDto>();

            if (dbTopic != null)
            {
                var usedWords = targetVocabularies.Select(v => v.Word.Trim()).ToHashSet(StringComparer.OrdinalIgnoreCase);
                var usedPatterns = targetGrammars.Select(g => g.Pattern.Trim()).ToHashSet(StringComparer.OrdinalIgnoreCase);

                topicRecommendedVocabs = dbTopic.TopicVocabularies
                    .Where(tv => tv.Vocabulary != null && tv.Vocabulary.IsActive && !usedWords.Contains(tv.Vocabulary.Word.Trim()))
                    .OrderBy(tv => tv.OrderIndex)
                    .Select(tv => new WeakVocabularyDto
                    {
                        Id = tv.VocabularyId,
                        Word = tv.Vocabulary.Word,
                        Reading = tv.Vocabulary.Reading,
                        Meaning = tv.Vocabulary.Meaning,
                        MasteryScore = 70,
                        Status = "AdaptiveTopicExpansion",
                        Reason = $"Từ vựng mở rộng thuộc chủ đề {dbTopic.Name}"
                    })
                    .Take(6)
                    .ToList();

                topicRecommendedGrammars = dbTopic.TopicGrammars
                    .Where(tg => tg.Grammar != null && tg.Grammar.IsActive && !usedPatterns.Contains(tg.Grammar.Pattern.Trim()))
                    .OrderBy(tg => tg.OrderIndex)
                    .Select(tg => new WeakGrammarDto
                    {
                        Id = tg.GrammarId,
                        Pattern = tg.Grammar.Pattern,
                        Meaning = tg.Grammar.Meaning,
                        ExampleSentence = tg.Grammar.ExampleSentence,
                        MasteryScore = 70,
                        Status = "AdaptiveTopicExpansion",
                        Reason = $"Mẫu ngữ pháp mở rộng thuộc chủ đề {dbTopic.Name}"
                    })
                    .Take(4)
                    .ToList();
            }

            return ApiResponse<RoleplayResultDetailDto>.Ok(new RoleplayResultDetailDto

            {

                HankoStampType = hankoType,
                KanjiRank = kanjiRank,
                HankoStampText = hankoText,
                CompetencyBadges = badges,
                TopicCode = topicCode,
                TopicName = dbTopic?.Name ?? topicMeta.Name,
                TopicId = dbTopic?.Id,
                TopicRecommendedVocabularies = topicRecommendedVocabs,
                TopicRecommendedGrammars = topicRecommendedGrammars,
                Id = result.Id,
                NextRecommendedScenarioId = nextScenarioId,
                NextRecommendedScenarioTitle = nextScenarioTitle,
                NextRecommendedReason = nextReason,
                PredictedSuccessRateNextScenario = predictedSuccessRate,

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

                PronunciationScore = pronScore,

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
                WeakVocabularies = weakVocabularies,
                WeakGrammars = weakGrammars,
                RecommendedShadowingDialogues = recommendedShadowingDialogues,

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

        private static string NormalizeGrammarPattern(string? pattern)
        {
            if (string.IsNullOrWhiteSpace(pattern)) return string.Empty;
            var cleaned = pattern;
            cleaned = cleaned.Replace("～", "").Replace("~", "").Replace("〜", "");
            cleaned = System.Text.RegularExpressions.Regex.Replace(cleaned, @"\[.*?\]|［.*?］|\(.*?\)|（.*?）", "");
            cleaned = cleaned.Replace("+", "").Replace("＋", "");
            cleaned = cleaned.Trim(' ', '\t', '　', '。', '、', '?', '？', '.', ',');
            return string.IsNullOrWhiteSpace(cleaned) ? pattern.Trim() : cleaned;
        }

        private static int GetJlptNumericRank(string? level)
        {
            if (string.IsNullOrWhiteSpace(level)) return 5;
            var upper = level.Trim().ToUpperInvariant();
            if (upper.Contains("N1")) return 1;
            if (upper.Contains("N2")) return 2;
            if (upper.Contains("N3")) return 3;
            if (upper.Contains("N4")) return 4;
            return 5;
        }

        private static List<WeakVocabularyDto> DetectWeakVocabularies(
            IReadOnlyList<TargetVocabularyDto> targetVocabularies,
            IReadOnlyList<RoleplayMessageDto> messages,
            IReadOnlyList<LearnerBehaviorSignal> signals)
        {
            if (targetVocabularies == null || targetVocabularies.Count == 0)
            {
                return [];
            }

            var userMessages = (messages ?? Array.Empty<RoleplayMessageDto>())
                .Where(m => string.Equals(m.Sender, "User", StringComparison.OrdinalIgnoreCase))
                .ToList();

            var weakVocabularies = new List<WeakVocabularyDto>();

            foreach (var vocab in targetVocabularies)
            {
                if (string.IsNullOrWhiteSpace(vocab.Word))
                {
                    continue;
                }

                var matchedMessages = userMessages.Where(m =>
                    (!string.IsNullOrWhiteSpace(vocab.Word) && m.JapaneseText.Contains(vocab.Word, StringComparison.OrdinalIgnoreCase)) ||
                    (!string.IsNullOrWhiteSpace(vocab.Reading) && m.JapaneseText.Contains(vocab.Reading, StringComparison.OrdinalIgnoreCase))
                ).ToList();

                if (matchedMessages.Count == 0)
                {
                    weakVocabularies.Add(new WeakVocabularyDto
                    {
                        Id = vocab.Id,
                        Word = vocab.Word,
                        Reading = vocab.Reading,
                        Meaning = vocab.Meaning,
                        MasteryScore = 30,
                        Status = "NotAttempted",
                        Reason = "Chưa chủ động vận dụng từ vựng này trong tình huống hội thoại."
                    });
                }
                else
                {
                    bool hasFeedbackIssue = matchedMessages.Any(m =>
                        m.LinguisticFeedback != null && (
                            string.Equals(m.LinguisticFeedback.Status, "Error", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(m.LinguisticFeedback.Status, "Warning", StringComparison.OrdinalIgnoreCase) ||
                            (m.LinguisticFeedback.Details != null && m.LinguisticFeedback.Details.Any(d =>
                                (string.Equals(d.Type, "error", StringComparison.OrdinalIgnoreCase) ||
                                 string.Equals(d.Type, "warning", StringComparison.OrdinalIgnoreCase)) &&
                                (d.Aspect.Contains("từ", StringComparison.OrdinalIgnoreCase) ||
                                 d.Aspect.Contains("Từ", StringComparison.OrdinalIgnoreCase) ||
                                 d.Comment.Contains("từ", StringComparison.OrdinalIgnoreCase))
                            ))
                        )
                    );

                    bool hasHintDependency = (signals != null && signals.Any(s => s.HintLevelUsed >= 2)) ||
                        matchedMessages.Any(m => m.LinguisticFeedback?.SpeechDelivery?.TurnAutonomyScore != null &&
                                                 m.LinguisticFeedback.SpeechDelivery.TurnAutonomyScore < 70);

                    if (hasFeedbackIssue || hasHintDependency)
                    {
                        weakVocabularies.Add(new WeakVocabularyDto
                        {
                            Id = vocab.Id,
                            Word = vocab.Word,
                            Reading = vocab.Reading,
                            Meaning = vocab.Meaning,
                            MasteryScore = 50,
                            Status = "NeedsPractice",
                            Reason = "Đã sử dụng nhưng còn gặp lỗi dùng từ/ngữ cảnh hoặc phụ thuộc gợi ý."
                        });
                    }
                }
            }

            return weakVocabularies;
        }

        private static List<WeakGrammarDto> DetectWeakGrammars(
            IReadOnlyList<TargetGrammarDto> targetGrammars,
            IReadOnlyList<RoleplayMessageDto> messages,
            IReadOnlyList<LearnerBehaviorSignal> signals)
        {
            if (targetGrammars == null || targetGrammars.Count == 0)
            {
                return [];
            }

            var userMessages = (messages ?? Array.Empty<RoleplayMessageDto>())
                .Where(m => string.Equals(m.Sender, "User", StringComparison.OrdinalIgnoreCase))
                .ToList();

            var weakGrammars = new List<WeakGrammarDto>();

            foreach (var grammar in targetGrammars)
            {
                if (string.IsNullOrWhiteSpace(grammar.Pattern))
                {
                    continue;
                }

                var corePattern = NormalizeGrammarPattern(grammar.Pattern);

                var matchedMessages = userMessages.Where(m =>
                    (!string.IsNullOrWhiteSpace(corePattern) && m.JapaneseText.Contains(corePattern, StringComparison.OrdinalIgnoreCase)) ||
                    (!string.IsNullOrWhiteSpace(grammar.Pattern) && m.JapaneseText.Contains(grammar.Pattern, StringComparison.OrdinalIgnoreCase))
                ).ToList();

                if (matchedMessages.Count == 0)
                {
                    weakGrammars.Add(new WeakGrammarDto
                    {
                        Id = grammar.Id,
                        Pattern = grammar.Pattern,
                        Meaning = grammar.Meaning,
                        ExampleSentence = grammar.ExampleSentence,
                        MasteryScore = 30,
                        Status = "NotAttempted",
                        Reason = "Chưa vận dụng mẫu câu ngữ pháp này trong phiên đối thoại."
                    });
                }
                else
                {
                    bool hasGrammarIssue = matchedMessages.Any(m =>
                        m.LinguisticFeedback != null && (
                            string.Equals(m.LinguisticFeedback.Status, "Error", StringComparison.OrdinalIgnoreCase) ||
                            (m.LinguisticFeedback.Details != null && m.LinguisticFeedback.Details.Any(d =>
                                string.Equals(d.Type, "error", StringComparison.OrdinalIgnoreCase) ||
                                (string.Equals(d.Type, "warning", StringComparison.OrdinalIgnoreCase) &&
                                 (d.Aspect.Contains("ngữ pháp", StringComparison.OrdinalIgnoreCase) ||
                                  d.Aspect.Contains("Ngữ pháp", StringComparison.OrdinalIgnoreCase) ||
                                  d.Aspect.Contains("trợ từ", StringComparison.OrdinalIgnoreCase) ||
                                  d.Aspect.Contains("cấu trúc", StringComparison.OrdinalIgnoreCase)))
                            ))
                        )
                    );

                    bool hasRuleError = signals != null && signals.Any(s => !string.IsNullOrWhiteSpace(s.DetectedRuleErrorCodes));
                    bool hasHintDependency = (signals != null && signals.Any(s => s.HintLevelUsed >= 2)) ||
                        matchedMessages.Any(m => m.LinguisticFeedback?.SpeechDelivery?.TurnAutonomyScore != null &&
                                                 m.LinguisticFeedback.SpeechDelivery.TurnAutonomyScore < 70);

                    if (hasGrammarIssue || hasRuleError || hasHintDependency)
                    {
                        weakGrammars.Add(new WeakGrammarDto
                        {
                            Id = grammar.Id,
                            Pattern = grammar.Pattern,
                            Meaning = grammar.Meaning,
                            ExampleSentence = grammar.ExampleSentence,
                            MasteryScore = 50,
                            Status = "NeedsPractice",
                            Reason = "Đã vận dụng nhưng còn sai sót về trợ từ/chia thể hoặc phụ thuộc gợi ý."
                        });
                    }
                }
            }

            return weakGrammars;
        }

        private async Task<List<RecommendedShadowingDialogueDto>> RecommendShadowingDialoguesAsync(
            int scenarioId,
            string scenarioTitle,
            string jlptLevel,
            IReadOnlyList<WeakVocabularyDto> weakVocabs,
            IReadOnlyList<WeakGrammarDto> weakGrammars)
        {
            var activeDialogues = await _dbContext.ShadowingDialogues
                .AsNoTracking()
                .Include(d => d.Sentences)
                .Where(d => d.IsActive)
                .ToListAsync();

            if (activeDialogues.Count == 0)
            {
                return [];
            }

            var scoredList = new List<(ShadowingDialogue Dialogue, int Score, string MatchReason)>();
            var targetTitle = !string.IsNullOrWhiteSpace(scenarioTitle) ? scenarioTitle : "tình huống hiện tại";

            foreach (var dialogue in activeDialogues)
            {
                int scenarioScore = 0;
                if (scenarioId > 0 && dialogue.ScenarioId.HasValue && dialogue.ScenarioId.Value == scenarioId)
                {
                    scenarioScore = 40;
                }

                int levelScore = 0;
                if (string.Equals(dialogue.JLPTLevel, jlptLevel, StringComparison.OrdinalIgnoreCase))
                {
                    levelScore = 30;
                }
                else if (Math.Abs(GetJlptNumericRank(dialogue.JLPTLevel) - GetJlptNumericRank(jlptLevel)) == 1)
                {
                    levelScore = 10;
                }

                var sentencesText = dialogue.Sentences != null
                    ? string.Join(" ", dialogue.Sentences.Select(s => s.JapaneseText ?? string.Empty))
                    : string.Empty;
                var corpus = (dialogue.Title ?? string.Empty) + " " + sentencesText;

                var matchedItems = new List<string>();
                int vocabPoints = 0;
                foreach (var v in weakVocabs)
                {
                    if (!string.IsNullOrWhiteSpace(v.Word) && corpus.Contains(v.Word, StringComparison.OrdinalIgnoreCase))
                    {
                        if (vocabPoints < 20)
                        {
                            vocabPoints += 10;
                        }
                        if (!matchedItems.Contains(v.Word))
                        {
                            matchedItems.Add(v.Word);
                        }
                    }
                }

                int grammarPoints = 0;
                foreach (var g in weakGrammars)
                {
                    var core = NormalizeGrammarPattern(g.Pattern);
                    if (!string.IsNullOrWhiteSpace(core) && corpus.Contains(core, StringComparison.OrdinalIgnoreCase))
                    {
                        if (grammarPoints < 20)
                        {
                            grammarPoints += 10;
                        }
                        var label = !string.IsNullOrWhiteSpace(g.Pattern) ? g.Pattern : core;
                        if (!matchedItems.Contains(label))
                        {
                            matchedItems.Add(label);
                        }
                    }
                }

                int weakScore = Math.Min(vocabPoints + grammarPoints, 30);
                int totalScore = Math.Min(scenarioScore + levelScore + weakScore, 100);

                string matchReason;
                var itemsText = matchedItems.Count > 0 ? string.Join(", ", matchedItems) : string.Empty;

                if (scenarioScore > 0 && matchedItems.Count > 0)
                {
                    matchReason = $"Bài Shadowing cùng tình huống '{targetTitle}' ({dialogue.JLPTLevel}), giúp củng cố trực tiếp các từ/mẫu câu cần lưu ý: {itemsText}.";
                }
                else if (scenarioScore > 0)
                {
                    matchReason = $"Bài Shadowing trực tiếp cho tình huống '{targetTitle}' ({dialogue.JLPTLevel}) giúp bạn hoàn thiện ngữ điệu tự nhiên và phản xạ phát âm chuẩn.";
                }
                else if (levelScore >= 30 && matchedItems.Count > 0)
                {
                    matchReason = $"Bài Shadowing cùng cấp độ {dialogue.JLPTLevel} chứa từ vựng/mẫu câu bạn cần rèn luyện thêm ({itemsText}).";
                }
                else
                {
                    matchReason = $"Bài Shadowing chuẩn cấp độ {dialogue.JLPTLevel} giúp bạn cải thiện nhịp điệu Mora và sự tự tin khi nói.";
                }

                scoredList.Add((dialogue, totalScore, matchReason));
            }

            return scoredList
                .OrderByDescending(x => x.Score)
                .ThenBy(x => x.Dialogue.Id)
                .Take(2)
                .Select(x => new RecommendedShadowingDialogueDto
                {
                    Id = x.Dialogue.Id,
                    Title = x.Dialogue.Title,
                    JLPTLevel = x.Dialogue.JLPTLevel,
                    ScenarioId = x.Dialogue.ScenarioId,
                    MatchReason = x.MatchReason,
                    Score = x.Score,
                    SentencesCount = x.Dialogue.Sentences?.Count ?? 0
                })
                .ToList();
        }
    }

}

