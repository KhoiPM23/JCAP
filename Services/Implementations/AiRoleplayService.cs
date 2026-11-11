using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using JCAP.DTOs.Roleplay;
using JCAP.Models;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations;

public class AiRoleplayService : IAiRoleplayService
{
    private readonly IAiClient _aiClient;
    private readonly ILogger<AiRoleplayService> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private static readonly Regex ForeignLanguagePatternRegex = new(
        @"[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]|\b(toi\s+muon|cho\s+toi|toi\s+la|em\s+la|xin\s+chao|cam\s+on|khong\s+co|co\s+the|lam\s+viec|thoi\s+gian|phuong\s+tien|di\s+lai|ca\s+dem|nghi\s+phep|muon\s+goi|mot\s+bat|1\s+bat|muon|goi|khong|duoc|tieng|viet|chao|ngay|tuan|phuong|phep|luong|hello|want|order|please|i\s+would\s+like)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex RomajiJapaneseRegex = new(
        @"\b(arigatou|arigato|konnichiwa|konbanwa|ohayou|ohayo|kore|sore|are|doko|ikura|desu|masu|kudasai|onegaishimasu|onegai|sumimasen|ramen|oishii|hai|iie|watashi|boku|ore|anata|mizu|ocha|gohan|sushi|tempura|chuumon|kaikei|ikaga|nanmei|hitori|futari)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static bool IsLikelyRomaji(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        bool hasJapaneseChar = Regex.IsMatch(text, @"[぀-ゟ゠-ヿ一-龯]");
        if (hasJapaneseChar) return false;
        return RomajiJapaneseRegex.IsMatch(text) || Regex.IsMatch(text, @"\b(kore\s+wa\s+ikura|ikura\s+desu\s+ka)\b", RegexOptions.IgnoreCase);
    }

    private static bool IsLikelyForeignOrVietnamese(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        return ForeignLanguagePatternRegex.IsMatch(text);
    }

    public AiRoleplayService(
        IAiClient aiClient,
        ILogger<AiRoleplayService> logger)
    {
        _aiClient = aiClient;
        _logger = logger;
    }

