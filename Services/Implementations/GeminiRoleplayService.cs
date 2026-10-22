using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using JCAP.DTOs.Roleplay;
using JCAP.Models;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations;

public class GeminiRoleplayService : IAiRoleplayService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GeminiRoleplayService> _logger;

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

    public GeminiRoleplayService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<GeminiRoleplayService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<AiOpeningMessageResult> GenerateOpeningMessageAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        CancellationToken cancellationToken = default)
    {
        var apiKey = _configuration["Gemini:ApiKey"];
        var model = _configuration["Gemini:Model"] ?? "gemini-3.1-flash-lite";

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogInformation("Gemini ApiKey chưa được cấu hình. Sử dụng Simulator cho câu mở đầu.");
            return GenerateSimulatorOpeningMessage(scenario, levelConfig);
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

            var jsonResponse = await CallGeminiAsync(apiKey, model, systemPrompt, userPrompt, cancellationToken);
            if (!string.IsNullOrWhiteSpace(jsonResponse))
            {
                using var doc = JsonDocument.Parse(jsonResponse);
                var root = doc.RootElement;
                var ja = root.TryGetProperty("replyJapanese", out var jaProp) ? jaProp.GetString() ?? "" : "";
                var fHtml = root.TryGetProperty("replyFuriganaHtml", out var fProp) ? fProp.GetString() : null;
                var vi = root.TryGetProperty("replyVietnamese", out var viProp) ? viProp.GetString() ?? "" : "";

                if (!string.IsNullOrWhiteSpace(ja))
                {
                    return new AiOpeningMessageResult
                    {
                        JapaneseText = ja.Trim(),
                        FuriganaHtml = !string.IsNullOrWhiteSpace(fHtml) ? fHtml.Trim() : null,
                        VietnameseMeaning = vi.Trim()
                    };
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Lỗi khi gọi Gemini API cho câu mở đầu. Tự động chuyển sang Simulator.");
        }

        return GenerateSimulatorOpeningMessage(scenario, levelConfig);
    }

    public async Task<AiTurnResult> ProcessTurnAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        List<RoleplayMessage> conversationHistory,
        string userMessage,
        List<Mission> pendingMissions,
        CancellationToken cancellationToken = default)
    {
        var apiKey = _configuration["Gemini:ApiKey"];
        var model = _configuration["Gemini:Model"] ?? "gemini-3.1-flash-lite";

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogInformation("Gemini ApiKey chưa được cấu hình. Sử dụng Simulator cho lượt đối thoại.");
            return ProcessSimulatorTurn(scenario, levelConfig, userMessage, pendingMissions);
        }

        try
        {
            var reg = RoleplaySocialRegister.Deduce(scenario.Title, levelConfig.AiPersona, levelConfig.Description);
            var systemPrompt = BuildSystemInstruction(scenario, levelConfig);

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
2. NORMAL JAPANESE EVALUATION (Only if learner spoke entirely in Japanese/Romaji):
   - replyJapanese: Natural Japanese response matching your persona and JLPT {levelConfig.JLPTLevel}.
   - replyFuriganaHtml: HTML ruby tag markup for replyJapanese for reading assistance (e.g., '<ruby>豚骨<rt>とんこつ</rt></ruby>ラーメン<ruby>一杯<rt>いっぱい</rt></ruby>ですね。'). All kanji characters MUST have accurate hiragana readings in <ruby><rt> tags. Kana-only characters remain plain text.
   - replyVietnamese: Natural translation in Vietnamese strictly adhering to the social register: use '{reg.AiSelf}' and address learner as '{reg.AiAddressLearner}'. ABSOLUTELY ZERO SLASHES ('/').
   - userVietnameseMeaning: Accurate Vietnamese translation of what the learner said in Japanese, strictly phrased from the learner's perspective ('{reg.LearnerSelf}' addressing '{reg.LearnerAddressAi}'). ABSOLUTELY ZERO SLASHES ('/').
   - completedMissionIds: Array of Mission IDs satisfied in the current turn. Follow STRICT rules:
     * Intent Verification: The learner's utterance MUST actively and clearly express the specific intent and conditions specified in the mission's Content and CompletionCriteriaJson.
     * NEVER mark a mission complete if the learner only provides generic filler words, passive agreement ('はい', 'そうです', 'わかりました', 'ええと'), or unrelated statements.
     * Sequential Flow: Missions are ordered by conversation flow. NEVER mark the final departure/closing mission completed if earlier transactional/core missions are still unfulfilled.
     * Concurrency: Typically at most ONE mission should be completed per turn, unless the learner explicitly combines multiple distinct intents in one compound sentence. Return [] if none.
   - isNaturallyConcluded: Boolean (true ONLY IF all scenario missions are accomplished and the learner and AI exchanged closing/departure greetings).
   - linguisticFeedback: Linguistic evaluation of the learner's utterance (MUST write all explanations/comments in Vietnamese):
     * status: ""Good"" | ""Warning"" | ""Error""
     * summary: Short Vietnamese summary (e.g. ""Rất tốt • Đúng ngữ cảnh"")
     * details: Array of items:
       - type: ""success"" | ""warning"" | ""error""
       - aspect: Aspect in Vietnamese (""Ngữ cảnh"" | ""Trợ từ"" | ""Văn phong"" | ""Kính ngữ"" | ""Từ vựng"")
       - comment: Specific constructive feedback in Vietnamese
       - For every normal Japanese utterance, include at least one grammar-related item
         (""Ngữ pháp"", ""Trợ từ"", ""Cấu trúc"" or ""Chia động từ""), one ""Từ vựng""
         item, and one communication-impression item (""Ngữ cảnh"", ""Văn phong"", ""Kính ngữ"" or ""Lịch sự"").
       - Contextual Keigo and Social Register Check:
         * If Scenario is Business / Job Interview: Learner must use formal Teineigo (です/ます) or Keigo. If casual/tameguchi form is used, mark aspect ""Kính ngữ"" with type ""warning"" or ""error"" and guide them to be formal.
         * If Scenario is Service Encounter: Learner should speak politely with ください / お願いします.
         * If Scenario is Casual: Casual form is acceptable.
       - Positive usage MUST be recorded as type ""success""; do not return only mistakes.
     * naturalAlternative: More natural native phrasing in Japanese (or null if already natural)
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

            var jsonResponse = await CallGeminiAsync(apiKey, model, systemPrompt, userPrompt, cancellationToken);
            if (!string.IsNullOrWhiteSpace(jsonResponse))
            {
                using var doc = JsonDocument.Parse(jsonResponse);
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
                    var resolvedUserFurigana = !string.IsNullOrWhiteSpace(userFHtml)
                        ? userFHtml.Trim()
                        : RoleplaySocialRegister.GenerateFuriganaHtml(userMessage);

                    return new AiTurnResult
                    {
                        JapaneseReply = ja.Trim(),
                        FuriganaHtml = !string.IsNullOrWhiteSpace(fHtml) ? fHtml.Trim() : null,
                        VietnameseMeaning = vi.Trim(),
                        UserVietnameseMeaning = string.IsNullOrWhiteSpace(userVi) ? null : userVi.Trim(),
                        UserFuriganaHtml = resolvedUserFurigana,
                        CompletedMissionIds = completedIds,
                        IsNaturallyConcluded = isConcluded,
                        LinguisticFeedback = feedback
                    };
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Lỗi khi gọi Gemini API cho lượt đối thoại. Tự động chuyển sang Simulator.");
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
        var apiKey = _configuration["Gemini:ApiKey"];
        var model = _configuration["Gemini:Model"] ?? "gemini-3.1-flash-lite";

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return GenerateSimulatorHint(levelConfig, pendingMissions);
        }

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

            var jsonResponse = await CallGeminiAsync(apiKey, model, systemPrompt, userPrompt, cancellationToken);
            if (!string.IsNullOrWhiteSpace(jsonResponse))
            {
                using var doc = JsonDocument.Parse(jsonResponse);
                var root = doc.RootElement;
                return new RoleplayHintDto
                {
                    JapaneseSuggestion = root.TryGetProperty("japaneseSuggestion", out var jProp) ? jProp.GetString() ?? "" : "",
                    RomajiOrReading = root.TryGetProperty("romajiOrReading", out var rProp) ? rProp.GetString() ?? "" : "",
                    VietnameseMeaning = root.TryGetProperty("vietnameseMeaning", out var vProp) ? vProp.GetString() ?? "" : "",
                    ContextExplanation = root.TryGetProperty("contextExplanation", out var cProp) ? cProp.GetString() ?? "" : ""
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Lỗi khi gọi Gemini API cho gợi ý câu tiếp theo. Tự động chuyển sang Simulator.");
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
        sb.AppendLine("[CORE GUARDRAILS]");
        sb.AppendLine($"- Roleplay fidelity: Stay in character naturally; never break persona.");
        sb.AppendLine($"- STRICT MONOLINGUAL PERSONA: You are a native Japanese resident who understands ONLY Japanese. You have ZERO comprehension of Vietnamese (both accented and unaccented), English, or any foreign language.");
        sb.AppendLine($"  * If the learner uses ANY non-Japanese words, Vietnamese text, or foreign language (e.g., 'toi muon', 'cho toi', 'hello', 'want', 'order'):");
        sb.AppendLine($"  * NEVER try to guess, deduce, infer, echo, or confirm ANY partial keywords or intent.");
        sb.AppendLine($"  * Even if the learner mentions a faint keyword like 'tonkotsu ramen' or 'ramen' inside non-Japanese text, act as if you did not recognize it at all.");
        sb.AppendLine($"  * STRICTLY FORBIDDEN: NEVER say '...ですね', '...ですか', or 'かしこまりました' when foreign/mixed language is used.");
        sb.AppendLine($"  * Your ONLY allowed response is polite native Japanese incomprehension requesting them to speak Japanese (e.g., '恐れ入りますが、日本語が分かりませんので、日本語でお話しいただけますでしょうか。').");
        sb.AppendLine($"- Strict Language Requirement: The learner MUST speak in Japanese (Kanji, Kana, or standard Japanese Romaji). If the learner uses Vietnamese, English, or non-Japanese text, NEVER mark any missions completed (completedMissionIds: []), mark linguisticFeedback status as \"Error\", and do not advance the scenario.");
        sb.AppendLine($"- Level matching: Use vocabulary and grammar strictly appropriate for JLPT {levelConfig.JLPTLevel}.");
        sb.AppendLine($"- SITUATIONAL KEIGO & SOCIAL REGISTER (VĂN HÓA GIAO TIẾP NHẬT BẢN):");
        sb.AppendLine($"  * Business/Job Interview (Phỏng vấn / Công sở): Learner must use formal Teineigo (です/ます) or Kenjougo/Sonkeigo (Kính ngữ/Khiêm nhường ngữ). If the learner uses plain form (Thể thường / Tameguchi / だ), gently correct them in linguisticFeedback as 'Cần lịch sự hơn trong phỏng vấn/công sở'.");
        sb.AppendLine($"  * Service Encounter (Nhà hàng / Tiệm ăn / Cửa hàng tiện lợi): As staff, you use polite customer service Keigo (いらっしゃいませ, 少々お待ちください, かしこまりました). The learner (customer) should use polite standard Japanese (ください, お願いします, です/ます).");
        sb.AppendLine($"  * Casual / Peers (Bạn bè / Đồng trang lứa): Standard casual or polite polite forms are acceptable.");
        sb.AppendLine($"- Brevity: Keep responses concise (1-2 sentences) simulating real-world spoken Japanese.");
        sb.AppendLine($"- Non-preemption: NEVER mention, answer, or complete pending missions for the learner; wait for them to initiate.");
        sb.AppendLine($"- Conversational cueing: Respond only to the current turn with open-ended cues, leaving space for the learner to drive the next mission.");
        sb.AppendLine($"- Output format: Always return valid, pure JSON matching the requested schema.");
        return sb.ToString();
    }

    private async Task<string> CallGeminiAsync(
        string apiKey,
        string model,
        string systemPrompt,
        string userPrompt,
        CancellationToken cancellationToken)
    {
        var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

        var requestBody = new
        {
            systemInstruction = new
            {
                parts = new[] { new { text = systemPrompt } }
            },
            contents = new[]
            {
                new
                {
                    role = "user",
                    parts = new[] { new { text = userPrompt } }
                }
            },
            generationConfig = new
            {
                temperature = 0.7,
                responseMimeType = "application/json"
            }
        };

        var json = JsonSerializer.Serialize(requestBody, JsonOptions);

        HttpResponseMessage? response = null;
        string responseString = string.Empty;

        for (int attempt = 0; attempt < 2; attempt++)
        {
            using var content = new StringContent(json, Encoding.UTF8, "application/json");
            response = await _httpClient.PostAsync(endpoint, content, cancellationToken);
            responseString = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                break;
            }

            if ((response.StatusCode == System.Net.HttpStatusCode.ServiceUnavailable || (int)response.StatusCode == 429) && attempt == 0)
            {
                _logger.LogWarning("Gemini API bận (status {StatusCode}), tự động thử lại sau 1.2s...", response.StatusCode);
                await Task.Delay(1200, cancellationToken);
                continue;
            }

            _logger.LogWarning("Gemini API trả về lỗi status {StatusCode}: {Response}", response.StatusCode, responseString);
            throw new HttpRequestException($"Gemini API error ({response.StatusCode}): {responseString}");
        }

        if (response == null || !response.IsSuccessStatusCode)
        {
            throw new HttpRequestException("Gemini API error: response is null or failed.");
        }

        using var doc = JsonDocument.Parse(responseString);
        var candidates = doc.RootElement.GetProperty("candidates");
        if (candidates.GetArrayLength() > 0)
        {
            var parts = candidates[0].GetProperty("content").GetProperty("parts");
            if (parts.GetArrayLength() > 0)
            {
                return parts[0].GetProperty("text").GetString() ?? "";
            }
        }

        return string.Empty;
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
