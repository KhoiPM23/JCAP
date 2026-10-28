using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Roleplay;
using JCAP.DTOs.Scenario;
using JCAP.Models;
using JCAP.Services.Interfaces;
using JCAP.Services.Subscriptions;
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

    /// <summary>
    /// Số ký tự tiếng Nhật ước lượng tương đương 1 credit (30 ký tự ≈ 30 tokens ≈ 1 credit).
    /// </summary>
    private const int CharsPerCredit = 30;

    public RoleplaySessionService(
        AppDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        IAiRoleplayService aiRoleplayService,
        ILogger<RoleplaySessionService> logger)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _aiRoleplayService = aiRoleplayService;
        _logger = logger;
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
        bool useSubQuotaForInit = false;

        if (!isAdmin && creditDeducted > 0)
        {
            if (hasActiveSub)
            {
                var (canUseQuota, quotaError) = await CheckSubscriptionQuotaAvailableAsync(user, creditDeducted, cancellationToken);
                if (canUseQuota)
                {
                    useSubQuotaForInit = true;
                }
                else if (user.CreditBalance < creditDeducted)
                {
                    return ApiResponse<RoleplaySessionDetailsDto>.Fail(quotaError);
                }
            }
            else if (user.CreditBalance < creditDeducted)
            {
                return ApiResponse<RoleplaySessionDetailsDto>.Fail(
                    $"Số dư credit của bạn không đủ ({user.CreditBalance}/{creditDeducted} credits). Vui lòng nạp thêm credit hoặc mua gói tháng để bắt đầu luyện tập.");
            }
        }

        // Khấu trừ Credit theo Model A (Cố định theo phiên)
        if (creditDeducted > 0)
        {
            if (useSubQuotaForInit)
            {
                var plan = SubscriptionPlanCatalog.FindOrDefault(user.SubscriptionPlanId);
                // Gói tháng bao gồm phí khởi tạo: ghi nhận giao dịch nhưng không trừ số dư vĩnh viễn
                _dbContext.CreditTransactions.Add(new CreditTransaction
                {
                    UserId = userId,
                    Amount = -creditDeducted,
                    Type = "Deduct",
                    Status = "Paid",
                    CoveredBySubscription = true,
                    SubscriptionPlanId = plan.Id,
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
                    CoveredBySubscription = false,
                    Description = $"Luyện tập hội thoại: {levelConfig.Scenario.Title} ({levelConfig.JLPTLevel})",
                    CreatedAt = DateTime.UtcNow
                });
                await _userManager.UpdateAsync(user);
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

        // AI luôn là người chủ động nói câu mở đầu
        var opening = await _aiRoleplayService.GenerateOpeningMessageAsync(levelConfig.Scenario, levelConfig, cancellationToken);
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

        // Kiểm tra hạn mức Quota (nếu dùng gói tháng) trước khi gọi AI
        var userForDeduct = await _userManager.FindByIdAsync(userId);
        var isAdmin = userForDeduct != null &&
            string.Equals(userForDeduct.Role, "Admin", StringComparison.OrdinalIgnoreCase);

        bool hasActiveSubscription = !isAdmin && userForDeduct != null
            && userForDeduct.SubscriptionExpiresAt.HasValue
            && userForDeduct.SubscriptionExpiresAt.Value > DateTime.UtcNow;

        bool canUseSubQuota = false;
        if (hasActiveSubscription && userForDeduct != null)
        {
            var (quotaOk, quotaErr) = await CheckSubscriptionQuotaAvailableAsync(userForDeduct, 1, cancellationToken);
            if (quotaOk)
            {
                canUseSubQuota = true;
            }
            else if (userForDeduct.CreditBalance <= 0)
            {
                // Đã chạm trần hạn ngạch gói tháng và không có credit nạp thêm dự phòng
                return ApiResponse<RoleplayTurnResponseDto>.Fail(quotaErr);
            }
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

        // 3. Gọi AI phân tích và phản hồi
        var turnResult = await _aiRoleplayService.ProcessTurnAsync(
            levelConfig.Scenario,
            levelConfig,
            session.Messages.ToList(),
            userMessage.JapaneseText,
            pendingMissions,
            cancellationToken);

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
        // Admin không bị trừ credit. Người dùng có gói tháng hoạt động còn quota KHÔNG bị trừ CreditBalance vĩnh viễn.
        int creditsSpentThisTurn = 0;

        if (!isAdmin && userForDeduct != null)
        {
            int estimatedTokens = string.IsNullOrWhiteSpace(turnResult.JapaneseReply)
                ? 0
                : turnResult.JapaneseReply.Length;
            int creditsDue = Math.Max(1, estimatedTokens / CharsPerCredit);

            if (canUseSubQuota)
            {
                var plan = SubscriptionPlanCatalog.FindOrDefault(userForDeduct.SubscriptionPlanId);
                // Gói tháng đang hoạt động và còn hạn mức: ghi nhận giao dịch để theo dõi quota, KHÔNG trừ CreditBalance
                creditsSpentThisTurn = creditsDue;
                _dbContext.CreditTransactions.Add(new CreditTransaction
                {
                    UserId = userId,
                    Amount = -creditsDue,
                    Type = "Deduct",
                    Status = "Paid",
                    CoveredBySubscription = true,
                    SubscriptionPlanId = plan.Id,
                    Description = $"[Gói tháng] Lượt hội thoại AI: {levelConfig.Scenario.Title} ({levelConfig.JLPTLevel})",
                    CreatedAt = DateTime.UtcNow
                });
                // Không gọi UpdateAsync vì CreditBalance không thay đổi
            }
            else
            {
                // Không có gói tháng (hoặc đã vượt trần quota gói tháng và dùng CreditBalance dự phòng): trừ từ CreditBalance vĩnh viễn
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
                        CoveredBySubscription = false,
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
            CreditsSpentThisTurn = creditsSpentThisTurn
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
    /// Kiểm tra xem người dùng có gói tháng còn đủ hạn mức quota 5 giờ và 7 ngày cho số credit cần dùng hay không.
    /// Chỉ đếm các giao dịch Deduct thuộc gói tháng (CoveredBySubscription = true hoặc Description bắt đầu bằng "[Gói tháng]").
    /// </summary>
    private async Task<(bool Available, string ErrorMessage)> CheckSubscriptionQuotaAvailableAsync(
        ApplicationUser user,
        int requiredCredits,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var fiveHoursAgo = now.AddHours(-5);
        var sevenDaysAgo = now.AddDays(-7);

        var plan = SubscriptionPlanCatalog.FindOrDefault(user.SubscriptionPlanId);

        var subDeductQuery = _dbContext.CreditTransactions
            .AsNoTracking()
            .Where(t => t.UserId == user.Id
                && t.Type == "Deduct"
                && (t.CoveredBySubscription || (t.Description != null && t.Description.StartsWith("[Gói tháng]"))));

        var used5h = await subDeductQuery
            .Where(t => t.CreatedAt >= fiveHoursAgo)
            .SumAsync(t => -t.Amount, cancellationToken);

        if (used5h + requiredCredits > plan.FiveHourQuota)
        {
            return (false, $"Bạn đã sử dụng hết hạn ngạch 5 giờ ({used5h}/{plan.FiveHourQuota} credits) của {plan.Name}. Vui lòng chờ hạn ngạch hồi phục hoặc nạp thêm credit dự phòng.");
        }

        var usedWeek = await subDeductQuery
            .Where(t => t.CreatedAt >= sevenDaysAgo)
            .SumAsync(t => -t.Amount, cancellationToken);

        if (usedWeek + requiredCredits > plan.WeeklyQuota)
        {
            return (false, $"Bạn đã sử dụng hết hạn ngạch tuần ({usedWeek}/{plan.WeeklyQuota} credits) của {plan.Name}. Vui lòng chờ hạn ngạch hồi phục hoặc nạp thêm credit dự phòng.");
        }

        return (true, string.Empty);
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