    public Task<AiOpeningMessageResult> GenerateOpeningMessageAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        CancellationToken cancellationToken = default)
        => GenerateOpeningMessageAsync(scenario, levelConfig, null, null, cancellationToken);

    public Task<AiOpeningMessageResult> GenerateOpeningMessageAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        string? circadianGreeting,
        CancellationToken cancellationToken = default)
        => GenerateOpeningMessageAsync(scenario, levelConfig, circadianGreeting, null, cancellationToken);

    public async Task<AiOpeningMessageResult> GenerateOpeningMessageAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        string? circadianGreeting,
        string? memoryContext,
        CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(circadianGreeting))
        {
            var reg = RoleplaySocialRegister.Deduce(scenario.Title, levelConfig.AiPersona, levelConfig.Description);
            var fHtml = RoleplaySocialRegister.GenerateFuriganaHtml(circadianGreeting);
            var viGreeting = circadianGreeting.Contains("おはよう")
                ? $"Chào buổi sáng! Rất vui được gặp lại {reg.AiAddressLearner}. Hôm nay chúng ta cùng cố gắng nhé!"
                : circadianGreeting.Contains("こんばんは")
                    ? $"Chào buổi tối! {reg.AiAddressLearner} hôm nay cũng vất vả rồi. Cùng cố gắng luyện tập buổi tối nhé!"
                    : $"Chào {reg.AiAddressLearner}! Hôm nay chúng ta cùng luyện tập nhé!";

            return new AiOpeningMessageResult
            {
                JapaneseText = circadianGreeting.Trim(),
                FuriganaHtml = fHtml,
                VietnameseMeaning = viGreeting
            };
        }

        try
        {
            var systemPrompt = BuildSystemInstruction(scenario, levelConfig);
            var userPrompt = @"Start the conversation as your persona with an appropriate opening line.
Return strictly pure JSON matching:
{
  ""replyJapanese"": ""Opening greeting in Japanese suitable for the persona and context"",
  ""replyFuriganaHtml"": ""HTML ruby tag markup for reading assistance (e.g. いらっしゃいませ！<ruby>何名様<rt>なんめいさま</rt></ruby>ですか？)"",
  ""replyVietnamese"": ""Natural translation in Vietnamese""
}";

            var request = AiRequest.CreateJson(systemPrompt, userPrompt);
            var response = await _aiClient.GenerateAsync(request, cancellationToken);

            if (response.IsSuccess && !string.IsNullOrWhiteSpace(response.Content))
            {
                using var doc = JsonDocument.Parse(response.Content);
                var root = doc.RootElement;
                var ja = root.TryGetProperty("replyJapanese", out var jaProp) ? jaProp.GetString() ?? "" : "";
                var fHtml = root.TryGetProperty("replyFuriganaHtml", out var fProp) ? fProp.GetString() : null;
                var vi = root.TryGetProperty("replyVietnamese", out var viProp) ? viProp.GetString() ?? "" : "";

                if (!string.IsNullOrWhiteSpace(ja))
                {
                    ja = RoleplaySocialRegister.SanitizeJapaneseReply(ja);
                    return new AiOpeningMessageResult
                    {
                        JapaneseText = ja.Trim(),
                        FuriganaHtml = !string.IsNullOrWhiteSpace(fHtml) && !RoleplaySocialRegister.HasVietnameseLeak(fHtml)
                            ? RoleplaySocialRegister.CleanFuriganaHtml(RoleplaySocialRegister.SanitizeJapaneseReply(fHtml))
                            : RoleplaySocialRegister.GenerateFuriganaHtml(ja.Trim()),
                        VietnameseMeaning = vi.Trim()
                    };
                }
            }
            else
            {
                _logger.LogWarning("Không thể sinh câu mở đầu từ AI Client ({Error}, Status: {StatusCode}). Sử dụng Simulator.", response.ErrorMessage, response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Lỗi khi gọi AI Client cho câu mở đầu. Tự động chuyển sang Simulator.");
        }

        return GenerateSimulatorOpeningMessage(scenario, levelConfig);
    }

    public Task<AiTurnResult> ProcessTurnAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        List<RoleplayMessage> conversationHistory,
        string userMessage,
        List<Mission> pendingMissions,
        CancellationToken cancellationToken = default)
        => ProcessTurnAsync(scenario, levelConfig, conversationHistory, userMessage, pendingMissions, null, cancellationToken);

    public async Task<AiTurnResult> ProcessTurnAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        List<RoleplayMessage> conversationHistory,
        string userMessage,
        List<Mission> pendingMissions,
        string? personaDirective,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var reg = RoleplaySocialRegister.Deduce(scenario.Title, levelConfig.AiPersona, levelConfig.Description);

            // PRE-FLIGHT GUARD (0 tokens, <1ms):
            // Chặn ngay các lượt nói tiếng Việt hoặc ngoại ngữ trước khi gọi LLM
            if (IsLikelyForeignOrVietnamese(userMessage))
            {
                var confusedJa = "恐れ入りますが、日本語が分かりませんので、日本語でお話しいただけますでしょうか。";
                var confusedVi = $"Xin lỗi, {reg.AiSelf} không hiểu tiếng nước ngoài. {reg.AiAddressLearner} có thể nói bằng tiếng Nhật được không ạ?";
                return new AiTurnResult
                {
                    JapaneseReply = confusedJa,
                    FuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(confusedJa),
                    VietnameseMeaning = confusedVi,
                    UserVietnameseMeaning = userMessage,
                    UserFuriganaHtml = userMessage,
                    CompletedMissionIds = new List<int>(),
                    IsNaturallyConcluded = false,
                    LinguisticFeedback = new LinguisticFeedbackDto
                    {
                        Status = "Error",
                        Summary = "Vui lòng sử dụng tiếng Nhật",
                        EvaluationSource = "PreFlightGuard",
                        Details = new List<LinguisticDetailItemDto>
                        {
                            new()
                            {
                                Type = "error",
                                Aspect = "Ngôn ngữ",
                                Comment = "Hệ thống chỉ hỗ trợ luyện tập bằng tiếng Nhật. Vui lòng không sử dụng tiếng Việt hoặc ngoại ngữ khác."
                            }
                        },
                        NaturalAlternative = null,
                        CulturalTip = "Tại các cửa hàng hoặc môi trường làm việc ở Nhật Bản, giao tiếp bằng tiếng Nhật là yêu cầu cơ bản."
                    }
                };
            }

            // PRE-FLIGHT GUARD 2: Chặn ký tự Romaji (chữ Latin) yêu cầu chuyển sang Kana/Kanji
            if (!IsLikelyForeignOrVietnamese(userMessage) && IsLikelyRomaji(userMessage))
            {
                var jaNotice = "恐れ入ります、ローマ字ではなく、日本語のひらがな・カタカナ、または漢字でお話しいただけますでしょうか。";
                var viNotice = $"Xin lỗi {reg.AiAddressLearner}, hệ thống yêu cầu sử dụng chữ viết tiếng Nhật (Hiragana/Katakana/Kanji) thay vì ký tự La-tinh (Romaji). {reg.AiAddressLearner} vui lòng bật bộ gõ tiếng Nhật (IME) nhé ạ.";
                return new AiTurnResult
                {
                    JapaneseReply = jaNotice,
                    FuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(jaNotice),
                    VietnameseMeaning = viNotice,
                    UserVietnameseMeaning = userMessage,
                    UserFuriganaHtml = userMessage,
                    CompletedMissionIds = new List<int>(),
                    IsNaturallyConcluded = false,
                    LinguisticFeedback = new LinguisticFeedbackDto
                    {
                        Status = "Warning",
                        Summary = "Phát hiện ký tự Romaji (La-tinh) • Vui lòng chuyển sang chữ Kana/Kanji",
                        EvaluationSource = "PreFlightGuard",
                        Details = new List<LinguisticDetailItemDto>
                        {
                            new()
                            {
                                Type = "warning",
                                Aspect = "Bảng chữ cái & Nhập liệu",
                                Comment = "Bạn đang gõ tiếng Nhật bằng ký tự La-tinh (Romaji). Trong giao tiếp thực tế và luyện tập Kaiwa, hãy bật bộ gõ tiếng Nhật (IME) để gõ chữ Hiragana, Katakana hoặc Kanji chuẩn mực."
                            }
                        },
                        NaturalAlternative = "これをお願いします。",
                        CulturalTip = "Hầu hết các thiết bị máy tính và điện thoại đều có sẵn bộ gõ Japanese IME. Bạn chỉ cần gõ phát âm và ấn phím Cách (Space) để chuyển đổi thành Kanji tương ứng."
                    }
                };
            }

            // === DETERMINISTIC PRE-FLIGHT GUARDRAILS (0 tokens, <1ms) ===
            var scenarioContext = $"{scenario.Title} {levelConfig.AiPersona} {levelConfig.Description}".ToLowerInvariant();
            bool isRamenScenario = scenarioContext.Contains("ramen") || scenarioContext.Contains("mì") || scenarioContext.Contains("ラーメン");
            bool isStationScenario = scenarioContext.Contains("ga") || scenarioContext.Contains("tàu") || scenarioContext.Contains("station") || scenarioContext.Contains("駅") || scenarioContext.Contains("切符");
            bool isInterviewScenario = scenarioContext.Contains("phỏng vấn") || scenarioContext.Contains("xin việc") || scenarioContext.Contains("baito") || scenarioContext.Contains("面接");
            bool isCafeScenario = scenarioContext.Contains("cafe") || scenarioContext.Contains("cà phê") || scenarioContext.Contains("đồ uống");
            bool isMedicalScenario = scenarioContext.Contains("bệnh viện") || scenarioContext.Contains("khám") || scenarioContext.Contains("bác sĩ") || scenarioContext.Contains("病院") || scenarioContext.Contains("クリニック");
            bool isKonbiniScenario = scenarioContext.Contains("tiện lợi") || scenarioContext.Contains("siêu thị") || scenarioContext.Contains("konbini") || scenarioContext.Contains("cửa hàng") || scenarioContext.Contains("コンビニ");

            var lastAiMsg = conversationHistory?.LastOrDefault(m => m.Sender == "Ai")?.JapaneseText ?? "";
            bool isAskingPartySize = Regex.IsMatch(lastAiMsg, @"(何名様|何名|何人|お一人|1人)");
            bool hasPartySize = Regex.IsMatch(userMessage, @"(1人|2人|3人|4人|5人|一人|二人|三人|四人|ひとり|ふたり|名|カウンター|テーブル)");
            bool isAskingLocation = Regex.IsMatch(lastAiMsg, @"(店内|持ち帰り|こちらでお召し上がり|テイクアウト)");

            // 1. Trailing Particle Fragment Guard (Tổng quát hóa theo bối cảnh kịch bản)
            if (Regex.IsMatch(userMessage.Trim(), @"(を|に|で|は|が|と|へ|から|まで)[…\.\s]*$") && !Regex.IsMatch(userMessage, @"(です|ます|ください|お願い|いたし)"))
            {
                string jaReply;
                string viReply;
                string naturalAlt;

                if (isRamenScenario)
                {
                    jaReply = "はい、ラーメンをどうなさいますか？ご注文をお聞かせください。";
                    viReply = $"Vâng, {reg.AiAddressLearner} muốn dùng mì ramen như thế nào ạ? Xin vui lòng cho {reg.AiSelf} biết yêu cầu gọi món.";
                    naturalAlt = "すみません、ラーメンをお願いします。";
                }
                else if (isStationScenario)
                {
                    jaReply = "はい、どちらまで行かれますか？どうなさいますか、ご用件をお聞かせください。";
                    viReply = $"Vâng, {reg.AiAddressLearner} muốn đi tới đâu ạ? Xin vui lòng cho {reg.AiSelf} biết ga đến hoặc yêu cầu vé tàu.";
                    naturalAlt = "新宿駅までの切符を一枚お願いします。";
                }
                else if (isInterviewScenario)
                {
                    jaReply = "はい、その件についてどうなさいますか？詳しくお聞かせください。";
                    viReply = $"Vâng, về việc đó thì {reg.AiAddressLearner} muốn trình bày thế nào ạ? Xin vui lòng nói rõ hơn câu trả lời.";
                    naturalAlt = "志望動機についてお話しさせていただきます。";
                }
                else if (isCafeScenario)
                {
                    jaReply = "はい、お飲み物をどうなさいますか？ご注文をお聞かせください。";
                    viReply = $"Vâng, {reg.AiAddressLearner} muốn dùng đồ uống như thế nào ạ? Xin vui lòng cho {reg.AiSelf} biết yêu cầu gọi món.";
                    naturalAlt = "すみません、アイスコーヒーをお願いします。";
                }
                else
                {
                    jaReply = "はい、どうなさいますか？ご用件を最後までお聞かせください。";
                    viReply = $"Vâng, {reg.AiAddressLearner} có yêu cầu như thế nào ạ? Xin vui lòng nói trọn vẹn câu để {reg.AiSelf} phục vụ tốt nhất.";
                    naturalAlt = "すみません、これをお願いします。";
                }

                return new AiTurnResult
                {
                    JapaneseReply = jaReply,
                    FuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(jaReply),
                    VietnameseMeaning = viReply,
                    UserVietnameseMeaning = userMessage,
                    UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userMessage),
                    CompletedMissionIds = new List<int>(),
                    IsNaturallyConcluded = false,
                    LinguisticFeedback = new LinguisticFeedbackDto
                    {
                        Status = "Warning",
                        Summary = "Câu nói chưa hoàn chỉnh • Bị ngắt ở trợ từ",
                        EvaluationSource = "Guardrail",
                        Details = new List<LinguisticDetailItemDto>
                        {
                            new()
                            {
                                Type = "warning",
                                Aspect = "Cấu trúc câu",
                                Comment = "Câu nói bị ngắt quãng ngay sau trợ từ. Hãy hoàn thiện vị ngữ như '〜をお願いします' hoặc '〜をください' để câu trọn vẹn và lịch sự."
                            }
                        },
                        NaturalAlternative = naturalAlt,
                        CulturalTip = "Trong tiếng Nhật giao tiếp, tránh ngắt câu lửng ở trợ từ vì có thể gây bối rối cho người đối thoại."
                    }
                };
            }

            // 2. Paradoxical / Conflicting Request Guard (熱いアイスコーヒー)
            if (Regex.IsMatch(userMessage, @"(熱い.*アイス|アイス.*熱い|冷たい.*ホット|ホット.*冷たい)"))
            {
                var jaReply = "恐れ入ります、ホット（温かいもの）とアイス（冷たいもの）のどちらをご希望でしょうか？";
                return new AiTurnResult
                {
                    JapaneseReply = jaReply,
                    FuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(jaReply),
                    VietnameseMeaning = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiAddressLearner} muốn dùng đồ uống nóng (hot) hay lạnh (ice) ạ?",
                    UserVietnameseMeaning = userMessage,
                    UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userMessage),
                    CompletedMissionIds = new List<int>(),
                    IsNaturallyConcluded = false,
                    LinguisticFeedback = new LinguisticFeedbackDto
                    {
                        Status = "Warning",
                        Summary = "Yêu cầu mâu thuẫn về nhiệt độ đồ uống",
                        EvaluationSource = "Guardrail",
                        Details = new List<LinguisticDetailItemDto>
                        {
                            new()
                            {
                                Type = "warning",
                                Aspect = "Ngữ nghĩa & Từ vựng",
                                Comment = "Bạn đang kết hợp từ trái ngược ('nóng' và 'đá'). Hãy chọn rõ ràng 'ホット' (nóng) hoặc 'アイス' (lạnh)."
                            }
                        },
                        NaturalAlternative = "アイスコーヒーをお願いします。",
                        CulturalTip = "Ở Nhật, cà phê hoặc trà luôn được phân loại rõ ràng là ホット (Hot) hoặc アイス (Iced)."
                    }
                };
            }

            // 3. Off-Context / Off-Menu Guard (Tổng quát hóa theo bối cảnh: Quán ăn, Nhà ga, Phỏng vấn)
            if (isRamenScenario && Regex.IsMatch(userMessage, @"(ピザ|ハンバーガー|パスタ|スパゲッティ|ピッツァ|寿司|すし)"))
            {
                var jaReply = "大変申し訳ございません、当店はラーメン専門店ですので、ラーメンのメニューからお選びいただけますでしょうか？";
                return new AiTurnResult
                {
                    JapaneseReply = jaReply,
                    FuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(jaReply),
                    VietnameseMeaning = $"Thành thật xin lỗi {reg.AiAddressLearner}, quán chúng tôi là tiệm chuyên mì ramen, {reg.AiAddressLearner} vui lòng chọn món trong thực đơn mì ramen nhé ạ?",
                    UserVietnameseMeaning = userMessage,
                    UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userMessage),
                    CompletedMissionIds = new List<int>(),
                    IsNaturallyConcluded = false,
                    LinguisticFeedback = new LinguisticFeedbackDto
                    {
                        Status = "Warning",
                        Summary = "Món ăn không có trong thực đơn quán ramen",
                        EvaluationSource = "Guardrail",
                        Details = new List<LinguisticDetailItemDto>
                        {
                            new()
                            {
                                Type = "warning",
                                Aspect = "Ngữ cảnh giao tiếp",
                                Comment = "Bạn đang gọi món không thuộc thực đơn của quán mì ramen. Hãy gọi các món ramen hoặc món ăn kèm đặc trưng của quán."
                            }
                        },
                        NaturalAlternative = "豚骨ラーメンをお願いします。",
                        CulturalTip = "Các quán ăn Nhật Bản thường có tính chuyên môn hóa rất cao theo từng dòng ẩm thực (Ramen-ya, Soba-ya, Sushi-ya...)."
                    }
                };
            }
            if (isStationScenario && Regex.IsMatch(userMessage, @"(ラーメン|ピザ|ハンバーガー|パスタ|寿司|すし|定食|コーヒー)"))
            {
                var jaReply = "大変申し訳ございません、こちらは駅の窓口でございますので、切符のご購入や運行案内に関するご用件をお願いできますでしょうか？";
                return new AiTurnResult
                {
                    JapaneseReply = jaReply,
                    FuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(jaReply),
                    VietnameseMeaning = $"Thành thật xin lỗi {reg.AiAddressLearner}, đây là quầy dịch vụ nhà ga, {reg.AiSelf} chỉ hỗ trợ mua vé và thông tin chuyến tàu thôi ạ.",
                    UserVietnameseMeaning = userMessage,
                    UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userMessage),
                    CompletedMissionIds = new List<int>(),
                    IsNaturallyConcluded = false,
                    LinguisticFeedback = new LinguisticFeedbackDto
                    {
                        Status = "Warning",
                        Summary = "Yêu cầu không phù hợp với quầy vé nhà ga",
                        EvaluationSource = "Guardrail",
                        Details = new List<LinguisticDetailItemDto>
                        {
                            new()
                            {
                                Type = "warning",
                                Aspect = "Ngữ cảnh giao tiếp",
                                Comment = "Bạn đang gọi đồ ăn/uống tại quầy vé nhà ga. Hãy hỏi về tuyến tàu, điểm đến hoặc mua vé."
                            }
                        },
                        NaturalAlternative = "新宿駅までの切符を一枚お願いします。",
                        CulturalTip = "Tại các nhà ga Nhật Bản, nhân viên quầy Midori-no-Madoguchi chuyên phục vụ vé tàu và hướng dẫn lịch trình di chuyển."
                    }
                };
            }
            if (isInterviewScenario && Regex.IsMatch(userMessage, @"(ラーメン|ピザ|ハンバーガー|パスタ|寿司|すし|切符)"))
            {
                var jaReply = "恐れ入ります、こちらは採用面接の場でございますので、ご質問に対するお答えや自己PRをお願いできますでしょうか？";
                return new AiTurnResult
                {
                    JapaneseReply = jaReply,
                    FuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(jaReply),
                    VietnameseMeaning = $"Xin lỗi {reg.AiAddressLearner}, đây là buổi phỏng vấn tuyển dụng, {reg.AiAddressLearner} vui lòng trả lời câu hỏi phỏng vấn nhé ạ?",
                    UserVietnameseMeaning = userMessage,
                    UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userMessage),
                    CompletedMissionIds = new List<int>(),
                    IsNaturallyConcluded = false,
                    LinguisticFeedback = new LinguisticFeedbackDto
                    {
                        Status = "Warning",
                        Summary = "Nội dung không thuộc phạm vi phỏng vấn tuyển dụng",
                        EvaluationSource = "Guardrail",
                        Details = new List<LinguisticDetailItemDto>
                        {
                            new()
                            {
                                Type = "warning",
                                Aspect = "Ngữ cảnh giao tiếp",
                                Comment = "Vui lòng tập trung vào các câu hỏi phỏng vấn xin việc (lý do ứng tuyển, kinh nghiệm, điểm mạnh)."
                            }
                        },
                        NaturalAlternative = "私の長所についてお話しいたします。",
                        CulturalTip = "Trong buổi phỏng vấn ở Nhật, tính tập trung và thái độ nghiêm túc đối với các câu hỏi là yếu tố quyết định."
                    }
                };
            }
            if (isCafeScenario && Regex.IsMatch(userMessage, @"(ラーメン|寿司|すし|切符|定食|餃子|ギョーザ)"))
            {
                var jaReply = "大変申し訳ございません、当店はカフェでございますので、お飲み物や軽食のメニューからお選びいただけますでしょうか？";
                return new AiTurnResult
                {
                    JapaneseReply = jaReply,
                    FuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(jaReply),
                    VietnameseMeaning = $"Thành thật xin lỗi {reg.AiAddressLearner}, quán chúng tôi là quán cà phê, {reg.AiAddressLearner} vui lòng chọn các món trong thực đơn đồ uống hoặc bánh ngọt nhé ạ?",
                    UserVietnameseMeaning = userMessage,
                    UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userMessage),
                    CompletedMissionIds = new List<int>(),
                    IsNaturallyConcluded = false,
                    LinguisticFeedback = new LinguisticFeedbackDto
                    {
                        Status = "Warning",
                        Summary = "Món ăn không có trong thực đơn quán cà phê",
                        EvaluationSource = "Guardrail",
                        Details = new List<LinguisticDetailItemDto>
                        {
                            new()
                            {
                                Type = "warning",
                                Aspect = "Ngữ cảnh giao tiếp",
                                Comment = "Bạn đang gọi món ăn mặn/không thuộc thực đơn quán cà phê. Hãy gọi các loại cà phê, trà hoặc bánh ngọt phù hợp."
                            }
                        },
                        NaturalAlternative = "アイスコーヒーをお願いします。",
                        CulturalTip = "Tại các quán cà phê Nhật Bản, thực đơn chủ yếu là đồ uống, bánh ngọt hoặc sandwich nhẹ."
                    }
                };
            }
            if (isMedicalScenario && Regex.IsMatch(userMessage, @"(ラーメン|ピザ|ハンバーガー|パスタ|寿司|すし|切符|ビール|コーヒー)"))
            {
                var jaReply = "大変恐れ入ります、こちらは医療機関でございますので、症状や体調についてお聞かせいただけますでしょうか？";
                return new AiTurnResult
                {
                    JapaneseReply = jaReply,
                    FuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(jaReply),
                    VietnameseMeaning = $"Thành thật xin lỗi {reg.AiAddressLearner}, đây là cơ sở y tế khám chữa bệnh, {reg.AiAddressLearner} vui lòng cho biết triệu chứng hoặc tình trạng sức khỏe nhé ạ?",
                    UserVietnameseMeaning = userMessage,
                    UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userMessage),
                    CompletedMissionIds = new List<int>(),
                    IsNaturallyConcluded = false,
                    LinguisticFeedback = new LinguisticFeedbackDto
                    {
                        Status = "Warning",
                        Summary = "Nội dung không phù hợp với cơ sở y tế",
                        EvaluationSource = "Guardrail",
                        Details = new List<LinguisticDetailItemDto>
                        {
                            new()
                            {
                                Type = "warning",
                                Aspect = "Ngữ cảnh giao tiếp",
                                Comment = "Đây là tình huống tại phòng khám/bệnh viện. Hãy mô tả triệu chứng sức khỏe hoặc yêu cầu khám bệnh."
                            }
                        },
                        NaturalAlternative = "頭が痛いので、診察をお願いします。",
                        CulturalTip = "Khi đến bệnh viện hoặc phòng khám ở Nhật Bản, bước đầu tiên tại quầy tiếp tân là xuất trình thẻ bảo hiểm và nêu rõ lý do khám."
                    }
                };
            }

            // 4. Ambiguous Demonstrative or Counter Guard (ひとつお願いします - thích ứng theo tình huống)
            if (Regex.IsMatch(userMessage.Trim(), @"^(すみません[、,\s]*|あの[、,\s]*)?(これ|それ|あれ|ひとつ|1つ)(を)?(おねがい|お願い|ください)?(します)?[\.!?。！？\s]*$"))
            {
                string jaReply;
                string viReply;
                string summary;
                string naturalAlt;

                if (isStationScenario)
                {
                    jaReply = "恐れ入ります、どの切符をひとつ（一枚）ご希望でしょうか？行き先の駅名をお聞かせください。";
                    viReply = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiAddressLearner} muốn mua một vé đi đâu ạ? Xin cho {reg.AiSelf} biết ga đến nhé.";
                    summary = "Yêu cầu chưa cụ thể • Cần nói rõ ga đến";
                    naturalAlt = "新宿駅までの切符を一枚お願いします。";
                }
                else if (isInterviewScenario)
                {
                    jaReply = "恐れ入ります、どの質問についてお答えでしょうか？具体的にお聞かせください。";
                    viReply = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiAddressLearner} muốn trả lời về phần nào ạ? Xin cho {reg.AiSelf} biết cụ thể.";
                    summary = "Yêu cầu chưa cụ thể • Cần nói rõ nội dung";
                    naturalAlt = "自己紹介についてお話しいたします。";
                }
                else if (isKonbiniScenario)
                {
                    jaReply = "恐れ入ります、どの商品をおひとつご希望でしょうか？商品をお教えいただけますか？";
                    viReply = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiAddressLearner} muốn lấy sản phẩm nào ạ? Xin cho {reg.AiSelf} biết tên sản phẩm nhé.";
                    summary = "Yêu cầu chưa cụ thể • Cần nói rõ tên sản phẩm";
                    naturalAlt = "お弁当をひとつお願いします。";
                }
                else if (isCafeScenario)
                {
                    jaReply = "恐れ入ります、どのお飲み物をおひとつご希望でしょうか？メニュー名をお聞かせください。";
                    viReply = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiAddressLearner} muốn dùng đồ uống nào ạ? Xin cho {reg.AiSelf} biết tên món nhé.";
                    summary = "Yêu cầu chưa cụ thể • Cần nói rõ tên đồ uống";
                    naturalAlt = "アイスコーヒーをひとつお願いします。";
                }
                else if (isRamenScenario || scenarioContext.Contains("quán") || scenarioContext.Contains("nhà hàng") || scenarioContext.Contains("ẩm thực") || scenarioContext.Contains("ăn"))
                {
                    jaReply = "恐れ入ります、どの料理をひとつご希望でしょうか？メニュー名をお聞かせください。";
                    viReply = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiAddressLearner} muốn lấy 1 phần món ăn nào ạ? Xin cho {reg.AiSelf} biết tên món nhé.";
                    summary = "Yêu cầu chưa cụ thể • Cần nói rõ tên món";
                    naturalAlt = "豚骨ラーメンをひとつお願いします。";
                }
                else
                {
                    jaReply = "恐れ入ります、具体的にどちらをおひとつご希望でしょうか？詳しくお聞かせください。";
                    viReply = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiAddressLearner} muốn yêu cầu đối tượng hoặc nội dung nào ạ? Xin nói rõ giúp {reg.AiSelf} nhé.";
                    summary = "Yêu cầu chưa cụ thể • Cần nêu rõ đối tượng";
                    naturalAlt = "これをお願いします。";
                }

                return new AiTurnResult
                {
                    JapaneseReply = jaReply,
                    FuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(jaReply),
                    VietnameseMeaning = viReply,
                    UserVietnameseMeaning = userMessage,
                    UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userMessage),
                    CompletedMissionIds = new List<int>(),
                    IsNaturallyConcluded = false,
                    LinguisticFeedback = new LinguisticFeedbackDto
                    {
                        Status = "Warning",
                        Summary = summary,
                        EvaluationSource = "Guardrail",
                        Details = new List<LinguisticDetailItemDto>
                        {
                            new()
                            {
                                Type = "warning",
                                Aspect = "Độ rõ ràng của thông tin",
                                Comment = "Chỉ nói 'cho tôi một phần' mà không nêu tên cụ thể sẽ khiến đối phương không rõ bạn muốn yêu cầu điều gì."
                            }
                        },
                        NaturalAlternative = naturalAlt,
                        CulturalTip = "Trong giao tiếp tiếng Nhật, luôn nêu rõ đối tượng cần mua hoặc yêu cầu trước từ chỉ số lượng."
                    }
                };
            }

            // 5. Flow Discipline: Khi AI đang hỏi số người trong bối cảnh dùng bữa / quán ăn (何名様ですか？)
            bool isDiningScenario = isRamenScenario || isCafeScenario || scenarioContext.Contains("quán") || scenarioContext.Contains("nhà hàng") || scenarioContext.Contains("ẩm thực") || scenarioContext.Contains("ăn");
            if (isDiningScenario && isAskingPartySize && !hasPartySize)
            {
                // 5a. Khách hỏi tư vấn món hoặc hỏi menu (おすすめは何ですか？)
                if (Regex.IsMatch(userMessage, @"(おすすめ|何ですか|何がおすすめ|メニュー)"))
                {
                    string jaReply;
                    string viReply;
                    string naturalAlt;

                    if (isRamenScenario)
                    {
                        jaReply = "当店のおすすめは特製豚骨ラーメンでございます！ご案内いたしますので、まず何名様か教えていただけますでしょうか？";
                        viReply = $"Món đặc sắc của quán chúng tôi là mì Tonkotsu đặc biệt ạ! Để {reg.AiSelf} chuẩn bị xếp chỗ, xin quý khách cho biết quý khách đi mấy người ạ?";
                        naturalAlt = "1人です。おすすめのラーメンは何ですか？";
                    }
                    else if (isCafeScenario)
                    {
                        jaReply = "当店のおすすめはブレンドコーヒーでございます！ご案内いたしますので、まず何名様か教えていただけますでしょうか？";
                        viReply = $"Món đặc sắc của quán chúng tôi là cà phê Blend đặc biệt ạ! Để {reg.AiSelf} chuẩn bị xếp chỗ, xin quý khách cho biết quý khách đi mấy người ạ?";
                        naturalAlt = "1人です。おすすめのコーヒーは何ですか？";
                    }
                    else
                    {
                        jaReply = "当店のおすすめメニューをご案内いたしますので、まず何名様でのご利用か教えていただけますでしょうか？";
                        viReply = $"Quán chúng tôi rất hân hạnh tư vấn thực đơn cho {reg.AiAddressLearner}! Để {reg.AiSelf} chuẩn bị bàn, xin cho biết quý khách đi mấy người ạ?";
                        naturalAlt = "1人です。おすすめは何ですか？";
                    }

                    return new AiTurnResult
                    {
                        JapaneseReply = jaReply,
                        FuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(jaReply),
                        VietnameseMeaning = viReply,
                        UserVietnameseMeaning = userMessage,
                        UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userMessage),
                        CompletedMissionIds = new List<int>(),
                        IsNaturallyConcluded = false,
                        LinguisticFeedback = new LinguisticFeedbackDto
                        {
                            Status = "Warning",
                            Summary = "Cần thông báo số lượng người trước khi hỏi món",
                            EvaluationSource = "Guardrail",
                            Details = new List<LinguisticDetailItemDto>
                            {
                                new()
                                {
                                    Type = "warning",
                                    Aspect = "Quy trình giao tiếp",
                                    Comment = "Nhân viên đang hỏi số người để sắp xếp bàn ghế. Hãy trả lời số người trước (ví dụ 1人です) rồi mới hỏi tư vấn món ăn."
                                }
                            },
                            NaturalAlternative = naturalAlt,
                            CulturalTip = "Tại các quán ăn Nhật Bản, thông báo số người đi cùng là bước tiên quyết trước khi nhân viên dẫn vào bàn."
                        }
                    };
                }

                // 5b. Khách trả lời thụ động (はい / そうです)
                if (Regex.IsMatch(userMessage.Trim(), @"^(はい|ええ|そうです|うん)[\.!?。！？]*$"))
                {
                    var jaReply = "恐れ入ります、お席をご案内いたしますので、何名様でのご利用か教えていただけますでしょうか？";
                    return new AiTurnResult
                    {
                        JapaneseReply = jaReply,
                        FuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(jaReply),
                        VietnameseMeaning = $"Dạ xin lỗi {reg.AiAddressLearner}, để xếp chỗ thì {reg.AiAddressLearner} vui lòng cho biết đi mấy người ạ?",
                        UserVietnameseMeaning = userMessage,
                        UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userMessage),
                        CompletedMissionIds = new List<int>(),
                        IsNaturallyConcluded = false,
                        LinguisticFeedback = new LinguisticFeedbackDto
                        {
                            Status = "Warning",
                            Summary = "Cần đưa ra lựa chọn cụ thể thay vì chỉ nói đồng ý",
                            EvaluationSource = "Guardrail",
                            Details = new List<LinguisticDetailItemDto>
                            {
                                new()
                                {
                                    Type = "warning",
                                    Aspect = "Hội thoại tương tác",
                                    Comment = "Khi đối phương hỏi câu hỏi số lượng hoặc lựa chọn, không thể trả lời bằng 'Có' (はい) mà cần nêu rõ con số cụ thể."
                                }
                            },
                            NaturalAlternative = "1人です。",
                            CulturalTip = "Hãy dùng các từ đếm người cơ bản: 1人 (ひとり), 2人 (ふたり), 3人 (さんにん)."
                        }
                    };
                }
            }

            // 6. Vague Ramen Order Guard: Khi nhiệm vụ yêu cầu khẩu vị cụ thể (濃いめ/đậm đà) mà khách chỉ gọi chung chung
            bool targetRequiresFlavor = pendingMissions.Any(m => (m.CompletionCriteriaJson + " " + m.Content).Contains("濃いめ") || (m.CompletionCriteriaJson + " " + m.Content).Contains("đậm đà") || (m.CompletionCriteriaJson + " " + m.Content).Contains("vị đậm"));
            bool userSpecifiedFlavor = Regex.IsMatch(userMessage, @"(濃いめ|こいめ|薄め|うすめ|普通|ふつう|辛め|からめ)");
            if (targetRequiresFlavor && !userSpecifiedFlavor && Regex.IsMatch(userMessage, @"(ラーメン|らーめん)"))
            {
                var jaReply = "かしこまりました。ラーメンのお味はいかがなさいますか？味の濃さや麺の硬さをお選びいただけます。";
                return new AiTurnResult
                {
                    JapaneseReply = jaReply,
                    FuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(jaReply),
                    VietnameseMeaning = $"{reg.AiSelf} đã rõ. Khẩu vị mì của {reg.AiAddressLearner} thế nào ạ? {reg.AiAddressLearner} có thể chọn độ đậm nhạt của nước dùng và độ cứng của sợi mì ạ.",
                    UserVietnameseMeaning = userMessage,
                    UserFuriganaHtml = RoleplaySocialRegister.GenerateFuriganaHtml(userMessage),
                    CompletedMissionIds = new List<int>(),
                    IsNaturallyConcluded = false,
                    LinguisticFeedback = new LinguisticFeedbackDto
                    {
                        Status = "Warning",
                        Summary = "Yêu cầu chưa rõ khẩu vị đặc trưng của nhiệm vụ",
                        EvaluationSource = "Guardrail",
                        Details = new List<LinguisticDetailItemDto>
                        {
                            new()
                            {
                                Type = "warning",
                                Aspect = "Yêu cầu kịch bản",
                                Comment = "Nhiệm vụ yêu cầu bạn chỉ định rõ khẩu vị đậm đà (濃いめ). Bạn mới chỉ gọi mì ramen chung chung."
                            }
                        },
                        NaturalAlternative = "豚骨ラーメン、味濃いめでお願いします。",
                        CulturalTip = "Tại các quán mì Tonkotsu hoặc Iekei Ramen, khách hàng thường được tự do tùy biến: Độ đậm (味の濃さ), Lượng mỡ (油の量), Độ cứng mì (麺の硬さ)."
                    }
                };
            }


            var systemPrompt = BuildSystemInstruction(scenario, levelConfig);
            if (!string.IsNullOrWhiteSpace(personaDirective))
            {
                systemPrompt += $"\n\n[NPC MEMORY DIRECTIVE]\n{personaDirective}\nMaintain continuity with these prior facts subtly and naturally.";
            }

            var sbHistory = new StringBuilder();
            foreach (var msg in conversationHistory.TakeLast(10))
            {
                sbHistory.AppendLine($"[{msg.Sender}]: {msg.JapaneseText}");
            }

            var missionsDescription = new StringBuilder();
            foreach (var m in pendingMissions)
            {
                missionsDescription.AppendLine($"- Mission ID {m.Id}: {m.Content}. Tiêu chí hoàn thành (JSON): {m.CompletionCriteriaJson}");
            }

            var userPrompt = $@"RECENT CONVERSATION HISTORY:
{sbHistory}

