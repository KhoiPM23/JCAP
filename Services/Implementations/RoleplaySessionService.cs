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
            .Include(c => c.Missions)
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
            if (!request.ForceRestart)
            {
                // Người dùng muốn tiếp tục phiên dở dang -> Trả về phiên hiện tại (không trừ credit)
                return await GetSessionDetailsAsync(userId, existingActiveSession.Id, cancellationToken);
            }

            // Người dùng chọn bắt đầu lại mới -> Đánh dấu phiên cũ là Abandoned (không hoàn credit cũ)
            existingActiveSession.Status = "Abandoned";
            existingActiveSession.UpdatedAt = DateTime.UtcNow;
            _logger.LogInformation("Người dùng {UserId} hủy phiên dở dang {SessionId} để tạo phiên mới.", userId, existingActiveSession.Id);
        }

        // Kiểm tra số dư Credit
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null)
        {
            return ApiResponse<RoleplaySessionDetailsDto>.Fail("Không tìm thấy thông tin tài khoản người dùng.");
        }

        if (user.CreditBalance < levelConfig.CreditCost)
        {
            return ApiResponse<RoleplaySessionDetailsDto>.Fail(
                $"Số dư credit của bạn không đủ ({user.CreditBalance}/{levelConfig.CreditCost} credits). Vui lòng nạp thêm credit để bắt đầu luyện tập.");
        }

        // Khấu trừ Credit theo Model A (Cố định theo phiên)
        user.CreditBalance -= levelConfig.CreditCost;

        var transaction = new CreditTransaction
        {
            UserId = userId,
            Amount = -levelConfig.CreditCost,
            Type = "Deduct",
            Status = "Paid",
            Description = $"Luyện tập hội thoại: {levelConfig.Scenario.Title} ({levelConfig.JLPTLevel})",
            CreatedAt = DateTime.UtcNow
        };
        _dbContext.CreditTransactions.Add(transaction);

        // Tạo RoleplaySession mới
        var newSession = new RoleplaySession
        {
            UserId = userId,
            ScenarioLevelConfigurationId = levelConfig.Id,
            Status = "Active",
            CreditDeducted = levelConfig.CreditCost,
            IsNaturallyConcluded = false,
            CreatedAt = DateTime.UtcNow
        };
        _dbContext.RoleplaySessions.Add(newSession);
        await _dbContext.SaveChangesAsync(cancellationToken);

        // Khởi tạo các Mission cho phiên
        foreach (var mission in levelConfig.Missions.OrderBy(m => m.Order))
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

        // 5. Cập nhật các mission vừa hoàn thành
        var newlyCompletedIds = new List<int>();
        foreach (var missionId in turnResult.CompletedMissionIds)
        {
            var sm = session.SessionMissions.FirstOrDefault(x => x.MissionId == missionId && !x.IsCompleted);
            if (sm != null)
            {
                sm.IsCompleted = true;
                sm.CompletedAt = DateTime.UtcNow;
                newlyCompletedIds.Add(missionId);
            }
        }

        // 6. Cập nhật đánh giá ngôn ngữ và cờ kết thúc tự nhiên
        if (turnResult.LinguisticFeedback != null)
        {
            userMessage.LinguisticFeedbackJson = System.Text.Json.JsonSerializer.Serialize(turnResult.LinguisticFeedback, JsonOptions);
        }

        if (turnResult.IsNaturallyConcluded)
        {
            session.IsNaturallyConcluded = true;
        }

        session.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        // 7. Tạo response trả về cho frontend
        var responseDto = new RoleplayTurnResponseDto
        {
            UserMessage = new RoleplayMessageDto
            {
                Id = userMessage.Id,
                Sender = userMessage.Sender,
                JapaneseText = userMessage.JapaneseText,
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
            CreditBalance = (await _userManager.FindByIdAsync(userId))?.CreditBalance ?? 0
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
}
