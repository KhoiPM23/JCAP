using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Roleplay;
using JCAP.DTOs.Scenario;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Text;
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
    private readonly IEpisodicFactExtractor _factExtractor;
    private readonly IVoiceVoxService? _voiceVoxService;

    /// <summary>
    /// Số ký tự tiếng Nhật ước lượng tương đương 1 credit (30 ký tự ≈ 30 tokens ≈ 1 credit).
    /// </summary>
    private const int CharsPerCredit = 30;

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
        IVoiceVoxService? voiceVoxService = null)
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

        var sanitizedOpeningJa = RoleplaySocialRegister.SanitizeJapaneseReply(opening.JapaneseText);
        var sanitizedOpeningFurigana = !string.IsNullOrWhiteSpace(opening.FuriganaHtml) && !RoleplaySocialRegister.HasVietnameseLeak(opening.FuriganaHtml)
            ? RoleplaySocialRegister.SanitizeJapaneseReply(opening.FuriganaHtml)
            : RoleplaySocialRegister.GenerateFuriganaHtml(sanitizedOpeningJa);

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

        dto.SceneType = ResolveSceneType(
            session.ScenarioLevelConfiguration?.Scenario?.ScenarioCode,
            session.ScenarioLevelConfiguration?.Title,
            session.ScenarioLevelConfiguration?.AiPersona);

        var npcCode = !string.IsNullOrWhiteSpace(session.ScenarioLevelConfiguration?.Scenario?.ScenarioCode)
            ? session.ScenarioLevelConfiguration.Scenario.ScenarioCode
            : $"NPC_{session.ScenarioLevelConfiguration?.Id}";

        dto.CurrentDayStreak = await ComputeDayStreakAsync(session.UserId, cancellationToken);

        try
        {
            var rel = await _dbContext.UserNpcRelationships
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.UserId == session.UserId && r.NpcCode == npcCode, cancellationToken);

            if (rel != null)
            {
                dto.NpcAffinityScore = rel.AffinityScore;
                dto.NpcRelationshipTitle = rel.AffinityScore switch
                {
                    >= 80 => "Tri kỷ tâm giao",
                    >= 50 => "Thân thiết sâu sắc",
                    >= 30 => "Người quen thân thuộc",
                    >= 20 => "Đã từng trò chuyện",
                    _ => "Lần đầu gặp gỡ"
                };
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

        var session = await _dbContext.RoleplaySessions
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

        // 2c. Pre-flight Guard: Nếu học viên nói tiếng Việt hoặc tiếng Anh không có chữ Nhật nào
        // Xử lý tất định tức thì trong 2ms, tiết kiệm 100% token LLM và phản hồi nhập vai đúng Persona
        AiTurnResult? turnResult = null;
        if (RoleplaySocialRegister.IsPureForeignOrVietnamese(userMessage.JapaneseText))
        {
            _logger.LogInformation("Người dùng {UserId} nói ngoại ngữ/tiếng Việt, kích hoạt Pre-flight Guard tất định 0 token.", userId);
            turnResult = RoleplaySocialRegister.ProcessForeignLanguageTurn(levelConfig.Scenario, levelConfig, userMessage.JapaneseText);
        }

        // 2d. Trích xuất ký ức cá nhân học viên (Episodic Facts Extraction)
        try
        {
            var extractedFact = _factExtractor.ExtractFact(userMessage.JapaneseText);
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

        // 3. Kết hợp Ký ức nhân vật + Hồ sơ năng lực học viên ngầm + Chỉ thị DDA
        var directiveBuilder = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(compactMemory))
        {
            directiveBuilder.AppendLine(compactMemory);
        }
        if (!string.IsNullOrWhiteSpace(ddaDecision.PromptModifier))
        {
            directiveBuilder.AppendLine(ddaDecision.PromptModifier);
        }

        // Bơm Compact Learner Profile Vector vào System Prompt
        try
        {
            var learnerProf = await _telemetryEvaluator.GetOrCreateProfileAsync(userId);
            directiveBuilder.AppendLine($"[PROFILE: reflex={learnerProf.SpeakingReflexIndex:F0}, keigo={learnerProf.KeigoCommandScore:F0}, mora_pace={learnerProf.AverageMoraRate:F1}]");
        }
        catch {}

        // Bơm chỉ thị Implicit Recast nếu học viên mắc lỗi ngữ pháp/trợ từ
        if (detectedIssues.Count > 0)
        {
            var topErr = detectedIssues[0];
            directiveBuilder.AppendLine($"[RECAST: Học viên vừa dùng sai {topErr.Code} ({topErr.Title}). Trong câu đối đáp, hãy khéo léo dùng lại cấu trúc chuẩn tự nhiên để tái hiện (implicit recast) mà không chỉ trích.]");
        }

        var combinedDirective = directiveBuilder.Length > 0 ? directiveBuilder.ToString().Trim() : null;

        // 4. Gọi AI phân tích và phản hồi nếu chưa xử lý bởi Pre-flight Guard
        if (turnResult == null && !string.IsNullOrWhiteSpace(combinedDirective))
        {
            turnResult = await _aiRoleplayService.ProcessTurnAsync(
                levelConfig.Scenario,
                levelConfig,
                session.Messages.ToList(),
                userMessage.JapaneseText,
                pendingMissions,
                combinedDirective,
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

        // 4. Lưu tin nhắn phản hồi của AI (Bảo đảm khử sạch 100% tiếng Việt bị rò rỉ vào câu thoại Nhật)
        var sanitizedJa = RoleplaySocialRegister.SanitizeJapaneseReply(turnResult.JapaneseReply);
        var sanitizedFurigana = !string.IsNullOrWhiteSpace(turnResult.FuriganaHtml) && !RoleplaySocialRegister.HasVietnameseLeak(turnResult.FuriganaHtml)
            ? RoleplaySocialRegister.SanitizeJapaneseReply(turnResult.FuriganaHtml)
            : RoleplaySocialRegister.GenerateFuriganaHtml(sanitizedJa);

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
            if (request.SpeakingDurationSeconds.HasValue || request.ResponseLatencySeconds.HasValue || request.SpeechConfidence.HasValue || request.HintLevelUsed > 0 || request.TranslationPeekCount > 0)
            {
                var duration = request.SpeakingDurationSeconds;
                var pace = (request.MoraRate.HasValue && request.MoraRate.Value > 0)
                    ? Math.Round(request.MoraRate.Value, 1)
                    : (duration.HasValue && duration.Value > 0)
                        ? Math.Round((double)userMessage.JapaneseText.Length / duration.Value, 1)
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

                // 1. Tính toán điểm tự chủ đàm thoại (Scaffolding Autonomy Score)
                int turnAutonomy = 100;
                string autonomyAssessment = "Tự chủ 100% (Không dùng trợ giúp)";
                if (request.HintLevelUsed == 1)
                {
                    turnAutonomy = 90;
                    autonomyAssessment = "Dùng gợi ý Từ khóa (-10đ)";
                }
                else if (request.HintLevelUsed == 2)
                {
                    turnAutonomy = 70;
                    autonomyAssessment = "Dùng gợi ý Khung câu điền từ (-30đ)";
                }
                else if (request.HintLevelUsed >= 3)
                {
                    turnAutonomy = 40;
                    autonomyAssessment = "Dùng gợi ý Mẫu câu hoàn chỉnh (-60đ)";
                }

                if (request.TranslationPeekCount > 1)
                {
                    int peekPenalty = Math.Min(20, (request.TranslationPeekCount - 1) * 5);
                    turnAutonomy = Math.Max(20, turnAutonomy - peekPenalty);
                    autonomyAssessment += $", xem bản dịch {request.TranslationPeekCount} lần (-{peekPenalty}đ)";
                }

                // 2. Tính toán điểm rõ âm phát âm (Acoustic Pronunciation Score)
                int pronClarity = request.SpeechConfidence.HasValue
                    ? (int)Math.Clamp(Math.Round(request.SpeechConfidence.Value * 100), 40, 100)
                    : (request.FallbackToTextInput ? 75 : 85);

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
                    TurnAutonomyScore = turnAutonomy,
                    AutonomyAssessment = autonomyAssessment,
                    PronunciationClarityScore = pronClarity,
                    MoraRate = request.MoraRate,
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
    /// Ước lượng số credit cần trừ dựa trên độ dài câu thoại AI tiếng Nhật.
    /// Mỗi <see cref="CharsPerCredit"/> ký tự = 1 credit, tối thiểu 1 credit.
    /// </summary>
    internal static int EstimateCreditCost(string japaneseReply)
    {
        if (string.IsNullOrWhiteSpace(japaneseReply)) return 1;
        return Math.Max(1, japaneseReply.Length / CharsPerCredit);
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

        int totalSessions = await _dbContext.RoleplaySessions
            .CountAsync(s => s.UserId == userId && s.Status == "Completed", cancellationToken);

        int totalTurns = await _dbContext.LearnerBehaviorSignals
            .Join(_dbContext.RoleplaySessions, sig => sig.SessionId, ses => ses.Id, (sig, ses) => new { sig, ses })
            .CountAsync(x => x.ses.UserId == userId, cancellationToken);

        DateTime? lastPracticed = await _dbContext.RoleplaySessions
            .Where(s => s.UserId == userId && s.CompletedAt != null)
            .OrderByDescending(s => s.CompletedAt)
            .Select(s => s.CompletedAt)
            .FirstOrDefaultAsync(cancellationToken);

        // Suy luận điểm mạnh & điểm cần tôi luyện từ chỉ số thực
        var strengths = new List<string>();
        var focusAreas = new List<string>();

        if (profile.SpeakingReflexIndex >= 65)
            strengths.Add("⚡ Phản xạ hội thoại nhạy bén (< 2.0s)");
        else
            focusAreas.Add("⏱️ Cải thiện tốc độ phản xạ khởi đầu câu");

        if (profile.KeigoCommandScore >= 65)
            strengths.Add("🌸 Sử dụng Kính ngữ (Desu/Masu) tự nhiên chuẩn mực");
        else
            focusAreas.Add("⛩️ Củng cố văn phong thể lịch sự Desu/Masu");

        if (profile.ParticleAccuracyRate >= 70)
            strengths.Add("🎯 Làm chủ chính xác trợ từ は, が, に, で");
        else
            focusAreas.Add("🔍 Chú ý phân biệt cặp trợ từ に vs で, は vs が");

        if (profile.AverageMoraRate >= 4.0)
            strengths.Add("🎙️ Nhịp điệu phát âm lưu loát (≥ 4.0 mora/s)");
        else
            focusAreas.Add("🗣️ Luyện tập nối âm và ngắt nghỉ tự nhiên hơn");

        if (profile.HintDependencyRate <= 25)
            strengths.Add("💪 Tự chủ giao tiếp cao (ít dựa gợi ý)");
        else
            focusAreas.Add("💡 Thử thách tự diễn đạt trước khi mở thẻ gợi ý");

        string omikujiRank = profile.CommunicativeProficiencyIndex >= 85 ? "大吉 (Đại Cát)"
            : profile.CommunicativeProficiencyIndex >= 70 ? "中吉 (Trung Cát)" : "吉 (Cát)";

        var nowUtc = DateTime.UtcNow;
        var dueMasteries = await _dbContext.LearnerSkillMasteries
            .AsNoTracking()
            .Where(m => m.UserId == userId)
            .OrderBy(m => m.NextRecommendedReviewUtc)
            .Take(6)
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
            .ToListAsync(cancellationToken);

        var dto = new LearnerIntelligenceProfileDto
        {
            UserId = userId,
            ThetaEstimate = profile.ThetaEstimate,
            SpeakingReflexIndex = profile.SpeakingReflexIndex,
            KeigoCommandScore = profile.KeigoCommandScore,
            ParticleAccuracyRate = profile.ParticleAccuracyRate,
            AverageMoraRate = profile.AverageMoraRate,
            HintDependencyRate = profile.HintDependencyRate,
            CommunicativeConfidenceScore = profile.CommunicativeConfidenceScore,
            CommunicativeProficiencyIndex = profile.CommunicativeProficiencyIndex,
            TotalSessionsCompleted = totalSessions,
            TotalPracticeTurns = totalTurns,
            Strengths = strengths,
            TargetFocusAreas = focusAreas,
            OmikujiRank = omikujiRank,
            KotowazaProverb = "継続は力なり — Kiên trì mỗi ngày chính là cội nguồn của sức mạnh giao tiếp.",
            LastPracticedAtUtc = lastPracticed,
            DueReviewItems = dueMasteries
        };

        // Trích xuất các đặc trưng hành vi và lộ trình thích ứng ngầm (TikTok-style Trajectory)
        if (!string.IsNullOrWhiteSpace(profile.InferredTraitsJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(profile.InferredTraitsJson);
                var root = doc.RootElement;
                if (root.TryGetProperty("hesitationRate", out var hr)) dto.HesitationRate = hr.GetDouble();
                if (root.TryGetProperty("averageHesitationSeconds", out var ahs)) dto.AverageHesitationSeconds = ahs.GetDouble();
                if (root.TryGetProperty("scaffoldTierPreference", out var stp)) dto.ScaffoldTierPreference = stp.GetString() ?? "Autonomous";
                if (root.TryGetProperty("preferredTone", out var pt)) dto.PreferredTone = pt.GetString() ?? "Polite_Teineigo";
                if (root.TryGetProperty("toneConsistencyScore", out var tcs)) dto.ToneConsistencyScore = tcs.GetDouble();
                if (root.TryGetProperty("dominantWeaknessCategory", out var dwc)) dto.DominantWeaknessCategory = dwc.GetString() ?? "Particles";
                if (root.TryGetProperty("nextRecommendedScenarioId", out var nsi) && nsi.ValueKind == JsonValueKind.Number) dto.NextRecommendedScenarioId = nsi.GetInt32();
                if (root.TryGetProperty("nextRecommendedScenarioCode", out var nsc)) dto.NextRecommendedScenarioCode = nsc.GetString();
                if (root.TryGetProperty("nextRecommendedScenarioTitle", out var nst)) dto.NextRecommendedScenarioTitle = nst.GetString();
                if (root.TryGetProperty("nextRecommendedReason", out var nrr)) dto.NextRecommendedReason = nrr.GetString();
                if (root.TryGetProperty("predictedSuccessRateNextScenario", out var psr)) dto.PredictedSuccessRateNextScenario = psr.GetDouble();
                if (root.TryGetProperty("adaptiveLearningPathStatus", out var alps)) dto.AdaptiveLearningPathStatus = alps.GetString() ?? "Fading_Assistance";
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Không thể parse InferredTraitsJson: {Msg}", ex.Message);
            }
        }

        return ApiResponse<LearnerIntelligenceProfileDto>.Ok(dto);
    }
}