LEARNER'S LATEST UTTERANCE:
""{userMessage}""

PENDING MISSIONS:
{missionsDescription}

TASK INSTRUCTIONS:
1. FOREIGN / MIXED LANGUAGE CHECK (CRITICAL FIRST STEP):
   - Check if the learner's message contains Vietnamese (accented or unaccented like 'toi', 'muon', 'cho', 'bat', 'minh', 'em', 'anh', 'la', 'xin', etc.) or English/foreign text.
   - If ANY foreign words or non-Japanese sentences are detected:
     * Even if they mentioned a dish or keyword (e.g. 'tonkotsu ramen', 'ramen'), you CANNOT understand them and CANNOT guess their intent. Treat the entire message as completely unintelligible foreign sounds.
     * replyJapanese: You MUST NOT guess or echo the item. DO NOT say 'かしこまりました', DO NOT say '...ですね' or '...ですか' (e.g., NEVER say 'とんこつラーメンですね' or ask 'とんこつラーメンですか'). ONLY express polite native Japanese incomprehension and ask for Japanese: '恐れ入りますが、日本語が分かりませんので、日本語でお話しいただけますでしょうか。'
     * replyVietnamese: 'Xin lỗi, tôi không hiểu tiếng nước ngoài. Bạn có thể nói bằng tiếng Nhật được không ạ?'
     * completedMissionIds: MUST BE STRICTLY EMPTY [] (no missions completed).
     * linguisticFeedback: status MUST BE 'Error', summary: 'Vui lòng sử dụng tiếng Nhật', details: explain that the learner must speak in Japanese. In naturalAlternative, show how to say their intended request in natural Japanese.
