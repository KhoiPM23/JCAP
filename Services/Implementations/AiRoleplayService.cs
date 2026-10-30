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
        => GenerateOpeningMessageAsync(scenario, levelConfig, null, cancellationToken);

    public async Task<AiOpeningMessageResult> GenerateOpeningMessageAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        string? circadianGreeting,
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
                            ? RoleplaySocialRegister.SanitizeJapaneseReply(fHtml)
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
                        if (elem.TryGetInt32(out var id) && pendingMissions.Any(m => m.Id == id))
                        {
                            completedIds.Add(id);
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

                if (!string.IsNullOrWhiteSpace(ja))
                {
                    ja = RoleplaySocialRegister.SanitizeJapaneseReply(ja,
                        levelConfig.AiPersona.Contains("cụ") || scenario.Title.Contains("cụ")
                            ? "本当にありがとうね。気をつけて帰ってね。"
                            : "丁寧にご対応いただき、誠にありがとうございました。");

                    var resolvedReplyFurigana = !string.IsNullOrWhiteSpace(fHtml) && !RoleplaySocialRegister.HasVietnameseLeak(fHtml)
                        ? RoleplaySocialRegister.SanitizeJapaneseReply(fHtml)
                        : RoleplaySocialRegister.GenerateFuriganaHtml(ja.Trim());

                    var resolvedUserFurigana = !string.IsNullOrWhiteSpace(userFHtml)
                        ? userFHtml.Trim()
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
        sb.AppendLine($"- Level matching: Use vocabulary and grammar strictly appropriate for JLPT {levelConfig.JLPTLevel}.");
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
