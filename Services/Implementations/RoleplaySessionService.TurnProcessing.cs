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
}