2. STRICT ANTI-REPETITION & CONVERSATIONAL MOMENTUM (PREVENTS REPETITIVE LOOPS):
   - CAREFULLY inspect RECENT CONVERSATION HISTORY. NEVER repeat the same question, confirmation, or prompt that was already asked or answered in the last 2-3 turns.
   - For example: If you already inquired about cash payment ('お会計は現金のみとなりますが、よろしいでしょうか') and the learner replied ('はい', 'いいえ', 'OK です', or agreed/refused), YOU MUST NEVER ASK THAT QUESTION AGAIN.
   - Acknowledge their response and ADVANCE THE SCENE:
     * If they agreed to cash payment: state the total bill ('ありがとうございます！合計で〇〇円になります'), accept their money/provide change, and transition toward concluding the transaction.
     * If there are still pending missions (e.g. learner needs to inquire about payment methods / card): DO NOT loop the cash question! Instead, provide a natural conversational bridge, such as: 'お支払いは現金のみとなっておりますが、カードなど他の決済方法をご希望でしたでしょうか？'
    - REPEATED COMPLETED MISSIONS BY LEARNER:
      * If the learner repeats a request/statement for an already satisfied mission (e.g. they already ordered ramen or greeted in a prior turn, and now repeat it):
      * DO NOT re-add that mission to completedMissionIds.
      * DO NOT be confused or loop. Politely acknowledge that you already noted their previous order/statement ('先ほどのご注文ですね、承知しておりますよ' or 'はい、かしこまりました'), and steer them forward toward remaining pending missions.
    - AMBIGUOUS OR DEVIATING UTTERANCES (CONFIRMATION BEFORE TICKING):
      * If the learner speaks an ambiguous fragment, unclear request, or slightly off-topic intent (e.g. saying just '甘さ' without specifying level, or an incomplete preference):
      * In replyJapanese, ask for clarification/confirmation: '〜ということでよろしいでしょうか？' or '〜をご希望でしょうか？'
      * DO NOT mark the mission completed in completedMissionIds until the learner clearly confirms in a subsequent turn.
