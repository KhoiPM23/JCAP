using System.Text.Json;
using System.Text.RegularExpressions;
using JCAP.DTOs.PlacementTest;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Động cơ điều phối và đánh giá thích ứng của bài Placement Test (EVT-01 .. EVT-05).
    /// Hoạt động độc lập, không phụ thuộc vào RoleplaySessionService hay TelemetryEvaluatorService.
    /// </summary>
    public sealed class PlacementAssessmentEngine
    {
        private readonly IAiClient _aiClient;
        private readonly IVietnameseLearnerErrorDetector _errorDetector;
        private readonly ILogger<PlacementAssessmentEngine> _logger;

        private static readonly JsonSerializerOptions JsonOpts = new()
        {
            PropertyNameCaseInsensitive = true
        };

        // Danh sách cụm từ báo hiệu khó khăn giao tiếp (Communication Difficulty)
        private static readonly string[] CommunicationDifficultyPhrases =
        [
            "わかりません", "分かりません", "分りません",
            "もう一度", "もういちど", "もう一回", "もういっかい",
            "ゆっくり", "ゆっくり話して", "ゆっくりおねがいします",
            "聞き取れません", "聞き取れなかった", "ききとれません",
            "意味が分かりません", "意味がわかりません",
            "何と言いましたか", "なんと言いましたか", "えっ？", "え？"
        ];

        public PlacementAssessmentEngine(
            IAiClient aiClient,
            IVietnameseLearnerErrorDetector errorDetector,
            ILogger<PlacementAssessmentEngine> logger)
        {
            _aiClient = aiClient;
            _errorDetector = errorDetector;
            _logger = logger;
        }

        /// <summary>
        /// Kiểm tra nhanh tiền xử lý (Pre-flight check) 0 token: spam, thô tục, ngoại ngữ thuần, hoặc khó khăn giao tiếp.
        /// </summary>
        public string PreflightClassify(string? text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                return "AbusiveOrSpam";
            }

            var trimmed = text.Trim();

            // 1. Ký tự lặp vô nghĩa (e.g. "aaaaa", "?????", "......", "123123")
            if (Regex.IsMatch(trimmed, @"^(.)\1{3,}$") || Regex.IsMatch(trimmed, @"^[\d\s\p{P}]+$"))
            {
                return "AbusiveOrSpam";
            }

            // 2. Không có bất kỳ ký tự tiếng Nhật nào (Hiragana, Katakana, Kanji)
            if (RoleplaySocialRegister.IsPureForeignOrVietnamese(trimmed))
            {
                return "AbusiveOrSpam";
            }

            // 3. Khó khăn giao tiếp (Học viên bày tỏ không hiểu, xin nói lại, nói chậm lại)
            foreach (var phrase in CommunicationDifficultyPhrases)
            {
                if (trimmed.Contains(phrase, StringComparison.OrdinalIgnoreCase))
                {
                    return "CommunicationDifficulty";
                }
            }

            return "CandidateValid";
        }

        /// <summary>
        /// Xử lý 1 lượt đối thoại của học viên qua 1 lần gọi LLM kết hợp Conditional Event Directives.
        /// </summary>
        public async Task<(PlacementAssessmentState UpdatedState, EngineTurnOutcome Outcome)> EvaluateTurnAsync(
            PlacementAssessmentState state,
            PlacementTestMessageRequestDto request,
            string userFullName,
            CancellationToken cancellationToken = default)
        {
            var userText = request.Message.Trim();
            var preflight = PreflightClassify(userText);
            var turnIndex = state.TurnEvidences.Count + 1;

            // XỬ LÝ NHÓM 1: SPAM HOẶC NGOẠI NGỮ THUẦN (0 Token LLM Guard)
            if (preflight == "AbusiveOrSpam")
            {
                state.AbuseOrSpamStrikeCount++;
                var isMaxSpam = state.AbuseOrSpamStrikeCount >= 3;

                string aiJa;
                string aiVi;
                if (isMaxSpam)
                {
                    state.TerminationReason = "AbuseOrSpamLimit";
                    aiJa = "恐れ入りますが、日本語での確認が難しいため、本日の手続きはいったん保留とさせていただきます。またのご利用をお待ちしております。";
                    aiVi = "Rất xin lỗi quý khách, vì không thể xác nhận thông tin bằng tiếng Nhật nên thủ tục hôm nay xin phép tạm dừng. Hẹn gặp lại quý khách lần sau.";
                }
                else
                {
                    aiJa = "恐れ入りますが、日本語でお話しいただけますでしょうか。チェックインのお手続きを続けさせていただきます。";
                    aiVi = "Xin thứ lỗi, quý khách có thể trao đổi bằng tiếng Nhật được không ạ? Chúng tôi xin phép tiếp tục hỗ trợ thủ tục nhận phòng.";
                }

                var spamEvidence = new PlacementTurnEvidence
                {
                    TurnIndex = turnIndex,
                    EventCode = state.CurrentEvent,
                    PromptDifficultyBand = state.CurrentDifficultyBand,
                    ScaffoldingStepUsed = state.CurrentEventScaffoldingStep,
                    InputClassification = "AbusiveOrSpam",
                    DetectedIntent = "SpamOrForeignLanguage",
                    DemonstratedBand = "Unobserved",
                    TaskFulfillmentScore = 0,
                    GrammarAccuracyScore = 0,
                    VocabularyRangeScore = 0,
                    PragmaticsScore = 0,
                    SpeechDeliveryReference = BuildSpeechReference(request),
                    EvidenceNote = "Phát hiện ký tự lặp, spam hoặc văn bản không chứa ký tự tiếng Nhật."
                };
                state.TurnEvidences.Add(spamEvidence);

                return (state, new EngineTurnOutcome
                {
                    AiReplyJapanese = aiJa,
                    AiReplyVietnamese = aiVi,
                    AiReplyFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(aiJa),
                    UserVietnameseMeaning = userText,
                    UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userText),
                    InputClassification = "AbusiveOrSpam",
                    DetectedIntent = "SpamOrForeignLanguage",
                    DemonstratedBand = "Unobserved",
                    IsStrikeWarning = !isMaxSpam,
                    StrikeWarningMessage = !isMaxSpam ? $"Cảnh báo nhắc nhở ({state.AbuseOrSpamStrikeCount}/3): Vui lòng sử dụng tiếng Nhật có ý nghĩa để hoàn thành bài đánh giá xếp lớp." : "Bài kiểm tra đã dừng do vi phạm quy tắc hội thoại quá 3 lần.",
                    IsConcluded = isMaxSpam,
                    TerminationReason = state.TerminationReason
                });
            }

            // XỬ LÝ NHÓM 2: KHÓ KHĂN GIAO TIẾP (COMMUNICATION DIFFICULTY - Không phạt strike, hỗ trợ thích ứng)
            if (preflight == "CommunicationDifficulty")
            {
                state.CommunicationDifficultyCount++;
                state.CurrentEventScaffoldingStep++;

                // Hạ bậc độ khó câu hỏi của AI để học viên dễ tiếp cận hơn
                if (state.CurrentDifficultyBand == "N3") state.CurrentDifficultyBand = "N4";
                else if (state.CurrentDifficultyBand == "N4") state.CurrentDifficultyBand = "N5";

                var commOutcome = GenerateScaffoldingAiReply(state);

                var commEvidence = new PlacementTurnEvidence
                {
                    TurnIndex = turnIndex,
                    EventCode = state.CurrentEvent,
                    PromptDifficultyBand = state.CurrentDifficultyBand,
                    ScaffoldingStepUsed = state.CurrentEventScaffoldingStep,
                    InputClassification = "CommunicationDifficulty",
                    DetectedIntent = "CommunicationDifficulty",
                    DemonstratedBand = "N5",
                    TaskFulfillmentScore = 50,
                    GrammarAccuracyScore = 60,
                    VocabularyRangeScore = 50,
                    PragmaticsScore = 70, // Đánh giá cao việc biết nhờ vả/xin nói lại lịch sự
                    SpeechDeliveryReference = BuildSpeechReference(request),
                    EvidenceNote = "Người học sử dụng chiến lược giao tiếp nhờ nhắc lại hoặc bày tỏ chưa hiểu. Hệ thống hạ độ khó câu hỏi AI và gợi ý diễn đạt."
                };
                state.TurnEvidences.Add(commEvidence);

                // Nếu đã hỗ trợ đến bước 3 tại cùng 1 sự kiện mà vẫn khó khăn -> chuyển sang event kế tiếp
                if (state.CurrentEventScaffoldingStep >= 3)
                {
                    RecordEventSummary(state, "InsufficientEvidence", "Cần hỗ trợ gợi ý quá 2 lần tại sự kiện này; chuyển tiếp sang tình huống khác.");
                    AdvanceToNextEvent(state);
                }

                return (state, commOutcome);
            }

            // XỬ LÝ NHÓM 3 & 4: CANDIDATE VALID HOẶC OFF-TOPIC (Gọi LLM 1 lần duy nhất)
            var systemInstruction = BuildSystemInstruction(state, userFullName);
            var userPrompt = BuildUserPrompt(state, userText);

            var aiReq = AiRequest.CreateJson(systemInstruction, userPrompt, temperature: 0.3);
            var aiResp = await _aiClient.GenerateAsync(aiReq, cancellationToken);

            if (!aiResp.IsSuccess || string.IsNullOrWhiteSpace(aiResp.Content))
            {
                _logger.LogWarning("LLM Placement Test call failed: {Err}", aiResp.ErrorMessage);
                return FallbackSafeResponse(state, request, userText);
            }

            try
            {
                using var doc = JsonDocument.Parse(aiResp.Content);
                var root = doc.RootElement;

                var replyJa = root.TryGetProperty("replyJapanese", out var rj) ? rj.GetString() ?? "" : "";
                var replyVi = root.TryGetProperty("replyVietnamese", out var rv) ? rv.GetString() ?? "" : "";
                var replyFurigana = root.TryGetProperty("replyFuriganaHtml", out var rf) ? rf.GetString() : null;
                var userVi = root.TryGetProperty("userVietnameseMeaning", out var uv) ? uv.GetString() ?? userText : userText;
                var userFurigana = root.TryGetProperty("userFuriganaHtml", out var uf) ? uf.GetString() : null;

                var analysis = root.GetProperty("turnAnalysis");
                var inputCat = analysis.TryGetProperty("inputCategory", out var ic) ? ic.GetString() ?? "Valid" : "Valid";
                var detectedIntent = analysis.TryGetProperty("detectedIntent", out var di) ? di.GetString() ?? "GeneralResponse" : "GeneralResponse";
                var demonstratedBand = analysis.TryGetProperty("demonstratedBand", out var db) ? db.GetString() ?? "N4" : "N4";
                var taskScore = analysis.TryGetProperty("taskFulfillmentScore", out var ts) ? ts.GetInt32() : 75;
                var grammarScore = analysis.TryGetProperty("grammarAccuracyScore", out var gs) ? gs.GetInt32() : 75;
                var vocabScore = analysis.TryGetProperty("vocabularyRangeScore", out var vs) ? vs.GetInt32() : 75;
                var pragmaticsScore = analysis.TryGetProperty("pragmaticsScore", out var ps) ? ps.GetInt32() : 75;
                var evidenceNote = analysis.TryGetProperty("evidenceNote", out var en) ? en.GetString() ?? "" : "";

                // Quét nhanh các lỗi ngữ pháp đặc thù người Việt (E01-E10)
                var detectedErrors = _errorDetector.DetectErrors(userText);
                var errorCodes = detectedErrors.Select(e => e.Code).ToList();
                if (errorCodes.Count > 0)
                {
                    grammarScore = Math.Max(40, grammarScore - (errorCodes.Count * 10));
                }

                // XỬ LÝ OFF-TOPIC STRIKE
                bool isStrikeWarning = false;
                string? strikeWarningMsg = null;
                if (inputCat == "OffTopic" || detectedIntent.Equals("OffTopic", StringComparison.OrdinalIgnoreCase))
                {
                    state.ConsecutiveOffTopicCount++;
                    if (state.ConsecutiveOffTopicCount >= 3)
                    {
                        state.TerminationReason = "OffTopicLimit";
                        replyJa = "恐れ入りますが、お話が確認できませんでしたので、本日のチェックインは保留とさせていただきます。";
                        replyVi = "Xin thứ lỗi, do không thể xác nhận thông tin liên quan nên thủ tục nhận phòng hôm nay xin phép tạm dừng.";
                    }
                    else
                    {
                        isStrikeWarning = true;
                        strikeWarningMsg = $"Lưu ý ({state.ConsecutiveOffTopicCount}/3): Vui lòng phản hồi đúng theo bối cảnh làm thủ tục nhận phòng khách sạn.";
                    }
                }
                else
                {
                    // Reset bộ đếm off-topic liên tiếp ngay khi có câu đúng chủ đề
                    state.ConsecutiveOffTopicCount = 0;
                    state.ValidEvidenceTurnCount++;
                }

                // Ghi nhận bằng chứng lượt
                var turnEvidence = new PlacementTurnEvidence
                {
                    TurnIndex = turnIndex,
                    EventCode = state.CurrentEvent,
                    PromptDifficultyBand = state.CurrentDifficultyBand,
                    ScaffoldingStepUsed = state.CurrentEventScaffoldingStep,
                    InputClassification = inputCat,
                    DetectedIntent = detectedIntent,
                    DemonstratedBand = demonstratedBand,
                    TaskFulfillmentScore = taskScore,
                    GrammarAccuracyScore = grammarScore,
                    VocabularyRangeScore = vocabScore,
                    PragmaticsScore = pragmaticsScore,
                    SpeechDeliveryReference = BuildSpeechReference(request),
                    DetectedRuleErrorCodes = errorCodes,
                    EvidenceNote = evidenceNote
                };
                state.TurnEvidences.Add(turnEvidence);

                // ĐIỀU CHỈNH TRẠNG THÁI SỰ KIỆN VÀ ĐỘ KHÓ (STATE MACHINE COMMIT)
                ApplyEventTransition(state, detectedIntent, demonstratedBand, taskScore, grammarScore, evidenceNote);

                var isConcluded = state.TerminationReason != "None" || state.CurrentEvent == "CONCLUDED";

                return (state, new EngineTurnOutcome
                {
                    AiReplyJapanese = replyJa,
                    AiReplyVietnamese = replyVi,
                    AiReplyFuriganaHtml = !string.IsNullOrWhiteSpace(replyFurigana) ? replyFurigana : RoleplaySocialRegister.GenerateFuriganaHtml(replyJa),
                    UserVietnameseMeaning = userVi,
                    UserFuriganaHtml = !string.IsNullOrWhiteSpace(userFurigana) ? userFurigana : RoleplaySocialRegister.GenerateFuriganaHtml(userText),
                    InputClassification = inputCat,
                    DetectedIntent = detectedIntent,
                    DemonstratedBand = demonstratedBand,
                    IsStrikeWarning = isStrikeWarning,
                    StrikeWarningMessage = strikeWarningMsg,
                    IsConcluded = isConcluded,
                    TerminationReason = state.TerminationReason
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error parsing Placement Test LLM output");
                return FallbackSafeResponse(state, request, userText);
            }
        }

        /// <summary>
        /// Chuyển dịch trạng thái sự kiện và cập nhật bậc độ khó dựa trên kết quả lượt (Backend controlled).
        /// </summary>
        private static void ApplyEventTransition(
            PlacementAssessmentState state,
            string detectedIntent,
            string demonstratedBand,
            int taskScore,
            int grammarScore,
            string evidenceNote)
        {
            // Điều chỉnh bậc độ khó thích ứng cho câu hỏi của AI (Step-up / Maintain / Step-down)
            if (taskScore >= 75 && grammarScore >= 75)
            {
                if (state.CurrentDifficultyBand == "N5") state.CurrentDifficultyBand = "N4";
                else if (state.CurrentDifficultyBand == "N4" && demonstratedBand == "N3") state.CurrentDifficultyBand = "N3";
            }
            else if (taskScore < 55)
            {
                if (state.CurrentDifficultyBand == "N3") state.CurrentDifficultyBand = "N4";
                else if (state.CurrentDifficultyBand == "N4") state.CurrentDifficultyBand = "N5";
            }

            // Chuyển dịch Event
            switch (state.CurrentEvent)
            {
                case "EVT-01":
                    if (detectedIntent is "ConfirmReservation" or "ConfirmReservationWithQuietRequest")
                    {
                        state.ReservationConfirmed = true;
                        RecordEventSummary(state, "Fulfilled", demonstratedBand, evidenceNote);
                        state.CurrentEvent = "EVT-02";
                        state.CurrentEventScaffoldingStep = 0;
                        state.CurrentEventStayCount = 0;
                    }
                    break;

                case "EVT-02":
                    if (detectedIntent is "RequestRoomChange" or "ExpressConcernNearElevator")
                    {
                        state.RoomChangeRequested = true;
                        RecordEventSummary(state, "Fulfilled", demonstratedBand, evidenceNote);
                        state.CurrentEvent = "EVT-03";
                        state.CurrentEventScaffoldingStep = 0;
                        state.CurrentEventStayCount = 0;
                    }
                    else if (detectedIntent == "AcceptAssignedRoom")
                    {
                        state.SelectedRoom = "Standard_512";
                        RecordEventSummary(state, "Fulfilled", demonstratedBand, evidenceNote);
                        // Nếu đã có >= 3 lượt bằng chứng thì có thể qua EVT-05 hoặc hỏi bữa sáng ở EVT-04
                        state.CurrentEvent = state.ValidEvidenceTurnCount < 3 ? "EVT-04" : "EVT-05";
                        state.CurrentEventScaffoldingStep = 0;
                        state.CurrentEventStayCount = 0;
                    }
                    break;

                case "EVT-03":
                    if (detectedIntent == "AcceptDeluxeUpgrade")
                    {
                        state.SelectedRoom = "Deluxe_Upgrade";
                        RecordEventSummary(state, "Fulfilled", demonstratedBand, evidenceNote);
                        state.CurrentEvent = state.ValidEvidenceTurnCount < 3 ? "EVT-04" : "EVT-05";
                        state.CurrentEventScaffoldingStep = 0;
                        state.CurrentEventStayCount = 0;
                    }
                    else if (detectedIntent == "KeepOriginalStandardRoom")
                    {
                        state.SelectedRoom = "Standard_512";
                        RecordEventSummary(state, "Fulfilled", demonstratedBand, evidenceNote);
                        state.CurrentEvent = state.ValidEvidenceTurnCount < 3 ? "EVT-04" : "EVT-05";
                        state.CurrentEventScaffoldingStep = 0;
                        state.CurrentEventStayCount = 0;
                    }
                    else if (detectedIntent == "AskUpgradeDetails")
                    {
                        // Giữ ở EVT-03 để giải đáp chi phí nâng hạng
                        state.CurrentEventStayCount++;
                        if (state.CurrentEventStayCount >= 2)
                        {
                            state.CurrentEvent = "EVT-05";
                        }
                    }
                    break;

                case "EVT-04":
                    if (detectedIntent is "AddBreakfast" or "DeclineBreakfast")
                    {
                        state.BreakfastDecision = detectedIntent == "AddBreakfast" ? "Added" : "Declined";
                        RecordEventSummary(state, "Fulfilled", demonstratedBand, evidenceNote);
                        state.CurrentEvent = "EVT-05";
                        state.CurrentEventScaffoldingStep = 0;
                        state.CurrentEventStayCount = 0;
                    }
                    else if (detectedIntent == "AskBreakfastInfo")
                    {
                        state.CurrentEventStayCount++;
                        if (state.CurrentEventStayCount >= 2)
                        {
                            state.CurrentEvent = "EVT-05";
                        }
                    }
                    break;

                case "EVT-05":
                    if (detectedIntent is "ConfirmAndThank" or "GeneralResponse")
                    {
                        RecordEventSummary(state, "Fulfilled", demonstratedBand, evidenceNote);
                        state.CurrentEvent = "CONCLUDED";
                        state.TerminationReason = "CompletedNormally";
                    }
                    break;
            }
        }

        private static void AdvanceToNextEvent(PlacementAssessmentState state)
        {
            state.CurrentEventScaffoldingStep = 0;
            state.CurrentEventStayCount = 0;
            state.CurrentEvent = state.CurrentEvent switch
            {
                "EVT-01" => "EVT-02",
                "EVT-02" => "EVT-03",
                "EVT-03" => "EVT-04",
                "EVT-04" => "EVT-05",
                _ => "CONCLUDED"
            };

            if (state.CurrentEvent == "CONCLUDED")
            {
                state.TerminationReason = "CompletedNormally";
            }
        }

        private static void RecordEventSummary(PlacementAssessmentState state, string status, string band, string explanation)
        {
            var existing = state.EventSummaries.FirstOrDefault(e => e.EventCode == state.CurrentEvent);
            if (existing != null)
            {
                existing.OutcomeStatus = status;
                existing.HighestDemonstratedBand = band;
                existing.SummaryExplanation = explanation;
                existing.ScaffoldingStepsNeeded = state.CurrentEventScaffoldingStep;
            }
            else
            {
                state.EventSummaries.Add(new PlacementEventEvidenceSummary
                {
                    EventCode = state.CurrentEvent,
                    CommunicativeGoal = GetEventGoal(state.CurrentEvent),
                    OutcomeStatus = status,
                    HighestDemonstratedBand = band,
                    ScaffoldingStepsNeeded = state.CurrentEventScaffoldingStep,
                    SummaryExplanation = explanation
                });
            }
        }

        private static void RecordEventSummary(PlacementAssessmentState state, string status, string explanation)
        {
            RecordEventSummary(state, status, "Unobserved", explanation);
        }

        private static string GetEventGoal(string eventCode) => eventCode switch
        {
            "EVT-01" => "Xác nhận đặt phòng và cung cấp thông tin cá nhân",
            "EVT-02" => "Tiếp nhận thông tin phòng 512 cạnh thang máy và bày tỏ mong muốn",
            "EVT-03" => "Đưa ra quyết định đối với phương án nâng hạng Deluxe hoặc giữ phòng cũ",
            "EVT-04" => "Trao đổi và quyết định về dịch vụ bữa sáng",
            "EVT-05" => "Xác nhận tổng kết phương án và kết thúc thủ tục nhận phòng",
            _ => "Giao tiếp tại quầy lễ tân"
        };

        private static SpeechDeliveryReferenceDto? BuildSpeechReference(PlacementTestMessageRequestDto req)
        {
            if (req.FallbackToTextInput)
            {
                return null; // BR-PT-23: Unobservable when typing
            }

            return new SpeechDeliveryReferenceDto
            {
                SpeakingDurationSeconds = req.SpeakingDurationSeconds,
                ResponseLatencySeconds = req.ResponseLatencySeconds,
                SpeechConfidence = req.SpeechConfidence
            };
        }

        private static (PlacementAssessmentState, EngineTurnOutcome) FallbackSafeResponse(
            PlacementAssessmentState state,
            PlacementTestMessageRequestDto request,
            string userText)
        {
            var fallbackJa = "かしこまりました。それでは、ご案内を続けさせていただきます。";
            var fallbackVi = "Tôi đã hiểu ạ. Sau đây tôi xin phép tiếp tục hướng dẫn quý khách.";

            return (state, new EngineTurnOutcome
            {
                AiReplyJapanese = fallbackJa,
                AiReplyVietnamese = fallbackVi,
                AiReplyFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(fallbackJa),
                UserVietnameseMeaning = userText,
                UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userText),
                InputClassification = "Valid",
                DetectedIntent = "GeneralResponse",
                DemonstratedBand = "N5",
                IsConcluded = false,
                TerminationReason = "None"
            });
        }

        private static EngineTurnOutcome GenerateScaffoldingAiReply(PlacementAssessmentState state)
        {
            string ja;
            string vi;

            if (state.CurrentEventScaffoldingStep == 1)
            {
                // Bước 1: Nói lại chậm và đơn giản hơn
                ja = state.CurrentEvent switch
                {
                    "EVT-01" => "すみません。ゆっくり言いますね。チェックインのお名前を教えていただけますか？",
                    "EVT-02" => "お部屋はエレベーターのとなりの512号室ですが、こちらでよろしいですか？",
                    "EVT-03" => "デラックスルームなら静かですが、1泊2,000円高くなります。どうなさいますか？",
                    "EVT-04" => "朝ごはんは1,500円ですが、つけますか？それともいりませんか？",
                    _ => "ゆっくり確認しますね。大丈夫ですか？"
                };
                vi = state.CurrentEvent switch
                {
                    "EVT-01" => "Xin lỗi quý khách. Tôi nói chậm lại nhé. Quý khách có thể cho tôi biết tên đặt phòng được không ạ?",
                    "EVT-02" => "Phòng của quý khách là phòng 512 cạnh thang máy, phòng này có ổn không ạ?",
                    "EVT-03" => "Phòng Deluxe thì yên tĩnh nhưng thêm 2,000 Yên một đêm. Quý khách muốn chọn thế nào ạ?",
                    "EVT-04" => "Bữa sáng là 1,500 Yên, quý khách có muốn đăng ký không ạ?",
                    _ => "Tôi sẽ xác nhận lại chậm rãi nhé. Quý khách thấy ổn không ạ?"
                };
            }
            else
            {
                // Bước 2: Đưa ra câu hỏi lựa chọn ngắn A hoặc B
                ja = state.CurrentEvent switch
                {
                    "EVT-01" => "お名前は「田中様」でよろしいですか？「はい」か「いいえ」でお答えください。",
                    "EVT-02" => "この部屋で「いい」ですか？それとも「変えたい」ですか？",
                    "EVT-03" => "「デラックスにする」か「このままでいい」か、どちらがよろしいですか？",
                    "EVT-04" => "朝食は「おねがいします」か「けっこうです」、どちらですか？",
                    _ => "「はい」ですか？「いいえ」ですか？"
                };
                vi = state.CurrentEvent switch
                {
                    "EVT-01" => "Tên của quý khách có phải là Tanaka không ạ? Xin trả lời 'Vâng' hoặc 'Không'.",
                    "EVT-02" => "Phòng này 'được' ạ? Hay quý khách 'muốn đổi' ạ?",
                    "EVT-03" => "Quý khách 'đổi sang Deluxe' hay 'giữ phòng này' ạ?",
                    "EVT-04" => "Bữa sáng quý khách 'đăng ký' hay 'thôi không cần' ạ?",
                    _ => "Là 'Vâng' hay 'Không' ạ?"
                };
            }

            return new EngineTurnOutcome
            {
                AiReplyJapanese = ja,
                AiReplyVietnamese = vi,
                AiReplyFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(ja),
                UserVietnameseMeaning = "Tôi chưa hiểu rõ / Xin nói lại.",
                UserFuriganaHtml = "わかりません",
                InputClassification = "CommunicationDifficulty",
                DetectedIntent = "CommunicationDifficulty",
                DemonstratedBand = "N5",
                IsStrikeWarning = false,
                IsConcluded = false,
                TerminationReason = "None"
            };
        }

        private static string BuildSystemInstruction(PlacementAssessmentState state, string userFullName)
        {
            return $@"Bạn là Lễ tân khách sạn Sakura (ホテルさくら フロント係 - 山田), đóng vai giao tiếp trong bài Kiểm tra xếp lớp đầu vào (Placement Test) của nền tảng JCAP.
Nhiệm vụ của bạn:
1. Tiếp đón khách hàng (Tên: {userFullName}, đã đặt phòng Standard Room 3 đêm từ 10/11 - 13/11, có ghi chú 'Ưu tiên phòng yên tĩnh / 静かな部屋を希望').
2. Thực hiện hội thoại tự nhiên, lịch thiệp theo chuẩn văn hóa dịch vụ khách sạn Nhật Bản (Teineigo/Keigo phù hợp).
3. Căn cứ vào Conditional Event Directives của sự kiện hiện tại ({state.CurrentEvent}) để dẫn dắt tình huống.
4. Điều chỉnh độ khó câu thoại của bạn theo bậc mục tiêu: {state.CurrentDifficultyBand} (N5: ngắn gọn, từ vựng cơ bản desu/masu; N4: câu ghép lịch sự tiêu chuẩn; N3: kính ngữ dịch vụ tự nhiên, linh hoạt).
5. Phân tích chính xác năng lực giao tiếp của câu người học vừa nói và trả về định dạng JSON thuần túy.";
        }

        private static string BuildUserPrompt(PlacementAssessmentState state, string userUtterance)
        {
            var eventDirectives = GetConditionalDirectivesForEvent(state);

            return $@"BỐI CẢNH HIỆN TẠI:
- Mã sự kiện hiện tại: {state.CurrentEvent}
- Bậc độ khó câu hỏi mục tiêu của AI: {state.CurrentDifficultyBand}
- Bước hỗ trợ hiện tại (ScaffoldingStep): {state.CurrentEventScaffoldingStep}

CHỈ THỊ ĐIỀU KIỆN SỰ KIỆN (CONDITIONAL EVENT DIRECTIVES):
{eventDirectives}

CÂU NÓI CỦA HỌC VIÊN:
""{userUtterance}""

YÊU CẦU ĐÁNH GIÁ VÀ TRẢ LỜI:
Hãy phân tích câu nói của học viên và trả lời bằng 1 JSON hợp lệ có đúng cấu trúc sau (không kèm markdown ngoài JSON):
{{
  ""userVietnameseMeaning"": ""Bản dịch tiếng Việt câu nói của người học"",
  ""userFuriganaHtml"": ""Markup ruby furigana cho câu của người học"",
  ""turnAnalysis"": {{
    ""inputCategory"": ""Valid | OffTopic"",
    ""detectedIntent"": ""Tên intent nhận diện được"",
    ""demonstratedBand"": ""N5 | N4 | N3 | Unobserved"",
    ""taskFulfillmentScore"": 0-100,
    ""grammarAccuracyScore"": 0-100,
    ""vocabularyRangeScore"": 0-100,
    ""pragmaticsScore"": 0-100,
    ""evidenceNote"": ""Nhận xét ngắn về cấu trúc, độ lịch sự và mức độ hoàn thành nhiệm vụ""
  }},
  ""replyJapanese"": ""Câu nói tiếp theo của Lễ tân bằng tiếng Nhật"",
  ""replyFuriganaHtml"": ""Markup ruby furigana câu tiếng Nhật của Lễ tân"",
  ""replyVietnamese"": ""Dịch câu Lễ tân sang tiếng Việt tự nhiên""
}}";
        }

        private static string GetConditionalDirectivesForEvent(PlacementAssessmentState state) => state.CurrentEvent switch
        {
            "EVT-01" => @"Sự kiện EVT-01 (Greeting & Reservation Confirmation):
- Nhánh 1 (ConfirmReservation): Khách xác nhận tên và đặt phòng -> Lễ tân cảm ơn, thông báo tìm thấy đặt phòng Standard 3 đêm, nhưng phòng được xếp là Phòng 512 nằm ngay cạnh thang máy (chuyển sang EVT-02).
- Nhánh 2 (ConfirmReservationWithQuietRequest): Khách xác nhận kèm nhắc lại yêu cầu phòng yên tĩnh -> Lễ tân xin lỗi vì phòng xếp hiện tại (512) ở cạnh thang máy, hỏi ý kiến khách (chuyển sang EVT-02).
- Nhánh 3 (OffTopic): Khách nói nội dung không liên quan -> Lễ tân lịch sự hỏi lại xem có phải khách đến nhận phòng không.",

            "EVT-02" => @"Sự kiện EVT-02 (Room Assignment Problem - Room 512 near elevator):
- Nhánh 1 (RequestRoomChange / ExpressConcernNearElevator): Khách ngại ồn hoặc đề nghị đổi phòng khác -> Lễ tân kiểm tra hệ thống, báo phòng Standard khác và Twin đều đã kín (満室), chỉ còn Deluxe Room xa thang máy nhưng có phụ phí +2,000 Yên/đêm (tổng 6,000 Yên cho 3 đêm) (chuyển sang EVT-03).
- Nhánh 2 (AcceptAssignedRoom): Khách đồng ý ở phòng 512 -> Lễ tân cảm ơn và hỏi khách có muốn đăng ký thêm bữa sáng (1,500 Yên/ngày) không (chuyển sang EVT-04 hoặc EVT-05).
- Nhánh 3 (OffTopic): Nhắc khéo khách về việc xác nhận phòng 512.",

            "EVT-03" => @"Sự kiện EVT-03 (Alternative Room Availability - Deluxe Room Offer):
- Nhánh 1 (AcceptDeluxeUpgrade): Khách đồng ý nâng lên Deluxe +2,000 Yên/đêm -> Lễ tân xác nhận đổi phòng Deluxe yên tĩnh (chuyển sang EVT-04 hoặc EVT-05).
- Nhánh 2 (KeepOriginalStandardRoom): Khách chọn giữ phòng cũ 512 -> Lễ tân xác nhận giữ phòng Standard 512 (chuyển sang EVT-04 hoặc EVT-05).
- Nhánh 3 (AskUpgradeDetails): Khách hỏi chi tiết giá hoặc tiện ích phòng Deluxe -> Lễ tân giải thích rõ phòng 28m2 giường lớn xa thang máy, phụ phí 2,000 Yên/đêm.
- Nhánh 4 (OffTopic): Lễ tân mời khách chọn giữa nâng hạng Deluxe hoặc giữ phòng cũ.",

            "EVT-04" => @"Sự kiện EVT-04 (Additional Service Inquiry - Breakfast):
- Nhánh 1 (AddBreakfast / DeclineBreakfast): Khách đăng ký hoặc từ chối bữa sáng -> Lễ tân ghi nhận và chuyển sang tổng kết chốt phương án trao chìa khóa (EVT-05).
- Nhánh 2 (AskBreakfastInfo): Khách hỏi giờ hoặc thông tin -> Lễ tân giải thích phục vụ từ 7:00 đến 10:00 tại nhà hàng tầng 1.",

            "EVT-05" => @"Sự kiện EVT-05 (Solution Confirmation & Natural Hand-off):
- Khách xác nhận và cảm ơn -> Lễ tân trao chìa khóa phòng, chúc khách có kỳ nghỉ thoải mái và kết thúc buổi nhận phòng.",

            _ => "Duy trì đối thoại lịch sự theo bối cảnh lễ tân khách sạn."
        };

        /// <summary>
        /// Tổng kết điểm 4 chiều Rubric, mức độ tin cậy và xếp hạng trình độ ban đầu (BR-PT-11..24).
        /// </summary>
        public PlacementTestCompleteResponseDto ComputeFinalResult(int sessionId, PlacementAssessmentState state)
        {
            var validTurns = state.TurnEvidences.Where(t => t.InputClassification == "Valid").ToList();

            // Nếu dừng do spam, off-topic quá mức hoặc có dưới 2 lượt bằng chứng hợp lệ
            if (state.TerminationReason is "AbuseOrSpamLimit" or "OffTopicLimit" || validTurns.Count < 2)
            {
                return new PlacementTestCompleteResponseDto
                {
                    SessionId = sessionId,
                    PlacementTestStatus = "InsufficientEvidence",
                    InitialEstimatedLevel = "Chưa xác định",
                    InitialConfidenceTier = "Low",
                    OverallScore = 0,
                    TaskFulfillmentScore = 0,
                    GrammarAccuracyScore = 0,
                    VocabularyRangeScore = 0,
                    PragmaticsScore = 0,
                    SpeechDeliveryReference = null,
                    EventSummaries = state.EventSummaries,
                    SummaryFeedback = "Hệ thống chưa thu thập đủ bằng chứng hội thoại hợp lệ để đưa ra kết luận xếp lớp chính xác. Bạn có thể thực hiện lại bài đánh giá khi sẵn sàng.",
                    CompletedAtUtc = DateTime.UtcNow
                };
            }

            // 1. Tính trung bình 4 chiều Rubric cốt lõi
            int avgTask = (int)Math.Round(validTurns.Average(t => t.TaskFulfillmentScore));
            int avgGrammar = (int)Math.Round(validTurns.Average(t => t.GrammarAccuracyScore));
            int avgVocab = (int)Math.Round(validTurns.Average(t => t.VocabularyRangeScore));
            int avgPragmatics = (int)Math.Round(validTurns.Average(t => t.PragmaticsScore));

            int overallScore = (int)Math.Round(
                (0.35 * avgTask) +
                (0.25 * avgGrammar) +
                (0.20 * avgVocab) +
                (0.20 * avgPragmatics)
            );

            // 2. Tính Confidence Score & Confidence Tier
            int fulfilledEventsCount = state.EventSummaries.Count(e => e.OutcomeStatus.StartsWith("Fulfilled"));
            double cQuantity = Math.Min(1.0, validTurns.Count / 4.0);
            double cCoverage = Math.Min(1.0, fulfilledEventsCount / 3.0);

            // Tính độ nhất quán giữa các lượt
            var bands = validTurns.Select(t => t.DemonstratedBand).Where(b => b is "N5" or "N4" or "N3").ToList();
            double cConsistency = 0.8;
            if (bands.Count >= 2)
            {
                var distinct = bands.Distinct().Count();
                cConsistency = distinct == 1 ? 1.0 : (distinct == 2 ? 0.8 : 0.5);
            }

            int unpromptedEvents = state.EventSummaries.Count(e => e.ScaffoldingStepsNeeded == 0);
            double cAutonomy = state.EventSummaries.Count > 0 ? (double)unpromptedEvents / state.EventSummaries.Count : 0.5;

            double confidenceScore = (0.35 * cQuantity) + (0.30 * cCoverage) + (0.20 * cConsistency) + (0.15 * cAutonomy);

            string confidenceTier = "Medium";
            if (confidenceScore >= 0.75 && validTurns.Count >= 4 && fulfilledEventsCount >= 3)
            {
                confidenceTier = "High";
            }
            else if (confidenceScore < 0.50 || validTurns.Count < 3)
            {
                confidenceTier = "Low";
            }

            // 3. Quy tắc xác định InitialEstimatedLevel
            string estimatedLevel;
            int n3Count = state.EventSummaries.Count(e => e.HighestDemonstratedBand == "N3");
            int n4Count = state.EventSummaries.Count(e => e.HighestDemonstratedBand == "N4");

            if (confidenceTier == "Low")
            {
                estimatedLevel = (n4Count + n3Count >= 2) ? "N4-N3" : "N5-N4";
            }
            else
            {
                if ((n3Count >= 2 || (n3Count >= 1 && n4Count >= 2 && overallScore >= 78)) && overallScore >= 72)
                {
                    estimatedLevel = "N3";
                }
                else if ((n4Count + n3Count >= 2) && overallScore >= 60)
                {
                    estimatedLevel = "N4";
                }
                else
                {
                    estimatedLevel = "N5";
                }
            }

            // 4. Lấy SpeechDelivery tham khảo từ lượt mới nhất có âm thanh (nếu có)
            var speechRef = validTurns.Select(t => t.SpeechDeliveryReference).LastOrDefault(s => s != null);

            var feedbackSummary = $"Kết quả xếp lớp tương đương trình độ {estimatedLevel} với độ tin cậy {confidenceTier}. " +
                $"Điểm tổng thể đạt {overallScore}/100. Người học đã hoàn thành {fulfilledEventsCount} tình huống giao tiếp.";

            return new PlacementTestCompleteResponseDto
            {
                SessionId = sessionId,
                PlacementTestStatus = "Completed",
                InitialEstimatedLevel = estimatedLevel,
                InitialConfidenceTier = confidenceTier,
                OverallScore = overallScore,
                TaskFulfillmentScore = avgTask,
                GrammarAccuracyScore = avgGrammar,
                VocabularyRangeScore = avgVocab,
                PragmaticsScore = avgPragmatics,
                SpeechDeliveryReference = speechRef,
                EventSummaries = state.EventSummaries,
                SummaryFeedback = feedbackSummary,
                CompletedAtUtc = DateTime.UtcNow
            };
        }
    }

    public sealed class EngineTurnOutcome
    {
        public string AiReplyJapanese { get; set; } = string.Empty;
        public string AiReplyVietnamese { get; set; } = string.Empty;
        public string? AiReplyFuriganaHtml { get; set; }
        public string UserVietnameseMeaning { get; set; } = string.Empty;
        public string? UserFuriganaHtml { get; set; }
        public string InputClassification { get; set; } = "Valid";
        public string DetectedIntent { get; set; } = string.Empty;
        public string DemonstratedBand { get; set; } = "Unobserved";
        public bool IsStrikeWarning { get; set; }
        public string? StrikeWarningMessage { get; set; }
        public bool IsConcluded { get; set; }
        public string TerminationReason { get; set; } = "None";
    }
}
