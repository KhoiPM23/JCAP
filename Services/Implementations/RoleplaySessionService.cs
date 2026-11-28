using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Roleplay;
using JCAP.DTOs.Scenario;
using JCAP.Models;
using JCAP.Services.Interfaces;
using JCAP.Services.Subscriptions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace JCAP.Services.Implementations;

public partial class RoleplaySessionService : IRoleplaySessionService
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> UserTurnLocks = new();
    private readonly AppDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IAiRoleplayService _aiRoleplayService;
    private readonly ILogger<RoleplaySessionService> _logger;
    private readonly IVietnameseLearnerErrorDetector _errorDetector;
    private readonly ITelemetryEvaluatorService _telemetryEvaluator;
    private readonly IPersonaMemoryService _personaMemory;
    private readonly IEpisodicFactExtractor _factExtractor;
    private readonly IVoiceVoxService? _voiceVoxService;
    private readonly IRegisterAnalyzer _registerAnalyzer;
    private readonly IEventDirector _eventDirector;
    private readonly IPhonemeRecognizer? _phonemeRecognizer;
    private readonly IWebHostEnvironment? _webHostEnvironment;
    private readonly IAdaptiveProfileService? _adaptiveProfileService;

    private async Task<bool> IsAdminUserAsync(ApplicationUser user)
    {
        if (string.Equals(user.Role, "Admin", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        try
        {
            var roles = await _userManager.GetRolesAsync(user);
            return roles != null && roles.Any(r => string.Equals(r, "Admin", StringComparison.OrdinalIgnoreCase));
        }
        catch
        {
            return false;
        }
    }

    private async Task<int> ComputeDayStreakAsync(string userId, CancellationToken cancellationToken)
    {
        var tz = TimeSpan.FromHours(7);
        var since = DateTime.UtcNow.AddDays(-60);
        var dates = await _dbContext.RoleplayResults
            .AsNoTracking()
            .Where(r => r.UserId == userId && r.CompletedAt >= since)
            .Select(r => r.CompletedAt)
            .ToListAsync(cancellationToken);

        var days = dates.Select(d => (d + tz).Date).ToHashSet();
        var today = (DateTime.UtcNow + tz).Date;
        var cursor = days.Contains(today) ? today : today.AddDays(-1);
        var streak = 0;
        while (days.Contains(cursor)) { streak++; cursor = cursor.AddDays(-1); }
        return streak;
    }
    public RoleplaySessionService(
        AppDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        IAiRoleplayService aiRoleplayService,
        ILogger<RoleplaySessionService> logger,
        IVietnameseLearnerErrorDetector errorDetector,
        ITelemetryEvaluatorService telemetryEvaluator,
        IPersonaMemoryService personaMemory,
        IEpisodicFactExtractor? factExtractor = null,
        IVoiceVoxService? voiceVoxService = null,
        IRegisterAnalyzer? registerAnalyzer = null,
        IEventDirector? eventDirector = null,
        IPhonemeRecognizer? phonemeRecognizer = null,
        IWebHostEnvironment? webHostEnvironment = null,
        IAdaptiveProfileService? adaptiveProfileService = null)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _aiRoleplayService = aiRoleplayService;
        _logger = logger;
        _errorDetector = errorDetector;
        _telemetryEvaluator = telemetryEvaluator;
        _personaMemory = personaMemory;
        _factExtractor = factExtractor ?? new EpisodicFactExtractor();
        _voiceVoxService = voiceVoxService;
        _registerAnalyzer = registerAnalyzer ?? new RegisterAnalyzer();
        _eventDirector = eventDirector ?? new EventDirector();
        _phonemeRecognizer = phonemeRecognizer;
        _webHostEnvironment = webHostEnvironment;
        _adaptiveProfileService = adaptiveProfileService;
    }

    public async Task<ApiResponse<ActiveRoleplaySessionDto?>> GetActiveSessionAsync(
        string userId,
        int scenarioId,
        CancellationToken cancellationToken = default)
    {
        var activeSession = await _dbContext.RoleplaySessions
            .AsNoTracking()
            .AsSplitQuery()
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.Scenario)
            .Include(s => s.SessionMissions)
            .Include(s => s.Messages)
            .Where(s => s.UserId == userId && s.SessionType != "PlacementTest" && s.Status == "Active" && s.ScenarioLevelConfiguration!.ScenarioId == scenarioId)
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
            .Where(s => s.UserId == userId && s.SessionType != "PlacementTest" && s.Status == "Active" && s.ScenarioLevelConfiguration!.ScenarioId == scenarioId)
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

        var isAdmin = await IsAdminUserAsync(user);

        // Kiểm tra người dùng có gói tháng đang hoạt động không
        bool hasActiveSub = !isAdmin
            && user.SubscriptionExpiresAt.HasValue
            && user.SubscriptionExpiresAt.Value > DateTime.UtcNow;

        // Bỏ trừ 5 credit khi bắt đầu vào học: Bắt đầu phiên thoại hoàn toàn miễn phí (0 credit)
        int creditDeducted = 0;
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

        // AI luôn là người chủ động nói câu mở đầu (kèm lời chào thích ứng theo quan hệ / thời gian / hồ sơ năng lực nếu có)
        string npcCode = ResolveNpcCode(levelConfig.Scenario.ScenarioCode, levelConfig.Scenario.Id, levelConfig.Id);
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

        // Nạp tối đa 2 ký ức liên phiên gần nhất + tóm tắt điểm yếu hồ sơ năng lực (nếu đã từng luyện tập)
        string? memoryContext = null;
        try
        {
            var memoryParts = new List<string>();
            var recentMemories = await _dbContext.LearnerMemories
                .AsNoTracking()
                .Where(lm => lm.UserId == userId)
                .OrderByDescending(lm => lm.LastConfirmedAtUtc)
                .Take(2)
                .ToListAsync(cancellationToken);

            if (recentMemories.Count > 0)
            {
                memoryParts.AddRange(recentMemories.Select(m => $"{m.Key}={m.Value}"));
            }

            var existingProfile = await _dbContext.LearnerIntelligenceProfiles
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == userId, cancellationToken);
            if (existingProfile != null)
            {
                var profileFocus = BuildProfileAdaptationSummary(existingProfile);
                if (!string.IsNullOrWhiteSpace(profileFocus))
                {
                    memoryParts.Add(profileFocus);
                }
            }

            if (memoryParts.Count > 0)
            {
                memoryContext = string.Join("; ", memoryParts);
            }

            // Cập nhật số lần gặp gỡ trong CharacterMemory
            var charMem = await _dbContext.CharacterMemories
                .FirstOrDefaultAsync(cm => cm.UserId == userId && cm.CharacterPersonaKey == npcCode, cancellationToken);
            if (charMem == null)
            {
                _dbContext.CharacterMemories.Add(new CharacterMemory
                {
                    UserId = userId,
                    CharacterPersonaKey = npcCode,
                    EncounterCount = 1,
                    AffinityScore = 0,
                    LastMetAtUtc = DateTime.UtcNow
                });
            }
            else
            {
                charMem.EncounterCount++;
                charMem.LastMetAtUtc = DateTime.UtcNow;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Không thể nạp hoặc cập nhật ký ức liên phiên cho người dùng {UserId}", userId);
        }

        // Giới hạn tối đa 1.2s chờ AI sinh lời mở đầu để phòng thoại mở nhanh (< 1.5s); fallback tức thì nếu chậm
        using var openingCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        openingCts.CancelAfter(TimeSpan.FromMilliseconds(1200));
        try
        {
            if (!string.IsNullOrWhiteSpace(circadianGreeting) || !string.IsNullOrWhiteSpace(memoryContext))
            {
                opening = await _aiRoleplayService.GenerateOpeningMessageAsync(levelConfig.Scenario, levelConfig, circadianGreeting, memoryContext, openingCts.Token);
            }
            else
            {
                opening = await _aiRoleplayService.GenerateOpeningMessageAsync(levelConfig.Scenario, levelConfig, openingCts.Token);
            }
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogInformation("AI opening vượt quá 1200ms khi tạo phòng {ScenarioId}, dùng mẫu mở đầu tức thì.", scenarioId);
            opening = null;
        }
        if (opening == null)
        {
            opening = RoleplaySocialRegister.GenerateOpeningMessage(levelConfig.Scenario, levelConfig);
        }

        var sanitizedOpeningJa = RoleplaySocialRegister.SanitizeJapaneseReply(opening.JapaneseText);
        var sanitizedOpeningFurigana = RoleplaySocialRegister.EnsureFuriganaParity(opening.FuriganaHtml, sanitizedOpeningJa);

        var aiOpeningMessage = new RoleplayMessage
        {
            RoleplaySessionId = newSession.Id,
            Sender = "Ai",
            JapaneseText = sanitizedOpeningJa,
            VietnameseMeaning = opening.VietnameseMeaning,
            FuriganaHtml = sanitizedOpeningFurigana,
            CreatedAt = DateTime.UtcNow
        };
        _dbContext.RoleplayMessages.Add(aiOpeningMessage);

        await _dbContext.SaveChangesAsync(cancellationToken);

        // Pre-Synthesis Pipeline: Nạp sẵn giọng nói VOICEVOX vào RAM Cache server (0ms latency khi client gọi)
        if (_voiceVoxService != null && !string.IsNullOrWhiteSpace(sanitizedOpeningJa))
        {
            var preSpeakerId = VoiceVoxPersonaResolver.Resolve(
                levelConfig.AiPersona,
                levelConfig.Scenario?.Title,
                levelConfig.Description,
                levelConfig.JLPTLevel).RecommendedAiVoiceId;
            _ = Task.Run(async () =>
            {
                try
                {
                    await _voiceVoxService.SynthesizeAsync(sanitizedOpeningJa, preSpeakerId, CancellationToken.None);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug("Backend Pre-synthesis opening message: {Msg}", ex.Message);
                }
            });
        }

        return await GetSessionDetailsAsync(userId, newSession.Id, cancellationToken);
    }

    public async Task<ApiResponse<RoleplaySessionDetailsDto>> GetSessionDetailsAsync(
        string userId,
        int sessionId,
        CancellationToken cancellationToken = default)
    {
        var session = await _dbContext.RoleplaySessions
            .AsNoTracking()
            .AsSplitQuery()
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.Scenario)
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.TargetVocabularies)
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.TargetGrammars)
            .Include(s => s.SessionMissions)
                .ThenInclude(sm => sm.Mission)
            .Include(s => s.Messages)
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.SessionType != "PlacementTest", cancellationToken);

        if (session == null)
        {
            return ApiResponse<RoleplaySessionDetailsDto>.Fail("Không tìm thấy phiên luyện tập.");
        }

        if (session.UserId != userId)
        {
            return ApiResponse<RoleplaySessionDetailsDto>.Fail("Bạn không có quyền truy cập vào phiên luyện tập này.");
        }

        var user = await _userManager.FindByIdAsync(userId);
        bool isAdmin = user != null && await IsAdminUserAsync(user);
        bool hasActiveSubscription = !isAdmin && user != null
            && user.SubscriptionExpiresAt.HasValue
            && user.SubscriptionExpiresAt.Value > DateTime.UtcNow;

        var (remainingQuota, isQuotaExhausted, creditWarningMessage) =
            await EvaluateCreditAndQuotaStatusAsync(user, isAdmin, hasActiveSubscription, cancellationToken);

        int? completedResultId = null;
        if (string.Equals(session.Status, "Completed", StringComparison.OrdinalIgnoreCase))
        {
            completedResultId = await _dbContext.RoleplayResults
                .AsNoTracking()
                .Where(r => r.RoleplaySessionId == session.Id && r.UserId == session.UserId)
                .OrderByDescending(r => r.CompletedAt)
                .ThenByDescending(r => r.Id)
                .Select(r => (int?)r.Id)
                .FirstOrDefaultAsync(cancellationToken);
        }

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
            HasActiveSubscription = hasActiveSubscription,
            RemainingSubscriptionQuota = remainingQuota,
            IsSubscriptionQuotaExhausted = isQuotaExhausted,
            CreditWarningMessage = creditWarningMessage,
            ResultId = completedResultId,
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

        dto.SceneType = ResolveSceneType(
            session.ScenarioLevelConfiguration?.Scenario?.ScenarioCode,
            session.ScenarioLevelConfiguration?.Title,
            session.ScenarioLevelConfiguration?.AiPersona);

        var npcCode = ResolveNpcCode(
            session.ScenarioLevelConfiguration?.Scenario?.ScenarioCode,
            session.ScenarioLevelConfiguration?.ScenarioId ?? 0,
            session.ScenarioLevelConfigurationId);

        dto.CurrentDayStreak = await ComputeDayStreakAsync(session.UserId, cancellationToken);

        dto.TotalHintTurnsUsed = await _dbContext.LearnerBehaviorSignals
            .AsNoTracking()
            .CountAsync(s => s.SessionId == session.Id && s.HintLevelUsed > 0, cancellationToken);

        dto.TotalTranslationPeeksUsed = await _dbContext.LearnerBehaviorSignals
            .AsNoTracking()
            .CountAsync(s => s.SessionId == session.Id && s.TranslationPeekCount > 0, cancellationToken);

        try
        {
            var rel = await _dbContext.UserNpcRelationships
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.UserId == session.UserId && r.NpcCode == npcCode, cancellationToken);

            if (rel != null)
            {
                dto.NpcAffinityScore = rel.AffinityScore;
                var reg = RoleplaySocialRegister.Deduce(
                    session.ScenarioLevelConfiguration?.Scenario?.Title,
                    session.ScenarioLevelConfiguration?.AiPersona,
                    session.ScenarioLevelConfiguration?.Description);
                dto.NpcRelationshipTitle = RoleplaySocialRegister.GetContextualRelationshipTitle(reg.RegisterType, rel.AffinityScore);
                if (!string.IsNullOrWhiteSpace(rel.MemoryCapsuleJson))
                {
                    dto.NpcMemories = JsonSerializer.Deserialize<List<string>>(rel.MemoryCapsuleJson) ?? [];
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Không thể nạp thông tin UserNpcRelationship cho phiên {SessionId}", sessionId);
        }

        return ApiResponse<RoleplaySessionDetailsDto>.Ok(dto);
    }
}