3. NORMAL JAPANESE EVALUATION & REFINED LINGUISTIC FEEDBACK:
   - replyJapanese: Natural Japanese response matching your persona and JLPT {levelConfig.JLPTLevel}. PURE JAPANESE ONLY (STRICTLY NO VIETNAMESE WORDS, ENGLISH, OR TRANSLATIONS INSIDE replyJapanese).
   - replyFuriganaHtml: HTML ruby tag markup for replyJapanese for reading assistance (e.g., '<ruby>豚骨<rt>とんこつ</rt></ruby>ラーメン<ruby>一杯<rt>いっぱい</rt></ruby>ですね。'). All kanji characters MUST have accurate hiragana readings in <ruby><rt> tags. Kana-only characters remain plain text. PURE JAPANESE RUBY ONLY.
   - replyVietnamese: Natural translation in Vietnamese strictly adhering to the social register: use '{reg.AiSelf}' and address learner as '{reg.AiAddressLearner}'. ABSOLUTELY ZERO SLASHES ('/').
   - userVietnameseMeaning: Accurate Vietnamese translation of what the learner said in Japanese, strictly phrased from the learner's perspective ('{reg.LearnerSelf}' addressing '{reg.LearnerAddressAi}'). ABSOLUTELY ZERO SLASHES ('/').
   - completedMissionIds: Array of Mission IDs satisfied in the current turn. Follow STRICT rules:
     * Intent Verification: The learner's utterance MUST actively and clearly express the specific intent and conditions specified in the mission's Content and CompletionCriteriaJson.
     * NEVER mark a mission complete if the learner only provides generic filler words, passive agreement ('はい', 'そうです', 'わかりました', 'ええと'), or unrelated statements.
     * Sequential Flow: Missions are ordered by conversation flow. NEVER mark the final departure/closing mission completed if earlier transactional/core missions are still unfulfilled.
     * Concurrency: Typically at most ONE mission should be completed per turn, unless the learner explicitly combines multiple distinct intents in one compound sentence. Return [] if none.
   - isNaturallyConcluded: Boolean (true ONLY IF all scenario missions are accomplished and the learner and AI exchanged closing/departure greetings).
   - linguisticFeedback: Rigorous, realistic linguistic evaluation in Vietnamese (NO HOLLOW FLATTERY, STRICT PEDAGOGICAL ACCURACY):
     * status: ""Good"" | ""Warning"" | ""Error""
     * summary: Short Vietnamese summary (e.g. ""Rất tốt • Đúng ngữ cảnh"", hoặc ""Cần diễn đạt câu hoàn chỉnh"")
     * details: Array of items:
       - type: ""success"" | ""warning"" | ""error""
       - aspect: Aspect in Vietnamese (""Ngữ pháp"" | ""Từ vựng"" | ""Văn phong"" | ""Kính ngữ"" | ""Cấu trúc"" | ""Trợ từ"")
       - comment: Specific constructive feedback in Vietnamese
       - ANTI-FLATTERY RULE FOR SHORT UTTERANCES:
         * If the learner only said a bare minimal affirmative/negative word ('はい', 'いいえ', 'そうです'):
           status should be 'Good' or 'Warning'.
           DO NOT fabricate exaggerated praise like 'Sử dụng từ はい rất lịch sự'.
           Instead, comment: 'Đã biểu đạt đúng ý muốn, nhưng trong giao tiếp thực tế nên mở rộng thành câu hoàn chỉnh như はい、お願いします hoặc いいえ、結構です để tự nhiên hơn.'
       - BARE NOUNS / INCOMPLETE FRAGMENTS RULE (STRICT):
         * If the learner only said an isolated bare noun, noun phrase, or non-sentence without predicate or copula (e.g. '甘さ', 'ラーメン', '水', 'これ', 'ホット', 'クレープ'):
           status MUST BE 'Warning' (NEVER 'Good'!).
           summary: 'Chưa thành câu hoàn chỉnh • Cần thêm vị ngữ hoặc đuôi câu lịch sự'
           Mark aspect 'Văn phong' or 'Cấu trúc', type 'warning'.
           Explain: 'Chỉ nói một từ hoặc danh từ đơn lẻ sẽ cộc lốc trong giao tiếp tiếng Nhật. Cần diễn đạt trọn vẹn thành câu với vị ngữ hoặc đuôi câu lịch sự.'
           DO NOT praise bare words as 'lịch sự chu đáo', 'chuẩn mực', or 'cấu trúc câu gãy gọn'!
           naturalAlternative MUST NOT be the same bare noun! It MUST be a complete polite sentence (e.g. for '甘さ' -> '甘さ控えめにできますか？' or '甘さは普通でお願いします。'; for 'ラーメン' -> 'ラーメンをお願いします。').
       - ACCURATE DETECTION OF COMMON LEARNER MISTAKES:
         * Bare Nouns when ordering (e.g. '卵です', '水です'): Mark aspect 'Văn phong', type 'warning'. Explain: 'Khi gọi món tại quán ăn Nhật Bản, chỉ nói tên món kèm です bị cộc lốc. Nên nói 味玉をお願いします hoặc 味玉を追加してください.'
         * Missing Verb/Predicates (e.g. '〜を注文', '〜を追加'): Mark aspect 'Cấu trúc', type 'warning'. Explain: 'Thiếu vị ngữ hoàn chỉnh. Cần nói 〜を注文します hoặc 〜をお願いします.'
         * Potential Form Confusion (e.g. '使うことですか'): Mark aspect 'Ngữ pháp', type 'warning'. Explain: 'Hỏi về khả năng/chấp nhận thanh toán cần dùng thể khả năng 使えますか, không ghép động từ nguyên mẫu với ことですか.'
         * Slang / Loanword in Service context (e.g. 'OK です'): Mark aspect 'Văn phong', type 'warning'. Explain: 'Trong môi trường dịch vụ Nhật Bản, tránh dùng OK. Nên nói 大丈夫です hoặc かしこまりました.'
       - TARGET VOCABULARY & GRAMMAR REINFORCEMENT:
         * When learner successfully uses scenario target words (e.g. 味玉, 固め) or target grammar, record a type 'success' explicitly praising that target usage.
         * If learner used a simpler general word instead of the scenario target (e.g. saying 卵 instead of 味玉), suggest the target word in naturalAlternative.
       - ONLY mark type 'success' when the learner genuinely uses correct sentence structures, appropriate politeness, or scenario target vocabulary.
     * naturalAlternative: More natural native phrasing in Japanese (incorporating scenario target words if applicable)
     * culturalTip: Relevant practical cultural tip in Vietnamese

