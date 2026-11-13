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

            // 3. Khó khăn giao tiếp cấp độ bế tắc (Chỉ áp dụng khi người học nói cụt lủn dưới 8 ký tự như "え？", "わかりません")
            // Nếu người học nói cả câu hoặc có thể nhờ vả, câu sẽ chuyển vào LLM để phân tích trọn vẹn và không bị đè câu.
            if (trimmed.Length <= 8)
            {
                foreach (var phrase in CommunicationDifficultyPhrases)
                {
                    if (trimmed.Equals(phrase, StringComparison.OrdinalIgnoreCase))
                    {
                        return "CommunicationDifficulty";
                    }
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

                var commOutcome = GenerateScaffoldingAiReply(state, userText);

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
            aiReq.PreferredModel = state.PreferredAiModel;
            aiReq.FallbackOnAnyError = true;
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
                var evidenceNote = analysis.TryGetProperty("evidenceNote", out var en) ? en.GetString() ?? "" : "";

                if (!string.IsNullOrWhiteSpace(aiResp.ModelUsed))
                {
                    state.PreferredAiModel = aiResp.ModelUsed;
                }

                // Quét nhanh các lỗi ngữ pháp đặc thù người Việt (E01-E10)
                var detectedErrors = _errorDetector.DetectErrors(userText);
                var errorCodes = detectedErrors.Select(e => e.Code).ToList();

                // BẢO VỆ CHIẾN LƯỢC GIAO TIẾP (Communication Repair / Clarification Strategy)
                // Các ý định xin giải thích đơn giản hơn, hỏi lại, bày tỏ chưa hiểu, hỏi chi tiết:
                // HOÀN TOÀN HỢP LỆ VÀ THUỘC BỐI CẢNH, TUYỆT ĐỐI KHÔNG COI LÀ OFFTOPIC.
                var isClarificationOrStrategy = detectedIntent.Contains("Simplif", StringComparison.OrdinalIgnoreCase)
                    || detectedIntent.Contains("Clarif", StringComparison.OrdinalIgnoreCase)
                    || detectedIntent.Contains("Repeat", StringComparison.OrdinalIgnoreCase)
                    || detectedIntent.Contains("Repetition", StringComparison.OrdinalIgnoreCase)
                    || detectedIntent.Contains("Ask", StringComparison.OrdinalIgnoreCase)
                    || detectedIntent.Equals("CommunicationDifficulty", StringComparison.OrdinalIgnoreCase);

                if (isClarificationOrStrategy)
                {
                    inputCat = "Valid";
                }

                // Trích xuất bằng chứng quan sát được (Approach C - JF Standard & Dekiru Nihongo)
                var observableEvidence = ParseObservableEvidence(analysis);
                int taskScore;
                int grammarScore;
                int vocabScore;
                int pragmaticsScore;

                if (observableEvidence != null)
                {
                    (taskScore, grammarScore, vocabScore, pragmaticsScore, demonstratedBand) =
                        ComputeDeterministicTurnScores(
                            userText,
                            inputCat,
                            detectedIntent,
                            demonstratedBand,
                            observableEvidence,
                            errorCodes,
                            isClarificationOrStrategy);
                }
                else
                {
                    // Fallback tương thích ngược nếu JSON thiếu khối evidence
                    taskScore = analysis.TryGetProperty("taskFulfillmentScore", out var ts) ? ts.GetInt32() : 75;
                    grammarScore = analysis.TryGetProperty("grammarAccuracyScore", out var gs) ? gs.GetInt32() : 75;
                    vocabScore = analysis.TryGetProperty("vocabularyRangeScore", out var vs) ? vs.GetInt32() : 75;
                    pragmaticsScore = analysis.TryGetProperty("pragmaticsScore", out var ps) ? ps.GetInt32() : 75;

                    if (errorCodes.Count > 0)
                    {
                        grammarScore = Math.Max(40, grammarScore - (errorCodes.Count * 10));
                    }
                    if (isClarificationOrStrategy)
                    {
                        pragmaticsScore = Math.Max(pragmaticsScore, 75);
                    }
                }

                // XỬ LÝ VI PHẠM NGỮ NGHĨA (SPAM CHỮ NHẬT VÔ NGHĨA / XÚC PHẠM) HOẶC OFF-TOPIC STRIKE
                bool isStrikeWarning = false;
                string? strikeWarningMsg = null;
                var isAiDetectedSpam = !isClarificationOrStrategy && (
                    inputCat.Equals("AbusiveOrSpam", StringComparison.OrdinalIgnoreCase) ||
                    inputCat.Equals("IncoherentOrAbusive", StringComparison.OrdinalIgnoreCase) ||
                    detectedIntent.Equals("AbusiveOrSpam", StringComparison.OrdinalIgnoreCase));

                var isOffTopic = !isClarificationOrStrategy && !isAiDetectedSpam && (
                    inputCat.Equals("OffTopic", StringComparison.OrdinalIgnoreCase) ||
                    detectedIntent.Equals("OffTopic", StringComparison.OrdinalIgnoreCase));

                if (isAiDetectedSpam)
                {
                    inputCat = "AbusiveOrSpam";
                    detectedIntent = "SpamOrIncoherentJapanese";
                    demonstratedBand = "Unobserved";
                    taskScore = 0;
                    grammarScore = 0;
                    vocabScore = 0;
                    pragmaticsScore = 0;

                    state.AbuseOrSpamStrikeCount++;
                    if (state.AbuseOrSpamStrikeCount >= 3)
                    {
                        state.TerminationReason = "AbuseOrSpamLimit";
                        replyJa = "恐れ入りますが、日本語での確認が難しいため、本日の手続きはいったん保留とさせていただきます。またのご利用をお待ちしております。";
                        replyVi = "Rất xin lỗi quý khách, vì không thể xác nhận thông tin bằng tiếng Nhật nên thủ tục hôm nay xin phép tạm dừng. Hẹn gặp lại quý khách lần sau.";
                        isStrikeWarning = false;
                        strikeWarningMsg = "Bài kiểm tra đã dừng do vi phạm quy tắc hội thoại quá 3 lần.";
                    }
                    else
                    {
                        isStrikeWarning = true;
                        strikeWarningMsg = $"Cảnh báo nhắc nhở ({state.AbuseOrSpamStrikeCount}/3): Vui lòng sử dụng câu tiếng Nhật có ý nghĩa và lịch sự để hoàn thành bài đánh giá xếp lớp.";
                    }
                }
                else if (isOffTopic)
                {
                    inputCat = "OffTopic";
                    demonstratedBand = "Unobserved";
                    taskScore = 0;
                    grammarScore = 0;
                    vocabScore = 0;
                    pragmaticsScore = 0;

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

                var overallTurnScore = ComputeTurnOverallScore(taskScore, grammarScore, vocabScore, pragmaticsScore);

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
                    OverallTurnScore = overallTurnScore,
                    SpeechDeliveryReference = BuildSpeechReference(request),
                    DetectedRuleErrorCodes = errorCodes,
                    ObservableEvidence = observableEvidence,
                    EvidenceNote = evidenceNote
                };
                state.TurnEvidences.Add(turnEvidence);

                // ĐIỀU CHỈNH TRẠNG THÁI SỰ KIỆN VÀ ĐỘ KHÓ (CHỈ THỰC HIỆN KHI LƯỢT HỢP LỆ - KHÔNG CHUYỂN EVENT KHI OFF-TOPIC/SPAM)
                if (inputCat == "Valid")
                {
                    ApplyEventTransition(
                        state,
                        detectedIntent,
                        demonstratedBand,
                        taskScore,
                        grammarScore,
                        vocabScore,
                        evidenceNote,
                        userText,
                        replyJa);
                }

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
                    TerminationReason = state.TerminationReason,
                    TaskFulfillmentScore = taskScore,
                    GrammarAccuracyScore = grammarScore,
                    VocabularyRangeScore = vocabScore,
                    PragmaticsScore = pragmaticsScore,
                    OverallTurnScore = overallTurnScore,
                    EvidenceNote = evidenceNote
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
        private static bool ContainsAny(string? source, params string[] keywords)
        {
            if (string.IsNullOrWhiteSpace(source)) return false;
            foreach (var kw in keywords)
            {
                if (source.Contains(kw, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        public static void ApplyEventTransition(
            PlacementAssessmentState state,
            string detectedIntent,
            string demonstratedBand,
            int taskScore,
            int grammarScore,
            int vocabScore,
            string evidenceNote,
            string userText = "",
            string aiReplyJapanese = "")
        {
            // Điều chỉnh bậc độ khó thích ứng cho câu hỏi của AI (Step-up / Maintain / Step-down)
            if (demonstratedBand == "N3" && taskScore >= 75 && grammarScore >= 75)
            {
                state.CurrentDifficultyBand = "N3";
            }
            else if (taskScore >= 75 && grammarScore >= 75)
            {
                if (state.CurrentDifficultyBand == "N5") state.CurrentDifficultyBand = "N4";
                else if (state.CurrentDifficultyBand == "N4" && taskScore >= 85 && grammarScore >= 85 && vocabScore >= 80) state.CurrentDifficultyBand = "N3";
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
                    {
                        bool intentRequestsChange = ContainsAny(
                            detectedIntent,
                            "RequestRoomChange",
                            "RoomChange",
                            "AskAlternative",
                            "AskOtherRoom",
                            "AskDeluxe",
                            "Upgrade");

                        bool userAsksAlternativeRoom = ContainsAny(
                            userText,
                            "ほかの部屋",
                            "他の部屋",
                            "別の部屋",
                            "違う部屋",
                            "ほかのへや",
                            "他のへや",
                            "別のへや",
                            "部屋を変え",
                            "変えて",
                            "変えられ",
                            "変更",
                            "デラックス",
                            "ツイン",
                            "空いて",
                            "空き");

                        bool aiOfferedAlternativeOrFull = ContainsAny(
                            aiReplyJapanese,
                            "デラックス",
                            "満室",
                            "アップグレード",
                            "2,000円",
                            "2000円",
                            "6,000円",
                            "6000円");

                        bool isAcceptAssigned512 = string.Equals(
                            detectedIntent.Trim(),
                            "AcceptAssignedRoom",
                            StringComparison.OrdinalIgnoreCase);

                        bool isAcceptDeluxeDirect = ContainsAny(
                            detectedIntent,
                            "AcceptDeluxeUpgrade",
                            "AcceptUpgrade",
                            "SelectDeluxe");

                        if (isAcceptDeluxeDirect)
                        {
                            state.RoomChangeRequested = true;
                            state.AlternativeRoomOffered = true;
                            state.SelectedRoom = "Deluxe_Upgrade";
                            RecordEventSummary(state, "Fulfilled", demonstratedBand, evidenceNote);
                            state.CurrentEvent = "EVT-03";
                            RecordEventSummary(state, "Fulfilled", demonstratedBand, evidenceNote);
                            state.CurrentEvent = "EVT-04";
                            state.CurrentEventScaffoldingStep = 0;
                            state.CurrentEventStayCount = 0;
                        }
                        else if (intentRequestsChange || (!isAcceptAssigned512 && (userAsksAlternativeRoom || aiOfferedAlternativeOrFull)))
                        {
                            // Học viên đã yêu cầu tìm/đổi phòng khác hoặc hội thoại đã chuyển sang phương án phòng thay thế (Deluxe/Full)
                            state.RoomChangeRequested = true;
                            if (ContainsAny(aiReplyJapanese, "デラックス", "2,000円", "2000円"))
                            {
                                state.AlternativeRoomOffered = true;
                            }
                            RecordEventSummary(state, "Fulfilled", demonstratedBand, evidenceNote);
                            state.CurrentEvent = "EVT-03";
                            state.CurrentEventScaffoldingStep = 0;
                            state.CurrentEventStayCount = 0;
                        }
                        else if (isAcceptAssigned512)
                        {
                            state.SelectedRoom = "Standard_512";
                            RecordEventSummary(state, "Fulfilled", demonstratedBand, evidenceNote);
                            state.CurrentEvent = "EVT-04";
                            state.CurrentEventScaffoldingStep = 0;
                            state.CurrentEventStayCount = 0;
                        }
                        else
                        {
                            // Khách mới hỏi thông tin về chính phòng 512 hoặc băn khoăn chung: duy trì ở EVT-02
                            state.CurrentEventStayCount++;
                            if (state.CurrentEventStayCount >= 4)
                            {
                                // Nếu hỏi nhiều lượt về phòng 512 mà chưa chốt, Lễ tân chủ động giới thiệu Deluxe
                                state.RoomChangeRequested = true;
                                state.AlternativeRoomOffered = true;
                                RecordEventSummary(state, "Fulfilled", demonstratedBand, "Khách băn khoăn về phòng 512 cạnh thang máy; Lễ tân chủ động giới thiệu Deluxe.");
                                state.CurrentEvent = "EVT-03";
                                state.CurrentEventScaffoldingStep = 0;
                                state.CurrentEventStayCount = 0;
                            }
                        }
                        break;
                    }

                case "EVT-03":
                    if (ContainsAny(detectedIntent, "AcceptDeluxeUpgrade", "AcceptUpgrade", "SelectDeluxe"))
                    {
                        state.AlternativeRoomOffered = true;
                        state.SelectedRoom = "Deluxe_Upgrade";
                        RecordEventSummary(state, "Fulfilled", demonstratedBand, evidenceNote);
                        state.CurrentEvent = "EVT-04";
                        state.CurrentEventScaffoldingStep = 0;
                        state.CurrentEventStayCount = 0;
                    }
                    else if (ContainsAny(detectedIntent, "KeepOriginalStandardRoom", "KeepStandard", "DeclineUpgrade"))
                    {
                        state.SelectedRoom = "Standard_512";
                        RecordEventSummary(state, "Fulfilled", demonstratedBand, evidenceNote);
                        state.CurrentEvent = "EVT-04";
                        state.CurrentEventScaffoldingStep = 0;
                        state.CurrentEventStayCount = 0;
                    }
                    else
                    {
                        // Khách hỏi thêm chi phí, so sánh phòng, hoặc cân nhắc giữ Standard cũ: BẮT BUỘC GIỮ Ở EVT-03
                        state.CurrentEventStayCount++;
                        if (state.CurrentEventStayCount >= 5)
                        {
                            // Chỉ chuyển tiếp khi đã vượt quá 4 lượt trao đổi mà học viên vẫn không đưa ra quyết định
                            RecordEventSummary(state, "InsufficientEvidence", demonstratedBand, "Khách chưa đưa ra quyết định chọn phòng sau nhiều lượt trao đổi; hệ thống chuyển sang bước tiếp theo.");
                            state.CurrentEvent = "EVT-04";
                            state.CurrentEventScaffoldingStep = 0;
                            state.CurrentEventStayCount = 0;
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
                    else
                    {
                        // Khách hỏi giờ ăn, giá ăn, thực đơn: duy trì ở EVT-04
                        state.CurrentEventStayCount++;
                        if (state.CurrentEventStayCount >= 4)
                        {
                            RecordEventSummary(state, "Fulfilled", demonstratedBand, "Đã trao đổi thông tin bữa sáng; chuyển sang hoàn tất thủ tục.");
                            state.CurrentEvent = "EVT-05";
                            state.CurrentEventScaffoldingStep = 0;
                            state.CurrentEventStayCount = 0;
                        }
                    }
                    break;

                case "EVT-05":
                    var isEvt5Concluding = detectedIntent is "ConfirmAndThank" or "GeneralResponse" or "PaymentConfirmation"
                        || detectedIntent.Contains("Thank", StringComparison.OrdinalIgnoreCase)
                        || detectedIntent.Contains("Confirm", StringComparison.OrdinalIgnoreCase)
                        || detectedIntent.Contains("Cảm ơn", StringComparison.OrdinalIgnoreCase)
                        || detectedIntent.Contains("Xác nhận", StringComparison.OrdinalIgnoreCase)
                        || taskScore >= 60;

                    if (isEvt5Concluding)
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

        private static int GetBandRank(string? band) => band switch
        {
            "N3" => 3,
            "N4" => 2,
            "N5" => 1,
            _ => 0
        };

        private static void RecordEventSummary(PlacementAssessmentState state, string status, string band, string explanation)
        {
            // Tìm lượt nói hợp lệ có bậc thể hiện cao nhất trong toàn bộ các lượt thuộc Event hiện tại
            // để tránh việc lượt xác nhận ngắn cuối cùng (예: "はい、お願いします") ghi đè mất bằng chứng N3 của lượt hỏi/thương lượng trước đó.
            var bestBand = band;
            var bestExplanation = explanation;

            var eventValidTurns = state.TurnEvidences
                .Where(t => t.EventCode == state.CurrentEvent && t.InputClassification == "Valid")
                .ToList();

            foreach (var turn in eventValidTurns)
            {
                if (GetBandRank(turn.DemonstratedBand) > GetBandRank(bestBand))
                {
                    bestBand = turn.DemonstratedBand;
                    if (!string.IsNullOrWhiteSpace(turn.EvidenceNote))
                    {
                        bestExplanation = turn.EvidenceNote;
                    }
                }
            }

            var existing = state.EventSummaries.FirstOrDefault(e => e.EventCode == state.CurrentEvent);
            if (existing != null)
            {
                if (GetBandRank(existing.HighestDemonstratedBand) > GetBandRank(bestBand))
                {
                    bestBand = existing.HighestDemonstratedBand;
                    if (!string.IsNullOrWhiteSpace(existing.SummaryExplanation))
                    {
                        bestExplanation = existing.SummaryExplanation;
                    }
                }

                existing.OutcomeStatus = status;
                existing.HighestDemonstratedBand = bestBand;
                existing.SummaryExplanation = bestExplanation;
                existing.ScaffoldingStepsNeeded = state.CurrentEventScaffoldingStep;
            }
            else
            {
                state.EventSummaries.Add(new PlacementEventEvidenceSummary
                {
                    EventCode = state.CurrentEvent,
                    CommunicativeGoal = GetEventGoal(state.CurrentEvent),
                    OutcomeStatus = status,
                    HighestDemonstratedBand = bestBand,
                    ScaffoldingStepsNeeded = state.CurrentEventScaffoldingStep,
                    SummaryExplanation = bestExplanation
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
                DemonstratedBand = "N4",
                IsConcluded = false,
                TerminationReason = "None",
                TaskFulfillmentScore = 70,
                GrammarAccuracyScore = 70,
                VocabularyRangeScore = 70,
                PragmaticsScore = 70,
                OverallTurnScore = ComputeTurnOverallScore(70, 70, 70, 70),
                EvidenceNote = "Phản hồi hợp lệ trong bối cảnh nhận phòng khách sạn."
            });
        }

        private static EngineTurnOutcome GenerateScaffoldingAiReply(PlacementAssessmentState state, string userText)
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
                UserVietnameseMeaning = userText,
                UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userText),
                InputClassification = "CommunicationDifficulty",
                DetectedIntent = "CommunicationDifficulty",
                DemonstratedBand = "N5",
                IsStrikeWarning = false,
                IsConcluded = false,
                TerminationReason = "None",
                TaskFulfillmentScore = 65,
                GrammarAccuracyScore = 70,
                VocabularyRangeScore = 60,
                PragmaticsScore = 75,
                OverallTurnScore = ComputeTurnOverallScore(65, 70, 60, 75),
                EvidenceNote = "Người học sử dụng chiến lược giao tiếp nhờ nhắc lại hoặc xin giải thích đơn giản. Hệ thống hạ độ khó câu hỏi của AI."
            };
        }

        private static string BuildSystemInstruction(PlacementAssessmentState state, string userFullName)
        {
            return $@"Bạn là Lễ tân khách sạn Sakura (ホテルさくら フロント係 - 山田), đóng vai giao tiếp trong bài Kiểm tra xếp lớp đầu vào (Placement Test) của nền tảng JCAP.
Nhiệm vụ của bạn:
1. Tiếp đón khách hàng (Tên khách: {userFullName} / 田中 様 / タナカ, đã đặt phòng Standard Room 3 đêm từ 10/11 - 13/11, có ghi chú 'Ưu tiên phòng yên tĩnh / 静かな部屋を希望').
2. Thực hiện hội thoại tự nhiên, lịch thiệp theo chuẩn văn hóa dịch vụ khách sạn Nhật Bản (Teineigo/Keigo phù hợp).
3. Căn cứ vào Conditional Event Directives của sự kiện hiện tại ({state.CurrentEvent}) để dẫn dắt tình huống.
4. Điều chỉnh độ khó câu thoại của bạn theo bậc mục tiêu: {state.CurrentDifficultyBand} (N5: ngắn gọn, từ vựng cơ bản desu/masu; N4: câu ghép lịch sự tiêu chuẩn; N3: kính ngữ dịch vụ tự nhiên, linh hoạt). Giữ lời thoại tự nhiên, lịch thiệp theo chuẩn tiếp tân khách sạn, duy trì nhịp độ đối thoại vừa phải (thông thường 1–2 câu và không quá 80 ký tự) để người học dễ theo dõi và phản hồi kịp thời.
5. Phân tích chính xác năng lực giao tiếp của câu người học vừa nói dựa trên khung tham chiếu nhiệm vụ Can-do của giáo trình 『できる日本語』(Dekiru Nihongo: 初級 N5 / 初中級 N4 / 中級 N3) và trả về định dạng JSON thuần túy.";
        }

        private static string BuildUserPrompt(PlacementAssessmentState state, string userUtterance)
        {
            var eventDirectives = GetConditionalDirectivesForEvent(state);
            var dekiruReference = GetDekiruNihongoReferenceForEvent(state.CurrentEvent);

            return $@"BỐI CẢNH HIỆN TẠI:
- Mã sự kiện hiện tại: {state.CurrentEvent}
- Bậc độ khó câu hỏi mục tiêu của AI: {state.CurrentDifficultyBand}
- Bước hỗ trợ hiện tại (ScaffoldingStep): {state.CurrentEventScaffoldingStep}

CHỈ THỊ ĐIỀU KIỆN SỰ KIỆN (CONDITIONAL EVENT DIRECTIVES):
{eventDirectives}

BẢNG THAM CHIẾU GIÁO TRÌNH 『できる日本語』(DEKIRU NIHONGO) & TIÊU CHÍ PHÂN BẬC N5 / N4 / N3 CHO SỰ KIỆN {state.CurrentEvent}:
{dekiruReference}

CÂU NÓI CỦA HỌC VIÊN:
""{userUtterance}""

HƯỚNG DẪN ĐÁNH GIÁ (TURN ANALYSIS GUIDANCE):
1. inputCategory:
   - ""Valid"": Câu nói thuộc bối cảnh nhận phòng khách sạn. ĐẶC BIỆT: Khi khách bày tỏ chưa hiểu, xin giải thích đơn giản hơn (RequestSimplification), xin nói chậm lại (RequestRepetition), hoặc hỏi chi tiết phòng/dịch vụ, ĐÂY LÀ CHIẾN LƯỢC GIAO TIẾP HỢP LỆ VÀ BẮT BUỘC ĐÁNH DẤU LÀ ""Valid"" (TUYỆT ĐỐI KHÔNG coi là OffTopic). Khi đó Lễ tân vui vẻ giải thích lại ngắn gọn, dễ hiểu ở bậc N5/N4.
   - ""OffTopic"": CHỈ KHI khách nói câu tiếng Nhật có nghĩa nhưng hoàn toàn lạc sang chủ đề khác (thời tiết bên ngoài, bóng đá, đồ ăn ngoài, rủ đi chơi...).
   - ""AbusiveOrSpam"": Khi khách gõ chuỗi ký tự chữ Nhật vô nghĩa (như 'あかさたな...', 'あいうえお'), ghép từ hỗn độn không có nghĩa, hoặc dùng ngôn từ xúc phạm/phá đám.
2. userVietnameseMeaning & userFuriganaHtml:
   - BẮT BUỘC dịch chính xác câu thực tế của học viên sang tiếng Việt tự nhiên và sinh Furigana HTML cho đúng câu học viên vừa nói. TUYỆT ĐỐI KHÔNG tự ý thay đổi nội dung câu học viên đã nói thành câu khác (như không được đổi thành 'wakarimasen').
3. Quy tắc xác định demonstratedBand (""N5"" | ""N4"" | ""N3"") — ĐÁNH GIÁ ĐỘC LẬP, KHÔNG BỊ NEO THEO ĐỘ KHÓ CÂU HỎI CỦA AI:
   - TUYỆT ĐỐI KHÔNG lấy ""Bậc độ khó câu hỏi mục tiêu của AI ({state.CurrentDifficultyBand})"" làm trần giới hạn cho demonstratedBand của học viên! Dù AI đang hỏi ở bậc N4 hay N5, nếu câu trả lời của học viên đạt tiêu chí N3 thì BẮT BUỘC chấm ""demonstratedBand"": ""N3"".
   - Chọn ""N5"" (『できる日本語 初級』): Câu đơn ngắn gọn, cụm từ cố định cơ bản (〜です/〜ます, 〜をお願いします, いくらですか), truyền đạt ý chính nhưng chưa mở rộng lý do hay mệnh đề phụ.
   - Chọn ""N4"" (『できる日本語 初中級』): Câu ghép có liên từ chỉ nguyên nhân/mục đích cơ bản (〜から, 〜ので, 〜んですが, 〜たいです), mẫu câu nhờ vả lịch sự tiêu chuẩn (〜てもらえませんか / 〜てもいいですか / 〜にします).
   - Chọn ""N3"" (『できる日本語 中級』): Câu phức đa mệnh đề, lập luận có điều kiện/giả định hoặc cân nhắc ngữ cảnh (〜となると, 〜のであれば, 〜ば/〜たら, 〜ため, 〜はずなんですが), rào đón/chuyển ý mềm mỏng (〜のですが…, ただ〜, 〜と思っています), kính ngữ/khiêm nhường ngữ tự nhiên (〜と申します, 〜ていただけますでしょうか, 〜可能でしょうか) và từ vựng trung cấp (予算, 追加料金, 翌朝, 検討, 空き, 変更...).
4. Trích xuất Bằng chứng Quan sát được (evidence — Theo chuẩn JF Standard & 『できる日本語』, KHÔNG tự cho điểm số 0-100):
   - ""taskAchievement"":
     + ""Exceeded_ProactiveDetail"": Hoàn thành đúng mục tiêu sự kiện VÀ chủ động cung cấp thêm lý do, điều kiện, chi tiết đặt phòng hoặc câu hỏi mở rộng hợp lý.
     + ""Fulfilled_Core"": Hoàn thành đúng và đủ yêu cầu cốt lõi của sự kiện.
     + ""Partial_IncompleteInfo"": Phản hồi đúng hướng nhưng còn thiếu thông tin hoặc chưa chốt quyết định (hoặc đang xin nhắc lại/giải thích thêm).
     + ""Unfulfilled_Unclear"": Chưa trả lời được câu hỏi hoặc diễn đạt quá mơ hồ.
   - ""sentenceStructure"":
     + ""Complex_MultiClause"": Câu phức đa mệnh đề, điều kiện/giả định/nhượng bộ (〜なら, 〜のであれば, 〜となると, 〜ため, 〜はずなんですが) hoặc kết hợp mệnh đề với kính ngữ.
     + ""Compound_LinkedClause"": Câu ghép nối mệnh đề (〜から, 〜ので, 〜が, 〜て) hoặc có mệnh đề định ngữ bổ nghĩa danh từ (3泊予約した田中).
     + ""Simple_CompleteClause"": Câu đơn hoàn chỉnh có vị ngữ.
     + ""Fragment_WordOnly"": Từ đơn rời rạc hoặc cụm từ ngắn thiếu vị ngữ (như 'はい', '部屋、変えて').
   - ""grammarErrorSeverity"":
     + ""NoError"": Chính xác 100%, không sai trợ từ hay chia thể (lưu ý: câu đơn N5 ngắn nhưng đúng ngữ pháp hoàn toàn vẫn là ""NoError"").
     + ""MinorSlip_MeaningIntact"": Có 1-2 lỗi nhỏ về trợ từ hoặc chia thể nhưng vẫn hiểu rõ ý.
     + ""MajorError_MeaningAffected"": Sai cấu trúc câu nặng, lắp ghép từ rời rạc gây khó hiểu.
   - ""grammarErrors"": Mảng liệt kê cụ thể lỗi trợ từ/chia thể nếu có (mảng rỗng [] nếu ""NoError"").
   - ""lexicalUsage"":
     + ""Rich_SituationalSpecific"": Dùng chính xác từ vựng chuyên biệt bối cảnh khách sạn/trung cấp (予約, 3泊, 追加料金, 予算, 変更, 空き, 朝食, 検討, 出発, 対応...).
     + ""Adequate_StandardTopic"": Từ vựng giao tiếp thông dụng phù hợp tình huống (チェックイン, 静かな部屋, エレベーター, 隣, 高い, 朝ごはん, 大丈夫...).
     + ""Basic_Minimal"": Chỉ dùng từ cơ bản tối thiểu hoặc lặp từ (はい, いいえ, 部屋, いい...).
     + ""Inaccurate_WrongWord"": Dùng sai từ vựng gây lệch nghĩa.
   - ""politenessRegister"":
     + ""Advanced_KeigoOrCushioned"": Dùng kính ngữ/khiêm nhường ngữ (〜と申します, 〜ていただけますか, 〜可能でしょうか, ご対応いただき) HOẶC từ đệm rào đón lịch thiệp (恐れ入りますが, すみませんが, ちょっと…, 〜んですが).
     + ""Standard_Teineigo"": Duy trì thể lịch sự chuẩn mực (〜です/〜ます, 〜をお願いします, 〜てもらえませんか, ありがとうございます).
     + ""Inconsistent_Mixed"": Trộn lẫn không nhất quán giữa thể lịch sự và thể thông thường (lưu ý: mệnh đề phụ đứng trước から/ので dùng thể thông thường kết hợp mệnh đề chính です/ます là ĐÚNG chuẩn ngữ pháp, tính là ""Standard_Teineigo"").
     + ""Abrupt_Casual"": Nói trống không cụt lủn hoặc dùng thể xuồng xã Tameguchi với lễ tân (như '部屋、うるさい。変えて').
   - Trong ""evidenceNote"", hãy nêu rõ cấu trúc ngữ pháp/từ vựng học viên đã dùng và trích dẫn mốc bài học 『できる日本語』 tương ứng từ bảng tham chiếu trên để giải thích vì sao lượt nói đạt N5, N4 hay N3.

YÊU CẦU ĐÁNH GIÁ VÀ TRẢ LỜI:
Hãy phân tích câu nói của học viên và trả lời bằng 1 JSON hợp lệ có đúng cấu trúc sau (không kèm markdown ngoài JSON):
{{
  ""userVietnameseMeaning"": ""Bản dịch tiếng Việt câu nói của người học"",
  ""userFuriganaHtml"": ""Markup ruby furigana cho câu của người học"",
  ""turnAnalysis"": {{
    ""inputCategory"": ""Valid | OffTopic | AbusiveOrSpam"",
    ""detectedIntent"": ""ĐÚNG 1 tên nhánh intent duy nhất trong Conditional Event Directives của sự kiện hiện tại (không ghép nhiều intent bằng dấu /)"",
    ""demonstratedBand"": ""N5 | N4 | N3 | Unobserved"",
    ""evidence"": {{
      ""taskAchievement"": ""Exceeded_ProactiveDetail | Fulfilled_Core | Partial_IncompleteInfo | Unfulfilled_Unclear"",
      ""sentenceStructure"": ""Complex_MultiClause | Compound_LinkedClause | Simple_CompleteClause | Fragment_WordOnly"",
      ""grammarErrorSeverity"": ""NoError | MinorSlip_MeaningIntact | MajorError_MeaningAffected"",
      ""grammarErrors"": [],
      ""lexicalUsage"": ""Rich_SituationalSpecific | Adequate_StandardTopic | Basic_Minimal | Inaccurate_WrongWord"",
      ""politenessRegister"": ""Advanced_KeigoOrCushioned | Standard_Teineigo | Inconsistent_Mixed | Abrupt_Casual""
    }},
    ""evidenceNote"": ""Nhận xét cụ thể về cấu trúc, từ vựng, độ lịch sự và đối chiếu mốc bài học Dekiru Nihongo (N5/N4/N3)""
  }},
  ""replyJapanese"": ""Câu nói tiếp theo của Lễ tân bằng tiếng Nhật (tự nhiên, lịch thiệp theo chuẩn lễ tân, thông thường 1-2 câu và không quá 80 ký tự)"",
  ""replyFuriganaHtml"": ""Markup ruby furigana câu tiếng Nhật của Lễ tân"",
  ""replyVietnamese"": ""Dịch câu Lễ tân sang tiếng Việt tự nhiên""
}}";
        }

        /// <summary>
        /// Trích xuất đối tượng bằng chứng quan sát được từ JSON của LLM.
        /// </summary>
        public static PlacementTurnObservableEvidence? ParseObservableEvidence(JsonElement analysis)
        {
            JsonElement evElem;
            if (!analysis.TryGetProperty("evidence", out evElem) || evElem.ValueKind != JsonValueKind.Object)
            {
                if (analysis.TryGetProperty("taskAchievement", out _))
                {
                    evElem = analysis;
                }
                else
                {
                    return null;
                }
            }

            var errors = new List<string>();
            if (evElem.TryGetProperty("grammarErrors", out var errArr) && errArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in errArr.EnumerateArray())
                {
                    var s = item.GetString();
                    if (!string.IsNullOrWhiteSpace(s))
                    {
                        errors.Add(s);
                    }
                }
            }

            return new PlacementTurnObservableEvidence
            {
                TaskAchievement = evElem.TryGetProperty("taskAchievement", out var ta) ? ta.GetString() ?? "Fulfilled_Core" : "Fulfilled_Core",
                SentenceStructure = evElem.TryGetProperty("sentenceStructure", out var ss) ? ss.GetString() ?? "Simple_CompleteClause" : "Simple_CompleteClause",
                GrammarErrorSeverity = evElem.TryGetProperty("grammarErrorSeverity", out var ge) ? ge.GetString() ?? "NoError" : "NoError",
                GrammarErrors = errors,
                LexicalUsage = evElem.TryGetProperty("lexicalUsage", out var lu) ? lu.GetString() ?? "Adequate_StandardTopic" : "Adequate_StandardTopic",
                PolitenessRegister = evElem.TryGetProperty("politenessRegister", out var pr) ? pr.GetString() ?? "Standard_Teineigo" : "Standard_Teineigo"
            };
        }

        /// <summary>
        /// Động cơ tính điểm tất định tại Backend (Backend Deterministic Scoring Engine - Approach C)
        /// dựa trên bằng chứng JF Standard &amp; Dekiru Nihongo kết hợp hậu kiểm C#.
        /// </summary>
        public static (int TaskScore, int GrammarScore, int VocabScore, int PragmaticsScore, string ValidatedBand) ComputeDeterministicTurnScores(
            string userText,
            string inputCategory,
            string detectedIntent,
            string rawDemonstratedBand,
            PlacementTurnObservableEvidence evidence,
            IReadOnlyList<string> ruleErrorCodes,
            bool isClarificationOrStrategy = false)
        {
            if (!isClarificationOrStrategy && (
                inputCategory.Equals("AbusiveOrSpam", StringComparison.OrdinalIgnoreCase) ||
                inputCategory.Equals("IncoherentOrAbusive", StringComparison.OrdinalIgnoreCase) ||
                inputCategory.Equals("OffTopic", StringComparison.OrdinalIgnoreCase) ||
                detectedIntent.Equals("OffTopic", StringComparison.OrdinalIgnoreCase) ||
                detectedIntent.Equals("AbusiveOrSpam", StringComparison.OrdinalIgnoreCase)))
            {
                return (0, 0, 0, 0, "Unobserved");
            }

            var trimmed = userText?.Trim() ?? string.Empty;

            // 1. Task Fulfillment Score (35%)
            int taskScore = evidence.TaskAchievement switch
            {
                "Exceeded_ProactiveDetail" => 92,
                "Fulfilled_Core" => 80,
                "Partial_IncompleteInfo" => 65,
                "Unfulfilled_Unclear" => 45,
                _ => 65
            };

            if (isClarificationOrStrategy && taskScore < 65)
            {
                taskScore = 65;
            }

            // 2. Grammar Accuracy Score (25%) — Tách biệt Độ chính xác và Độ phức tạp + Hậu kiểm mâu thuẫn
            var effectiveSeverity = evidence.GrammarErrorSeverity;
            if (effectiveSeverity.Equals("NoError", StringComparison.OrdinalIgnoreCase) && evidence.GrammarErrors.Count > 0)
            {
                effectiveSeverity = "MinorSlip_MeaningIntact";
            }

            int grammarScore;
            if (effectiveSeverity.Equals("MajorError_MeaningAffected", StringComparison.OrdinalIgnoreCase))
            {
                grammarScore = 50;
            }
            else if (effectiveSeverity.Equals("MinorSlip_MeaningIntact", StringComparison.OrdinalIgnoreCase))
            {
                grammarScore = 70;
            }
            else
            {
                grammarScore = evidence.SentenceStructure switch
                {
                    "Complex_MultiClause" or "Compound_LinkedClause" => 92,
                    "Fragment_WordOnly" => 76,
                    _ => 85 // Simple_CompleteClause không lỗi đạt 85đ
                };
            }

            if (ruleErrorCodes != null && ruleErrorCodes.Count > 0)
            {
                if (grammarScore > 75)
                {
                    grammarScore = 75;
                }
                grammarScore = Math.Max(40, grammarScore - (ruleErrorCodes.Count * 5));
            }

            // 3. Vocabulary Range Score (20%)
            int vocabScore = evidence.LexicalUsage switch
            {
                "Rich_SituationalSpecific" => 90,
                "Adequate_StandardTopic" => 78,
                "Basic_Minimal" => 65,
                "Inaccurate_WrongWord" => 50,
                _ => 78
            };

            if (evidence.SentenceStructure.Equals("Fragment_WordOnly", StringComparison.OrdinalIgnoreCase) && trimmed.Length <= 5)
            {
                vocabScore = Math.Min(vocabScore, 65);
            }

            // 4. Pragmatics & Politeness Score (20%) + Hậu kiểm dấu hiệu lịch sự bằng C#
            int pragmaticsScore = evidence.PolitenessRegister switch
            {
                "Advanced_KeigoOrCushioned" => 92,
                "Standard_Teineigo" => 80,
                "Inconsistent_Mixed" => 62,
                "Abrupt_Casual" => 48,
                _ => 80
            };

            bool hasPolite = HasPoliteMarker(trimmed);
            if (trimmed.Length > 4 && !hasPolite)
            {
                pragmaticsScore = Math.Min(pragmaticsScore, 62);
            }

            if (isClarificationOrStrategy && hasPolite)
            {
                pragmaticsScore = Math.Max(pragmaticsScore, 80);
            }

            // 5. Hậu kiểm Bậc năng lực bộc lộ (DemonstratedBand: N5 | N4 | N3)
            string validatedBand = rawDemonstratedBand is "N3" or "N4" or "N5" ? rawDemonstratedBand : "N5";
            if (evidence.SentenceStructure.Equals("Fragment_WordOnly", StringComparison.OrdinalIgnoreCase))
            {
                validatedBand = "N5";
            }
            else if (validatedBand == "N3")
            {
                if (evidence.SentenceStructure.Equals("Simple_CompleteClause", StringComparison.OrdinalIgnoreCase) &&
                    !evidence.PolitenessRegister.Equals("Advanced_KeigoOrCushioned", StringComparison.OrdinalIgnoreCase))
                {
                    validatedBand = "N4";
                }
                else if (effectiveSeverity.Equals("MajorError_MeaningAffected", StringComparison.OrdinalIgnoreCase))
                {
                    validatedBand = "N4";
                }
            }

            return (taskScore, grammarScore, vocabScore, pragmaticsScore, validatedBand);
        }

        private static readonly string[] PoliteMarkers =
        [
            "です", "ます", "ました", "ません", "でした", "でしょう",
            "お願い", "おねがい", "ありがとう", "すみません", "すいません",
            "恐れ", "いたし", "申します", "いただ", "くださ", "よろし",
            "結構", "かしこまり", "ございま", "はい", "ええ"
        ];

        public static bool HasPoliteMarker(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return false;
            foreach (var marker in PoliteMarkers)
            {
                if (text.Contains(marker, StringComparison.Ordinal))
                {
                    return true;
                }
            }
            return false;
        }

        private static string GetDekiruNihongoReferenceForEvent(string eventCode) => eventCode switch
        {
            "EVT-01" => @"- Tham chiếu giáo trình 『できる日本語』:
  + 初級 (Sho - N5): Bài 1 ST1 (Nói thông tin cá nhân cơ bản và mục đích đến quầy).
  + 初中級 (Shochuu - N4): Bài 1 ST1 (Tự giới thiệu trang trọng kèm thông tin đặt chỗ).
  + 中級 (Chuu - N3): Bài 4 ST1/ST2 (Xác nhận chi tiết dịch vụ đã đặt trước và chủ động đề cập yêu cầu đặc biệt).
- Tiêu chí phân bậc câu nói của học viên tại EVT-01:
  + Mức N5: Xác nhận check-in và nêu tên bằng câu đơn ngắn (VD: 「チェックインをお願いします。田中です」).
  + Mức N4: Nêu tên kèm chi tiết kỳ lưu trú (3 đêm) hoặc dùng khiêm nhường ngữ cơ bản (VD: 「今日から3泊予約した田中と申します。チェックインをお願いします」).
  + Mức N3: Xác nhận đầy đủ thông tin đặt phòng kèm chủ động nhắc lại yêu cầu phòng yên tĩnh hoặc rào đón tự nhiên (VD: 「本日3泊で予約している田中と申します。予約時に静かな部屋をお願いしたんですが、確認していただけますか」).",

            "EVT-02" => @"- Tham chiếu giáo trình 『できる日本語』:
  + 初級 (Sho - N5): Bài 2 ST1 (Hỏi thông tin cơ bản tại quầy).
  + 初中級 (Shochuu - N4): Bài 4 ST1 & Bài 5 ST2 (Trình bày lý do bất tiện và nhờ nhân viên hỗ trợ đổi phương án).
  + 中級 (Chuu - N3): Bài 2 ST4 & Bài 4 ST2 (Giải thích lịch sự sự khác biệt so với kỳ vọng/yêu cầu ban đầu và thương lượng đổi phòng tinh tế).
- Tiêu chí phân bậc câu nói của học viên tại EVT-02:
  + Mức N5: Đồng ý ngắn gọn hoặc hỏi câu đơn xem có phòng khác không (VD: 「大丈夫です」 / 「ほかの部屋はありますか？」).
  + Mức N4: Nêu lý do muốn phòng yên tĩnh (〜ので / 〜から) và nhờ lễ tân đổi phòng (VD: 「静かな部屋がいいので、他の部屋に変えてもらえませんか？」).
  + Mức N3: Trình bày lịch sự hoàn cảnh/mong muốn nghỉ ngơi hoặc nhắc lại yêu cầu lúc đặt (〜はずなんですが / 〜たいんですが / 〜ため) và đề nghị kiểm tra/đổi phòng xa thang máy bằng kính ngữ/cấu trúc trang trọng (VD: 「予約した時に静かな部屋をお願いしたはずなんですが、エレベーターから離れた部屋に変えていただくことは可能でしょうか」).",

            "EVT-03" => @"- Tham chiếu giáo trình 『できる日本語』:
  + 初級 (Sho - N5): Bài 2 ST2 (Hỏi giá tiền và chọn phương án đơn giản).
  + 初中級 (Shochuu - N4): Bài 2 ST1/ST2 (So sánh điều kiện 2 phương án và đưa ra quyết định kèm lý do).
  + 中級 (Chuu - N3): Bài 8 ST1 & Bài 14 ST2 (Đánh giá chi phí - lợi ích, nêu điều kiện ngân sách/lịch trình và thương lượng/chốt phương án lịch thiệp).
- Tiêu chí phân bậc câu nói của học viên tại EVT-03:
  + Mức N5: Hỏi giá đơn giản hoặc đưa ra lựa chọn câu đơn (VD: 「いくらですか？」 / 「デラックスをお願いします」 / 「元の部屋にします」).
  + Mức N4: Xác nhận phụ phí 3 đêm và nêu quyết định kèm lý do ngắn (VD: 「3泊で6,000円ですね。ちょっと高いので元の部屋でいいです」 / 「静かな方がいいのでデラックスにします」).
  + Mức N3: Cân nhắc điều kiện ngân sách hoặc lịch trình cá nhân bằng câu phức (〜となると / 予算を超えてしまうのですが / 予定があるため), đặt câu hỏi/điều kiện giả định (〜のであれば / 〜でしょうか) và chốt phương án lịch sự (VD: 「3泊で6,000円の追加料金がかかるとなると、少し予算を超えてしまうのですが、翌朝早くから予定があるため、静かな部屋で休みたいと思っています。スタンダードルームに空きがないのであれば、デラックスルームに変更していただけますでしょうか」).",

            "EVT-04" => @"- Tham chiếu giáo trình 『できる日本語』:
  + 初級 (Sho - N5): Bài 3 ST1 (Hỏi giờ giấc, giá tiền và đăng ký/từ chối dịch vụ).
  + 初中級 (Shochuu - N4): Bài 3 ST1 (Hỏi chi tiết dịch vụ kèm trình bày kế hoạch cá nhân).
  + 中級 (Chuu - N3): Bài 4 ST1 (Đặt câu hỏi điều kiện linh hoạt hoặc kết hợp giải thích lịch trình với việc tìm hiểu chi tiết thực đơn trước khi cân nhắc).
- Tiêu chí phân bậc câu nói của học viên tại EVT-04:
  + Mức N5: Hỏi giờ ăn sáng, giá tiền hoặc đăng ký/từ chối đơn giản (VD: 「朝ごはんは何時からですか？」 / 「お願いします」 / 「けっこうです」).
  + Mức N4: Hỏi thông tin bữa sáng và quyết định kèm lý do/kế hoạch cá nhân (VD: 「明日は早く出かけるつもりなので、朝食は結構です」 / 「朝ごはんもつけてもらえますか」).
  + Mức N3: Trình bày lịch trình kết hợp đặt điều kiện tìm hiểu thêm nội dung/thực đơn hoặc hỏi phương án đăng ký linh hoạt (VD: 「翌朝は早く出発する予定なので今回は利用しないことにします。ただ、ビュッフェには興味がありますので、もし朝食の内容やメニューについて詳しく教えていただけるのであれば、検討してみたいと思います」 / 「3泊のうち1日だけ朝食をつけることはできますか」).",

            "EVT-05" => @"- Tham chiếu giáo trình 『できる日本語』:
  + 初級 (Sho - N5): Bài 1–2 (Xác nhận ngắn và cảm ơn khi hoàn tất thủ tục).
  + 初中級 (Shochuu - N4): Bài 5 (Xác nhận lại thông tin tổng kết và cảm ơn lịch sự).
  + 中級 (Chuu - N3): Bài 4 (Xác nhận tổng kết phương án và đáp lễ trang trọng chuẩn mực khi kết thúc giao dịch).
- Tiêu chí phân bậc câu nói của học viên tại EVT-05:
  + Mức N5: Xác nhận và cảm ơn cơ bản (VD: 「はい、わかりました。ありがとうございます」).
  + Mức N4: Xác nhận lại chi tiết/tổng tiền và cảm ơn lịch sự (VD: 「はい、確認しました。いろいろありがとうございます」).
  + Mức N3: Xác nhận tổng kết rõ ràng kèm lời cảm ơn và chào kết thúc trang trọng tự nhiên (VD: 「丁寧にご対応いただきありがとうございます。3日間よろしくお願いいたします」).",

            _ => "- Đối chiếu năng lực thực tế câu nói của học viên theo khung 『できる日本語』: 初級 (N5 - câu đơn cơ bản), 初中級 (N4 - câu ghép nêu lý do/nhờ vả), 中級 (N3 - câu phức đa mệnh đề, điều kiện giả định, kính ngữ và thương lượng tinh tế)."
        };

        private static string GetConditionalDirectivesForEvent(PlacementAssessmentState state) => state.CurrentEvent switch
        {
            "EVT-01" => @"Sự kiện EVT-01 (Greeting & Reservation Confirmation):
- Nhánh 1 (ConfirmReservation): Khách xác nhận tên (Tanaka / 田中 / タナカ) và đặt phòng -> Lễ tân cảm ơn, thông báo tìm thấy đặt phòng Standard 3 đêm, nhưng phòng được xếp là Phòng 512 nằm ngay cạnh thang máy (chuyển sang EVT-02).
- Nhánh 2 (ConfirmReservationWithQuietRequest): Khách xác nhận tên (Tanaka / 田中 / タナカ) kèm nhắc lại yêu cầu phòng yên tĩnh -> Lễ tân xin lỗi vì phòng xếp hiện tại (512) ở cạnh thang máy, hỏi ý kiến khách (chuyển sang EVT-02).
- Nhánh 3 (OffTopic): Khách nói nội dung không liên quan -> Lễ tân lịch sự hỏi lại xem có phải khách đến nhận phòng không.",

            "EVT-02" => @"Sự kiện EVT-02 (Room Assignment Problem - Room 512 near elevator):
- Nhánh 1 (RequestRoomChange): Khách không hài lòng với phòng 512 ồn ào, đề nghị đổi phòng, hỏi xem có phòng nào khác không (như ほかの部屋はありますか, 別の部屋) hoặc hỏi sang phòng Deluxe/Twin -> Lễ tân kiểm tra hệ thống, báo các phòng Standard khác và Twin đều đã kín (満室), đồng thời giới thiệu Deluxe Room xa thang máy có phụ phí +2,000 Yên/đêm (tổng 6,000 Yên cho 3 đêm) (chuyển sang EVT-03).
- Nhánh 2 (AcceptAssignedRoom): Khách đồng ý ở phòng 512 -> Lễ tân cảm ơn và hỏi khách có muốn đăng ký thêm bữa sáng (1,500 Yên/ngày) không (chuyển sang EVT-04).
- Nhánh 3 (AskRoomInfo): Khách CHỈ hỏi thông tin về chính phòng 512 (tầng mấy, diện tích, độ ồn) hoặc bày tỏ băn khoăn chung mà CHƯA hỏi đổi phòng khác -> Lễ tân giải thích phòng 18m2 tầng 5 có cửa cách âm, nhưng giờ cao điểm có thể nghe tiếng thang máy; sau đó hỏi khách có chấp nhận phòng 512 này không hay muốn tìm phòng khác (duy trì ở EVT-02).
- Nhánh 4 (OffTopic): Nhắc khéo khách về việc xác nhận phòng 512.",

            "EVT-03" => @"Sự kiện EVT-03 (Alternative Room Availability - Deluxe Room Offer):
- Nhánh 1 (AcceptDeluxeUpgrade): Khách đồng ý nâng lên Deluxe +2,000 Yên/đêm -> Lễ tân xác nhận đổi phòng Deluxe yên tĩnh, đồng thời hỏi khách có muốn dùng thêm bữa sáng buffet (1,500 Yên/người) không (chuyển sang EVT-04).
- Nhánh 2 (KeepOriginalStandardRoom): Khách chọn giữ phòng cũ 512 (hoặc đồng ý ở lại phòng Standard ban đầu) -> Lễ tân xác nhận giữ phòng Standard 512, đồng thời hỏi khách có muốn đăng ký thêm bữa sáng (1,500 Yên/người) không (chuyển sang EVT-04).
- Nhánh 3 (AskUpgradeDetails): Khách hỏi chi tiết giá (tổng 3 đêm là 6,000 Yên), hỏi diện tích/tiện ích phòng Deluxe, hoặc hỏi xem có thể quay lại giữ phòng Standard cũ được không -> Lễ tân giải thích rõ ràng, trung thực và lịch sự (ví dụ: 3 đêm Deluxe là 6,000 Yên; nếu giữ Standard 512 thì không mất phí; Twin đã kín). ĐẶC BIỆT: Sau khi giải đáp thông tin, Lễ tân CHỦ ĐỘNG TÓM TẮT 2 phương án và lịch sự hỏi khách muốn chọn phương án nào (nâng hạng Deluxe hay giữ phòng Standard 512 ban đầu). Duy trì ở EVT-03 cho đến khi khách đưa ra quyết định.
- Nhánh 4 (OffTopic): Lễ tân mời khách chọn giữa nâng hạng Deluxe hoặc giữ phòng cũ.",

            "EVT-04" => @"Sự kiện EVT-04 (Additional Service Inquiry - Breakfast):
- Nhánh 1 (AddBreakfast hoặc DeclineBreakfast): Khách đăng ký hoặc từ chối bữa sáng -> Lễ tân ghi nhận và chuyển sang tổng kết chốt phương án trao chìa khóa (EVT-05).
- Nhánh 2 (AskBreakfastInfo): Khách hỏi giờ hoặc thông tin bữa sáng -> Lễ tân giải thích phục vụ từ 7:00 đến 10:00 tại nhà hàng tầng 1, giá 1,500 Yên/người buffet món Nhật và Tây; sau đó hỏi khách có muốn đăng ký dùng bữa sáng không (duy trì ở EVT-04 cho đến khi khách quyết định).",

            "EVT-05" => @"Sự kiện EVT-05 (Solution Confirmation & Natural Hand-off):
- Nhánh 1 (ConfirmAndThank): Khách xác nhận thông tin thanh toán, nhận chìa khóa hoặc cảm ơn lễ tân (ví dụ: はい確認しました, 有難うございます, よろしくお願いします) -> Lễ tân chúc khách có kỳ nghỉ thoải mái, trao chìa khóa và hoàn tất thủ tục nhận phòng.",

            _ => "Duy trì đối thoại lịch sự theo bối cảnh lễ tân khách sạn."
        };

        /// <summary>
        /// Tính điểm tổng hợp trung bình có trọng số cho một lượt nói theo đúng tỷ trọng Rubric
        /// (35% Task + 25% Grammar + 20% Vocabulary + 20% Pragmatics).
        /// </summary>
        public static int ComputeTurnOverallScore(int taskScore, int grammarScore, int vocabScore, int pragmaticsScore)
        {
            return (int)Math.Round(
                (0.35 * taskScore) +
                (0.25 * grammarScore) +
                (0.20 * vocabScore) +
                (0.20 * pragmaticsScore));
        }

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

            int overallScore = ComputeTurnOverallScore(avgTask, avgGrammar, avgVocab, avgPragmatics);

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

            // Mức độ tin cậy của dữ liệu đánh giá: Tỷ lệ lượt hợp lệ / tổng lượt hội thoại
            double cDataReliability = state.TurnEvidences.Count > 0 ? (double)validTurns.Count / state.TurnEvidences.Count : 1.0;

            double confidenceScore = (0.35 * cQuantity) + (0.35 * cCoverage) + (0.20 * cConsistency) + (0.10 * cDataReliability);

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
        public int TaskFulfillmentScore { get; set; }
        public int GrammarAccuracyScore { get; set; }
        public int VocabularyRangeScore { get; set; }
        public int PragmaticsScore { get; set; }
        public int OverallTurnScore { get; set; }
        public string EvidenceNote { get; set; } = string.Empty;
    }
}