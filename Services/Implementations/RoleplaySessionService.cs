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

public class RoleplaySessionService : IRoleplaySessionService
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

        if (string.IsNullOrWhiteSpace(userId))
        {
            return ApiResponse<RoleplayTurnResponseDto>.Fail("Thông tin người dùng không hợp lệ.");
        }

        var userLock = UserTurnLocks.GetOrAdd(userId, _ => new SemaphoreSlim(1, 1));
        await userLock.WaitAsync(cancellationToken);
        try
        {
        var session = await _dbContext.RoleplaySessions
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

        // Kiểm tra hạn mức Quota (nếu dùng gói tháng) và số dư Credit trước khi xử lý AI
        var userForDeduct = await _userManager.FindByIdAsync(userId);
        if (userForDeduct == null)
        {
            return ApiResponse<RoleplayTurnResponseDto>.Fail("Không tìm thấy thông tin tài khoản người dùng.");
        }

        var isAdmin = await IsAdminUserAsync(userForDeduct);

        bool hasActiveSubscription = !isAdmin
            && userForDeduct.SubscriptionExpiresAt.HasValue
            && userForDeduct.SubscriptionExpiresAt.Value > DateTime.UtcNow;

        bool canUseSubQuota = false;
        if (!isAdmin)
        {
            if (hasActiveSubscription)
            {
                var (quotaOk, quotaErr) = await CheckSubscriptionQuotaAvailableAsync(userForDeduct, 1, cancellationToken);
                if (quotaOk)
                {
                    canUseSubQuota = true;
                }
                else if (userForDeduct.CreditBalance <= 0)
                {
                    _logger.LogWarning("User {UserId} hết hạn ngạch gói tháng và số dư credit bằng 0.", userId);
                    return ApiResponse<RoleplayTurnResponseDto>.Fail(quotaErr);
                }
            }
            else if (userForDeduct.CreditBalance <= 0)
            {
                _logger.LogWarning("User {UserId} gửi tin nhắn nhưng số dư credit bằng 0. Đã chặn lượt nói.", userId);
                return ApiResponse<RoleplayTurnResponseDto>.Fail(
                    "Số dư credit của bạn không đủ để tiếp tục lượt nói. Vui lòng nạp thêm để tiếp tục kịch bản.");
            }
        }

        // 1. Tạo tin nhắn học viên trong bộ nhớ (chỉ lưu DB cùng AI reply trong transaction sau khi AI thành công)
        var userMessageText = request.Message.Trim();
        var userMessage = new RoleplayMessage
        {
            RoleplaySessionId = sessionId,
            Sender = "User",
            JapaneseText = userMessageText,
            CreatedAt = DateTime.UtcNow
        };

        // 2. Lấy danh sách nhiệm vụ CHƯA hoàn thành
        var pendingMissions = session.SessionMissions
            .Where(sm => !sm.IsCompleted && sm.Mission != null)
            .Select(sm => sm.Mission!)
            .ToList();

        // 2b. Quét lỗi chuyển dịch tiếng Nhật E01-E10 và đánh giá Telemetry (chưa persist DB trước khi AI thành công)
        var detectedIssues = _errorDetector.DetectErrors(userMessageText);
        var existingUserMessages = session.Messages
            .Where(m => m.Sender == "User")
            .OrderBy(m => m.CreatedAt)
            .ThenBy(m => m.Id)
            .ToList();
        var turnIndex = existingUserMessages.Count + 1;
        bool isVerifiedVoiceInput = !request.FallbackToTextInput
            && request.SpeechConfidence.HasValue
            && request.SpeechConfidence.Value > 0;

        int recordedLatencyMs = request.ResponseLatencySeconds.HasValue && request.ResponseLatencySeconds.Value > 0
            ? (int)Math.Round(Math.Clamp(request.ResponseLatencySeconds.Value, 0.3, 30.0) * 1000.0)
            : 0;

        double recordedMoraRate = 0.0;
        if (isVerifiedVoiceInput)
        {
            if (request.MoraRate is > 0)
            {
                recordedMoraRate = Math.Round(request.MoraRate.Value, 1);
            }
            else
            {
                int initialMoraCount = ComputeMoraCount(userMessageText);
                double? wavMoraRate = TryAnalyzeWavMoraRate(request.AudioUrl, initialMoraCount);
                if (wavMoraRate.HasValue)
                {
                    recordedMoraRate = wavMoraRate.Value;
                }
                else if (request.SpeakingDurationSeconds is > 0.1 && initialMoraCount > 0)
                {
                    recordedMoraRate = Math.Round(initialMoraCount / request.SpeakingDurationSeconds.Value, 1);
                }
            }
        }

        var telemetryInput = new TurnTelemetryInput
        {
            SessionId = sessionId,
            UserId = userId,
            TurnIndex = turnIndex,
            LatencyMs = recordedLatencyMs,
            PauseRatio = request.PauseRatio ?? 0.0,
            MoraRate = recordedMoraRate,
            HintLevelUsed = request.HintLevelUsed,
            TranslationPeekCount = request.TranslationPeekCount,
            RetryCount = request.RetryCount,
            FallbackToTextInput = request.FallbackToTextInput,
            BargeInInterrupted = request.BargeInInterrupted,
            JapaneseSpoken = userMessageText,
            TurnScore = 0.0,
            DeferPersistence = true
        };
        var ddaDecision = await _telemetryEvaluator.RecordAndEvaluateTurnAsync(telemetryInput);

        string npcCode = ResolveNpcCode(levelConfig.Scenario.ScenarioCode, levelConfig.Scenario.Id, levelConfig.Id);

        // 2c. Pre-flight Guard: Nếu học viên nói tiếng Việt hoặc tiếng Anh không có chữ Nhật nào
        // Xử lý tất định tức thì trong 2ms, tiết kiệm 100% token LLM và phản hồi nhập vai đúng Persona
        AiTurnResult? turnResult = null;
        if (RoleplaySocialRegister.IsPureForeignOrVietnamese(userMessageText))
        {
            _logger.LogInformation("Người dùng {UserId} nói ngoại ngữ/tiếng Việt, kích hoạt Pre-flight Guard tất định 0 token.", userId);
            turnResult = RoleplaySocialRegister.ProcessForeignLanguageTurn(levelConfig.Scenario, levelConfig, userMessageText);
        }

        // 2c-bis. Whisper Low Confidence Guard (< 0.35):
        // Chỉ chặn âm thanh nhiễu / không nghe được; ngưỡng 0.50-0.60 với tiếng Nhật người học vẫn cho đi tiếp bình thường
        if (turnResult == null && request.SpeechConfidence.HasValue && request.SpeechConfidence.Value < 0.35 && !string.IsNullOrWhiteSpace(userMessageText))
        {
            var jlptForGuard = (levelConfig.JLPTLevel ?? "N5").Trim().ToUpperInvariant();
            var askBackJa = jlptForGuard switch
            {
                "N5" => "すみません、よく聞こえませんでした。もう一度お願いします。",
                "N4" => "すみません、少し聞き取れませんでした。もう一度お願いします。",
                _ => "恐れ入りますが、少し聞き取れませんでした。もう一度よろしいでしょうか？"
            };
            var reg = RoleplaySocialRegister.Deduce(levelConfig.Scenario?.Title, levelConfig.AiPersona, levelConfig.Description);
            var askBackVi = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiSelf} nghe chưa rõ. {reg.AiAddressLearner} có thể nói lại một lần nữa được không ạ?";
            turnResult = new AiTurnResult
            {
                JapaneseReply = askBackJa,
                FuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(askBackJa),
                VietnameseMeaning = askBackVi,
                UserVietnameseMeaning = userMessageText,
                UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userMessageText),
                CompletedMissionIds = new List<int>(),
                IsNaturallyConcluded = false,
                LinguisticFeedback = new LinguisticFeedbackDto
                {
                    Status = "Warning",
                    Summary = "Âm thanh chưa rõ · Hãy thử nói to và rõ hơn",
                    EvaluationSource = "AcousticConfidenceGuard",
                    Details = new List<LinguisticDetailItemDto>
                    {
                        new()
                        {
                            Type = "warning",
                            Aspect = "Độ rõ giọng nói",
                            Comment = "Hệ thống ghi nhận âm thanh còn nhỏ hoặc lẫn tạp âm. Bạn hãy giữ micro gần hơn và nói rõ từng âm nhé."
                        }
                    }
                }
            };
        }

        // 2d. Trích xuất ký ức cá nhân học viên (Episodic Facts Extraction)
        try
        {
            var extractedFact = _factExtractor.ExtractFact(userMessageText);
            if (!string.IsNullOrWhiteSpace(extractedFact))
            {
                await _personaMemory.RecordSessionAffinityAsync(userId, npcCode, false, extractedFact);
                _logger.LogInformation("Đã ghi nhận ký ức học viên {UserId} với NPC {NpcCode}: {Fact}", userId, npcCode, extractedFact);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Không thể trích xuất episodic fact cho người dùng {UserId}", userId);
        }

        string? compactMemory = null;
        try
        {
            compactMemory = await _personaMemory.GetCompactMemoryDirectiveAsync(userId, npcCode);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Không thể lấy persona memory directive cho người dùng {UserId}", userId);
        }

        // 3. Kết hợp tối đa 3 chỉ thị gọn nhẹ để tránh bão chỉ thị làm loãng vai AI và cấp độ JLPT
        var priorityDirectives = new List<string>(3);
        var jlptLevelUpper = (levelConfig.JLPTLevel ?? "N5").Trim().ToUpperInvariant();
        bool isN5Level = jlptLevelUpper == "N5";

        // 3b. Phân tích Kính ngữ / Thể văn tất định bằng RegisterAnalyzer
        var regAnalysis = _registerAnalyzer.Analyze(userMessageText, levelConfig.ExpectedLearnerRegister);

        // 3c. EventDirector: Đánh giá kích hoạt biến cố rẽ nhánh sư phạm phù hợp ngữ cảnh kịch bản
        var userTurnCount = existingUserMessages.Count + 1;
        var previousUserMessages = existingUserMessages;

        int totalEventsTriggeredSoFar = 0;
        int turnsSinceLastEvent = 99;

        for (int i = 0; i < previousUserMessages.Count; i++)
        {
            var prevMsg = previousUserMessages[i];
            if (!string.IsNullOrEmpty(prevMsg.LinguisticFeedbackJson))
            {
                try
                {
                    using var doc = JsonDocument.Parse(prevMsg.LinguisticFeedbackJson);
                    if (doc.RootElement.TryGetProperty("activeBranchingEventCode", out var codeProp) &&
                        !string.IsNullOrWhiteSpace(codeProp.GetString()))
                    {
                        totalEventsTriggeredSoFar++;
                        turnsSinceLastEvent = userTurnCount - (i + 1);
                    }
                }
                catch {}
            }
        }

        var scenarioEventContext = $"{levelConfig.Scenario?.Title} {levelConfig.Title} {levelConfig.AiPersona} {levelConfig.Description}";
        var eventDecision = _eventDirector.EvaluateEventTrigger(
            levelConfig.JLPTLevel ?? "N5",
            userTurnCount,
            turnsSinceLastEvent,
            totalEventsTriggeredSoFar,
            remainingMissionsCount: pendingMissions.Count,
            compatibleEventsJson: levelConfig.CompatibleEventsJson,
            lastUserUtterance: userMessageText,
            scenarioContext: scenarioEventContext);

        string? activeEventCode = null;
        if (eventDecision.ShouldTriggerEvent && eventDecision.TriggeredEvent != null)
        {
            activeEventCode = eventDecision.EventCode;
            if (!string.IsNullOrWhiteSpace(eventDecision.DirectiveForAiPrompt))
            {
                priorityDirectives.Add(eventDecision.DirectiveForAiPrompt);
            }
        }

        // Priority 2: Survival phrase / Register directive (tối đa 1)
        if (regAnalysis.IsSurvivalPhrase)
        {
            priorityDirectives.Add("[SURVIVAL PHRASE DIRECTIVE: Học viên chủ động dùng cụm từ sinh tồn (nhờ nhắc lại/nói chậm). Hãy nói chậm rãi, khích lệ và nhắc lại nội dung quan trọng.]");
        }
        else if (!regAnalysis.IsMatch && regAnalysis.SumiInkIndicatorType != null)
        {
            priorityDirectives.Add($"[REGISTER DIRECTIVE: Học viên dùng thể {regAnalysis.DetectedRegister} trong khi bối cảnh yêu cầu {regAnalysis.ExpectedRegister}. Phản xạ tự nhiên và khéo léo giữ đúng vai.]");
        }

        // Cập nhật nhịp độ phát âm & Fail-streak / DDA (tối đa 1 chỉ thị, không bơm chỉ thị mở rộng câu khi đang ở N5)
        string? ddaOrSupportDirective = null;
        bool isDdaFastExpand = !string.IsNullOrWhiteSpace(ddaDecision.PromptModifier)
            && ddaDecision.PromptModifier.Contains("mở rộng chủ đề", StringComparison.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(ddaDecision.PromptModifier) && !(isN5Level && isDdaFastExpand))
        {
            ddaOrSupportDirective = ddaDecision.PromptModifier;
        }

        string? nextSessionCoachingFocus = null;
        try
        {
            var learnerProf = await _telemetryEvaluator.GetOrCreateProfileAsync(userId);
            if (learnerProf != null)
            {
                nextSessionCoachingFocus = AdaptiveProfileService.ExtractNextSessionFocus(learnerProf.InferredTraitsJson, jlptLevelUpper);

                if ((learnerProf.SpeakingReflexIndex < 55 || learnerProf.AverageMoraRate < 3.4) && ddaDecision.SpeedScale >= 1.0)
                {
                    ddaDecision.SpeedScale = 0.88;
                }

                var lastTwoPassedFlags = await (
                    from r in _dbContext.RoleplayResults.AsNoTracking()
                    join s in _dbContext.RoleplaySessions.AsNoTracking() on r.RoleplaySessionId equals s.Id into sj
                    from s in sj.DefaultIfEmpty()
                    where r.UserId == userId && (s == null || s.SessionType != "PlacementTest")
                    orderby r.CompletedAt descending, r.Id descending
                    select r.PassStatus)
                    .Take(2)
                    .ToListAsync(cancellationToken);

                if (lastTwoPassedFlags.Count >= 2 && lastTwoPassedFlags.All(p => !p))
                {
                    ddaOrSupportDirective ??= "[FAIL-STREAK SUPPORT: Học viên vừa chưa đạt 2 phiên gần nhất. Hãy giữ giọng ấm áp, câu ngắn dễ hiểu và khích lệ tự nhiên.]";
                    ddaDecision.SpeedScale = Math.Min(ddaDecision.SpeedScale, 0.88);
                }
            }
        }
        catch { }

        // Bơm Implicit Recast nếu còn slot (< 3)
        if (priorityDirectives.Count < 3 && detectedIssues.Count > 0)
        {
            var topErr = detectedIssues[0];
            priorityDirectives.Add($"[RECAST: Học viên vừa dùng sai {topErr.Code} ({topErr.Title}). Trong câu đối đáp, khéo léo dùng lại cấu trúc chuẩn tự nhiên để tái hiện.]");
        }
        else if (priorityDirectives.Count < 3 && !string.IsNullOrWhiteSpace(ddaOrSupportDirective))
        {
            priorityDirectives.Add(ddaOrSupportDirective);
        }

        // Bơm mục tiêu rèn riêng từ AI Coaching (nếu còn slot < 3, tuyệt đối giữ vai và cấp độ JLPT)
        if (priorityDirectives.Count < 3 && !string.IsNullOrWhiteSpace(nextSessionCoachingFocus))
        {
            priorityDirectives.Add($"[ADAPTIVE COACHING FOCUS (giữ nguyên vai nhân vật & đúng cấp độ JLPT {jlptLevelUpper}): {nextSessionCoachingFocus}]");
        }

        // Chỉ giữ ký ức NPC ngắn gọn (1 dòng) nếu còn slot
        if (priorityDirectives.Count < 3 && !string.IsNullOrWhiteSpace(compactMemory))
        {
            var firstMemoryLine = compactMemory
                .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
                .FirstOrDefault()?.Trim();
            if (!string.IsNullOrWhiteSpace(firstMemoryLine))
            {
                priorityDirectives.Add(firstMemoryLine);
            }
        }

        var combinedDirective = priorityDirectives.Count > 0
            ? string.Join("\n", priorityDirectives.Take(3)).Trim()
            : null;

        // 4. Gọi AI phân tích và phản hồi nếu chưa xử lý bởi Pre-flight Guard (lịch sử sạch, chưa gồm userMessage hiện tại)
        if (levelConfig.Scenario == null)
            throw new InvalidOperationException($"Scenario not found for ScenarioId={levelConfig.ScenarioId}. Data integrity error.");

        var historyMessages = session.Messages
            .OrderBy(m => m.CreatedAt)
            .ThenBy(m => m.Id)
            .ToList();

        // Khởi chạy song song nhận dạng âm vị ONNX với lời gọi Gemini (độ trễ cộng thêm ~0ms)
        bool shouldRunPhonemeCheck = turnResult == null
            && !request.FallbackToTextInput
            && request.SpeechConfidence.HasValue
            && request.SpeechConfidence.Value >= 0.35
            && !string.IsNullOrWhiteSpace(request.AudioUrl)
            && _phonemeRecognizer?.IsAvailable == true;

        Task<PhonemeRecognitionResult?>? phonemeTask = shouldRunPhonemeCheck
            ? Task.Run(() => AnalyzeAudioPhonemesAsync(request.AudioUrl!, cancellationToken), cancellationToken)
            : null;

        if (turnResult == null && !string.IsNullOrWhiteSpace(combinedDirective))
        {
            turnResult = await _aiRoleplayService.ProcessTurnAsync(
                levelConfig.Scenario,
                levelConfig,
                historyMessages,
                userMessageText,
                pendingMissions,
                combinedDirective,
                cancellationToken);
        }
        if (turnResult == null)
        {
            turnResult = await _aiRoleplayService.ProcessTurnAsync(
                levelConfig.Scenario,
                levelConfig,
                historyMessages,
                userMessageText,
                pendingMissions,
                cancellationToken);
        }
        if (turnResult == null)
        {
            turnResult = RoleplaySocialRegister.ProcessGenericTurn(
                levelConfig.Scenario,
                levelConfig,
                userMessageText,
                pendingMissions);
        }

        // 4. Chuẩn hóa phản hồi của AI (Bảo đảm khử sạch 100% tiếng Việt bị rò rỉ vào câu thoại Nhật)
        var sanitizedJa = RoleplaySocialRegister.SanitizeJapaneseReply(turnResult.JapaneseReply);
        var sanitizedFurigana = RoleplaySocialRegister.EnsureFuriganaParity(turnResult.FuriganaHtml, sanitizedJa);

        // Backend Pre-Synthesis Pipeline: Kích hoạt tổng hợp âm thanh VOICEVOX song song ngay trong lúc lưu DB
        if (_voiceVoxService != null && !string.IsNullOrWhiteSpace(sanitizedJa))
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
                    await _voiceVoxService.SynthesizeAsync(sanitizedJa, preSpeakerId, CancellationToken.None);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug("Backend Pre-synthesis turn message: {Msg}", ex.Message);
                }
            });
        }

        var aiMessage = new RoleplayMessage
        {
            RoleplaySessionId = sessionId,
            Sender = "Ai",
            JapaneseText = sanitizedJa,
            VietnameseMeaning = turnResult.VietnameseMeaning,
            FuriganaHtml = sanitizedFurigana,
            CreatedAt = DateTime.UtcNow
        };

        int creditsSpentThisTurn = 0;
        var newlyCompletedIds = new List<int>();
        SumiInkFeedbackDto? sumiFeedback = null;

        var evalSource = turnResult.LinguisticFeedback?.EvaluationSource;
        bool isZeroTokenGuardTurn =
            string.Equals(evalSource, "PreFlightGuard", StringComparison.OrdinalIgnoreCase)
            || string.Equals(evalSource, "AcousticConfidenceGuard", StringComparison.OrdinalIgnoreCase)
            || string.Equals(evalSource, "Guardrail", StringComparison.OrdinalIgnoreCase);

        var useTransaction = _dbContext.Database.IsRelational();
        await using var dbTransaction = useTransaction
            ? await _dbContext.Database.BeginTransactionAsync(cancellationToken)
            : null;

        CreditTransaction? pendingCreditTransaction = null;

        void DetachPendingEntities()
        {
            if (_dbContext.Entry(userMessage).State == EntityState.Added)
                _dbContext.Entry(userMessage).State = EntityState.Detached;
            if (_dbContext.Entry(aiMessage).State == EntityState.Added)
                _dbContext.Entry(aiMessage).State = EntityState.Detached;
            if (telemetryInput.PendingSignal != null && _dbContext.Entry(telemetryInput.PendingSignal).State == EntityState.Added)
                _dbContext.Entry(telemetryInput.PendingSignal).State = EntityState.Detached;
            if (pendingCreditTransaction != null && _dbContext.Entry(pendingCreditTransaction).State == EntityState.Added)
                _dbContext.Entry(pendingCreditTransaction).State = EntityState.Detached;
        }

        try
        {
            _dbContext.RoleplayMessages.Add(userMessage);
            _dbContext.RoleplayMessages.Add(aiMessage);
            var turnSignal = telemetryInput.PendingSignal;
            if (turnSignal != null)
            {
                _dbContext.LearnerBehaviorSignals.Add(turnSignal);
            }

            // 4b. Trừ credit theo công thức 3 thành phần (tối thiểu 1, tối đa 4 credit/lượt).
            // Admin và các lượt Pre-flight Guard 0-token LLM không bị trừ credit.
            if (!isAdmin && !isZeroTokenGuardTurn)
            {
                int creditsDue = EstimateCreditCost(userMessageText, turnResult.JapaneseReply, userTurnCount);

                if (canUseSubQuota)
                {
                    var plan = SubscriptionPlanCatalog.FindOrDefault(userForDeduct.SubscriptionPlanId);
                    creditsSpentThisTurn = creditsDue;
                    pendingCreditTransaction = new CreditTransaction
                    {
                        UserId = userId,
                        Amount = -creditsDue,
                        Type = "Deduct",
                        Status = "Paid",
                        CoveredBySubscription = true,
                        SubscriptionPlanId = plan.Id,
                        Description = $"[Gói tháng] Lượt hội thoại AI: {levelConfig.Scenario?.Title ?? "Kịch bản"} ({levelConfig.JLPTLevel})",
                        CreatedAt = DateTime.UtcNow
                    };
                    _dbContext.CreditTransactions.Add(pendingCreditTransaction);
                }
                else
                {
                    int? relationalFreshBalance = null;
                    if (useTransaction)
                    {
                        relationalFreshBalance = await _dbContext.Users
                            .AsNoTracking()
                            .Where(u => u.Id == userId)
                            .Select(u => (int?)u.CreditBalance)
                            .FirstOrDefaultAsync(cancellationToken);

                        if (relationalFreshBalance.HasValue)
                        {
                            userForDeduct.CreditBalance = relationalFreshBalance.Value;
                        }
                    }

                    if (userForDeduct.CreditBalance <= 0)
                    {
                        DetachPendingEntities();
                        if (dbTransaction != null)
                        {
                            await dbTransaction.RollbackAsync(cancellationToken);
                        }
                        return ApiResponse<RoleplayTurnResponseDto>.Fail(
                            "Số dư credit của bạn không đủ để tiếp tục lượt nói. Vui lòng nạp thêm để tiếp tục kịch bản.");
                    }

                    creditsSpentThisTurn = Math.Min(creditsDue, userForDeduct.CreditBalance);

                    if (useTransaction && relationalFreshBalance.HasValue)
                    {
                        int rowsAffected = await _dbContext.Users
                            .Where(u => u.Id == userId && u.CreditBalance >= creditsSpentThisTurn)
                            .ExecuteUpdateAsync(
                                setters => setters.SetProperty(u => u.CreditBalance, u => u.CreditBalance - creditsSpentThisTurn),
                                cancellationToken);

                        if (rowsAffected == 0)
                        {
                            DetachPendingEntities();
                            if (dbTransaction != null)
                            {
                                await dbTransaction.RollbackAsync(cancellationToken);
                            }
                            return ApiResponse<RoleplayTurnResponseDto>.Fail(
                                "Số dư credit của bạn không đủ hoặc đã thay đổi đồng thời. Vui lòng thử lại.");
                        }

                        var userEntry = _dbContext.Entry(userForDeduct);
                        if (userEntry.State != EntityState.Detached)
                        {
                            userEntry.Property(u => u.CreditBalance).IsModified = false;
                            await userEntry.ReloadAsync(cancellationToken);
                        }
                        else
                        {
                            userForDeduct.CreditBalance -= creditsSpentThisTurn;
                        }
                    }
                    else
                    {
                        userForDeduct.CreditBalance -= creditsSpentThisTurn;
                        var updateResult = await _userManager.UpdateAsync(userForDeduct);
                        if (updateResult is { Succeeded: false })
                        {
                            userForDeduct.CreditBalance += creditsSpentThisTurn;
                            DetachPendingEntities();
                            if (dbTransaction != null)
                            {
                                await dbTransaction.RollbackAsync(cancellationToken);
                            }
                            _logger.LogWarning(
                                "Cập nhật CreditBalance thất bại cho User {UserId}: {Errors}",
                                userId,
                                string.Join(", ", updateResult.Errors.Select(e => e.Description)));
                            return ApiResponse<RoleplayTurnResponseDto>.Fail(
                                "Không thể cập nhật số dư credit do xung đột đồng thời. Vui lòng thử lại.");
                        }
                    }

                    pendingCreditTransaction = new CreditTransaction
                    {
                        UserId = userId,
                        Amount = -creditsSpentThisTurn,
                        Type = "Deduct",
                        Status = "Paid",
                        CoveredBySubscription = false,
                        Description = $"Lượt hội thoại AI: {levelConfig.Scenario?.Title ?? "Kịch bản"} ({levelConfig.JLPTLevel})",
                        CreatedAt = DateTime.UtcNow
                    };
                    _dbContext.CreditTransactions.Add(pendingCreditTransaction);
                }
            }

            // 5. Cập nhật các mission vừa hoàn thành (có kiểm tra thứ tự logic hội thoại)
            var maxOrder = session.SessionMissions.Count > 0
                ? session.SessionMissions.Max(x => x.Mission?.Order ?? 0)
                : 0;
            var orderedCompletedIds = turnResult.CompletedMissionIds
                .OrderBy(id => session.SessionMissions.FirstOrDefault(x => x.MissionId == id)?.Mission?.Order ?? int.MaxValue)
                .ToList();

            foreach (var missionId in orderedCompletedIds)
            {
                var sm = session.SessionMissions.FirstOrDefault(x => x.MissionId == missionId && !x.IsCompleted);
                if (sm != null)
                {
                    var missionOrder = sm.Mission?.Order ?? 0;
                    static bool IsClosingMissionItem(Mission? m)
                    {
                        var mc = (m?.Content ?? "") + " " + (m?.CompletionCriteriaJson ?? "");
                        return mc.Contains("cảm ơn", StringComparison.OrdinalIgnoreCase) ||
                               mc.Contains("ra về", StringComparison.OrdinalIgnoreCase) ||
                               mc.Contains("tạm biệt", StringComparison.OrdinalIgnoreCase) ||
                               mc.Contains("kết thúc", StringComparison.OrdinalIgnoreCase);
                    }

                    bool isClosingMission = IsClosingMissionItem(sm.Mission);
                    bool userSaidExplicitDeparture = System.Text.RegularExpressions.Regex.IsMatch(
                        userMessageText,
                        @"(ごちそうさま|ご馳走様|失礼|お会計|勘定|さようなら|また来ます)");
                    var hasEarlierNonClosingPending = session.SessionMissions.Any(x =>
                        !x.IsCompleted && (x.Mission?.Order ?? 0) < missionOrder && !IsClosingMissionItem(x.Mission));
                    var hasEarlierPending = session.SessionMissions.Any(x => !x.IsCompleted && (x.Mission?.Order ?? 0) < missionOrder);

                    // Không cho phép tick sớm nhiệm vụ kết thúc nếu các nhiệm vụ chính trước đó vẫn chưa hoàn thành
                    if (missionOrder == maxOrder && maxOrder > 1 && hasEarlierPending &&
                        !(isClosingMission && userSaidExplicitDeparture && !hasEarlierNonClosingPending))
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

            var resolvedUserFuri = RoleplaySocialRegister.EnsureFuriganaParity(
                turnResult.UserFuriganaHtml,
                userMessageText);
            if (string.IsNullOrWhiteSpace(resolvedUserFuri) || !resolvedUserFuri.Contains("<ruby>", StringComparison.OrdinalIgnoreCase))
            {
                var genFuri = RoleplaySocialRegister.GenerateFuriganaHtml(userMessageText);
                if (!string.IsNullOrWhiteSpace(genFuri) && genFuri.Contains("<ruby>", StringComparison.OrdinalIgnoreCase))
                {
                    resolvedUserFuri = RoleplaySocialRegister.EnsureFuriganaParity(genFuri, userMessageText);
                }
            }
            userMessage.FuriganaHtml = resolvedUserFuri;

            var duration = request.SpeakingDurationSeconds;
            int userMoraCount = ComputeMoraCount(userMessageText, userMessage.FuriganaHtml);
            var pace = isVerifiedVoiceInput
                ? (request.MoraRate is > 0
                    ? Math.Round(request.MoraRate.Value, 1)
                    : (TryAnalyzeWavMoraRate(request.AudioUrl, userMoraCount)
                        ?? (duration is > 0.1 && userMoraCount > 0
                            ? Math.Round(userMoraCount / duration.Value, 1)
                            : (double?)null)))
                : null;

            if (turnResult.LinguisticFeedback != null)
            {
                var jlpt = (levelConfig.JLPTLevel ?? "N4").Trim().ToUpperInvariant();
                (double idealLat, double maxLat, double minPace, double maxPace, string paceDesc) = jlpt switch
                {
                    "N5" => (5.0, 10.0, 2.0, 4.5, "Chuẩn N5: 2.0 - 4.5 âm/s"),
                    "N4" => (4.0, 8.5, 2.5, 5.5, "Chuẩn N4: 2.5 - 5.5 âm/s"),
                    "N3" => (3.0, 7.0, 3.5, 6.5, "Chuẩn N3: 3.5 - 6.5 âm/s"),
                    "N2" => (2.2, 5.5, 4.5, 7.5, "Chuẩn N2: 4.5 - 7.5 âm/s"),
                    "N1" => (1.8, 4.5, 5.5, 9.0, "Chuẩn N1: 5.5 - 9.0 âm/s"),
                    _ => (4.0, 8.5, 2.5, 5.5, "Chuẩn N4: 2.5 - 5.5 âm/s")
                };

                // 1. Tính toán điểm tự chủ đàm thoại (Scaffolding Autonomy Score + Effort Rebate theo AssistancePolicy)
                int turnAutonomy = 100;
                string autonomyAssessment = "Tự chủ 100% (Không dùng trợ giúp)";
                if (request.HintLevelUsed > 0)
                {
                    int priorHintTurnsCount = await _dbContext.LearnerBehaviorSignals
                        .AsNoTracking()
                        .CountAsync(s => s.SessionId == session.Id && s.HintLevelUsed > 0, cancellationToken);

                    int timesUsed = priorHintTurnsCount + 1;
                    bool isFirstHintInSession = timesUsed <= 1;

                    var (rawPenalty, ceiling) = AssistancePolicy.GetHintTierCost(request.HintLevelUsed, timesUsed);
                    int effectivePenalty = rawPenalty;
                    bool isRebateApplied = false;

                    if (request.HintLevelUsed >= 2 && rawPenalty > 0)
                    {
                        var sampleCandidate = !string.IsNullOrWhiteSpace(request.HintSampleText)
                            ? request.HintSampleText
                            : (levelConfig.TargetGrammars?
                                .Select(g => g.ExampleSentence)
                                .FirstOrDefault(e => !string.IsNullOrWhiteSpace(e)) ?? string.Empty);

                        if (!string.IsNullOrWhiteSpace(sampleCandidate))
                        {
                            double sim = ComputeJapaneseSimilarity(userMessageText, sampleCandidate);
                            (effectivePenalty, isRebateApplied) = AssistancePolicy.ApplyEffortRebate(
                                rawPenalty, request.HintLevelUsed, sim);
                        }
                    }

                    turnAutonomy = Math.Clamp(100 - effectivePenalty, 20, 100);

                    if (request.HintLevelUsed == 1)
                    {
                        autonomyAssessment = isFirstHintInSession
                            ? "Dùng gợi ý Ý tưởng lần đầu (Miễn trừ phạt 0đ, tự chủ 100đ)"
                            : "Dùng gợi ý Ý tưởng chuẩn (-10đ, tự chủ 90đ)";
                    }
                    else if (request.HintLevelUsed == 2)
                    {
                        autonomyAssessment = isFirstHintInSession
                            ? "Dùng gợi ý Từ khóa lần đầu (-15đ, tự chủ 85đ)"
                            : "Dùng gợi ý Từ khóa chuẩn (-30đ, tự chủ 70đ)";
                    }
                    else if (request.HintLevelUsed >= 3)
                    {
                        autonomyAssessment = isFirstHintInSession
                            ? "Dùng gợi ý Mẫu trọn câu lần đầu (-40đ, tự chủ 60đ)"
                            : "Dùng gợi ý Mẫu trọn câu chuẩn (-60đ, tự chủ 40đ)";
                    }

                    if (isRebateApplied)
                    {
                        autonomyAssessment += " · Hoàn 50% phạt nhờ tự diễn đạt biến tấu";
                    }
                }

                if (request.TranslationPeekCount > 0)
                {
                    int priorPeeksInSession = await _dbContext.LearnerBehaviorSignals
                        .AsNoTracking()
                        .Where(s => s.SessionId == session.Id && s.TranslationPeekCount > 0)
                        .SumAsync(s => s.TranslationPeekCount, cancellationToken);

                    bool hasUsedFreeQuota = priorPeeksInSession > 0;

                    int peekPenalty = 0;
                    if (!hasUsedFreeQuota)
                    {
                        int chargeablePeeks = Math.Max(0, request.TranslationPeekCount - 1);
                        peekPenalty = chargeablePeeks * 5;
                    }
                    else
                    {
                        peekPenalty = request.TranslationPeekCount * 5;
                    }

                    peekPenalty = Math.Min(peekPenalty, 20);
                    if (peekPenalty > 0)
                    {
                        turnAutonomy = Math.Max(20, turnAutonomy - peekPenalty);
                        autonomyAssessment += $", xem bản dịch {request.TranslationPeekCount} lần (-{peekPenalty}đ)";
                    }
                }

                if (regAnalysis.IsSurvivalPhrase)
                {
                    turnAutonomy = 100;
                    autonomyAssessment = "Cụm từ sinh tồn xuất sắc (Miễn trừ hoàn toàn điểm phạt tự chủ)";
                }

                // 2. Chỉ chấm âm học (Phát âm / Độ trôi chảy) khi CÓ xác thực từ Faster-Whisper (SpeechConfidence > 0)
                bool isTextTurn = request.FallbackToTextInput || (!request.SpeechConfidence.HasValue && string.IsNullOrEmpty(request.AudioUrl));
                bool isVerifiedVoice = !isTextTurn && request.SpeechConfidence.HasValue && request.SpeechConfidence.Value > 0;

                int? pronClarity = isVerifiedVoice
                    ? (int)Math.Clamp(Math.Round(request.SpeechConfidence!.Value * 100), 40, 100)
                    : null;

                var turnFluency = isVerifiedVoice ? 85 : 0;
                string? latencyAssessment = null;
                if (isVerifiedVoice && request.ResponseLatencySeconds.HasValue)
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
                if (isVerifiedVoice && pace.HasValue)
                {
                    var p = pace.Value;
                    if (p >= minPace && p <= maxPace)
                    {
                        turnFluency += 5;
                        paceAssessment = $"Tốc độ phù hợp ({p:0.0} âm/s - {paceDesc})";
                    }
                    else if (p < minPace)
                    {
                        turnFluency -= 5;
                        paceAssessment = $"Hơi chậm ({p:0.0} âm/s < {minPace:0.0})";
                    }
                    else
                    {
                        paceAssessment = $"Tốc độ nhanh ({p:0.0} âm/s)";
                    }
                }

                if (isVerifiedVoice && request.SpeechConfidence.HasValue)
                {
                    var conf = request.SpeechConfidence.Value;
                    if (conf >= 0.85) turnFluency += 5;
                    else if (conf < 0.60) turnFluency -= 15;
                }
                int? finalFluency = isVerifiedVoice ? Math.Clamp(turnFluency, 30, 100) : null;

                List<string>? pronunciationIssues = null;
                if (isVerifiedVoice && phonemeTask != null)
                {
                    try
                    {
                        var completedTask = await Task.WhenAny(phonemeTask, Task.Delay(1500, cancellationToken));
                        var phonemeResult = completedTask == phonemeTask ? await phonemeTask : null;
                        if (phonemeResult != null)
                        {
                            pronunciationIssues = AlignPronunciationIssues(
                                turnResult.UserFuriganaHtml,
                                userMessageText,
                                phonemeResult);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Bỏ qua đối chiếu âm vị ONNX cho lượt hội thoại");
                    }
                }

                turnResult.LinguisticFeedback.SpeechDelivery = new SpeechDeliveryMetricsDto
                {
                    SpeakingDurationSeconds = isVerifiedVoice && request.SpeakingDurationSeconds.HasValue ? Math.Round(request.SpeakingDurationSeconds.Value, 1) : null,
                    ResponseLatencySeconds = isVerifiedVoice && request.ResponseLatencySeconds.HasValue && request.ResponseLatencySeconds.Value >= 0.3 ? Math.Max(0.5, Math.Round(request.ResponseLatencySeconds.Value, 1)) : null,
                    SpeechConfidence = isVerifiedVoice && request.SpeechConfidence.HasValue ? Math.Round(request.SpeechConfidence.Value, 2) : null,
                    SpeechPace = isVerifiedVoice && pace.HasValue && pace.Value >= 1.0 ? pace : null,
                    TurnFluencyScore = finalFluency,
                    TurnAutonomyScore = turnAutonomy,
                    AutonomyAssessment = autonomyAssessment,
                    PronunciationClarityScore = pronClarity,
                    MoraRate = isVerifiedVoice && pace.HasValue && pace.Value >= 1.0 ? pace : null,
                    JlptLevel = jlpt,
                    PaceAssessment = isVerifiedVoice ? paceAssessment : null,
                    LatencyAssessment = isVerifiedVoice ? latencyAssessment : null,
                    AudioUrl = request.AudioUrl,
                    IsTextInput = isTextTurn,
                    HintLevelUsed = request.HintLevelUsed,
                    PronunciationIssues = pronunciationIssues
                };
            }

            if (!regAnalysis.IsMatch && !string.IsNullOrWhiteSpace(regAnalysis.SumiInkIndicatorType))
            {
                sumiFeedback = new SumiInkFeedbackDto
                {
                    HasStain = true,
                    StainType = regAnalysis.SumiInkIndicatorType == "RegisterError" ? "error" : "warning",
                    Message = regAnalysis.FeedbackTip ?? "Gợi ý: Điều chỉnh thể văn phù hợp vai vế",
                    SuggestedAlternative = regAnalysis.SuggestedAlternative,
                    RegisterDelta = regAnalysis.RegisterDelta,
                    IsSurvivalPhrase = regAnalysis.IsSurvivalPhrase
                };
            }
            else if (regAnalysis.IsSurvivalPhrase)
            {
                sumiFeedback = new SumiInkFeedbackDto
                {
                    HasStain = true,
                    StainType = "survival",
                    Message = "Kỹ năng sinh tồn xuất sắc: Chủ động nhờ nhắc lại hoặc nói chậm",
                    SuggestedAlternative = null,
                    RegisterDelta = 0,
                    IsSurvivalPhrase = true
                };
            }

            turnSignal ??= await _dbContext.LearnerBehaviorSignals
                .Where(s => s.SessionId == sessionId && s.TurnIndex == turnIndex)
                .OrderByDescending(s => s.Id)
                .FirstOrDefaultAsync(cancellationToken);

            if (turnSignal != null)
            {
                turnSignal.MoraRate = isVerifiedVoiceInput && pace is >= 1.0 ? pace.Value : 0.0;
            }

            if (turnResult.LinguisticFeedback != null)
            {
                if (sumiFeedback != null)
                {
                    turnResult.LinguisticFeedback.SumiInk = sumiFeedback;
                }
                turnResult.LinguisticFeedback.ActiveBranchingEventCode = activeEventCode;

                userMessage.LinguisticFeedbackJson = System.Text.Json.JsonSerializer.Serialize(turnResult.LinguisticFeedback, JsonOptions);

                if (turnSignal != null)
                {
                    double baseTurnScore = turnResult.LinguisticFeedback.Status switch
                    {
                        "Good" or "Success" => 90.0,
                        "Warning" => 60.0,
                        "Error" => 30.0,
                        _ => 65.0
                    };

                    var sd = turnResult.LinguisticFeedback.SpeechDelivery;
                    if (sd?.TurnFluencyScore is int fluency && fluency > 0)
                    {
                        baseTurnScore = (baseTurnScore * 0.7) + (fluency * 0.3);
                    }
                    if (sd?.TurnAutonomyScore is int autonomy && autonomy < 100)
                    {
                        baseTurnScore -= (100 - autonomy) * 0.25;
                    }

                    turnSignal.TurnScore = Math.Round(Math.Clamp(baseTurnScore, 10.0, 100.0), 1);
                }
            }

            turnResult.SumiInkFeedback = sumiFeedback;
            turnResult.ActiveBranchingEventCode = activeEventCode;

            bool allMissionsDone = session.SessionMissions.Count > 0 && session.SessionMissions.All(sm => sm.IsCompleted);
            if (allMissionsDone || (turnResult.IsNaturallyConcluded && allMissionsDone))
            {
                session.IsNaturallyConcluded = true;
            }

            session.UpdatedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(cancellationToken);
            if (dbTransaction != null)
            {
                await dbTransaction.CommitAsync(cancellationToken);
            }
        }
        catch
        {
            DetachPendingEntities();
            if (dbTransaction != null)
            {
                await dbTransaction.RollbackAsync(cancellationToken);
            }
            throw;
        }

        // 7. Tạo response trả về cho frontend
        // Lấy credit balance mới nhất (đã được cập nhật sau deduct)
        int latestCreditBalance = userForDeduct.CreditBalance;
        var (postTurnRemainingQuota, postTurnQuotaExhausted, postTurnWarningMessage) =
            await EvaluateCreditAndQuotaStatusAsync(userForDeduct, isAdmin, hasActiveSubscription, cancellationToken);

        var responseDto = new RoleplayTurnResponseDto
        {
            UserMessage = new RoleplayMessageDto
            {
                Id = userMessage.Id,
                Sender = userMessage.Sender,
                JapaneseText = userMessage.JapaneseText ?? string.Empty,
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
            HasActiveSubscription = hasActiveSubscription,
            RemainingSubscriptionQuota = postTurnRemainingQuota,
            IsSubscriptionQuotaExhausted = postTurnQuotaExhausted,
            CreditWarningMessage = postTurnWarningMessage,
            DetectedIssues = detectedIssues.ToList(),
            SpeedScale = ddaDecision.SpeedScale,
            ShouldOfferEncouragement = ddaDecision.ShouldOfferEncouragement,
            ActiveBranchingEventCode = activeEventCode,
            SumiInkFeedback = sumiFeedback
        };

        return ApiResponse<RoleplayTurnResponseDto>.Ok(responseDto);
        }
        finally
        {
            userLock.Release();
        }
    }

    public async Task<ApiResponse<RoleplayHintDto>> GetHintAsync(
        string userId,
        int sessionId,
        CancellationToken cancellationToken = default)
    {
        var session = await _dbContext.RoleplaySessions
            .AsNoTracking()
            .AsSplitQuery()
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.Scenario)
            .Include(s => s.SessionMissions)
                .ThenInclude(sm => sm.Mission)
            .Include(s => s.Messages)
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.SessionType != "PlacementTest", cancellationToken);

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
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.SessionType != "PlacementTest", cancellationToken);

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
            .AsSplitQuery()
            .Include(s => s.ScenarioLevelConfiguration)
                .ThenInclude(c => c!.Scenario)
            .Include(s => s.SessionMissions)
            .FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken);

        if (sessionWithConfig?.ScenarioLevelConfiguration?.Scenario != null)
        {
            bool allDone = sessionWithConfig.SessionMissions.Count > 0 && sessionWithConfig.SessionMissions.All(m => m.IsCompleted);
            string npcCode = ResolveNpcCode(
                sessionWithConfig.ScenarioLevelConfiguration.Scenario.ScenarioCode,
                sessionWithConfig.ScenarioLevelConfiguration.Scenario.Id,
                sessionWithConfig.ScenarioLevelConfigurationId);
            await _personaMemory.RecordSessionAffinityAsync(userId, npcCode, allDone);

        }

        // Cập nhật và lưu ký ức liên phiên vào LearnerMemory & CharacterMemory
        try
        {
            var userTexts = await _dbContext.RoleplayMessages
                .Where(m => m.RoleplaySessionId == sessionId && m.Sender == "User")
                .Select(m => m.JapaneseText)
                .ToListAsync(cancellationToken);

            foreach (var ut in userTexts)
            {
                var fact = _factExtractor.ExtractFact(ut);
                if (!string.IsNullOrWhiteSpace(fact))
                {
                    var cat = fact.Contains("ramen") || fact.Contains("sushi") || fact.Contains("ăn") || fact.Contains("uống")
                        ? "FoodPreference"
                        : fact.Contains("quê") || fact.Contains("sống") || fact.Contains("ở")
                            ? "Origin"
                            : "Hobby";
                    var parts = fact.Split(':');
                    var k = (parts.Length > 0 ? parts[0] : "general").Trim().ToLowerInvariant();
                    var v = (parts.Length > 1 ? parts[1] : fact).Trim();

                    var existing = await _dbContext.LearnerMemories
                        .FirstOrDefaultAsync(lm => lm.UserId == userId && lm.Key == k, cancellationToken);
                    if (existing == null)
                    {
                        _dbContext.LearnerMemories.Add(new LearnerMemory
                        {
                            UserId = userId,
                            Category = cat,
                            Key = k,
                            Value = v,
                            Confidence = 0.95,
                            Visibility = "WorldKnown",
                            SourceSessionId = sessionId,
                            CreatedAtUtc = DateTime.UtcNow,
                            LastConfirmedAtUtc = DateTime.UtcNow
                        });
                    }
                    else
                    {
                        existing.Value = v;
                        existing.LastConfirmedAtUtc = DateTime.UtcNow;
                    }
                }
            }

            if (sessionWithConfig?.ScenarioLevelConfiguration?.Scenario != null)
            {
                string npcKey = ResolveNpcCode(
                    sessionWithConfig.ScenarioLevelConfiguration.Scenario.ScenarioCode,
                    sessionWithConfig.ScenarioLevelConfiguration.Scenario.Id,
                    sessionWithConfig.ScenarioLevelConfigurationId);
                bool allDone = sessionWithConfig.SessionMissions.Count > 0 && sessionWithConfig.SessionMissions.All(m => m.IsCompleted);

                var cm = await _dbContext.CharacterMemories
                    .FirstOrDefaultAsync(c => c.UserId == userId && c.CharacterPersonaKey == npcKey, cancellationToken);
                if (cm == null)
                {
                    _dbContext.CharacterMemories.Add(new CharacterMemory
                    {
                        UserId = userId,
                        CharacterPersonaKey = npcKey,
                        EncounterCount = 1,
                        AffinityScore = allDone ? 20 : 10,
                        LastInteractionSummary = $"Hoàn thành phiên {sessionWithConfig.ScenarioLevelConfiguration.Scenario.Title}",
                        LastMetAtUtc = DateTime.UtcNow
                    });
                }
                else
                {
                    cm.AffinityScore += allDone ? 15 : 5;
                    cm.LastInteractionSummary = $"Luyện tập {sessionWithConfig.ScenarioLevelConfiguration.Scenario.Title} ({DateTime.UtcNow:dd/MM})";
                    cm.LastMetAtUtc = DateTime.UtcNow;
                }
            }
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Lỗi khi lưu LearnerMemory/CharacterMemory khi kết thúc phiên {SessionId}", sessionId);
        }

        // Tổng hợp AI Coaching Snapshot một lần lúc kết thúc phiên (strict 4000ms timeout, tự động fallback an toàn)
        if (_adaptiveProfileService != null)
        {
            try
            {
                using var coachingCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                coachingCts.CancelAfter(TimeSpan.FromMilliseconds(4000));
                await _adaptiveProfileService.GenerateAndPersistCoachingSnapshotAsync(
                    userId,
                    sessionId,
                    coachingCts.Token);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Bỏ qua hoặc timeout khi tổng hợp AI Adaptive Coaching cho phiên {SessionId}", sessionId);
            }
        }

        return ApiResponse<bool>.Ok(true, "Phiên luyện tập đã kết thúc thành công.");
    }

    internal static string ResolveNpcCode(string? scenarioCode, int scenarioId, int? levelConfigId = null)
    {
        if (!string.IsNullOrWhiteSpace(scenarioCode))
        {
            return scenarioCode.Trim();
        }
        if (scenarioId > 0)
        {
            return $"SCN_{scenarioId}";
        }
        if (levelConfigId.HasValue && levelConfigId.Value > 0)
        {
            return $"NPC_{levelConfigId.Value}";
        }
        return "NPC_DEFAULT";
    }

    private static string ExtractDominantWeakness(string? inferredTraitsJson)
    {
        if (string.IsNullOrWhiteSpace(inferredTraitsJson))
        {
            return "Balanced";
        }
        try
        {
            using var doc = JsonDocument.Parse(inferredTraitsJson);
            if (doc.RootElement.TryGetProperty("dominantWeaknessCategory", out var prop))
            {
                return prop.GetString() ?? "Balanced";
            }
        }
        catch { }
        return "Balanced";
    }

    private static string BuildProfileAdaptationSummary(LearnerIntelligenceProfile profile)
    {
        var cues = new List<string>();
        if (profile.SpeakingReflexIndex < 55 || profile.AverageMoraRate < 3.4)
        {
            cues.Add("nói chậm rõ câu ngắn");
        }
        if (profile.ParticleAccuracyRate < 70)
        {
            cues.Add("giúp tái hiện tự nhiên trợ từ は/が/に/で");
        }
        if (profile.KeigoCommandScore < 65)
        {
            cues.Add("khuyến khích dùng Desu/Masu tự nhiên");
        }
        if (profile.HintDependencyRate > 35)
        {
            cues.Add("tạo khoảng mở dễ trả lời để giảm phụ thuộc gợi ý");
        }
        if (cues.Count == 0 && profile.CommunicativeProficiencyIndex >= 82)
        {
            cues.Add("có thể thử thách câu hỏi mở rộng tự nhiên");
        }
        return cues.Count == 0 ? string.Empty : string.Join(", ", cues);
    }

    private static double ComputeJapaneseSimilarity(string actual, string sample)
    {
        static string Normalize(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return string.Empty;
            var sb = new StringBuilder(text.Length);
            foreach (var ch in text.Trim())
            {
                if (!char.IsWhiteSpace(ch) && ch != '。' && ch != '、' && ch != '！' && ch != '？' && ch != '.' && ch != ',' && ch != '!' && ch != '?')
                {
                    sb.Append(ch);
                }
            }
            return sb.ToString();
        }

        var a = Normalize(actual);
        var b = Normalize(sample);
        if (a.Length == 0 || b.Length == 0) return 0.0;
        if (string.Equals(a, b, StringComparison.Ordinal)) return 1.0;

        int n = a.Length;
        int m = b.Length;
        var prev = new int[m + 1];
        var curr = new int[m + 1];
        for (int j = 0; j <= m; j++) prev[j] = j;

        for (int i = 1; i <= n; i++)
        {
            curr[0] = i;
            for (int j = 1; j <= m; j++)
            {
                int cost = a[i - 1] == b[j - 1] ? 0 : 1;
                curr[j] = Math.Min(Math.Min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            Array.Copy(curr, prev, m + 1);
        }

        int maxLen = Math.Max(n, m);
        return maxLen == 0 ? 1.0 : Math.Clamp(1.0 - (double)prev[m] / maxLen, 0.0, 1.0);
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

    internal static string ResolveSceneType(string? scenarioCode, string? title, string? aiPersona)
    {
        var code = (scenarioCode ?? string.Empty).ToUpperInvariant();
        if (code.Contains("TRANSIT") || code.Contains("STATION") || code.Contains("SHINJUKU")) return "train";
        if (code.Contains("KONBINI") || code.Contains("STORE") || code.Contains("RETAIL")) return "konbini";
        if (code.Contains("OFFICE") || code.Contains("INTERVIEW") || code.Contains("BUSINESS")) return "office";
        if (code.Contains("CAFE") || code.Contains("COFFEE")) return "cafe";
        if (code.Contains("RAMEN") || code.Contains("IZAKAYA") || code.Contains("RESTAURANT")) return "ramen";

        var text = $"{title} {aiPersona}".ToLowerInvariant();
        if (text.Contains("ga") || text.Contains("tàu") || text.Contains("vé tàu") || text.Contains("shinkansen")) return "train";
        if (text.Contains("tiện lợi") || text.Contains("konbini") || text.Contains("siêu thị") || text.Contains("thu ngân")) return "konbini";
        if (text.Contains("phỏng vấn") || text.Contains("công sở") || text.Contains("văn phòng") || text.Contains("công ty")) return "office";
        if (text.Contains("cafe") || text.Contains("cà phê") || text.Contains("quán trà")) return "cafe";
        if (text.Contains("chùa") || text.Contains("đền") || text.Contains("onsen") || text.Contains("ryokan")) return "zen";
        if (text.Contains("bác sĩ") || text.Contains("bệnh viện") || text.Contains("khám")) return "medical";

        return "ramen";
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

    private const int LowCreditWarningThreshold = 5;
    private const int LowSubscriptionQuotaWarningThreshold = 5;

    /// <summary>
    /// Tính toán hạn mức token gói tháng còn lại và thông báo cảnh báo số dư / hạn mức cho phòng hội thoại:
    /// - Nếu có gói tháng và token gói tháng chưa hết (> 5 token): KHÔNG cảnh báo gì kể cả khi CreditBalance = 0 xu.
    /// - Nếu có gói tháng và token gói tháng sắp hết (1..5 token): Cảnh báo gói tháng sắp hết token.
    /// - Nếu không có gói tháng (hoặc gói tháng đã hết token) và CreditBalance còn 1..5 xu: Cảnh báo sắp hết xu.
    /// - Nếu không có gói tháng (hoặc gói tháng đã hết token) và CreditBalance &lt;= 0: Thông báo không đủ tiền để trò chuyện.
    /// </summary>
    private async Task<(int? RemainingQuota, bool IsQuotaExhausted, string? WarningMessage)> EvaluateCreditAndQuotaStatusAsync(
        ApplicationUser? user,
        bool isAdmin,
        bool hasActiveSubscription,
        CancellationToken cancellationToken = default)
    {
        if (user == null || isAdmin)
        {
            return (null, false, null);
        }

        if (hasActiveSubscription)
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

            var usedWeek = await subDeductQuery
                .Where(t => t.CreatedAt >= sevenDaysAgo)
                .SumAsync(t => -t.Amount, cancellationToken);

            int rem5h = Math.Max(0, plan.FiveHourQuota - used5h);
            int remWeek = Math.Max(0, plan.WeeklyQuota - usedWeek);
            int remainingQuota = Math.Min(rem5h, remWeek);
            bool isExhausted = remainingQuota <= 0;

            if (!isExhausted)
            {
                // Khi token gói tháng vẫn còn (> 5), tuyệt đối không thông báo gì kể cả khi CreditBalance == 0 xu
                if (remainingQuota <= LowSubscriptionQuotaWarningThreshold)
                {
                    return (remainingQuota, false,
                        $"Gói tháng ({plan.Name}) của bạn sắp hết token trong chu kỳ này (còn {remainingQuota} token).");
                }

                return (remainingQuota, false, null);
            }

            // Gói tháng đã hết sạch token trong chu kỳ -> kiểm tra xu lẻ dự phòng (CreditBalance)
            if (user.CreditBalance <= 0)
            {
                return (0, true,
                    $"Bạn đã dùng hết hạn ngạch token của {plan.Name} và số dư xu dự phòng là 0 xu. Vui lòng chờ hạn ngạch hồi phục hoặc nạp thêm Credit để trò chuyện.");
            }

            if (user.CreditBalance <= LowCreditWarningThreshold)
            {
                return (0, true,
                    $"Token gói tháng đã hết, hệ thống đang dùng xu dự phòng và bạn sắp hết xu (chỉ còn {user.CreditBalance} xu). Vui lòng nạp thêm Credit.");
            }

            return (0, true, null);
        }

        // Không có gói tháng -> chỉ dùng CreditBalance
        if (user.CreditBalance <= 0)
        {
            return (null, false,
                "Bạn chưa có đủ Credit (0 xu). Mặc dù bước khởi tạo kịch bản là miễn phí, việc trò chuyện với AI có tính phí — vui lòng nạp thêm Credit hoặc đăng ký Gói tháng để bắt đầu hội thoại.");
        }

        if (user.CreditBalance <= LowCreditWarningThreshold)
        {
            return (null, false,
                $"Số dư Credit của bạn sắp hết (chỉ còn {user.CreditBalance} xu). Vui lòng nạp thêm Credit hoặc đăng ký Gói tháng để cuộc trò chuyện không bị gián đoạn.");
        }

        return (null, false, null);
    }

    internal static int ComputeMoraCount(string? japaneseText, string? furiganaHtml = null)
    {
        var source = !string.IsNullOrWhiteSpace(furiganaHtml)
            ? furiganaHtml
            : RoleplaySocialRegister.GenerateFuriganaHtml(japaneseText ?? string.Empty);

        if (string.IsNullOrWhiteSpace(source)) return 0;

        var kanaOnly = System.Text.RegularExpressions.Regex.Replace(
            source,
            @"<ruby[^>]*>.*?<rt[^>]*>(.*?)(?:</rt>|(?=</ruby>)).*?</ruby>",
            "$1",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Singleline);
        kanaOnly = RoleplaySocialRegister.StripRubyTags(kanaOnly);

        return JapaneseMora.FromKana(kanaOnly).Count;
    }

    private static double? TryAnalyzeWavMoraRate(string? audioUrl, int moraCount)
    {
        if (moraCount <= 0 || string.IsNullOrWhiteSpace(audioUrl)) return null;
        var cleanUrl = audioUrl.Split('?', '#')[0].Trim();
        if (!cleanUrl.StartsWith("/audio/", StringComparison.OrdinalIgnoreCase)
            || !cleanUrl.EndsWith(".wav", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        try
        {
            var webRoot = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"));
            var relativePath = cleanUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var fullPath = Path.GetFullPath(Path.Combine(webRoot, relativePath));
            if (!fullPath.StartsWith(webRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                || !File.Exists(fullPath))
            {
                return null;
            }

            var wavBytes = File.ReadAllBytes(fullPath);
            var metrics = new FluencyAnalyzer().AnalyzeAnyRate(wavBytes, moraCount);
            if (string.Equals(metrics.Status, "available", StringComparison.OrdinalIgnoreCase)
                && metrics.SpeakingRateMoraPerSec is > 0)
            {
                return Math.Round(metrics.SpeakingRateMoraPerSec.Value, 1);
            }
        }
        catch
        {
            // Non-fatal: fall back to deterministic mora / duration calculation
        }

        return null;
    }

    private async Task<PhonemeRecognitionResult?> AnalyzeAudioPhonemesAsync(
        string audioUrl,
        CancellationToken cancellationToken)
    {
        if (_phonemeRecognizer == null || !_phonemeRecognizer.IsAvailable || string.IsNullOrWhiteSpace(audioUrl))
        {
            return null;
        }

        var cleanUrl = audioUrl.Split('?', '#')[0].Trim();
        if (!cleanUrl.StartsWith("/audio/roleplay/", StringComparison.OrdinalIgnoreCase)
            || cleanUrl.Contains("..", StringComparison.Ordinal))
        {
            return null;
        }

        try
        {
            var webRoot = Path.GetFullPath(
                _webHostEnvironment?.WebRootPath
                ?? Path.Combine(_webHostEnvironment?.ContentRootPath ?? Directory.GetCurrentDirectory(), "wwwroot"));
            var relativePath = cleanUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var fullPath = Path.GetFullPath(Path.Combine(webRoot, relativePath));
            if (!fullPath.StartsWith(webRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                || !File.Exists(fullPath))
            {
                return null;
            }

            float[] samples16k;
            if (cleanUrl.EndsWith(".wav", StringComparison.OrdinalIgnoreCase))
            {
                var wavBytes = await File.ReadAllBytesAsync(fullPath, cancellationToken);
                samples16k = WavPcmReader.ReadMono16k(wavBytes);
            }
            else
            {
                var wavBytes = await ConvertAudioToWav16kViaFfmpegAsync(fullPath, cancellationToken);
                if (wavBytes == null || wavBytes.Length < 44) return null;
                samples16k = WavPcmReader.ReadMono16k(wavBytes);
            }

            if (samples16k.Length < 1600) return null; // < 0.1s
            return _phonemeRecognizer.Recognize(samples16k);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Không thể chạy nhận dạng âm vị ONNX cho file {AudioUrl}", cleanUrl);
            return null;
        }
    }

    private static async Task<byte[]?> ConvertAudioToWav16kViaFfmpegAsync(
        string inputPath,
        CancellationToken cancellationToken)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromMilliseconds(1800));

            var psi = new ProcessStartInfo
            {
                FileName = "ffmpeg",
                Arguments = $"-nostdin -loglevel error -y -i \"{inputPath}\" -ar 16000 -ac 1 -f wav pipe:1",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process == null) return null;

            using var ms = new MemoryStream();
            var copyTask = process.StandardOutput.BaseStream.CopyToAsync(ms, cts.Token);
            await process.WaitForExitAsync(cts.Token);
            await copyTask;

            return process.ExitCode == 0 ? ms.ToArray() : null;
        }
        catch
        {
            return null;
        }
    }

    internal static List<string>? AlignPronunciationIssues(
        string? furiganaHtml,
        string userMessageText,
        PhonemeRecognitionResult phonemeResult)
    {
        if (phonemeResult.LogProbabilities.Length == 0 || phonemeResult.Labels.Count == 0)
        {
            return null;
        }

        var source = !string.IsNullOrWhiteSpace(furiganaHtml) && furiganaHtml.Contains("<rt", StringComparison.OrdinalIgnoreCase)
            ? furiganaHtml
            : RoleplaySocialRegister.GenerateFuriganaHtml(userMessageText);

        var kana = System.Text.RegularExpressions.Regex.Replace(
            source,
            @"<ruby[^>]*>.*?<rt[^>]*>(.*?)(?:</rt>|(?=</ruby>)).*?</ruby>",
            "$1",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Singleline);
        kana = RoleplaySocialRegister.StripRubyTags(kana);

        var moras = JapaneseMora.FromKana(kana, preserveLongVowelSpelling: false);
        if (moras.Count < 2) return null;

        var aligned = PronunciationAligner.Align(moras, phonemeResult.LogProbabilities, phonemeResult.Labels);
        if (aligned == null || aligned.IsMismatch) return null;

        var issues = new List<string>();
        foreach (var m in aligned.Moras)
        {
            if (string.Equals(m.Kind, "ok", StringComparison.OrdinalIgnoreCase)) continue;

            var desc = m.Kind switch
            {
                "missing" => $"Có thể bạn đã đọc lướt hoặc thiếu âm '{m.Target}'",
                "short" => $"Cần kéo dài trường âm ở '{m.Target}'",
                "sokuon" => "Cần ngắt hơi rõ hơn ở âm ngắt (っ)",
                "extra_long" => $"Không cần kéo dài thêm trường âm sau '{m.Target}'",
                _ when !string.IsNullOrWhiteSpace(m.Heard) && !string.Equals(m.Target, m.Heard, StringComparison.Ordinal)
                    => $"Âm '{m.Target}' nghe hơi giống '{m.Heard}'",
                _ => null
            };

            if (!string.IsNullOrWhiteSpace(desc) && !issues.Contains(desc))
            {
                issues.Add(desc);
                if (issues.Count >= 2) break;
            }
        }

        return issues.Count > 0 ? issues : null;
    }

    /// <summary>
    /// Ước lượng số credit cần trừ dựa trên độ dài câu nói người học, câu thoại AI và độ sâu ngữ cảnh (1..4 credits/lượt).
    /// </summary>
    internal static int EstimateCreditCost(string? userMessage, string? aiReply, int userTurnCount)
    {
        int userLen = string.IsNullOrWhiteSpace(userMessage) ? 0 : userMessage.Trim().Length;
        int aiLen = string.IsNullOrWhiteSpace(aiReply) ? 0 : aiReply.Trim().Length;
        int volumeCost = (int)Math.Ceiling((userLen + aiLen) / 50.0);
        int contextDepth = userTurnCount <= 5 ? 0 : (userTurnCount <= 12 ? 1 : 2);
        return Math.Clamp(1 + volumeCost + contextDepth, 1, 4);
    }

    public async Task<ApiResponse<LearnerIntelligenceProfileDto>> GetIntelligenceProfileAsync(
        string userId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            return ApiResponse<LearnerIntelligenceProfileDto>.Fail("UserId không hợp lệ.");
        }

        var profile = await _telemetryEvaluator.GetOrCreateProfileAsync(userId);

        int totalSessions = await TelemetryEvaluatorService.CountCompletedStandardSessionsAsync(
            _dbContext,
            userId,
            cancellationToken);

        int totalTurns = await _dbContext.LearnerBehaviorSignals
            .Join(_dbContext.RoleplaySessions, sig => sig.SessionId, ses => ses.Id, (sig, ses) => new { sig, ses })
            .CountAsync(x => x.ses.UserId == userId && x.ses.SessionType != "PlacementTest", cancellationToken);

        int voiceTurns = await TelemetryEvaluatorService.CountVoiceStandardTurnsAsync(
            _dbContext,
            userId,
            cancellationToken);
        bool hasVoiceData = voiceTurns > 0;

        DateTime? lastPracticed = await _dbContext.RoleplaySessions
            .Where(s => s.UserId == userId && s.SessionType != "PlacementTest" && s.CompletedAt != null)
            .OrderByDescending(s => s.CompletedAt)
            .Select(s => s.CompletedAt)
            .FirstOrDefaultAsync(cancellationToken);

        // Suy luận điểm mạnh & điểm cần tôi luyện từ chỉ số thực
        var strengths = new List<string>();
        var focusAreas = new List<string>();

        if (profile.SpeakingReflexIndex >= 65)
            strengths.Add("Phản xạ hội thoại nhạy bén");
        else
            focusAreas.Add("Cải thiện tốc độ phản xạ khởi đầu câu");

        if (profile.KeigoCommandScore >= 65)
            strengths.Add("Dùng thể lịch sự tự nhiên đúng vai vế");
        else
            focusAreas.Add("Củng cố thể lịch sự trong giao tiếp");

        if (profile.ParticleAccuracyRate >= 70)
            strengths.Add("Làm chủ chính xác trợ từ は, が, に, で");
        else
            focusAreas.Add("Chú ý phân biệt cặp trợ từ に vs で, は vs が");

        if (hasVoiceData)
        {
            if (profile.AverageMoraRate >= 4.0)
                strengths.Add("Nhịp điệu phát âm lưu loát (≥ 4.0 âm/giây)");
            else
                focusAreas.Add("Luyện tập nối âm và ngắt nghỉ tự nhiên hơn");
        }

        if (profile.HintDependencyRate <= 25)
            strengths.Add("Tự chủ giao tiếp cao (ít dựa gợi ý)");
        else
            focusAreas.Add("Thử thách tự diễn đạt trước khi mở thẻ gợi ý");

        string omikujiRank = profile.CommunicativeProficiencyIndex >= 85 ? "大吉 (Đại Cát)"
            : profile.CommunicativeProficiencyIndex >= 70 ? "中吉 (Trung Cát)" : "吉 (Cát)";

        var nowUtc = DateTime.UtcNow;
        var dueItemsQuery = await _dbContext.LearnerSkillMasteries
            .AsNoTracking()
            .Where(m => m.UserId == userId && m.NextRecommendedReviewUtc <= nowUtc)
            .OrderBy(m => m.NextRecommendedReviewUtc)
            .Take(20)
            .ToListAsync(cancellationToken);

        var masteredItemsQuery = await _dbContext.LearnerSkillMasteries
            .AsNoTracking()
            .Where(m => m.UserId == userId && m.NextRecommendedReviewUtc > nowUtc)
            .OrderByDescending(m => m.Stability)
            .ThenByDescending(m => m.LastPracticedUtc)
            .Take(16)
            .ToListAsync(cancellationToken);

        var dueMasteries = dueItemsQuery
            .Concat(masteredItemsQuery)
            .Select(m => new LearnerSkillMasteryItemDto
            {
                SkillCode = m.SkillCode,
                SkillName = m.SkillName,
                Category = m.Category,
                Stability = m.Stability,
                Difficulty = m.Difficulty,
                Repetitions = m.Repetitions,
                Lapses = m.Lapses,
                NextRecommendedReviewUtc = m.NextRecommendedReviewUtc,
                IsDueForReview = m.NextRecommendedReviewUtc <= nowUtc
            })
            .ToList();

        // Đồng bộ chỉ số tổng quát với các trục năng lực thực sự đã đo (5 trục nếu chưa thu âm, 6 trục nếu đã nói qua micro)
        double alignedProficiency = TelemetryEvaluatorService.ComputeEffectiveAlignedProficiency(profile, totalSessions, hasVoiceData);

        omikujiRank = alignedProficiency >= 85 ? "大吉 (Đại Cát)"
            : alignedProficiency >= 70 ? "中吉 (Trung Cát)" : "吉 (Cát)";

        var recentResults = await TelemetryEvaluatorService.GetRecentStandardResultsAsync(
            _dbContext,
            userId,
            6,
            cancellationToken);

        int consecutiveFailCount = recentResults.TakeWhile(r => !r.PassStatus).Count();

        string proficiencyTrend = "Stable";
        if (recentResults.Count >= 4)
        {
            int splitCount = Math.Min(3, recentResults.Count / 2);
            double newerAvg = recentResults.Take(splitCount).Average(r => r.OverallScore);
            double olderAvg = recentResults.Skip(splitCount).Take(splitCount).Average(r => r.OverallScore);
            double trendDelta = newerAvg - olderAvg;
            if (trendDelta >= 5.0) proficiencyTrend = "Improving";
            else if (trendDelta <= -5.0) proficiencyTrend = "Declining";
        }

        var (estimatedJlptLevel, estimatedJlptLabel) = TelemetryEvaluatorService.DeriveDynamicJlptDetails(
            profile.ThetaEstimate,
            alignedProficiency,
            consecutiveFailCount);

        var recurringMistakes = await _dbContext.LearnerSkillMasteries
            .AsNoTracking()
            .Where(m => m.UserId == userId && m.Lapses >= 2)
            .OrderByDescending(m => m.Lapses)
            .ThenByDescending(m => m.LastPracticedUtc)
            .Take(3)
            .Select(m => new RecurringMistakeDto
            {
                SkillCode = m.SkillCode,
                SkillName = m.SkillName,
                Lapses = m.Lapses
            })
            .ToListAsync(cancellationToken);

        var coachingAlerts = new List<LearnerCoachingAlertDto>();
        if (consecutiveFailCount >= 2)
        {
            coachingAlerts.Add(new LearnerCoachingAlertDto
            {
                Severity = "danger",
                Title = $"Chưa đạt {consecutiveFailCount} phiên liên tiếp",
                Message = "Bạn nên ôn lại cấp dễ hơn hoặc bật gợi ý Cấp 1 để lấy lại nhịp nói.",
                SuggestedAction = "Luyện củng cố"
            });
        }
        if (recurringMistakes.Count > 0)
        {
            var concreteMistake = recurringMistakes
                .Select(m => new
                {
                    Item = m,
                    Display = ResolveRecurringSkillDisplay(m.SkillCode, m.SkillName)
                })
                .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x.Display));

            if (concreteMistake != null)
            {
                coachingAlerts.Add(new LearnerCoachingAlertDto
                {
                    Severity = "warning",
                    Title = $"Lỗi hay gặp: {concreteMistake.Display} ({concreteMistake.Item.Lapses} lần)",
                    Message = "Bạn thường vướng phần này ở các phiên gần đây — hãy để ý tránh lặp lại trong phiên tới.",
                    SuggestedAction = "Xem sổ tay ôn tập"
                });
            }
        }
        if (coachingAlerts.Count < 3 && proficiencyTrend == "Declining")
        {
            coachingAlerts.Add(new LearnerCoachingAlertDto
            {
                Severity = "warning",
                Title = "Phong độ gần đây đang giảm",
                Message = "Điểm các phiên gần đây giảm nhẹ. Hãy nói chậm rãi và hoàn thiện trọn câu lịch sự."
            });
        }
        else if (coachingAlerts.Count == 0 && proficiencyTrend == "Improving" && totalSessions >= 3 && alignedProficiency >= 78)
        {
            coachingAlerts.Add(new LearnerCoachingAlertDto
            {
                Severity = "positive",
                Title = "Phong độ đang tiến bộ rõ rệt",
                Message = $"Thực lực hiện tại ở mức {estimatedJlptLabel} — bạn có thể thử cấp độ cao hơn."
            });
        }

        var dto = new LearnerIntelligenceProfileDto
        {
            UserId = userId,
            ThetaEstimate = profile.ThetaEstimate,
            SpeakingReflexIndex = profile.SpeakingReflexIndex,
            KeigoCommandScore = profile.KeigoCommandScore,
            ParticleAccuracyRate = profile.ParticleAccuracyRate,
            AverageMoraRate = hasVoiceData ? profile.AverageMoraRate : 0.0,
            HintDependencyRate = profile.HintDependencyRate,
            CommunicativeConfidenceScore = profile.CommunicativeConfidenceScore,
            CommunicativeProficiencyIndex = alignedProficiency,
            TotalSessionsCompleted = totalSessions,
            TotalPracticeTurns = totalTurns,
            VoicePracticeTurns = voiceTurns,
            HasVoiceData = hasVoiceData,
            Strengths = strengths,
            TargetFocusAreas = focusAreas,
            OmikujiRank = omikujiRank,
            KotowazaProverb = "継続は力なり — Kiên trì mỗi ngày chính là cội nguồn của sức mạnh giao tiếp.",
            LastPracticedAtUtc = lastPracticed,
            DueReviewItems = dueMasteries,
            EstimatedJlptLevel = estimatedJlptLevel,
            EstimatedJlptLabel = estimatedJlptLabel,
            ProficiencyTrend = proficiencyTrend,
            ConsecutiveFailCount = consecutiveFailCount,
            RecurringMistakes = recurringMistakes,
            CoachingAlerts = coachingAlerts.Take(3).ToList()
        };

        // Trích xuất các đặc trưng hành vi và lộ trình thích ứng ngầm (TikTok-style Trajectory)
        if (!string.IsNullOrWhiteSpace(profile.InferredTraitsJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(profile.InferredTraitsJson);
                var root = doc.RootElement;
                if (root.TryGetProperty("hesitationRate", out var hr) && hr.ValueKind == JsonValueKind.Number)
                    dto.HesitationRate = Math.Clamp(hr.GetDouble(), 0.0, 100.0);
                if (root.TryGetProperty("averageHesitationSeconds", out var ahs) && ahs.ValueKind == JsonValueKind.Number)
                    dto.AverageHesitationSeconds = Math.Clamp(ahs.GetDouble(), 0.2, 30.0);
                if (root.TryGetProperty("scaffoldTierPreference", out var stp) && stp.ValueKind == JsonValueKind.String)
                    dto.ScaffoldTierPreference = stp.GetString() ?? "Autonomous";
                if (root.TryGetProperty("preferredTone", out var pt) && pt.ValueKind == JsonValueKind.String)
                    dto.PreferredTone = pt.GetString() ?? "Polite_Teineigo";
                if (root.TryGetProperty("toneConsistencyScore", out var tcs) && tcs.ValueKind == JsonValueKind.Number)
                    dto.ToneConsistencyScore = tcs.GetDouble();
                if (root.TryGetProperty("dominantWeaknessCategory", out var dwc) && dwc.ValueKind == JsonValueKind.String)
                    dto.DominantWeaknessCategory = dwc.GetString() ?? "Particles";
                if (root.TryGetProperty("nextRecommendedScenarioId", out var nsi) && nsi.ValueKind == JsonValueKind.Number)
                    dto.NextRecommendedScenarioId = nsi.GetInt32();
                if (root.TryGetProperty("nextRecommendedScenarioCode", out var nsc) && nsc.ValueKind == JsonValueKind.String)
                    dto.NextRecommendedScenarioCode = nsc.GetString();
                if (root.TryGetProperty("nextRecommendedScenarioTitle", out var nst) && nst.ValueKind == JsonValueKind.String)
                    dto.NextRecommendedScenarioTitle = nst.GetString();
                if (root.TryGetProperty("nextRecommendedReason", out var nrr) && nrr.ValueKind == JsonValueKind.String)
                    dto.NextRecommendedReason = nrr.GetString();
                if (root.TryGetProperty("predictedSuccessRateNextScenario", out var psr) && psr.ValueKind == JsonValueKind.Number)
                {
                    var rawPsr = psr.GetDouble();
                    dto.PredictedSuccessRateNextScenario = rawPsr <= 1.0 ? Math.Round(rawPsr * 100.0, 1) : Math.Round(rawPsr, 1);
                }
                if (root.TryGetProperty("adaptiveLearningPathStatus", out var alps) && alps.ValueKind == JsonValueKind.String)
                    dto.AdaptiveLearningPathStatus = alps.GetString() ?? "Fading_Assistance";
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Không thể parse InferredTraitsJson: {Msg}", ex.Message);
            }
        }

        return ApiResponse<LearnerIntelligenceProfileDto>.Ok(dto);
    }

    private static string? ResolveRecurringSkillDisplay(string? skillCode, string? rawName)
    {
        if (!string.IsNullOrWhiteSpace(skillCode))
        {
            var (_, resolvedName, _) = TelemetryEvaluatorService.ResolveSkillInfo(skillCode.Trim().ToUpperInvariant());
            if (!IsGenericSkillPlaceholder(resolvedName))
                return resolvedName;
        }

        if (string.IsNullOrWhiteSpace(rawName)) return null;
        var codeMatch = System.Text.RegularExpressions.Regex.Match(rawName, @"\(([A-Z]\d+(?:_[A-Z0-9_]+)?)\)");
        if (codeMatch.Success)
        {
            var (_, resolvedFromParen, _) = TelemetryEvaluatorService.ResolveSkillInfo(codeMatch.Groups[1].Value.ToUpperInvariant());
            if (!IsGenericSkillPlaceholder(resolvedFromParen))
                return resolvedFromParen;
        }

        var cleaned = System.Text.RegularExpressions.Regex.Replace(rawName, @"\s*\([A-Z0-9_]+\)\s*", " ").Trim();
        cleaned = System.Text.RegularExpressions.Regex.Replace(cleaned, @"^Quy tắc giao tiếp\s*[:\-]?\s*", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase).Trim();
        cleaned = System.Text.RegularExpressions.Regex.Replace(cleaned, @"^(Từ vựng|Ngữ pháp)\s*:\s*", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase).Trim();
        return IsGenericSkillPlaceholder(cleaned) ? null : cleaned;
    }

    private static bool IsGenericSkillPlaceholder(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return true;
        var normalized = text.Trim();
        return normalized.Equals("quy tắc giao tiếp", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("quy tắc ngữ pháp", StringComparison.OrdinalIgnoreCase)
            || System.Text.RegularExpressions.Regex.IsMatch(normalized, @"^E\d+$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    }
}