Return strictly pure JSON matching this schema:
{{
  ""userVietnameseMeaning"": ""Vietnamese translation of what the learner just said in their utterance"",
  ""userFuriganaHtml"": ""HTML string with <ruby>kanji<rt>furigana</rt></ruby> tags for all kanji in the learner's Japanese utterance (or plain text if no kanji)"",
  ""replyJapanese"": ""..."",
  ""replyFuriganaHtml"": ""..."",
  ""replyVietnamese"": ""..."",
  ""completedMissionIds"": [],
  ""isNaturallyConcluded"": false,
  ""linguisticFeedback"": {{
    ""status"": ""Good"",
    ""summary"": ""..."",
    ""details"": [
      {{ ""type"": ""success"", ""aspect"": ""Ngữ cảnh"", ""comment"": ""..."" }}
    ],
    ""naturalAlternative"": ""..."",
    ""culturalTip"": ""...""
  }}
}}";

            var request = AiRequest.CreateJson(systemPrompt, userPrompt);
            var response = await _aiClient.GenerateAsync(request, cancellationToken);

            if (response.IsSuccess && !string.IsNullOrWhiteSpace(response.Content))
            {
                using var doc = JsonDocument.Parse(response.Content);
                var root = doc.RootElement;
                var userVi = root.TryGetProperty("userVietnameseMeaning", out var uviProp) ? uviProp.GetString() ?? "" : "";
                var userFHtml = root.TryGetProperty("userFuriganaHtml", out var ufProp) ? ufProp.GetString() : null;
                var ja = root.TryGetProperty("replyJapanese", out var jaProp) ? jaProp.GetString() ?? "" : "";
                var fHtml = root.TryGetProperty("replyFuriganaHtml", out var fProp) ? fProp.GetString() : null;
                var vi = root.TryGetProperty("replyVietnamese", out var viProp) ? viProp.GetString() ?? "" : "";
                var isConcluded = root.TryGetProperty("isNaturallyConcluded", out var concProp) && concProp.GetBoolean();

                var completedIds = new List<int>();
                if (root.TryGetProperty("completedMissionIds", out var idsProp) && idsProp.ValueKind == JsonValueKind.Array)
                {
                    foreach (var elem in idsProp.EnumerateArray())
                    {
                        int? parsedId = null;
                        if (elem.ValueKind == JsonValueKind.Number && elem.TryGetInt32(out var n)) parsedId = n;
                        else if (elem.ValueKind == JsonValueKind.String && int.TryParse(elem.GetString(), out var s)) parsedId = s;

                        if (parsedId.HasValue)
                        {
                            var matched = pendingMissions.FirstOrDefault(m => m.Id == parsedId.Value || m.Order == parsedId.Value);
                            if (matched != null && !completedIds.Contains(matched.Id))
                            {
                                completedIds.Add(matched.Id);
                            }
                        }
                    }
                }

                // Cân bằng sư phạm: Nếu câu của học viên biểu đạt rõ ràng mục tiêu nhiệm vụ (không lỗi ngoại ngữ)
                // đảm bảo nhiệm vụ được tick chính xác, không bị phụ thuộc vào việc LLM trả về ID hay Order
                if (completedIds.Count == 0 && !IsLikelyForeignOrVietnamese(userMessage) && pendingMissions.Count > 0)
                {
                    var currentMission = pendingMissions.OrderBy(m => m.Order).FirstOrDefault();
                    if (currentMission != null)
                    {
                        var crit = (currentMission.CompletionCriteriaJson ?? "").ToLowerInvariant();
                        var content = (currentMission.Content ?? "").ToLowerInvariant();
                        var cleanUserMsg = userMessage.Trim();

                        bool matchesIntent = false;
                        if ((crit.Contains("soy milk") || content.Contains("sữa thực vật") || crit.Contains("sweetness") || content.Contains("độ ngọt")) &&
                            (cleanUserMsg.Contains("豆乳") || cleanUserMsg.Contains("甘さ控えめ") || cleanUserMsg.Contains("甘さは") || cleanUserMsg.Contains("ソイミルク")))
                        {
                            matchesIntent = true;
                        }
                        else if ((crit.Contains("recommend") || content.Contains("tư vấn") || content.Contains("bánh ngọt")) &&
                                 (cleanUserMsg.Contains("おすすめ") || cleanUserMsg.Contains("クレープ") || cleanUserMsg.Contains("スイーツ")))
                        {
                            matchesIntent = true;
                        }
                        else if ((crit.Contains("order") || content.Contains("chọn") || content.Contains("ăn kèm")) &&
                                 (cleanUserMsg.Contains("ください") || cleanUserMsg.Contains("お願いします") || cleanUserMsg.Contains("にします")))
                        {
                            matchesIntent = true;
                        }
                        else if ((crit.Contains("topping") || crit.Contains("egg") || crit.Contains("ajitama") || content.Contains("topping") || content.Contains("trứng") || content.Contains("味玉")) &&
                                 (cleanUserMsg.Contains("味玉") || cleanUserMsg.Contains("たまご") || cleanUserMsg.Contains("トッピング") || cleanUserMsg.Contains("卵")) &&
                                 (cleanUserMsg.Contains("追加") || cleanUserMsg.Contains("購入") || cleanUserMsg.Contains("お願いします") || cleanUserMsg.Contains("ください") || cleanUserMsg.Contains("もらえますか") || cleanUserMsg.Contains("つけて")))
                        {
                            matchesIntent = true;
                        }
                        else if ((crit.Contains("card") || crit.Contains("payment") || content.Contains("thanh toán") || content.Contains("thẻ")) &&
                                 (cleanUserMsg.Contains("カード") || cleanUserMsg.Contains("電子マネー") || cleanUserMsg.Contains("クレカ") || cleanUserMsg.Contains("支払") || cleanUserMsg.Contains("会計")) &&
                                 (cleanUserMsg.Contains("使え") || cleanUserMsg.Contains("でき") || cleanUserMsg.Contains("いいですか") || cleanUserMsg.Contains("ですか") || cleanUserMsg.Contains("払え")))
                        {
                            matchesIntent = true;
                        }

                        if (matchesIntent)
                        {
                            completedIds.Add(currentMission.Id);
                        }
                    }
                }

                LinguisticFeedbackDto? feedback = null;
                if (root.TryGetProperty("linguisticFeedback", out var fbProp) && fbProp.ValueKind == JsonValueKind.Object)
                {
                    try
                    {
                        feedback = JsonSerializer.Deserialize<LinguisticFeedbackDto>(fbProp.GetRawText(), JsonOptions);
                    }
                    catch
                    {
                        // Fallback nếu parse feedback bị lỗi
                    }
                }

                var isForeignLanguage = IsLikelyForeignOrVietnamese(userMessage);
                if (isForeignLanguage)
                {
                    // Strict programmatic enforcement: clear completed missions
                    completedIds.Clear();

                    // If AI leaked a confirmation or echoed the item, sanitize to polite confusion
                    if (ja.Contains("かしこまりました") || ja.Contains("承知") || ja.Contains("ですね") || ja.Contains("ですか") || !ja.Contains("日本語"))
                    {
                        ja = "恐れ入りますが、日本語が分かりませんので、日本語でお話しいただけますでしょうか。";
                        vi = "Xin lỗi, tôi không hiểu tiếng nước ngoài. Bạn có thể nói bằng tiếng Nhật được không ạ?";
                    }

                    // Enforce Error status in feedback
                    if (feedback == null)
                    {
                        feedback = new LinguisticFeedbackDto
                        {
                            Status = "Error",
                            Summary = "Vui lòng sử dụng tiếng Nhật",
                            Details = new List<LinguisticDetailItemDto>
                            {
                                new() { Type = "error", Aspect = "Ngôn ngữ", Comment = "Hệ thống chỉ hỗ trợ luyện tập bằng tiếng Nhật. Vui lòng không sử dụng tiếng Việt hoặc ngôn ngữ khác." }
                            },
                            CulturalTip = "Tại các cửa hàng hoặc môi trường làm việc ở Nhật Bản, giao tiếp bằng tiếng Nhật là yêu cầu cơ bản."
                        };
                    }
                    else
                    {
                        feedback.Status = "Error";
                        if (string.IsNullOrWhiteSpace(feedback.Summary) || feedback.Summary.Contains("tốt", StringComparison.OrdinalIgnoreCase))
                        {
                            feedback.Summary = "Vui lòng sử dụng tiếng Nhật";
                        }
                    }
                }

                // Programmatic anti-flattery guard: Detect bare single nouns and non-sentences (e.g. "甘さ", "ラーメン", "これ", "ホットコーヒー")
                if (!isForeignLanguage && feedback != null)
                {
                    var trimmedUserMsg = userMessage.Trim();
                    var cleanUserMsg = Regex.Replace(trimmedUserMsg, @"[\s\.,?!。、？！]", "");
                    var hasPoliteEnding = Regex.IsMatch(trimmedUserMsg, @"(です|ます|でした|ました|ません|ください|おねがい|お願い|いただけ|でしょうか|ですか|たいです|ましょう|頼み|頼む)");
                    var isBareFragment = cleanUserMsg.Length <= 12 && !hasPoliteEnding && !Regex.IsMatch(cleanUserMsg, @"^(はい|いいえ|ええ|うん|ううん|こんにちは|ありがとう|すみません)$");

                    if (isBareFragment)
                    {
                        if (string.Equals(feedback.Status, "Good", StringComparison.OrdinalIgnoreCase))
                        {
                            feedback.Status = "Warning";
                        }
                        if (string.IsNullOrWhiteSpace(feedback.Summary) || feedback.Summary.Contains("tự nhiên", StringComparison.OrdinalIgnoreCase) || feedback.Summary.Contains("chuẩn", StringComparison.OrdinalIgnoreCase) || feedback.Summary.Contains("tốt", StringComparison.OrdinalIgnoreCase))
                        {
                            feedback.Summary = "Chưa thành câu hoàn chỉnh • Cần thêm vị ngữ hoặc đuôi câu lịch sự";
                        }

                        if (feedback.Details != null)
                        {
                            foreach (var item in feedback.Details)
                            {
                                if (item.Comment != null && (item.Comment.Contains("chuẩn mực") || item.Comment.Contains("gãy gọn") || item.Comment.Contains("chu đáo") || item.Comment.Contains("rất tự nhiên") || item.Comment.Contains("lễ phép")))
                                {
                                    item.Type = "warning";
                                    item.Aspect = "Văn phong";
                                    item.Comment = "Từ vựng đúng ngữ cảnh nhưng chỉ nói từ đơn lẻ sẽ cộc lốc trong tiếng Nhật. Nên mở rộng thành câu hoàn chỉnh kèm vị ngữ hoặc đuôi câu lịch sự (〜をお願いします / 〜にできますか).";
                                }
                            }
                        }

                        if (string.IsNullOrWhiteSpace(feedback.NaturalAlternative) || feedback.NaturalAlternative.Trim() == trimmedUserMsg)
                        {
                            feedback.NaturalAlternative = $"{trimmedUserMsg}をお願いします。";
                        }
                    }
                    else if (!hasPoliteEnding && feedback.Details != null)
                    {
                        foreach (var item in feedback.Details)
                        {
                            if (item.Comment != null && (item.Comment.Contains("thể lịch sự") || item.Comment.Contains("chuẩn mực") || item.Comment.Contains("chu đáo và lễ phép")))
                            {
                                item.Type = "warning";
                                item.Aspect = "Văn phong";
                                item.Comment = "Câu thiếu thể lịch sự chuẩn mực (Desu/Masu/Kudasai). Trong giao tiếp thực tế nên thêm đuôi câu lịch sự.";
                            }
                        }
                    }
                }

                // === POST-LLM DETERMINISTIC SANITIZER & OVER-ACCOMMODATION PREVENTER ===
                // 1. Distorted word check: e.g. "つらめ"
                if (userMessage.Contains("つらめ"))
                {
                    completedIds.Clear();
                    ja = "恐れ入ります、「つらめ」でしょうか？辛め（からめ）または濃いめ（こいめ）のどちらをご希望でしょうか？";
                    fHtml = "恐れ入ります、「つらめ」でしょうか？<ruby>辛<rt>から</rt></ruby>めまたは<ruby>濃<rt>こ</rt></ruby>いめのどちらをご<ruby>希望<rt>きぼう</rt></ruby>でしょうか？";
                    vi = $"Xin lỗi {reg.AiAddressLearner}, ý {reg.AiAddressLearner} là vị cay (karame) hay vị đậm đà (koime) ạ?";
                    if (feedback != null)
                    {
                        feedback.Status = "Warning";
                        feedback.Summary = "Từ vựng biến dạng • Cần làm rõ ý";
                        feedback.NaturalAlternative = "濃いめでお願いします。";
                    }
                }
                // 2. Premature ordering when asked party size
                else if (isDiningScenario && isAskingPartySize && !hasPartySize && Regex.IsMatch(userMessage, @"(ラーメン|Tonkotsu|とんこつ|チャーシュー|餃子|ギョーザ|ビール|ライス|コーヒー|ケーキ)"))
                {
                    completedIds.Clear();
                    ja = "ご注文ありがとうございます！先にお席へご案内いたしますので、まず何名様か教えていただけますでしょうか？";
                    fHtml = "ご<ruby>注文<rt>ちゅうもん</rt></ruby>ありがとうございます！<ruby>先<rt>さき</rt></ruby>にお<ruby>席<rt>せき</rt></ruby>へご<ruby>案内<rt>あんない</rt></ruby>いたしますので、まず<ruby>何名様<rt>なんめいさま</rt></ruby>か<ruby>教<rt>おし</rt></ruby>えていただけますでしょうか？";
                    vi = $"Cảm ơn {reg.AiAddressLearner}! Để {reg.AiSelf} chuẩn bị xếp bàn trước, xin cho biết quý khách đi mấy người ạ?";
                    if (feedback != null)
                    {
                        feedback.Status = "Warning";
                        feedback.Summary = "Cần thông báo số lượng người trước khi gọi món";
                        feedback.NaturalAlternative = "1人です。";
                    }
                }
                // 3. Rude language
                else if (Regex.IsMatch(userMessage, @"(お前|てめえ|持ってこい|しろよ|くれよ|出せよ|おい、)"))
                {
                    completedIds.Clear();
                    ja = "恐れ入りますが、もう少し丁寧な言葉遣いでお話しいただけますでしょうか？";
                    fHtml = "恐れ入りますが、もう少し<ruby>丁寧<rt>ていねい</rt></ruby>な<ruby>言葉遣<rt>ことばづか</rt></ruby>いでお<ruby>話<rt>はな</rt></ruby>しいただけますでしょうか？";
                    vi = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiAddressLearner} có thể dùng từ ngữ lịch sự hơn một chút được không ạ?";
                    if (feedback != null)
                    {
                        feedback.Status = "Warning";
                        feedback.Summary = "Văn phong chưa phù hợp • Cần dùng thể lịch sự (Desu/Masu)";
                        feedback.NaturalAlternative = "ラーメンをお願いします。";
                    }
                }
                // 4. Off-topic evasion: "猫", "アニメ" trong bối cảnh quán ăn
                else if (Regex.IsMatch(userMessage, @"(アニメと猫|猫が好き|アニメが好き)"))
                {
                    completedIds.Clear();
                    ja = "恐れ入ります、まずご注文をお伺いしてもよろしいでしょうか？";
                    fHtml = "恐れ入ります、まずご<ruby>注文<rt>ちゅうもん</rt></ruby>をお<ruby>伺<rt>うかが</rt></ruby>いしてもよろしいでしょうか？";
                    vi = $"Dạ xin lỗi {reg.AiAddressLearner}, {reg.AiSelf} xin phép được lắng nghe yêu cầu gọi món trước nhé ạ?";
                    if (feedback != null)
                    {
                        feedback.Status = "Warning";
                        feedback.Summary = "Lệch trọng tâm cuộc trò chuyện";
                        feedback.NaturalAlternative = "ラーメンをお願いします。";
                    }
                }
                // 5. Parroting AI prompt
                else if (!string.IsNullOrWhiteSpace(lastAiMsg) && userMessage.Trim().Contains(lastAiMsg.Trim()))
                {
                    completedIds.Clear();
                    ja = "恐れ入ります、私のご挨拶を繰り返していただいたようですが、ご注文をお伺いしてもよろしいでしょうか？";
                    fHtml = "恐れ入ります、<ruby>私<rt>わたし</rt></ruby>のご<ruby>挨拶<rt>あいさつ</rt></ruby>を<ruby>繰<rt>く</rt></ruby>り<ruby>返<rt>かえ</rt></ruby>していただいたようですが、ご<ruby>注文<rt>ちゅうもん</rt></ruby>をお<ruby>伺<rt>うかが</rt></ruby>いしてもよろしいでしょうか？";
                    vi = $"Dạ xin lỗi {reg.AiAddressLearner}, hình như {reg.AiAddressLearner} vừa lặp lại lời chào của {reg.AiSelf}. Xin cho biết yêu cầu của {reg.AiAddressLearner} ạ?";
                    if (feedback != null)
                    {
                        feedback.Status = "Warning";
                        feedback.Summary = "Lặp lại câu nói của nhân vật";
                        feedback.NaturalAlternative = "1人です。";
                    }
                }
                // 6. Gibberish / character noise (ví dụ: "あああああああああ")
                else if (Regex.IsMatch(userMessage, @"(.)\1{4,}"))
                {
                    completedIds.Clear();
                    ja = "恐れ入ります、少々聞き取りにくかったのですが、もう一度お話しいただけますでしょうか？";
                    fHtml = "恐れ入ります、<ruby>少々<rt>しょうしょう</rt></ruby><ruby>聞<rt>き</rt></ruby>き<ruby>取<rt>と</rt></ruby>りにくかったのですが、もう<ruby>一度<rt>いちど</rt></ruby>お<ruby>話<rt>はな</rt></ruby>しいただけますでしょうか？";
                    vi = $"Xin lỗi {reg.AiAddressLearner}, âm thanh hơi khó nghe một chút, {reg.AiAddressLearner} có thể nói lại được không ạ?";
                    if (feedback != null)
                    {
                        feedback.Status = "Warning";
                        feedback.Summary = "Nội dung chưa rõ ràng • Âm thanh lạ";
                        feedback.NaturalAlternative = "ラーメンをお願いします。";
                    }
                }
                // 7. Anti-Ego Keigo: "召し上がります"
                else if (Regex.IsMatch(userMessage, @"(私が召し上がり|私がご覧になり)"))
                {
                    completedIds.Clear();
                    ja = "恐れ入りますが、ご自身の動作には尊敬語ではなく謙譲語をお使いになるとより自然ですよ。";
                    fHtml = "恐れ入りますが、ご<ruby>自身<rt>じしん</rt></ruby>の<ruby>動作<rt>どうさ</rt></ruby>には<ruby>尊敬語<rt>そんけいご</rt></ruby>ではなく<ruby>謙譲語<rt>けんじょうご</rt></ruby>をお<ruby>使<rt>つか</rt></ruby>いになるとより<ruby>自然<rt>しぜん</rt></ruby>ですよ。";
                    vi = $"Xin lỗi {reg.AiAddressLearner}, khi nói về hành động của chính mình, dùng khiêm nhường ngữ sẽ chuẩn mực hơn là tôn kính ngữ ạ.";
                    if (feedback != null)
                    {
                        feedback.Status = "Warning";
                        feedback.Summary = "Nhầm lẫn Tôn kính ngữ (Sonkeigo) cho bản thân";
                        feedback.NaturalAlternative = "私がいただきます。";
                    }
                }
                // 8. Premature abrupt goodbye: "さようなら" khi pendingMissions còn
                else if (pendingMissions.Count > 0 && Regex.IsMatch(userMessage, @"(さようなら|バイバイ|帰る)"))
                {
                    completedIds.Clear();
                    isConcluded = false;
                    ja = "あれっ、もうお帰りですか？まだご注文の途中ですが、いかがなさいますか？";
                    fHtml = "あれっ、もうお<ruby>帰<rt>かえ</rt></ruby>りですか？まだご<ruby>注文<rt>ちゅうもん</rt></ruby>の<ruby>途中<rt>とちゅう</rt></ruby>ですが、いかがなさいますか？";
                    vi = $"Ơ, {reg.AiAddressLearner} về luôn rồi sao ạ? Vẫn đang trong lúc gọi món mà, {reg.AiAddressLearner} có muốn tiếp tục không ạ?";
                    if (feedback != null)
                    {
                        feedback.Status = "Warning";
                        feedback.Summary = "Kết thúc cuộc trò chuyện quá sớm";
                        feedback.NaturalAlternative = "まだ注文したいです。";
                    }
                }

                if (!string.IsNullOrWhiteSpace(ja))
                {
                    ja = RoleplaySocialRegister.SanitizeJapaneseReply(ja,
                        levelConfig.AiPersona.Contains("cụ") || scenario.Title.Contains("cụ")
                            ? "本当にありがとうね。気をつけて帰ってね。"
                            : "丁寧にご対応いただき、誠にありがとうございました。");

                    var resolvedReplyFurigana = !string.IsNullOrWhiteSpace(fHtml) && !RoleplaySocialRegister.HasVietnameseLeak(fHtml)
                        ? RoleplaySocialRegister.CleanFuriganaHtml(RoleplaySocialRegister.SanitizeJapaneseReply(fHtml))
                        : RoleplaySocialRegister.GenerateFuriganaHtml(ja.Trim());

                    var resolvedUserFurigana = (!string.IsNullOrWhiteSpace(userFHtml) && userFHtml.Contains("<ruby>"))
                        ? RoleplaySocialRegister.CleanFuriganaHtml(userFHtml.Trim())
                        : RoleplaySocialRegister.GenerateFuriganaHtml(userMessage);

                    return new AiTurnResult
                    {
                        JapaneseReply = ja.Trim(),
                        FuriganaHtml = resolvedReplyFurigana,
                        VietnameseMeaning = vi.Trim(),
                        UserVietnameseMeaning = !string.IsNullOrWhiteSpace(userVi) ? userVi.Trim() : null,
                        UserFuriganaHtml = resolvedUserFurigana,
                        CompletedMissionIds = completedIds,
                        IsNaturallyConcluded = isConcluded,
                        LinguisticFeedback = feedback
                    };
                }
            }
            else
            {
                _logger.LogWarning("Không thể xử lý lượt thoại từ AI Client ({Error}, Status: {StatusCode}). Sử dụng Simulator.", response.ErrorMessage, response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Lỗi khi gọi AI Client cho lượt đối thoại. Tự động chuyển sang Simulator.");
        }

        return ProcessSimulatorTurn(scenario, levelConfig, userMessage, pendingMissions);
    }

    public async Task<RoleplayHintDto> GenerateHintAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        List<RoleplayMessage> conversationHistory,
        List<Mission> pendingMissions,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var systemPrompt = $"You are a supportive Japanese language tutor in the JCAP platform assisting a JLPT {levelConfig.JLPTLevel} learner.";

            var nextMission = pendingMissions.OrderBy(m => m.Order).FirstOrDefault();
            var targetMissionText = nextMission != null
                ? $"Next mission to achieve: {nextMission.Content}"
                : "All missions completed; suggest a polite closing or confirmation.";

            var lastAiMessage = conversationHistory.LastOrDefault(m => m.Sender == "Ai")?.JapaneseText ?? "";

            var userPrompt = $@"CONTEXT:
