using System.Text.Json;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.PlacementTest;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    public class PlacementTestService : IPlacementTestService
    {
        private readonly AppDbContext _dbContext;
        private readonly PlacementAssessmentEngine _engine;
        private readonly IVoiceVoxService? _voiceVoxService;
        private readonly ILogger<PlacementTestService> _logger;

        private static readonly JsonSerializerOptions JsonOpts = new()
        {
            PropertyNameCaseInsensitive = true
        };

        // Speaker ID nữ lễ tân khách sạn lịch sự (VOICEVOX Meimei / Tsumugi / Kurita)
        private const int ReceptionistVoiceSpeakerId = 14;

        public PlacementTestService(
            AppDbContext dbContext,
            PlacementAssessmentEngine engine,
            ILogger<PlacementTestService> logger,
            IVoiceVoxService? voiceVoxService = null)
        {
            _dbContext = dbContext;
            _engine = engine;
            _logger = logger;
            _voiceVoxService = voiceVoxService;
        }

        public async Task<ApiResponse<PlacementTestStatusDto>> GetStatusAsync(string userId, CancellationToken cancellationToken = default)
        {
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
            if (user == null)
            {
                return ApiResponse<PlacementTestStatusDto>.Fail("Không tìm thấy thông tin người dùng.");
            }

            var activeSessionId = await _dbContext.RoleplaySessions
                .Where(s => s.UserId == userId && s.SessionType == "PlacementTest" && s.Status == "Active")
                .Select(s => (int?)s.Id)
                .FirstOrDefaultAsync(cancellationToken);

            var statusDto = new PlacementTestStatusDto
            {
                PlacementTestStatus = string.IsNullOrWhiteSpace(user.PlacementTestStatus) ? "NotStarted" : user.PlacementTestStatus,
                HasSeenPlacementPrompt = user.HasSeenPlacementPrompt,
                ActiveSessionId = activeSessionId,
                InitialEstimatedLevel = user.InitialEstimatedLevel,
                InitialConfidenceTier = user.InitialConfidenceTier,
                InitialProficiencySnapshotJson = user.InitialProficiencySnapshotJson,
                ContextPackage = new HotelContextPackageDto
                {
                    GuestName = "Tanaka",
                    ReceptionistSpeakerId = ReceptionistVoiceSpeakerId
                }
            };

            return ApiResponse<PlacementTestStatusDto>.Ok(statusDto);
        }

        public async Task<ApiResponse<PlacementTestStartResponseDto>> StartOrResumeSessionAsync(string userId, bool reset = false, CancellationToken cancellationToken = default)
        {
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
            if (user == null)
            {
                return ApiResponse<PlacementTestStartResponseDto>.Fail("Không tìm thấy thông tin người dùng.");
            }

                        if (reset)
            {
                var activeSessions = await _dbContext.RoleplaySessions
                    .Where(s => s.UserId == userId && s.SessionType == "PlacementTest" && s.Status == "Active")
                    .ToListAsync(cancellationToken);

                foreach (var s in activeSessions)
                {
                    // Phien dang do ma bi reset: Danh dau la Abandoned, tuyet doi khong gan Completed
                    s.Status = "Abandoned";
                    s.CompletedAt = DateTime.UtcNow;
                }
                user.PlacementTestStatus = "InProgress";
                await _dbContext.SaveChangesAsync(cancellationToken);
            }
            else
            {
                // Kiểm tra xem có phiên InProgress đang dở không để Resume (BR-PT-16)
                var existingSession = await _dbContext.RoleplaySessions
                    .Include(s => s.Messages)
                    .FirstOrDefaultAsync(s => s.UserId == userId && s.SessionType == "PlacementTest" && s.Status == "Active", cancellationToken);

                if (existingSession != null)
                {
                    var existingState = !string.IsNullOrWhiteSpace(existingSession.AssessmentStateJson)
                        ? JsonSerializer.Deserialize<PlacementAssessmentState>(existingSession.AssessmentStateJson, JsonOpts) ?? new PlacementAssessmentState()
                        : new PlacementAssessmentState();

                    var history = existingSession.Messages
                        .OrderBy(m => m.CreatedAt)
                        .Select(m => new PlacementTestTurnMessageDto
                        {
                            Id = m.Id,
                            Sender = m.Sender,
                            JapaneseText = m.JapaneseText,
                            VietnameseMeaning = m.VietnameseMeaning,
                            FuriganaHtml = m.FuriganaHtml,
                            CreatedAt = m.CreatedAt
                        })
                        .ToList();

                    var opening = history.FirstOrDefault(m => m.Sender == "Ai") ?? new PlacementTestTurnMessageDto();

                    return ApiResponse<PlacementTestStartResponseDto>.Ok(new PlacementTestStartResponseDto
                    {
                        SessionId = existingSession.Id,
                        Status = existingSession.Status,
                        CurrentEvent = existingState.CurrentEvent,
                        CurrentDifficultyBand = existingState.CurrentDifficultyBand,
                        IsResumed = true,
                        OpeningMessage = opening,
                        MessageHistory = history,
                        ContextPackage = new HotelContextPackageDto
                        {
                            GuestName = "Tanaka",
                    ReceptionistSpeakerId = ReceptionistVoiceSpeakerId
                        },
                        EventSummaries = existingState.EventSummaries
                    }, "Tiếp tục bài kiểm tra xếp lớp đang dở.");
                }
            }

            // 3. Khởi tạo phiên mới (BR-PT-05: CreditDeducted = 0)
            var levelConfigId = await _dbContext.ScenarioLevelConfigurations
                .Select(c => c.Id)
                .FirstOrDefaultAsync(cancellationToken);

            var initialState = new PlacementAssessmentState
            {
                CurrentEvent = "EVT-01",
                CurrentDifficultyBand = "N4"
            };

            var newSession = new RoleplaySession
            {
                UserId = userId,
                ScenarioLevelConfigurationId = levelConfigId > 0 ? levelConfigId : 1,
                Status = "Active",
                CreditDeducted = 0, // Miễn phí 100%
                IsNaturallyConcluded = false,
                SessionType = "PlacementTest",
                AssessmentStateJson = JsonSerializer.Serialize(initialState),
                CreatedAt = DateTime.UtcNow
            };

            _dbContext.RoleplaySessions.Add(newSession);
            await _dbContext.SaveChangesAsync(cancellationToken);

            // Câu mở đầu chuẩn mực của Lễ tân khách sạn Sakura
            const string openingJa = "いらっしゃいませ。ホテルさくらへようこそ。本日のチェックインでいらっしゃいますか？お名前をお伺いしてもよろしいでしょうか？";
            const string openingVi = "Xin kính chào quý khách! Chào mừng quý khách đến với Khách sạn Sakura. Quý khách đến nhận phòng hôm nay phải không ạ? Xin phép được hỏi quý khách tên là gì ạ?";
            var openingFurigana = RoleplaySocialRegister.GenerateFuriganaHtml(openingJa);

            var openingMsg = new RoleplayMessage
            {
                RoleplaySessionId = newSession.Id,
                Sender = "Ai",
                JapaneseText = openingJa,
                VietnameseMeaning = openingVi,
                FuriganaHtml = openingFurigana,
                CreatedAt = DateTime.UtcNow
            };

            _dbContext.RoleplayMessages.Add(openingMsg);

            user.PlacementTestStatus = "InProgress";
            user.HasSeenPlacementPrompt = true;

            await _dbContext.SaveChangesAsync(cancellationToken);

            // Pre-synthesis giọng đọc VOICEVOX mở đầu (0ms latency cho client)
            if (_voiceVoxService != null)
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _voiceVoxService.SynthesizeAsync(openingJa, ReceptionistVoiceSpeakerId, CancellationToken.None);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug("Placement VoiceVox pre-synthesis failed: {Msg}", ex.Message);
                    }
                });
            }

            var openingDto = new PlacementTestTurnMessageDto
            {
                Id = openingMsg.Id,
                Sender = openingMsg.Sender,
                JapaneseText = openingMsg.JapaneseText,
                VietnameseMeaning = openingMsg.VietnameseMeaning,
                FuriganaHtml = openingMsg.FuriganaHtml,
                CreatedAt = openingMsg.CreatedAt
            };

            return ApiResponse<PlacementTestStartResponseDto>.Ok(new PlacementTestStartResponseDto
            {
                SessionId = newSession.Id,
                Status = newSession.Status,
                CurrentEvent = initialState.CurrentEvent,
                CurrentDifficultyBand = initialState.CurrentDifficultyBand,
                IsResumed = false,
                OpeningMessage = openingDto,
                MessageHistory = [openingDto],
                ContextPackage = new HotelContextPackageDto
                {
                    GuestName = "Tanaka",
                    ReceptionistSpeakerId = ReceptionistVoiceSpeakerId
                }
            }, "Bắt đầu bài kiểm tra xếp lớp thành công.");
        }

        public async Task<ApiResponse<bool>> SkipTestAsync(string userId, CancellationToken cancellationToken = default)
        {
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
            if (user == null)
            {
                return ApiResponse<bool>.Fail("Không tìm thấy thông tin người dùng.");
            }

            user.HasSeenPlacementPrompt = true;
            if (user.PlacementTestStatus == "NotStarted")
            {
                user.PlacementTestStatus = "Skipped";
            }

            await _dbContext.SaveChangesAsync(cancellationToken);
            return ApiResponse<bool>.Ok(true, "Đã bỏ qua bài kiểm tra xếp lớp.");
        }

        public async Task<ApiResponse<PlacementTestMessageResponseDto>> ProcessMessageAsync(
            string userId,
            int sessionId,
            PlacementTestMessageRequestDto request,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(request.Message))
            {
                return ApiResponse<PlacementTestMessageResponseDto>.Fail("Nội dung tin nhắn không được để trống.");
            }

            var session = await _dbContext.RoleplaySessions
                .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId && s.SessionType == "PlacementTest", cancellationToken);

            if (session == null)
            {
                return ApiResponse<PlacementTestMessageResponseDto>.Fail("Không tìm thấy phiên kiểm tra xếp lớp.");
            }

            if (session.Status != "Active")
            {
                return ApiResponse<PlacementTestMessageResponseDto>.Fail("Phiên kiểm tra này đã kết thúc.");
            }

            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
            const string guestName = "Tanaka (田中)";

            var state = !string.IsNullOrWhiteSpace(session.AssessmentStateJson)
                ? JsonSerializer.Deserialize<PlacementAssessmentState>(session.AssessmentStateJson, JsonOpts) ?? new PlacementAssessmentState()
                : new PlacementAssessmentState();

            // Gọi Engine thích ứng
            var (updatedState, outcome) = await _engine.EvaluateTurnAsync(state, request, guestName, cancellationToken);

            // Lưu tin nhắn User
            var userMsg = new RoleplayMessage
            {
                RoleplaySessionId = session.Id,
                Sender = "User",
                JapaneseText = request.Message.Trim(),
                VietnameseMeaning = outcome.UserVietnameseMeaning,
                FuriganaHtml = outcome.UserFuriganaHtml,
                CreatedAt = DateTime.UtcNow
            };
            _dbContext.RoleplayMessages.Add(userMsg);

            // Lưu tin nhắn AI
            var aiMsg = new RoleplayMessage
            {
                RoleplaySessionId = session.Id,
                Sender = "Ai",
                JapaneseText = outcome.AiReplyJapanese,
                VietnameseMeaning = outcome.AiReplyVietnamese,
                FuriganaHtml = outcome.AiReplyFuriganaHtml,
                CreatedAt = DateTime.UtcNow
            };
            _dbContext.RoleplayMessages.Add(aiMsg);

            // Cập nhật trạng thái session
            session.AssessmentStateJson = JsonSerializer.Serialize(updatedState);
            session.UpdatedAt = DateTime.UtcNow;

            // Xử lý hoàn tất nếu kết thúc phiên
            if (outcome.IsConcluded)
            {
                session.CompletedAt = DateTime.UtcNow;
                session.IsNaturallyConcluded = outcome.TerminationReason == "CompletedNormally";

                if (outcome.TerminationReason == "CompletedNormally")
                {
                    session.Status = "Completed";
                    var finalResult = _engine.ComputeFinalResult(session.Id, updatedState);

                    if (user != null)
                    {
                        user.PlacementTestStatus = finalResult.PlacementTestStatus;
                        user.InitialEstimatedLevel = finalResult.InitialEstimatedLevel;
                        user.InitialConfidenceTier = finalResult.InitialConfidenceTier;
                        user.InitialProficiencySnapshotJson = JsonSerializer.Serialize(finalResult);
                        user.PlacementTestCompletedAtUtc = DateTime.UtcNow;

                        // Cập nhật JLPTLevel cơ sở nếu xác định được bậc
                        if (finalResult.InitialEstimatedLevel.StartsWith("N"))
                        {
                            var baseLevel = finalResult.InitialEstimatedLevel.Split('-')[0];
                            user.JLPTLevel = baseLevel;
                        }
                    }
                }
                else
                {
                    session.Status = "TerminatedEarly";
                    if (user != null)
                    {
                        user.PlacementTestStatus = "InsufficientEvidence";
                    }
                }
            }

            await _dbContext.SaveChangesAsync(cancellationToken);

            // Pre-synthesize giọng đọc AI câu tiếp theo
            if (_voiceVoxService != null && !string.IsNullOrWhiteSpace(outcome.AiReplyJapanese))
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _voiceVoxService.SynthesizeAsync(outcome.AiReplyJapanese, ReceptionistVoiceSpeakerId, CancellationToken.None);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug("Placement VoiceVox turn pre-synthesis failed: {Msg}", ex.Message);
                    }
                });
            }

            var responseDto = new PlacementTestMessageResponseDto
            {
                SessionId = session.Id,
                UserMessage = new PlacementTestTurnMessageDto
                {
                    Id = userMsg.Id,
                    Sender = userMsg.Sender,
                    JapaneseText = userMsg.JapaneseText,
                    VietnameseMeaning = userMsg.VietnameseMeaning,
                    FuriganaHtml = userMsg.FuriganaHtml,
                    CreatedAt = userMsg.CreatedAt
                },
                AiMessage = new PlacementTestTurnMessageDto
                {
                    Id = aiMsg.Id,
                    Sender = aiMsg.Sender,
                    JapaneseText = aiMsg.JapaneseText,
                    VietnameseMeaning = aiMsg.VietnameseMeaning,
                    FuriganaHtml = aiMsg.FuriganaHtml,
                    CreatedAt = aiMsg.CreatedAt
                },
                CurrentEvent = updatedState.CurrentEvent,
                CurrentDifficultyBand = updatedState.CurrentDifficultyBand,
                ScaffoldingStep = updatedState.CurrentEventScaffoldingStep,
                InputClassification = outcome.InputClassification,
                DetectedIntent = outcome.DetectedIntent,
                DemonstratedBand = outcome.DemonstratedBand,
                IsConcluded = outcome.IsConcluded,
                TerminationReason = outcome.TerminationReason,
                IsStrikeWarning = outcome.IsStrikeWarning,
                StrikeWarningMessage = outcome.StrikeWarningMessage,
                TaskFulfillmentScore = outcome.TaskFulfillmentScore,
                GrammarAccuracyScore = outcome.GrammarAccuracyScore,
                VocabularyRangeScore = outcome.VocabularyRangeScore,
                PragmaticsScore = outcome.PragmaticsScore,
                OverallTurnScore = outcome.OverallTurnScore,
                EvidenceNote = outcome.EvidenceNote,
                EstimatedLevelSoFar = updatedState.CurrentDifficultyBand,
                EventSummaries = updatedState.EventSummaries
            };

            return ApiResponse<PlacementTestMessageResponseDto>.Ok(responseDto);
        }

        public async Task<ApiResponse<PlacementTestCompleteResponseDto>> CompleteSessionAsync(
            string userId,
            int sessionId,
            CancellationToken cancellationToken = default)
        {
            var session = await _dbContext.RoleplaySessions
                .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId && s.SessionType == "PlacementTest", cancellationToken);

            if (session == null)
            {
                return ApiResponse<PlacementTestCompleteResponseDto>.Fail("Không tìm thấy phiên kiểm tra xếp lớp.");
            }

            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
            if (user == null)
            {
                return ApiResponse<PlacementTestCompleteResponseDto>.Fail("Không tìm thấy thông tin người dùng.");
            }

            var state = !string.IsNullOrWhiteSpace(session.AssessmentStateJson)
                ? JsonSerializer.Deserialize<PlacementAssessmentState>(session.AssessmentStateJson, JsonOpts) ?? new PlacementAssessmentState()
                : new PlacementAssessmentState();

            var finalResult = _engine.ComputeFinalResult(session.Id, state);

            session.Status = finalResult.PlacementTestStatus == "Completed" ? "Completed" : "InsufficientEvidence";
            session.CompletedAt = DateTime.UtcNow;

            user.PlacementTestStatus = finalResult.PlacementTestStatus;
            user.InitialEstimatedLevel = finalResult.InitialEstimatedLevel;
            user.InitialConfidenceTier = finalResult.InitialConfidenceTier;
            user.InitialProficiencySnapshotJson = JsonSerializer.Serialize(finalResult);
            user.PlacementTestCompletedAtUtc = DateTime.UtcNow;

            if (finalResult.PlacementTestStatus == "Completed" && finalResult.InitialEstimatedLevel.StartsWith("N"))
            {
                var baseLevel = finalResult.InitialEstimatedLevel.Split('-')[0];
                user.JLPTLevel = baseLevel;
            }

            await _dbContext.SaveChangesAsync(cancellationToken);

            return ApiResponse<PlacementTestCompleteResponseDto>.Ok(finalResult, "Hoàn tất bài kiểm tra xếp lớp.");
        }
    
        public async Task<ApiResponse<List<PlacementTestHistoryItemDto>>> GetHistoryListAsync(
            string userId,
            CancellationToken cancellationToken = default)
        {
            var sessions = await _dbContext.RoleplaySessions
                .Include(s => s.Messages)
                .Where(s => s.UserId == userId && s.SessionType == "PlacementTest" && s.Status != "Abandoned")
                .OrderByDescending(s => s.CreatedAt)
                .ToListAsync(cancellationToken);

            var items = new List<PlacementTestHistoryItemDto>();

            foreach (var session in sessions)
            {
                var userMessageCount = session.Messages.Count(m => m.Sender == "User");
                var state = !string.IsNullOrWhiteSpace(session.AssessmentStateJson)
                    ? JsonSerializer.Deserialize<PlacementAssessmentState>(session.AssessmentStateJson, JsonOpts) ?? new PlacementAssessmentState()
                    : new PlacementAssessmentState();

                // Loc bo phien rac/trung lap: khong co bat ky cau noi nao cua nguoi hoc hoac khong co bang chung
                if (userMessageCount == 0 && state.TurnEvidences.Count == 0)
                {
                    continue;
                }

                var finalResult = _engine.ComputeFinalResult(session.Id, state);

                items.Add(new PlacementTestHistoryItemDto
                {
                    SessionId = session.Id,
                    Status = session.Status,
                    InitialEstimatedLevel = finalResult.InitialEstimatedLevel,
                    InitialConfidenceTier = finalResult.InitialConfidenceTier,
                    OverallScore = finalResult.OverallScore,
                    TaskFulfillmentScore = finalResult.TaskFulfillmentScore,
                    GrammarAccuracyScore = finalResult.GrammarAccuracyScore,
                    VocabularyRangeScore = finalResult.VocabularyRangeScore,
                    PragmaticsScore = finalResult.PragmaticsScore,
                    TotalTurns = state.TurnEvidences.Count > 0 ? state.TurnEvidences.Count : userMessageCount,
                    FulfilledEventsCount = state.EventSummaries.Count(e => e.OutcomeStatus.StartsWith("Fulfilled")),
                    CreatedAt = DateTime.SpecifyKind(session.CreatedAt, DateTimeKind.Utc),
                    CompletedAt = session.CompletedAt.HasValue ? DateTime.SpecifyKind(session.CompletedAt.Value, DateTimeKind.Utc) : null
                });
            }

            return ApiResponse<List<PlacementTestHistoryItemDto>>.Ok(items);
        }

        public async Task<ApiResponse<PlacementTestHistoryDetailDto>> GetHistoryDetailAsync(
            string userId,
            int sessionId,
            CancellationToken cancellationToken = default)
        {
            var session = await _dbContext.RoleplaySessions
                .Include(s => s.Messages)
                .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId && s.SessionType == "PlacementTest", cancellationToken);

            if (session == null)
            {
                return ApiResponse<PlacementTestHistoryDetailDto>.Fail("Không tìm thấy phiên kiểm tra xếp lớp.");
            }

            var state = !string.IsNullOrWhiteSpace(session.AssessmentStateJson)
                ? JsonSerializer.Deserialize<PlacementAssessmentState>(session.AssessmentStateJson, JsonOpts) ?? new PlacementAssessmentState()
                : new PlacementAssessmentState();

            foreach (var turn in state.TurnEvidences)
            {
                turn.OverallTurnScore ??= PlacementAssessmentEngine.ComputeTurnOverallScore(
                    turn.TaskFulfillmentScore,
                    turn.GrammarAccuracyScore,
                    turn.VocabularyRangeScore,
                    turn.PragmaticsScore);
            }

            var finalResult = _engine.ComputeFinalResult(session.Id, state);

            var messages = session.Messages
                .OrderBy(m => m.CreatedAt)
                .Select(m => new PlacementTestTurnMessageDto
                {
                    Id = m.Id,
                    Sender = m.Sender,
                    JapaneseText = m.JapaneseText,
                    VietnameseMeaning = m.VietnameseMeaning,
                    FuriganaHtml = m.FuriganaHtml,
                    CreatedAt = DateTime.SpecifyKind(m.CreatedAt, DateTimeKind.Utc)
                })
                .ToList();

            var detail = new PlacementTestHistoryDetailDto
            {
                SessionId = session.Id,
                Status = session.Status,
                InitialEstimatedLevel = finalResult.InitialEstimatedLevel,
                InitialConfidenceTier = finalResult.InitialConfidenceTier,
                OverallScore = finalResult.OverallScore,
                TaskFulfillmentScore = finalResult.TaskFulfillmentScore,
                GrammarAccuracyScore = finalResult.GrammarAccuracyScore,
                VocabularyRangeScore = finalResult.VocabularyRangeScore,
                PragmaticsScore = finalResult.PragmaticsScore,
                SummaryFeedback = finalResult.SummaryFeedback,
                Disclaimer = finalResult.Disclaimer,
                CreatedAt = DateTime.SpecifyKind(session.CreatedAt, DateTimeKind.Utc),
                CompletedAt = session.CompletedAt.HasValue ? DateTime.SpecifyKind(session.CompletedAt.Value, DateTimeKind.Utc) : null,
                EventSummaries = state.EventSummaries,
                TurnEvidences = state.TurnEvidences,
                MessageHistory = messages
            };

            return ApiResponse<PlacementTestHistoryDetailDto>.Ok(detail);
        }
    }
}