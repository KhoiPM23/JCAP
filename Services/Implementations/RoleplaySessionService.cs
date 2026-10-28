using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Roleplay;
using JCAP.DTOs.Scenario;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace JCAP.Services.Implementations;

public class RoleplaySessionService : IRoleplaySessionService
{
    private readonly AppDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IAiRoleplayService _aiRoleplayService;
    private readonly ILogger<RoleplaySessionService> _logger;
    private readonly IVietnameseLearnerErrorDetector _errorDetector;
    private readonly ITelemetryEvaluatorService _telemetryEvaluator;
    private readonly IPersonaMemoryService _personaMemory;

    /// <summary>
    /// Số ký tự tiếng Nhật ước lượng tương đương 1 credit (30 ký tự ≈ 30 tokens ≈ 1 credit).
    /// </summary>
    private const int CharsPerCredit = 30;

    public RoleplaySessionService(
        AppDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        IAiRoleplayService aiRoleplayService,
        ILogger<RoleplaySessionService> logger,
        IVietnameseLearnerErrorDetector errorDetector,
        ITelemetryEvaluatorService telemetryEvaluator,
        IPersonaMemoryService personaMemory)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _aiRoleplayService = aiRoleplayService;
        _logger = logger;
        _errorDetector = errorDetector;
        _telemetryEvaluator = telemetryEvaluator;
        _personaMemory = personaMemory;
    }

    public async Task<ApiResponse<ActiveRoleplaySessionDto?>> GetActiveSessionAsync(
        string userId,
        int scenarioId,
        CancellationToken cancellationToken = default)
    {
        var activeSession = await _dbContext.RoleplaySessions
            .AsNoTracking()
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.Scenario)
            .Include(s => s.SessionMissions)
            .Include(s => s.Messages)
            .Where(s => s.UserId == userId && s.Status == "Active" && s.ScenarioLevelConfiguration!.ScenarioId == scenarioId)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (activeSession == null || activeSession.ScenarioLevelConfiguration == null)
        {
            return ApiResponse<ActiveRoleplaySessionDto?>.Ok(null);
        }

        var dto = new ActiveRoleplaySessionDto
        {
            SessionId = activeSession.Id,
            ScenarioId = activeSession.ScenarioLevelConfiguration.ScenarioId,
            ScenarioTitle = activeSession.ScenarioLevelConfiguration.Scenario?.Title ?? "",
            ScenarioCode = activeSession.ScenarioLevelConfiguration.Scenario?.ScenarioCode ?? "",
            JLPTLevel = activeSession.ScenarioLevelConfiguration.JLPTLevel,
            AiPersona = activeSession.ScenarioLevelConfiguration.AiPersona,
            CompletedMissionsCount = activeSession.SessionMissions.Count(sm => sm.IsCompleted),
            TotalMissionsCount = activeSession.SessionMissions.Count,
            MessageCount = activeSession.Messages.Count,
            CreatedAt = activeSession.CreatedAt,
            UpdatedAt = activeSession.UpdatedAt
        };

        return ApiResponse<ActiveRoleplaySessionDto?>.Ok(dto);
    }

    public async Task<ApiResponse<RoleplaySessionDetailsDto>> StartSessionAsync(
        string userId,
        int scenarioId,
        string jlptLevel,
        StartRoleplaySessionRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var levelConfig = await _dbContext.ScenarioLevelConfigurations
            .Include(c => c.Scenario)
            .Include(c => c.Missions.Where(m => m.IsActive))
            .FirstOrDefaultAsync(c => c.ScenarioId == scenarioId && c.JLPTLevel == jlptLevel, cancellationToken);

        if (levelConfig == null || levelConfig.Scenario == null)
        {
            return ApiResponse<RoleplaySessionDetailsDto>.Fail("Không tìm thấy cấu hình cấp độ cho tình huống này.");
        }

        // Kiểm tra xem đã có phiên dở dang nào của Scenario này (bất kể level nào)
        var existingActiveSession = await _dbContext.RoleplaySessions
            .Include(s => s.ScenarioLevelConfiguration)
            .Where(s => s.UserId == userId && s.Status == "Active" && s.ScenarioLevelConfiguration!.ScenarioId == scenarioId)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (existingActiveSession != null)
        {
            if (!request.ForceRestart && existingActiveSession.ScenarioLevelConfiguration?.JLPTLevel == jlptLevel)
            {
                // Người dùng muốn tiếp tục phiên dở dang của cùng level -> Trả về phiên hiện tại (không trừ credit)
                return await GetSessionDetailsAsync(userId, existingActiveSession.Id, cancellationToken);
            }

            // Người dùng chọn bắt đầu lại mới hoặc đổi sang cấp độ khác -> Đánh dấu phiên cũ là Abandoned (không hoàn credit cũ)
            existingActiveSession.Status = "Abandoned";
            existingActiveSession.UpdatedAt = DateTime.UtcNow;
            _logger.LogInformation("Người dùng {UserId} hủy phiên dở dang {SessionId} để tạo phiên mới cấp độ {Level}.", userId, existingActiveSession.Id, jlptLevel);
        }

        // Kiểm tra số dư Credit (Miễn phí cho Admin khi trải nghiệm / kiểm thử hệ thống)
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null)
        {
            return ApiResponse<RoleplaySessionDetailsDto>.Fail("Không tìm thấy thông tin tài khoản người dùng.");
        }

        var isAdmin = string.Equals(user.Role, "Admin", StringComparison.OrdinalIgnoreCase);
        if (!isAdmin)
        {
            try
            {
                var roles = await _userManager.GetRolesAsync(user);
                if (roles != null && roles.Any(r => string.Equals(r, "Admin", StringComparison.OrdinalIgnoreCase)))
                {
                    isAdmin = true;
                }
            }
            catch
            {
                // In case userManager mock does not have GetRolesAsync configured in tests
            }
        }

        // Kiểm tra người dùng có gói tháng đang hoạt động không
        bool hasActiveSub = !isAdmin
            && user.SubscriptionExpiresAt.HasValue
            && user.SubscriptionExpiresAt.Value > DateTime.UtcNow;

        int creditDeducted = isAdmin ? 0 : levelConfig.CreditCost;

        // Nếu có gói tháng: bỏ qua kiểm tra số dư và không trừ CreditBalance
        if (!isAdmin && !hasActiveSub && user.CreditBalance < levelConfig.CreditCost)
        {
            return ApiResponse<RoleplaySessionDetailsDto>.Fail(
                $"Số dư credit của bạn không đủ ({user.CreditBalance}/{levelConfig.CreditCost} credits). Vui lòng nạp thêm credit hoặc mua gói tháng để bắt đầu luyện tập.");
        }

        // Khấu trừ Credit theo Model A (Cố định theo phiên) — chỉ trừ CreditBalance nếu KHÔNG có gói tháng
        if (creditDeducted > 0)
        {
            if (hasActiveSub)
            {
                // Gói tháng bao gồm phí khởi tạo: ghi nhận giao dịch nhưng không trừ số dư vĩnh viễn
                _dbContext.CreditTransactions.Add(new CreditTransaction
                {
                    UserId = userId,
                    Amount = -creditDeducted,
                    Type = "Deduct",
                    Status = "Paid",
                    Description = $"[Gói tháng] Luyện tập hội thoại: {levelConfig.Scenario.Title} ({levelConfig.JLPTLevel})",
                    CreatedAt = DateTime.UtcNow
                });
            }
            else
            {
                user.CreditBalance -= creditDeducted;
                _dbContext.CreditTransactions.Add(new CreditTransaction
                {
                    UserId = userId,
                    Amount = -creditDeducted,
                    Type = "Deduct",
                    Status = "Paid",
                    Description = $"Luyện tập hội thoại: {levelConfig.Scenario.Title} ({levelConfig.JLPTLevel})",
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        // Tạo RoleplaySession mới
        var newSession = new RoleplaySession
        {
            UserId = userId,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active",
            CreditDeducted = creditDeducted,
            IsNaturallyConcluded = false,
            CreatedAt = DateTime.UtcNow
        };
        _dbContext.RoleplaySessions.Add(newSession);
        await _dbContext.SaveChangesAsync(cancellationToken);

        // Khởi tạo các Mission cho phiên
        foreach (var mission in levelConfig.Missions.Where(m => m.IsActive).OrderBy(m => m.Order))
        {
            _dbContext.RoleplaySessionMissions.Add(new RoleplaySessionMission
            {
                RoleplaySessionId = newSession.Id,
                MissionId = mission.Id,
                IsCompleted = false
            });
        }

        // AI luôn là người chủ động nói câu mở đầu (kèm lời chào thích ứng theo quan hệ / thời gian nếu có)
        string npcCode = levelConfig.Scenario.ScenarioCode ?? $"SCN_{levelConfig.Scenario.Id}";
        string? circadianGreeting = null;
        try
        {
            circadianGreeting = await _personaMemory.GetAdaptiveCircadianGreetingAsync(userId, npcCode);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Không thể lấy circadian greeting cho người dùng {UserId}", userId);
        }

        AiOpeningMessageResult? opening = null;
        if (!string.IsNullOrWhiteSpace(circadianGreeting))
        {
            opening = await _aiRoleplayService.GenerateOpeningMessageAsync(levelConfig.Scenario, levelConfig, circadianGreeting, cancellationToken);
        }
        if (opening == null)
        {
            opening = await _aiRoleplayService.GenerateOpeningMessageAsync(levelConfig.Scenario, levelConfig, cancellationToken);
        }
        if (opening == null)
        {
            opening = RoleplaySocialRegister.GenerateOpeningMessage(levelConfig.Scenario, levelConfig);
        }

        var aiOpeningMessage = new RoleplayMessage
        {
            RoleplaySessionId = newSession.Id,
            Sender = "Ai",
            JapaneseText = opening.JapaneseText,
            VietnameseMeaning = opening.VietnameseMeaning,
            FuriganaHtml = opening.FuriganaHtml,
            CreatedAt = DateTime.UtcNow
        };
        _dbContext.RoleplayMessages.Add(aiOpeningMessage);

        await _dbContext.SaveChangesAsync(cancellationToken);

        return await GetSessionDetailsAsync(userId, newSession.Id, cancellationToken);
    }

    public async Task<ApiResponse<RoleplaySessionDetailsDto>> GetSessionDetailsAsync(
        string userId,
        int sessionId,
        CancellationToken cancellationToken = default)
    {
        var session = await _dbContext.RoleplaySessions
            .AsNoTracking()
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.Scenario)
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.TargetVocabularies)
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.TargetGrammars)
            .Include(s => s.SessionMissions)
                .ThenInclude(sm => sm.Mission)
            .Include(s => s.Messages)
            .FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken);

        if (session == null)
        {
            return ApiResponse<RoleplaySessionDetailsDto>.Fail("Không tìm thấy phiên luyện tập.");
        }

        if (session.UserId != userId)
        {
            return ApiResponse<RoleplaySessionDetailsDto>.Fail("Bạn không có quyền truy cập vào phiên luyện tập này.");
        }

        var user = await _userManager.FindByIdAsync(userId);

        var voiceResolution = VoiceVoxPersonaResolver.Resolve(
            session.ScenarioLevelConfiguration?.AiPersona,
            session.ScenarioLevelConfiguration?.Scenario?.Title,
            session.ScenarioLevelConfiguration?.Description,
            session.ScenarioLevelConfiguration?.JLPTLevel);

        var dto = new RoleplaySessionDetailsDto
        {
            SessionId = session.Id,
            ScenarioId = session.ScenarioLevelConfiguration?.ScenarioId ?? 0,
            ScenarioTitle = session.ScenarioLevelConfiguration?.Scenario?.Title ?? "",
            ScenarioCode = session.ScenarioLevelConfiguration?.Scenario?.ScenarioCode ?? "",
            JLPTLevel = session.ScenarioLevelConfiguration?.JLPTLevel ?? "",
            AiPersona = session.ScenarioLevelConfiguration?.AiPersona ?? "",
            ScenarioContext = session.ScenarioLevelConfiguration?.Description ?? "",
            Status = session.Status,
            CreditDeducted = session.CreditDeducted,
            CreditBalance = user?.CreditBalance ?? 0,
            IsNaturallyConcluded = session.IsNaturallyConcluded,
            CreatedAt = session.CreatedAt,
            RecommendedAiVoiceId = voiceResolution.RecommendedAiVoiceId,
            RecommendedAiVoiceName = voiceResolution.RecommendedAiVoiceName,
            RecommendedLearnerVoiceId = voiceResolution.RecommendedLearnerVoiceId,
            RecommendedLearnerVoiceName = voiceResolution.RecommendedLearnerVoiceName,
            RoleVoiceMappings = voiceResolution.RoleVoiceMappings,
            TargetVocabularies = session.ScenarioLevelConfiguration?.TargetVocabularies
                .Select(v => new TargetVocabularyDto
                {
                    Id = v.Id,
                    Word = v.Word,
                    Reading = v.Reading,
                    Meaning = v.Meaning
                }).ToList() ?? [],
            TargetGrammars = session.ScenarioLevelConfiguration?.TargetGrammars
                .Select(g => new TargetGrammarDto
                {
                    Id = g.Id,
                    Pattern = g.Pattern,
                    Meaning = g.Meaning,
                    ExampleSentence = g.ExampleSentence
                }).ToList() ?? [],
            Missions = session.SessionMissions
                .OrderBy(sm => sm.Mission?.Order ?? 0)
                .Select(sm => new RoleplayMissionDto
                {
                    MissionId = sm.MissionId,
                    Content = sm.Mission?.Content ?? "",
                    Target = ExtractMissionTarget(sm.Mission?.CompletionCriteriaJson),
                    Order = sm.Mission?.Order ?? 0,
                    IsCompleted = sm.IsCompleted,
                    CompletedAt = sm.CompletedAt
                }).ToList(),
            Messages = session.Messages
                .OrderBy(m => m.CreatedAt)
                .Select(m => new RoleplayMessageDto
                {
                    Id = m.Id,
                    Sender = m.Sender,
                    JapaneseText = m.JapaneseText,
                    VietnameseMeaning = m.VietnameseMeaning,
                    FuriganaHtml = m.FuriganaHtml,
                    LinguisticFeedback = ParseFeedback(m.LinguisticFeedbackJson),
                    AudioUrl = ParseFeedback(m.LinguisticFeedbackJson)?.SpeechDelivery?.AudioUrl,
                    CreatedAt = m.CreatedAt
                }).ToList()
        };

        return ApiResponse<RoleplaySessionDetailsDto>.Ok(dto);
    }

    public async Task<ApiResponse<RoleplayTurnResponseDto>> SendMessageAsync(
        string userId,
        int sessionId,
        SendRoleplayMessageRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
        {
            return ApiResponse<RoleplayTurnResponseDto>.Fail("Tin nhắn không được để trống.");
        }

        var session = await _dbContext.RoleplaySessions
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.Scenario)
            .Include(s => s.SessionMissions)
                .ThenInclude(sm => sm.Mission)
            .Include(s => s.Messages)
            .FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken);

        if (session == null)
        {
            return ApiResponse<RoleplayTurnResponseDto>.Fail("Không tìm thấy phiên luyện tập.");
        }

        if (session.UserId != userId)
        {
            return ApiResponse<RoleplayTurnResponseDto>.Fail("Bạn không có quyền thực hiện thao tác này.");
        }

        if (session.Status != "Active")
        {
            return ApiResponse<RoleplayTurnResponseDto>.Fail("Phiên luyện tập đã kết thúc, không thể gửi thêm tin nhắn.");
        }

        var levelConfig = session.ScenarioLevelConfiguration;
        if (levelConfig == null || levelConfig.Scenario == null)
        {
            return ApiResponse<RoleplayTurnResponseDto>.Fail("Dữ liệu kịch bản bị thiếu hoặc không hợp lệ.");
        }

        // 1. Lưu tin nhắn của học viên
        var userMessage = new RoleplayMessage
        {
            RoleplaySessionId = sessionId,
            Sender = "User",
            JapaneseText = request.Message.Trim(),
            CreatedAt = DateTime.UtcNow
        };
        _dbContext.RoleplayMessages.Add(userMessage);
        await _dbContext.SaveChangesAsync(cancellationToken);

        // 2. Lấy danh sách nhiệm vụ CHƯA hoàn thành
        var pendingMissions = session.SessionMissions
            .Where(sm => !sm.IsCompleted && sm.Mission != null)
            .Select(sm => sm.Mission!)
            .ToList();

        // 2b. Quét lỗi chuyển dịch tiếng Nhật E01-E10 và ghi nhận Telemetry
        var detectedIssues = _errorDetector.DetectErrors(userMessage.JapaneseText);
        var turnIndex = session.Messages.Count(m => m.Sender == "User");
        var ddaDecision = await _telemetryEvaluator.RecordAndEvaluateTurnAsync(new TurnTelemetryInput
        {
            SessionId = sessionId,
            UserId = userId,
            TurnIndex = turnIndex,
            LatencyMs = (int)((request.ResponseLatencySeconds ?? 2.0) * 1000),
            PauseRatio = request.PauseRatio ?? 0.0,
            MoraRate = request.MoraRate ?? 3.5,
            HintLevelUsed = request.HintLevelUsed,
            TranslationPeekCount = request.TranslationPeekCount,
            RetryCount = request.RetryCount,
            FallbackToTextInput = request.FallbackToTextInput,
            BargeInInterrupted = request.BargeInInterrupted,
            JapaneseSpoken = userMessage.JapaneseText,
            TurnScore = 85.0
        });

        string npcCode = levelConfig.Scenario.ScenarioCode ?? $"SCN_{levelConfig.Scenario.Id}";
        string? compactMemory = null;
        try
        {
            compactMemory = await _personaMemory.GetCompactMemoryDirectiveAsync(userId, npcCode);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Không thể lấy persona memory directive cho người dùng {UserId}", userId);
        }

        // 3. Gọi AI phân tích và phản hồi (ưu tiên memory directive nếu có)
        AiTurnResult? turnResult = null;
        if (!string.IsNullOrWhiteSpace(compactMemory))
        {
            turnResult = await _aiRoleplayService.ProcessTurnAsync(
                levelConfig.Scenario,
                levelConfig,
                session.Messages.ToList(),
                userMessage.JapaneseText,
                pendingMissions,
                compactMemory,
                cancellationToken);
        }
        if (turnResult == null)
        {
            turnResult = await _aiRoleplayService.ProcessTurnAsync(
                levelConfig.Scenario,
                levelConfig,
                session.Messages.ToList(),
                userMessage.JapaneseText,
                pendingMissions,
                cancellationToken);
        }
        if (turnResult == null)
        {
            turnResult = RoleplaySocialRegister.ProcessGenericTurn(
                levelConfig.Scenario,
                levelConfig,
                userMessage.JapaneseText,
                pendingMissions);
        }

        // 4. Lưu tin nhắn phản hồi của AI
        var aiMessage = new RoleplayMessage
        {
            RoleplaySessionId = sessionId,
            Sender = "Ai",
            JapaneseText = turnResult.JapaneseReply,
            VietnameseMeaning = turnResult.VietnameseMeaning,
            FuriganaHtml = turnResult.FuriganaHtml,
            CreatedAt = DateTime.UtcNow
        };
        _dbContext.RoleplayMessages.Add(aiMessage);

        // 4b. Trừ credit theo số token ước lượng từ câu thoại AI (tối thiểu 1 credit/lượt)
        // Công thức: mỗi CharsPerCredit ký tự tiếng Nhật ≈ 1 credit, tối thiểu 1 credit/lượt.
        // Admin không bị trừ credit. Người dùng có gói tháng hoạt động KHÔNG bị trừ CreditBalance vĩnh viễn.
        var userForDeduct = await _userManager.FindByIdAsync(userId);
        var isAdmin = userForDeduct != null &&
            string.Equals(userForDeduct.Role, "Admin", StringComparison.OrdinalIgnoreCase);
        int creditsSpentThisTurn = 0;

        if (!isAdmin && userForDeduct != null)
        {
            int estimatedTokens = string.IsNullOrWhiteSpace(turnResult.JapaneseReply)
                ? 0
                : turnResult.JapaneseReply.Length;
            int creditsDue = Math.Max(1, estimatedTokens / CharsPerCredit);

            bool hasActiveSubscription = userForDeduct.SubscriptionExpiresAt.HasValue
                && userForDeduct.SubscriptionExpiresAt.Value > DateTime.UtcNow;

            if (hasActiveSubscription)
            {
                // Gói tháng đang hoạt động: ghi nhận giao dịch để theo dõi quota, KHÔNG trừ CreditBalance
                creditsSpentThisTurn = creditsDue;
                _dbContext.CreditTransactions.Add(new CreditTransaction
                {
                    UserId = userId,
                    Amount = -creditsDue,
                    Type = "Deduct",
                    Status = "Paid",
                    Description = $"[Gói tháng] Lượt hội thoại AI: {levelConfig.Scenario.Title} ({levelConfig.JLPTLevel})",
                    CreatedAt = DateTime.UtcNow
                });
                // Không gọi UpdateAsync vì CreditBalance không thay đổi
            }
            else
            {
                // Không có gói tháng: trừ từ CreditBalance vĩnh viễn
                if (userForDeduct.CreditBalance >= creditsDue)
                {
                    creditsSpentThisTurn = creditsDue;
                }
                else if (userForDeduct.CreditBalance > 0)
                {
                    // Trừ hết số dư còn lại nếu không đủ đúng lượng
                    creditsSpentThisTurn = userForDeduct.CreditBalance;
                }
                else
                {
                    // Hết credit: vẫn cho phép nhận phản hồi lượt này nhưng ghi log
                    _logger.LogWarning("User {UserId} gửi tin nhắn nhưng số dư credit bằng 0. Cho phép lượt này nhưng không trừ credit.", userId);
                }

                if (creditsSpentThisTurn > 0)
                {
                    userForDeduct.CreditBalance -= creditsSpentThisTurn;
                    _dbContext.CreditTransactions.Add(new CreditTransaction
                    {
                        UserId = userId,
                        Amount = -creditsSpentThisTurn,
                        Type = "Deduct",
                        Status = "Paid",
                        Description = $"Lượt hội thoại AI: {levelConfig.Scenario.Title} ({levelConfig.JLPTLevel})",
                        CreatedAt = DateTime.UtcNow
                    });
                    await _userManager.UpdateAsync(userForDeduct);
                }
            }
        }

        // 5. Cập nhật các mission vừa hoàn thành (có kiểm tra thứ tự logic hội thoại)
        var newlyCompletedIds = new List<int>();
        var maxOrder = session.SessionMissions.Count > 0
            ? session.SessionMissions.Max(x => x.Mission?.Order ?? 0)
            : 0;
        var hasEarlierPending = session.SessionMissions.Any(x => !x.IsCompleted && (x.Mission?.Order ?? 0) < maxOrder);

        foreach (var missionId in turnResult.CompletedMissionIds)
        {
            var sm = session.SessionMissions.FirstOrDefault(x => x.MissionId == missionId && !x.IsCompleted);
            if (sm != null)
            {
                // Ngăn chặn việc tick nhảy cóc nhiệm vụ kết thúc kịch bản khi các nhiệm vụ chính trước đó chưa hoàn thành
                if ((sm.Mission?.Order ?? 0) == maxOrder && maxOrder > 1 && hasEarlierPending)
                {
                    _logger.LogInformation("Nhiệm vụ {MissionId} (Order {Order}) là nhiệm vụ kết thúc kịch bản, bị hoãn tick do còn nhiệm vụ tiên quyết chưa hoàn thành.", missionId, sm.Mission?.Order);
                    continue;
                }

                sm.IsCompleted = true;
                sm.CompletedAt = DateTime.UtcNow;
                newlyCompletedIds.Add(missionId);
            }
        }

        // 6. Cập nhật đánh giá ngôn ngữ, bản dịch tiếng Việt, furigana người học và cờ kết thúc tự nhiên
        if (!string.IsNullOrWhiteSpace(turnResult.UserVietnameseMeaning))
        {
            userMessage.VietnameseMeaning = turnResult.UserVietnameseMeaning;
        }

        if (!string.IsNullOrWhiteSpace(turnResult.UserFuriganaHtml))
        {
            userMessage.FuriganaHtml = turnResult.UserFuriganaHtml;
        }

        if (turnResult.LinguisticFeedback != null)
        {
            if (request.SpeakingDurationSeconds.HasValue || request.ResponseLatencySeconds.HasValue || request.SpeechConfidence.HasValue)
            {
                var duration = request.SpeakingDurationSeconds;
                var pace = (duration.HasValue && duration.Value > 0)
                    ? Math.Round(userMessage.JapaneseText.Length / duration.Value, 1)
                    : (double?)null;

                var jlpt = (levelConfig.JLPTLevel ?? "N4").Trim().ToUpperInvariant();
                (double idealLat, double maxLat, double minPace, double maxPace, string paceDesc) = jlpt switch
                {
                    "N5" => (5.0, 10.0, 2.0, 4.5, "Chuẩn N5: 2.0 - 4.5 ký tự/s"),
                    "N4" => (4.0, 8.5, 2.5, 5.5, "Chuẩn N4: 2.5 - 5.5 ký tự/s"),
                    "N3" => (3.0, 7.0, 3.5, 6.5, "Chuẩn N3: 3.5 - 6.5 ký tự/s"),
                    "N2" => (2.2, 5.5, 4.5, 7.5, "Chuẩn N2: 4.5 - 7.5 ký tự/s"),
                    "N1" => (1.8, 4.5, 5.5, 9.0, "Chuẩn N1: 5.5 - 9.0 ký tự/s"),
                    _ => (4.0, 8.5, 2.5, 5.5, "Chuẩn N4: 2.5 - 5.5 ký tự/s")
                };

                var turnFluency = 85;
                string? latencyAssessment = null;
                if (request.ResponseLatencySeconds.HasValue)
                {
                    var lat = request.ResponseLatencySeconds.Value;
                    if (lat <= idealLat)
                    {
                        turnFluency += 10;
                        latencyAssessment = $"Phản xạ rất tốt ({lat:0.0}s, chuẩn {jlpt} <= {idealLat:0.0}s)";
                    }
                    else if (lat <= (idealLat + maxLat) / 2.0)
                    {
                        turnFluency += 3;
                        latencyAssessment = $"Phản xạ ổn định ({lat:0.0}s)";
                    }
                    else if (lat > maxLat)
                    {
                        var penalty = Math.Min(30, (int)((lat - maxLat) * 3));
                        turnFluency -= penalty;
                        latencyAssessment = $"Ngập ngừng lâu ({lat:0.0}s > {maxLat:0.0}s)";
                    }
                    else
                    {
                        latencyAssessment = $"Phản xạ trung bình ({lat:0.0}s)";
                    }
                }

                string? paceAssessment = null;
                if (pace.HasValue)
                {
                    var p = pace.Value;
                    if (p >= minPace && p <= maxPace)
                    {
                        turnFluency += 5;
                        paceAssessment = $"Tốc độ phù hợp ({p:0.0} kt/s - {paceDesc})";
                    }
                    else if (p < minPace)
                    {
                        turnFluency -= 5;
                        paceAssessment = $"Hơi chậm ({p:0.0} kt/s < {minPace:0.0})";
                    }
                    else
                    {
                        paceAssessment = $"Tốc độ nhanh ({p:0.0} kt/s)";
                    }
                }

                if (request.SpeechConfidence.HasValue)
                {
                    var conf = request.SpeechConfidence.Value;
                    if (conf >= 0.85) turnFluency += 5;
                    else if (conf < 0.60) turnFluency -= 15;
                }
                turnFluency = Math.Clamp(turnFluency, 30, 100);

                turnResult.LinguisticFeedback.SpeechDelivery = new SpeechDeliveryMetricsDto
                {
                    SpeakingDurationSeconds = request.SpeakingDurationSeconds.HasValue ? Math.Round(request.SpeakingDurationSeconds.Value, 1) : null,
                    ResponseLatencySeconds = request.ResponseLatencySeconds.HasValue ? Math.Round(request.ResponseLatencySeconds.Value, 1) : null,
                    SpeechConfidence = request.SpeechConfidence.HasValue ? Math.Round(request.SpeechConfidence.Value, 2) : null,
                    SpeechPace = pace,
                    TurnFluencyScore = turnFluency,
                    JlptLevel = jlpt,
                    PaceAssessment = paceAssessment,
                    LatencyAssessment = latencyAssessment,
                    AudioUrl = request.AudioUrl
                };
            }

            userMessage.LinguisticFeedbackJson = System.Text.Json.JsonSerializer.Serialize(turnResult.LinguisticFeedback, JsonOptions);
        }

        bool allMissionsDone = session.SessionMissions.Count > 0 && session.SessionMissions.All(sm => sm.IsCompleted);
        if (turnResult.IsNaturallyConcluded && allMissionsDone)
        {
            session.IsNaturallyConcluded = true;
        }

        session.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        // 7. Tạo response trả về cho frontend
        // Lấy credit balance mới nhất (đã được cập nhật sau deduct)
        int latestCreditBalance = userForDeduct?.CreditBalance
            ?? (await _userManager.FindByIdAsync(userId))?.CreditBalance
            ?? 0;

        var responseDto = new RoleplayTurnResponseDto
        {
            UserMessage = new RoleplayMessageDto
            {
                Id = userMessage.Id,
                Sender = userMessage.Sender,
                JapaneseText = userMessage.JapaneseText,
                VietnameseMeaning = userMessage.VietnameseMeaning,
                FuriganaHtml = userMessage.FuriganaHtml,
                LinguisticFeedback = turnResult.LinguisticFeedback,
                AudioUrl = request.AudioUrl,
                CreatedAt = userMessage.CreatedAt
            },
            AiMessage = new RoleplayMessageDto
            {
                Id = aiMessage.Id,
                Sender = aiMessage.Sender,
                JapaneseText = aiMessage.JapaneseText,
                VietnameseMeaning = aiMessage.VietnameseMeaning,
                FuriganaHtml = aiMessage.FuriganaHtml,
                CreatedAt = aiMessage.CreatedAt
            },
            NewlyCompletedMissionIds = newlyCompletedIds,
            UpdatedMissions = session.SessionMissions
                .OrderBy(sm => sm.Mission?.Order ?? 0)
                .Select(sm => new RoleplayMissionDto
                {
                    MissionId = sm.MissionId,
                    Content = sm.Mission?.Content ?? "",
                    Target = ExtractMissionTarget(sm.Mission?.CompletionCriteriaJson),
                    Order = sm.Mission?.Order ?? 0,
                    IsCompleted = sm.IsCompleted,
                    CompletedAt = sm.CompletedAt
                }).ToList(),
            IsNaturallyConcluded = session.IsNaturallyConcluded,
            SessionStatus = session.Status,
            CreditBalance = latestCreditBalance,
            CreditsSpentThisTurn = creditsSpentThisTurn,
            DetectedIssues = detectedIssues.ToList(),
            SpeedScale = ddaDecision.SpeedScale,
            ShouldOfferEncouragement = ddaDecision.ShouldOfferEncouragement
        };

        return ApiResponse<RoleplayTurnResponseDto>.Ok(responseDto);
    }

    public async Task<ApiResponse<RoleplayHintDto>> GetHintAsync(
        string userId,
        int sessionId,
        CancellationToken cancellationToken = default)
    {
        var session = await _dbContext.RoleplaySessions
            .AsNoTracking()
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.Scenario)
            .Include(s => s.SessionMissions)
                .ThenInclude(sm => sm.Mission)
            .Include(s => s.Messages)
            .FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken);

        if (session == null || session.ScenarioLevelConfiguration?.Scenario == null)
        {
            return ApiResponse<RoleplayHintDto>.Fail("Không tìm thấy phiên luyện tập.");
        }

        if (session.UserId != userId)
        {
            return ApiResponse<RoleplayHintDto>.Fail("Bạn không có quyền thực hiện thao tác này.");
        }

        var pendingMissions = session.SessionMissions
            .Where(sm => !sm.IsCompleted && sm.Mission != null)
            .Select(sm => sm.Mission!)
            .ToList();

        var hint = await _aiRoleplayService.GenerateHintAsync(
            session.ScenarioLevelConfiguration.Scenario,
            session.ScenarioLevelConfiguration,
            session.Messages.ToList(),
            pendingMissions,
            cancellationToken);

        return ApiResponse<RoleplayHintDto>.Ok(hint);
    }

    public async Task<ApiResponse<bool>> EndSessionAsync(
        string userId,
        int sessionId,
        CancellationToken cancellationToken = default)
    {
        var session = await _dbContext.RoleplaySessions
            .FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken);

        if (session == null)
        {
            return ApiResponse<bool>.Fail("Không tìm thấy phiên luyện tập.");
        }

        if (session.UserId != userId)
        {
            return ApiResponse<bool>.Fail("Bạn không có quyền thao tác trên phiên này.");
        }

        session.Status = "Completed";
        session.CompletedAt = DateTime.UtcNow;
        session.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);

        // Finalize Telemetry & Persona Memory
        await _telemetryEvaluator.FinalizeSessionTelemetryAsync(sessionId, userId);

        var sessionWithConfig = await _dbContext.RoleplaySessions
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.Scenario)
            .Include(s => s.SessionMissions)
            .FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken);

        if (sessionWithConfig?.ScenarioLevelConfiguration?.Scenario != null)
        {
            bool allDone = sessionWithConfig.SessionMissions.Count > 0 && sessionWithConfig.SessionMissions.All(m => m.IsCompleted);
            string npcCode = sessionWithConfig.ScenarioLevelConfiguration.Scenario.ScenarioCode ?? $"SCN_{sessionWithConfig.ScenarioLevelConfiguration.Scenario.Id}";
            await _personaMemory.RecordSessionAffinityAsync(userId, npcCode, allDone);

            if (allDone)
            {
                var spotActivity = await _dbContext.ExploreSpotActivities
                    .Include(a => a.Lesson)
                    .FirstOrDefaultAsync(a => a.ActivityType == ExploreActivityType.Roleplay && a.ReferenceId == sessionWithConfig.ScenarioLevelConfigurationId, cancellationToken);

                if (spotActivity?.Lesson != null)
                {
                    var spotProgress = await _dbContext.Set<ExploreSpotProgress>()
                        .FirstOrDefaultAsync(p => p.UserId == userId && p.SpotId == spotActivity.Lesson.SpotId, cancellationToken);
                    if (spotProgress == null)
                    {
                        spotProgress = new ExploreSpotProgress
                        {
                            UserId = userId,
                            SpotId = spotActivity.Lesson.SpotId,
                            RedStampedAt = DateTime.UtcNow,
                            RoleplaySessionId = sessionId,
                            UpdatedAt = DateTime.UtcNow
                        };
                        _dbContext.Set<ExploreSpotProgress>().Add(spotProgress);
                        await _dbContext.SaveChangesAsync(cancellationToken);
                    }
                    else if (!spotProgress.RedStampedAt.HasValue)
                    {
                        spotProgress.RedStampedAt = DateTime.UtcNow;
                        spotProgress.RoleplaySessionId = sessionId;
                        spotProgress.UpdatedAt = DateTime.UtcNow;
                        await _dbContext.SaveChangesAsync(cancellationToken);
                    }
                }
            }
        }

        return ApiResponse<bool>.Ok(true, "Phiên luyện tập đã kết thúc thành công.");
    }

    private static readonly System.Text.Json.JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private static LinguisticFeedbackDto? ParseFeedback(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<LinguisticFeedbackDto>(json, JsonOptions);
        }
        catch
        {
            return null;
        }
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
            // Ignore parse errors
        }
        return string.Empty;
    }

    /// <summary>
    /// Ước lượng số credit cần trừ dựa trên độ dài câu thoại AI tiếng Nhật.
    /// Mỗi <see cref="CharsPerCredit"/> ký tự = 1 credit, tối thiểu 1 credit.
    /// </summary>
    internal static int EstimateCreditCost(string japaneseReply)
    {
        if (string.IsNullOrWhiteSpace(japaneseReply)) return 1;
        return Math.Max(1, japaneseReply.Length / CharsPerCredit);
    }
}