- Scenario: {scenario.Title} ({levelConfig.JLPTLevel})
- AI's previous utterance: ""{lastAiMessage}""
- Target goal: {targetMissionText}

Suggest one natural, grammatically accurate Japanese response for the learner at JLPT {levelConfig.JLPTLevel}.
Return strictly pure JSON:
{{
  ""japaneseSuggestion"": ""Natural Japanese response sentence"",
  ""romajiOrReading"": ""Romaji or Hiragana reading"",
  ""vietnameseMeaning"": ""Meaning in Vietnamese"",
  ""contextExplanation"": ""Brief explanation in Vietnamese of when and why to use this phrase""
}}";

            var request = AiRequest.CreateJson(systemPrompt, userPrompt);
            var response = await _aiClient.GenerateAsync(request, cancellationToken);

            if (response.IsSuccess && !string.IsNullOrWhiteSpace(response.Content))
            {
                using var doc = JsonDocument.Parse(response.Content);
                var root = doc.RootElement;
                var hintDto = new RoleplayHintDto
                {
                    JapaneseSuggestion = root.TryGetProperty("japaneseSuggestion", out var jProp) ? jProp.GetString() ?? "" : "",
                    RomajiOrReading = root.TryGetProperty("romajiOrReading", out var rProp) ? rProp.GetString() ?? "" : "",
                    VietnameseMeaning = root.TryGetProperty("vietnameseMeaning", out var vProp) ? vProp.GetString() ?? "" : "",
                    ContextExplanation = root.TryGetProperty("contextExplanation", out var cProp) ? cProp.GetString() ?? "" : "",
                    Keywords = root.TryGetProperty("keywords", out var kProp) && kProp.ValueKind == JsonValueKind.Array
                        ? kProp.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => !string.IsNullOrWhiteSpace(s)).ToList()
                        : new List<string>(),
                    ClozeSentence = root.TryGetProperty("clozeSentence", out var clProp) ? clProp.GetString() : null
                };
                return RoleplaySocialRegister.EnrichScaffolding(hintDto);
            }
            else
            {
                _logger.LogWarning("Không thể sinh gợi ý từ AI Client ({Error}, Status: {StatusCode}). Sử dụng Simulator.", response.ErrorMessage, response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Lỗi khi gọi AI Client cho gợi ý câu tiếp theo. Tự động chuyển sang Simulator.");
        }

        return GenerateSimulatorHint(levelConfig, pendingMissions);
    }

    private string BuildSystemInstruction(Scenario scenario, ScenarioLevelConfiguration levelConfig)
    {
        var reg = RoleplaySocialRegister.Deduce(scenario.Title, levelConfig.AiPersona, levelConfig.Description);

        var sb = new StringBuilder();
        sb.AppendLine("You are an authentic Japanese roleplay conversational partner in the JCAP platform.");
        sb.AppendLine("[SCENARIO CONTEXT]");
        sb.AppendLine($"- Title: {scenario.Title}");
        sb.AppendLine($"- Role/Persona: {levelConfig.AiPersona}");
        sb.AppendLine($"- Context: {levelConfig.Description}");
        sb.AppendLine($"- Target JLPT Level: {levelConfig.JLPTLevel}");
        sb.AppendLine("[VIETNAMESE PRONOUN & SOCIAL REGISTER (VAI VẾ XƯNG HÔ) - STRICT ZERO-SLASH & ADAPTIVE RULES]");
        sb.AppendLine($"- Baseline Register Suggestion: {reg.RegisterDescription}");
        sb.AppendLine($"- Suggested Baseline: Learner = '{reg.LearnerSelf}' addressing '{reg.LearnerAddressAi}'; AI Persona = '{reg.AiSelf}' addressing '{reg.AiAddressLearner}'.");
        sb.AppendLine("- ADAPTIVE NUANCE: Deeply understand the real interpersonal relationship and tone from the scenario context. If the context reflects a specific relationship (e.g., close friends/buddies -> mày/tao or cậu/tớ; school/work seniors -> anh/chị - em; family -> bố/mẹ - con; service encounter -> tôi - quý khách; elderly -> cháu - cụ), adopt the single most culturally natural Vietnamese pronoun pair.");
        sb.AppendLine("- ZERO-SLASH ENFORCEMENT: STRICTLY FORBIDDEN to use slash alternatives (NEVER write 'mày/cậu', 'cụ/bạn', 'cháu/em', 'ông/bà', 'tôi/mình') in ANY Vietnamese output. Pick and use ONLY ONE single, definitive, culturally authentic pronoun pair.");
        sb.AppendLine("- CONSISTENCY: Maintain that chosen pronoun pair consistently across all Vietnamese fields (userVietnameseMeaning, replyVietnamese, and linguisticFeedback).");
        if (levelConfig.TargetVocabularies?.Count > 0)
        {
            sb.AppendLine("[SCENARIO TARGET VOCABULARIES TO REINFORCE]");
            foreach (var v in levelConfig.TargetVocabularies)
            {
                sb.AppendLine($"- {v.Word}{(string.IsNullOrWhiteSpace(v.Reading) ? "" : $" ({v.Reading})")}: {v.Meaning}");
            }
        }
        if (levelConfig.TargetGrammars?.Count > 0)
        {
            sb.AppendLine("[SCENARIO TARGET GRAMMAR PATTERNS TO REINFORCE]");
            foreach (var g in levelConfig.TargetGrammars)
            {
                sb.AppendLine($"- {g.Pattern}: {g.Meaning}{(string.IsNullOrWhiteSpace(g.ExampleSentence) ? "" : $" (VD: {g.ExampleSentence})")}");
            }
        }
        sb.AppendLine("[CORE GUARDRAILS]");
        sb.AppendLine($"- Roleplay fidelity: Stay in character naturally; never break persona.");
        sb.AppendLine($"- STRICT MONOLINGUAL PERSONA: You are a native Japanese resident who speaks and understands ONLY Japanese. You have ZERO comprehension of Vietnamese (both accented and unaccented), English, or any foreign language.");
        sb.AppendLine($"  * replyJapanese MUST contain 100% Japanese text ONLY (Kanji, Hiragana, Katakana, and Japanese punctuation).");
        sb.AppendLine($"  * ABSOLUTELY NEVER include, leak, append, or interpolate ANY Vietnamese words, Roman letters, English words, or translations inside replyJapanese (e.g. NEVER write 'cháu...', 'cảm ơn...', or '(dịch nghĩa...)').");
        sb.AppendLine($"  * All Vietnamese meanings and translations belong EXCLUSIVELY in replyVietnamese.");
        sb.AppendLine($"  * If the learner uses ANY non-Japanese words, Vietnamese text, or foreign language (e.g., 'toi muon', 'cho toi', 'hello', 'want', 'order'):");
        sb.AppendLine($"  * NEVER try to guess, deduce, infer, echo, or confirm ANY partial keywords or intent.");
        sb.AppendLine($"  * Even if the learner mentions a faint keyword like 'tonkotsu ramen' or 'ramen' inside non-Japanese text, act as if you did not recognize it at all.");
        sb.AppendLine($"  * STRICTLY FORBIDDEN: NEVER say '...ですね', '...ですか', or 'かしこまりました' when foreign/mixed language is used.");
        sb.AppendLine($"  * Your ONLY allowed response is polite native Japanese incomprehension requesting them to speak Japanese (e.g., '恐れ入りますが、日本語が分かりませんので、日本語でお話しいただけますでしょうか。').");
        sb.AppendLine($"- Strict Language Requirement: The learner MUST speak in Japanese (Kanji, Kana, or standard Japanese Romaji). If the learner uses Vietnamese, English, or non-Japanese text, NEVER mark any missions completed (completedMissionIds: []), mark linguisticFeedback status as \"Error\", and do not advance the scenario.");
        var level = (levelConfig.JLPTLevel ?? "N5").ToUpperInvariant().Trim();
        sb.AppendLine($"[PEDAGOGICAL DIFFICULTY ADAPTATION FOR JLPT {level}]");
        if (level == "N5")
        {
            sb.AppendLine("- TARGET AUDIENCE: Absolute beginner Japanese learner (JLPT N5, Minna no Nihongo Lesson 1-25).");
            sb.AppendLine("- SENTENCE STRUCTURE & BREVITY: Short, simple sentences (maximum 8-12 words per sentence, 1-2 clauses only). Absolutely avoid convoluted relative clauses or complex subordinate conjunctions.");
            sb.AppendLine("- GRAMMAR BOUNDARIES: Strictly limit grammar to basic polite form (~です / ~ます / ~ました / ~ません), basic questions (~ですか), and simple suggestions/requests (~をください, ~ましょうか). NEVER use Sonkeigo/Kenjougo (e.g. avoid '～ていただく', '～でお知りになりたい', '～いらっしゃる', '～申す'). Use basic polite forms only.");
            sb.AppendLine("- VOCABULARY RESTRICTIONS: Use elementary daily vocabulary. Avoid technical, Sino-Japanese (Kango) compound words (e.g., say 'えび・かに' instead of '甲殻類'; say 'やさい' instead of '植物性原料').");
            sb.AppendLine("- CONVERSATIONAL TONE: Warm, welcoming, patient, and highly encouraging. Ask straightforward questions with clear choices or simple yes/no cues (e.g., 'スープはどうしますか？', 'ラーメンはどれにしますか？') so an N5 learner can understand easily and answer immediately without hesitation.");
        }
        else if (level == "N4")
        {
            sb.AppendLine("- TARGET AUDIENCE: Elementary Japanese learner (JLPT N4, Minna no Nihongo Lesson 26-50).");
            sb.AppendLine("- SENTENCE STRUCTURE: Natural spoken Japanese with moderate compounding (e.g., ~てください, ~てもいいですか, ~てから, ~たら, ~たり~たり, ~と思います).");
            sb.AppendLine("- GRAMMAR BOUNDARIES: Use standard Teinei form with mild polite expressions. Do not overwhelm with heavy Sonkeigo/Kenjougo.");
            sb.AppendLine("- VOCABULARY: Common conversational service and daily life vocabulary (approx 1,500 common words).");
            sb.AppendLine("- CONVERSATIONAL TONE: Friendly, helpful guide. Provide natural prompts that encourage the learner to express conditions or simple reasons (~から, ~ので).");
        }
        else
        {
            sb.AppendLine("- TARGET AUDIENCE: Intermediate Japanese learner (JLPT N3+).");
            sb.AppendLine("- SENTENCE STRUCTURE: Natural authentic native pace, idioms, and compound sentences.");
            sb.AppendLine("- GRAMMAR BOUNDARIES: Standard business/service keigo (~でございます, ~ていただけますか), passive (~られる), causative (~させる), natural transitions.");
            sb.AppendLine("- VOCABULARY: Rich authentic terminology and nuanced vocabulary.");
            sb.AppendLine("- CONVERSATIONAL TONE: Authentic native Japanese dialogue reflecting realistic societal scenarios.");
        }
        sb.AppendLine($"- Brevity: Keep responses concise (1-2 sentences) simulating real-world spoken Japanese.");
        sb.AppendLine($"- Non-preemption: NEVER mention, answer, or complete pending missions for the learner; wait for them to initiate.");
        sb.AppendLine($"- Conversational cueing: Respond only to the current turn with open-ended cues, leaving space for the learner to drive the next mission.");
        sb.AppendLine($"- Output format: Always return valid, pure JSON matching the requested schema.");
        return sb.ToString();
    }

    // ==========================================
    // MOCK SIMULATOR (Dự phòng khi offline / hết quota / chưa nhập Key)
    // Tự động suy luận vai vế xưng hô & tiến trình nhiệm vụ linh hoạt
    // ==========================================
    private static AiOpeningMessageResult GenerateSimulatorOpeningMessage(Scenario scenario, ScenarioLevelConfiguration levelConfig)
    {
        return RoleplaySocialRegister.GenerateOpeningMessage(scenario, levelConfig);
    }

    private static AiTurnResult ProcessSimulatorTurn(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        string userMessage,
        List<Mission> pendingMissions)
    {
        return RoleplaySocialRegister.ProcessGenericTurn(scenario, levelConfig, userMessage, pendingMissions);
    }

    private static RoleplayHintDto GenerateSimulatorHint(
        ScenarioLevelConfiguration levelConfig,
        List<Mission> pendingMissions)
    {
        return RoleplaySocialRegister.GenerateHint(levelConfig, pendingMissions);
    }
}
