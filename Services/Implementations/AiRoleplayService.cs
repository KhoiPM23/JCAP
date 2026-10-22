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

    public async Task<AiOpeningMessageResult> GenerateOpeningMessageAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        CancellationToken cancellationToken = default)
    {
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
                    return new AiOpeningMessageResult
                    {
                        JapaneseText = ja.Trim(),
                        FuriganaHtml = !string.IsNullOrWhiteSpace(fHtml) ? fHtml.Trim() : null,
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

    public async Task<AiTurnResult> ProcessTurnAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        List<RoleplayMessage> conversationHistory,
        string userMessage,
        List<Mission> pendingMissions,
        CancellationToken cancellationToken = default)
    {
        try
        {
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
     * replyJapanese: You MUST NOT guess or echo the item. DO NOT say 'かしこまりました', DO NOT say '...ですね' or '...ですか' (e.g., NEVER say 'とんこつラーメンですね' or ask 'とんこつラーメンですか'). ONLY express polite incomprehension and ask for Japanese: '恐れ入りますが、日本語が分かりませんので、日本語でお話しいただけますでしょうか。'
     * replyVietnamese: 'Xin lỗi, tôi không hiểu tiếng nước ngoài. Bạn có thể nói bằng tiếng Nhật được không ạ?'
     * completedMissionIds: MUST BE STRICTLY EMPTY [] (no missions completed).
     * linguisticFeedback: status MUST BE 'Error', summary: 'Vui lòng sử dụng tiếng Nhật', details: explain that the learner must speak in Japanese. In naturalAlternative, show how to say their intended request in natural Japanese.
2. NORMAL JAPANESE EVALUATION (Only if learner spoke entirely in Japanese/Romaji):
   - replyJapanese: Natural Japanese response matching your persona and JLPT {levelConfig.JLPTLevel}.
   - replyFuriganaHtml: HTML ruby tag markup for replyJapanese for reading assistance (e.g., '<ruby>豚骨<rt>とんこつ</rt></ruby>ラーメン<ruby>一杯<rt>いっぱい</rt></ruby>ですね。'). All kanji characters MUST have accurate hiragana readings in <ruby><rt> tags. Kana-only characters remain plain text.
   - replyVietnamese: Natural translation in Vietnamese.
   - userVietnameseMeaning: Accurate Vietnamese translation of what the learner said in Japanese in their latest utterance.
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
                    return new AiTurnResult
                    {
                        JapaneseReply = ja.Trim(),
                        FuriganaHtml = !string.IsNullOrWhiteSpace(fHtml) ? fHtml.Trim() : null,
                        VietnameseMeaning = vi.Trim(),
                        UserVietnameseMeaning = !string.IsNullOrWhiteSpace(userVi) ? userVi.Trim() : null,
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
                return new RoleplayHintDto
                {
                    JapaneseSuggestion = root.TryGetProperty("japaneseSuggestion", out var jProp) ? jProp.GetString() ?? "" : "",
                    RomajiOrReading = root.TryGetProperty("romajiOrReading", out var rProp) ? rProp.GetString() ?? "" : "",
                    VietnameseMeaning = root.TryGetProperty("vietnameseMeaning", out var vProp) ? vProp.GetString() ?? "" : "",
                    ContextExplanation = root.TryGetProperty("contextExplanation", out var cProp) ? cProp.GetString() ?? "" : ""
                };
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
        var sb = new StringBuilder();
        sb.AppendLine("You are an authentic Japanese roleplay conversational partner in the JCAP platform.");
        sb.AppendLine("[SCENARIO CONTEXT]");
        sb.AppendLine($"- Title: {scenario.Title}");
        sb.AppendLine($"- Role/Persona: {levelConfig.AiPersona}");
        sb.AppendLine($"- Context: {levelConfig.Description}");
        sb.AppendLine($"- Target JLPT Level: {levelConfig.JLPTLevel}");
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
        sb.AppendLine($"- Brevity: Keep responses concise (1-2 sentences) simulating real-world spoken Japanese.");
        sb.AppendLine($"- Non-preemption: NEVER mention, answer, or complete pending missions for the learner; wait for them to initiate.");
        sb.AppendLine($"- Conversational cueing: Respond only to the current turn with open-ended cues, leaving space for the learner to drive the next mission.");
        sb.AppendLine($"- Output format: Always return valid, pure JSON matching the requested schema.");
        return sb.ToString();
    }

    // ==========================================
    // MOCK SIMULATOR (Dự phòng khi offline / hết quota / chưa nhập Key)
    // ==========================================
    // ==========================================
    // MOCK SIMULATOR (Dự phòng khi offline / hết quota / chưa nhập Key)
    // ==========================================
    private static AiOpeningMessageResult GenerateSimulatorOpeningMessage(Scenario scenario, ScenarioLevelConfiguration levelConfig)
    {
        var title = scenario?.Title ?? "";
        var persona = levelConfig?.AiPersona ?? "";

        if (title.Contains("cụ già", StringComparison.OrdinalIgnoreCase) ||
            title.Contains("người già", StringComparison.OrdinalIgnoreCase) ||
            title.Contains("băng qua đường", StringComparison.OrdinalIgnoreCase) ||
            persona.Contains("お年寄り", StringComparison.OrdinalIgnoreCase) ||
            persona.Contains("cụ già", StringComparison.OrdinalIgnoreCase))
        {
            return new AiOpeningMessageResult
            {
                JapaneseText = "あのう、すみません。足が悪くて、向こう側まで渡りたいのですが、手伝っていただけないでしょうか。",
                FuriganaHtml = "あのう、すみません。<ruby>足<rt>あし</rt></ruby>が<ruby>悪<rt>わる</rt></ruby>くて、<ruby>向<rt>む</rt></ruby>こう<ruby>側<rt>がわ</rt></ruby>まで<ruby>渡<rt>わた</rt></ruby>りたいのですが、<ruby>手伝<rt>てつだ</rt></ruby>っていただけないでしょうか。",
                VietnameseMeaning = "Xin lỗi, chân tôi đau và tôi muốn băng sang bên kia đường, bạn có thể giúp tôi được không?"
            };
        }

        if (title.Contains("Ramen", StringComparison.OrdinalIgnoreCase) || title.Contains("quán ăn", StringComparison.OrdinalIgnoreCase))
        {
            return new AiOpeningMessageResult
            {
                JapaneseText = "いらっしゃいませ！何名様ですか？",
                FuriganaHtml = "いらっしゃいませ！<ruby>何名様<rt>なんめいさま</rt></ruby>ですか？",
                VietnameseMeaning = "Kính chào quý khách! Quý khách đi mấy người ạ?"
            };
        }

        if (title.Contains("tàu", StringComparison.OrdinalIgnoreCase) || title.Contains("Shinjuku", StringComparison.OrdinalIgnoreCase))
        {
            return new AiOpeningMessageResult
            {
                JapaneseText = "はい、こちらは駅員室です。どうなさいましたか？",
                FuriganaHtml = "はい、こちらは<ruby>駅員室<rt>えきいんしつ</rt></ruby>です。どうなさいましたか？",
                VietnameseMeaning = "Vâng, đây là phòng trực ga. Tôi có thể giúp gì cho quý khách?"
            };
        }

        return new AiOpeningMessageResult
        {
            JapaneseText = $"こんにちは。本日の{title}を始めましょう。よろしくお願いします。",
            FuriganaHtml = $"こんにちは。<ruby>本日<rt>ほんじつ</rt></ruby>の{title}を<ruby>始<rt>はじ</rt></ruby>めましょう。よろしくお<ruby>願<rt>ねが</rt></ruby>いします。",
            VietnameseMeaning = $"Xin chào. Chúng ta hãy bắt đầu bài luyện tập {title}. Rất mong được hợp tác."
        };
    }

    private static string TranslateUserUtteranceHeuristic(string userMessage, string scenarioTitle, string aiPersona)
    {
        if (string.IsNullOrWhiteSpace(userMessage)) return "";

        var lower = userMessage.Trim().ToLowerInvariant();

        if (lower.Contains("どういたしまして") && (lower.Contains("お気をつけて") || lower.Contains("気をつけて")) && lower.Contains("お大事に"))
            return "Dạ không có gì đâu ạ. Chúc cụ/bạn đi cẩn thận và giữ gìn sức khỏe nhé.";

        if (lower.Contains("どういたしまして") && (lower.Contains("お気をつけて") || lower.Contains("気をつけて")))
            return "Dạ không có gì đâu ạ. Chúc bạn đi lại cẩn thận nhé.";

        if (lower.Contains("お気をつけて") || lower.Contains("気をつけて"))
        {
            if (lower.Contains("お帰り") || lower.Contains("かえり"))
                return "Chúc cụ/bạn đi về cẩn thận nhé ạ.";
            if (lower.Contains("お大事に") || lower.Contains("だいじに"))
                return "Chúc cụ/bạn đi lại cẩn thận và giữ gìn sức khỏe nhé.";
            return "Chúc bạn/cụ đi lại cẩn thận nhé.";
        }

        if (lower.Contains("どういたしまして"))
            return "Dạ không có gì đâu ạ.";

        if (lower.Contains("お大事に") || lower.Contains("おだいじに"))
            return "Chúc bạn/cụ mau khỏe và giữ gìn sức khỏe nhé.";

        if (lower.Contains("喜んで") && (lower.Contains("手伝") || lower.Contains("てつだ")))
        {
            if (lower.Contains("渡りましょう") || lower.Contains("わたりましょう"))
                return "Vâng, tôi rất sẵn lòng giúp đỡ. Chúng ta cùng sang đường nhé.";
            return "Vâng, tôi rất sẵn lòng giúp bạn một tay.";
        }

        if (lower.Contains("どちらまで") && (lower.Contains("行かれ") || lower.Contains("いきます") || lower.Contains("いく")))
        {
            if (lower.Contains("手伝い") || lower.Contains("てつだい"))
                return "Cụ/bạn định đi đến đâu vậy ạ? Để tôi giúp bạn nhé.";
            return "Cụ/bạn định đi đến đâu vậy ạ?";
        }

        if (lower.Contains("手伝いましょうか") || lower.Contains("てつだいましょうか"))
            return "Để tôi giúp bạn một tay nhé?";

        if (lower.Contains("手伝") || lower.Contains("てつだ"))
            return "Tôi muốn giúp đỡ bạn/cụ.";

        if (lower.Contains("こんにちは"))
            return "Xin chào bạn.";

        if (lower.Contains("はじめまして"))
            return "Rất vui được gặp bạn lần đầu.";

        if (lower.Contains("よろしくお願") || lower.Contains("よろしくおねがい") || lower.Contains("よろしくお願いします"))
            return "Rất mong nhận được sự giúp đỡ của bạn.";

        if (lower.Contains("ありがとうございます") || lower.Contains("ありがとう"))
            return "Cảm ơn bạn rất nhiều.";

        if (lower.Contains("失礼します") || lower.Contains("失礼いたします") || lower.Contains("しつれい"))
            return "Tôi xin phép chào bạn.";

        if (lower.Contains("さようなら"))
            return "Tạm biệt bạn.";

        if (lower.Contains("ごちそうさま"))
            return "Cảm ơn vì bữa ăn rất ngon ạ.";

        if (lower.Contains("ラーメン") && (lower.Contains("お願いします") || lower.Contains("ください") || lower.Contains("一杯")))
            return "Làm ơn cho tôi một bát mì Ramen.";

        if (lower.Contains("いくら") || lower.Contains("値段"))
            return "Món này / dịch vụ này giá bao nhiêu tiền ạ?";

        if (lower.Contains("会計") || lower.Contains("お会計"))
            return "Làm ơn cho tôi thanh toán tiền.";

        if (lower.Contains("渡") || lower.Contains("わた"))
            return "Chúng ta cùng qua đường nhé.";

        return "Câu đối thoại lịch sự bằng tiếng Nhật phù hợp với bối cảnh.";
    }

    private static AiTurnResult ProcessSimulatorTurn(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        string userMessage,
        List<Mission> pendingMissions)
    {
        var completedIds = new List<int>();
        var lowerMsg = userMessage.ToLower();
        var scenarioTitle = scenario?.Title ?? "";
        var persona = levelConfig?.AiPersona ?? "";

        bool isElderlyHelp = scenarioTitle.Contains("cụ già", StringComparison.OrdinalIgnoreCase) ||
                             scenarioTitle.Contains("người già", StringComparison.OrdinalIgnoreCase) ||
                             scenarioTitle.Contains("băng qua đường", StringComparison.OrdinalIgnoreCase) ||
                             scenarioTitle.Contains("sang đường", StringComparison.OrdinalIgnoreCase) ||
                             persona.Contains("cụ già", StringComparison.OrdinalIgnoreCase) ||
                             persona.Contains("お年寄り", StringComparison.OrdinalIgnoreCase);

        bool isBaito = scenarioTitle.Contains("baito", StringComparison.OrdinalIgnoreCase) ||
                       scenarioTitle.Contains("phỏng vấn", StringComparison.OrdinalIgnoreCase) ||
                       scenarioTitle.Contains("xin việc", StringComparison.OrdinalIgnoreCase);

        bool isRamen = scenarioTitle.Contains("ramen", StringComparison.OrdinalIgnoreCase) ||
                       scenarioTitle.Contains("quán ăn", StringComparison.OrdinalIgnoreCase) ||
                       scenarioTitle.Contains("nhà hàng", StringComparison.OrdinalIgnoreCase) ||
                       scenarioTitle.Contains("tiệm mì", StringComparison.OrdinalIgnoreCase) ||
                       scenarioTitle.Contains("gọi món", StringComparison.OrdinalIgnoreCase);

        string jaReply;
        string fHtmlReply;
        string viMeaning;
        var isNaturallyConcluded = false;

        if (isElderlyHelp)
        {
            var orderedPending = pendingMissions.OrderBy(m => m.Order).ToList();
            var nextMission = orderedPending.FirstOrDefault();

            if (nextMission != null && (nextMission.Order == 1 || nextMission.Content.Contains("giúp", StringComparison.OrdinalIgnoreCase) || nextMission.Content.Contains("sang đường", StringComparison.OrdinalIgnoreCase)))
            {
                if (lowerMsg.Contains("手伝") || lowerMsg.Contains("てつだ") || lowerMsg.Contains("助け") || lowerMsg.Contains("一緒") || lowerMsg.Contains("渡") || lowerMsg.Contains("大丈夫") || lowerMsg.Contains("喜んで"))
                {
                    completedIds.Add(nextMission.Id);
                }
                jaReply = "ありがとうございます。では、あちらの横断歩道まで、ゆっくりお願いしますね。";
                fHtmlReply = "ありがとうございます。では、あちらの<ruby>横断歩道<rt>おうだんほどう</rt></ruby>まで、ゆっくりお<ruby>願<rt>ねが</rt></ruby>いしますね。";
                viMeaning = "Cảm ơn cháu rất nhiều. Vậy nhờ cháu đi chậm chậm đến vạch sang đường đằng kia nhé.";
            }
            else if (nextMission != null && (nextMission.Order == 2 || nextMission.Content.Contains("hướng", StringComparison.OrdinalIgnoreCase) || nextMission.Content.Contains("điểm đến", StringComparison.OrdinalIgnoreCase)))
            {
                if (lowerMsg.Contains("どちら") || lowerMsg.Contains("どこ") || lowerMsg.Contains("行") || lowerMsg.Contains("向こう") || lowerMsg.Contains("病院") || lowerMsg.Contains("駅") || lowerMsg.Contains("方向"))
                {
                    completedIds.Add(nextMission.Id);
                }
                jaReply = "ありがとうございます。目の前にある病院まで行きたいんです。本当に助かります。";
                fHtmlReply = "ありがとうございます。<ruby>目<rt>め</rt></ruby>の<ruby>前<rt>まえ</rt></ruby>にある<ruby>病院<rt>びょういん</rt></ruby>まで<ruby>行<rt>い</rt></ruby>きたいんです。<ruby>本当<rt>ほんとう</rt></ruby>に<ruby>助<rt>たす</rt></ruby>かります。";
                viMeaning = "Cảm ơn cháu. Cụ muốn đến bệnh viện ngay trước mặt kia. Cụ thực sự rất cảm ơn cháu.";
            }
            else if (nextMission != null)
            {
                if (lowerMsg.Contains("どういたしまして") || lowerMsg.Contains("お気をつけて") || lowerMsg.Contains("気をつけて") || lowerMsg.Contains("お大事に") || lowerMsg.Contains("お帰り") || lowerMsg.Contains("さようなら") || lowerMsg.Contains("失礼") || lowerMsg.Contains("では") || lowerMsg.Contains("また") || lowerMsg.Contains("良い") || lowerMsg.Contains("よい"))
                {
                    completedIds.Add(nextMission.Id);
                }
                jaReply = "本当にありがとうね。あなたのような親切な人に出会えて嬉しいよ。気をつけて帰ってね。";
                fHtmlReply = "<ruby>本当<rt>ほんとう</rt></ruby>にありがとうね。あなたのような<ruby>親切<rt>しんせつ</rt></ruby>な<ruby>人<rt>ひと</rt></ruby>に<ruby>出会<rt>であ</rt></ruby>えて<ruby>嬉<rt>うれ</rt></ruby>しいよ。<ruby>気<rt>き</rt></ruby>をつけて<ruby>帰<rt>かえ</rt></ruby>ってね。";
                viMeaning = "Cụ thực sự cảm ơn cháu nhiều lắm. Rất vui vì gặp được một người tốt bụng như cháu. Cháu đi về cẩn thận nhé.";
                isNaturallyConcluded = true;
            }
            else
            {
                jaReply = "はい、ありがとうね。気をつけて行ってらっしゃい。";
                fHtmlReply = "はい、ありがとうね。<ruby>気<rt>き</rt></ruby>をつけて<ruby>行<rt>い</rt></ruby>ってらっしゃい。";
                viMeaning = "Cụ cảm ơn cháu nhé. Chúc cháu đi lại cẩn thận.";
                isNaturallyConcluded = true;
            }
        }
        else if (isBaito)
        {
            var orderedPending = pendingMissions.OrderBy(m => m.Order).ToList();
            var nextMission = orderedPending.FirstOrDefault();

            if (nextMission != null && (nextMission.Order == 1 || nextMission.Content.Contains("chào", StringComparison.OrdinalIgnoreCase) || nextMission.Content.Contains("giới thiệu", StringComparison.OrdinalIgnoreCase)))
            {
                if (lowerMsg.Contains("こんにちは") || lowerMsg.Contains("申します") || lowerMsg.Contains("です") || lowerMsg.Contains("学生") || lowerMsg.Contains("よろしく") || lowerMsg.Contains("名前"))
                {
                    completedIds.Add(nextMission.Id);
                }
                jaReply = "ご応募ありがとうございます。早速ですが、週に何日くらい、何曜日にシフトに入れますか？";
                fHtmlReply = "ご<ruby>応募<rt>おうぼ</rt></ruby>ありがとうございます。<ruby>早速<rt>さっそく</rt></ruby>ですが、<ruby>週<rt>しゅう</rt></ruby>に<ruby>何日<rt>なんにち</rt></ruby>くらい、<ruby>何曜日<rt>なんようび</rt></ruby>にシフトに<ruby>入<rt>はい</rt></ruby>れますか？";
                viMeaning = "Cảm ơn bạn đã ứng tuyển. Chúng ta bắt đầu nhé, một tuần bạn có thể làm việc khoảng mấy ngày và vào những thứ mấy?";
            }
            else if (nextMission != null && (nextMission.Order == 2 || nextMission.Content.Contains("ngày", StringComparison.OrdinalIgnoreCase) || nextMission.Content.Contains("tuần", StringComparison.OrdinalIgnoreCase) || nextMission.Content.Contains("ca", StringComparison.OrdinalIgnoreCase)))
            {
                if (lowerMsg.Contains("日") || lowerMsg.Contains("週") || lowerMsg.Contains("曜日") || lowerMsg.Contains("シフト") || lowerMsg.Contains("午後") || lowerMsg.Contains("午前") || lowerMsg.Contains("時間") || lowerMsg.Contains("月") || lowerMsg.Contains("火") || lowerMsg.Contains("水") || lowerMsg.Contains("木") || lowerMsg.Contains("金") || lowerMsg.Contains("土"))
                {
                    completedIds.Add(nextMission.Id);
                }
                jaReply = "承知いたしました。シフトの希望はよくわかりました。最後に、当店で働く意気込みや志望動機をお聞かせいただけますか？";
                fHtmlReply = "<ruby>承知<rt>しょうち</rt></ruby>いたしました。シフトの<ruby>希望<rt>きぼう</rt></ruby>はよくわかりました。<ruby>最後<rt>さいご</rt></ruby>に、<ruby>当店<rt>とうてん</rt></ruby>で<ruby>働<rt>はたら</rt></ruby>く<ruby>意気込<rt>いきご</rt></ruby>みや<ruby>志望動機<rt>しぼうどうき</rt></ruby>をお<ruby>聞<rt>き</rt></ruby>かせいただけますか？";
                viMeaning = "Tôi hiểu rồi. Nguyện vọng về ca làm việc rất rõ ràng. Cuối cùng, bạn có thể chia sẻ tinh thần làm việc hoặc động lực ứng tuyển vào quán được không?";
            }
            else if (nextMission != null)
            {
                if (lowerMsg.Contains("頑張") || lowerMsg.Contains("がんば") || lowerMsg.Contains("努力") || lowerMsg.Contains("一生懸命") || lowerMsg.Contains("ありがとう") || lowerMsg.Contains("よろしく") || lowerMsg.Contains("失礼"))
                {
                    completedIds.Add(nextMission.Id);
                }
                jaReply = "素晴らしい意気込みですね！本日は面接にお越しいただき、誠にありがとうございました。採用結果は3日以内にご連絡いたします。";
                fHtmlReply = "<ruby>素晴<rt>すば</rt></ruby>らしい<ruby>意気込<rt>いきご</rt></ruby>みですね！<ruby>本日<rt>ほんじつ</rt></ruby>は<ruby>面接<rt>めんせつ</rt></ruby>にお<ruby>越<rt>こ</rt></ruby>しいただき、<ruby>誠<rt>まこと</rt></ruby>にありがとうございました。<ruby>採用結果<rt>さいようけっか</rt></ruby>は3<ruby>日以内<rt>にちいない</rt></ruby>にご<ruby>連絡<rt>れんらく</rt></ruby>いたします。";
                viMeaning = "Tinh thần của bạn rất tuyệt vời! Cảm ơn bạn rất nhiều vì đã đến tham gia phỏng vấn hôm nay. Kết quả chúng tôi sẽ liên hệ trong vòng 3 ngày tới ạ.";
                isNaturallyConcluded = true;
            }
            else
            {
                jaReply = "本日の面接は終了となります。お疲れ様でした。";
                fHtmlReply = "<ruby>本日<rt>ほんじつ</rt></ruby>の<ruby>面接<rt>めんせつ</rt></ruby>は<ruby>終了<rt>しゅうりょう</rt></ruby>となります。お<ruby>疲<rt>つか</rt></ruby>れ<ruby>様<rt>さま</rt></ruby>でした。";
                viMeaning = "Buổi phỏng vấn hôm nay đến đây là kết thúc. Cảm ơn bạn đã vất vả.";
                isNaturallyConcluded = true;
            }
        }
        else if (isRamen)
        {
            var maxOrder = pendingMissions.Count > 0 ? pendingMissions.Max(m => m.Order) : 0;
            foreach (var m in pendingMissions)
            {
                var criteria = m.CompletionCriteriaJson.ToLower();
                if (criteria.Contains("order") || criteria.Contains("ramen") || criteria.Contains("gọi món"))
                {
                    if (lowerMsg.Contains("ラーメン") || lowerMsg.Contains("とんこつ") || lowerMsg.Contains("おねがい") || lowerMsg.Contains("ください") || lowerMsg.Contains("一杯") || lowerMsg.Contains("ひとつ"))
                    {
                        completedIds.Add(m.Id);
                        break;
                    }
                }
                else if (criteria.Contains("price") || criteria.Contains("giá"))
                {
                    if (lowerMsg.Contains("いくら") || lowerMsg.Contains("円") || lowerMsg.Contains("値段"))
                    {
                        completedIds.Add(m.Id);
                        break;
                    }
                }
                else if (criteria.Contains("thank") || criteria.Contains("goodbye") || criteria.Contains("cảm ơn") || criteria.Contains("tạm biệt") || criteria.Contains("thanh toán"))
                {
                    var hasEarlierIncomplete = pendingMissions.Any(pm => pm.Order < m.Order && !completedIds.Contains(pm.Id));
                    if (!hasEarlierIncomplete && (lowerMsg.Contains("ありがとう") || lowerMsg.Contains("ごちそう") || lowerMsg.Contains("失礼") || lowerMsg.Contains("さようなら") || lowerMsg.Contains("会計") || lowerMsg.Contains("お気をつけて")))
                    {
                        completedIds.Add(m.Id);
                        break;
                    }
                }
            }

            var hasPendingCore = pendingMissions.Any(pm => pm.Order < maxOrder && !completedIds.Contains(pm.Id));
            if (!hasPendingCore && (lowerMsg.Contains("ありがとう") || lowerMsg.Contains("ごちそう") || lowerMsg.Contains("失礼") || lowerMsg.Contains("会計") || lowerMsg.Contains("お気をつけて") || lowerMsg.Contains("さようなら")))
            {
                jaReply = "ありがとうございました！またのお越しをお待ちしております。";
                fHtmlReply = "ありがとうございました！またのお<ruby>越<rt>こ</rt></ruby>しをお<ruby>待<rt>ま</rt></ruby>ちしております。";
                viMeaning = "Cảm ơn quý khách rất nhiều! Hẹn gặp lại quý khách lần sau ạ.";
                isNaturallyConcluded = true;
            }
            else if (lowerMsg.Contains("いくら") || lowerMsg.Contains("値段"))
            {
                jaReply = "とんこつラーメンは一杯850円でございます。";
                fHtmlReply = "<ruby>豚骨<rt>とんこつ</rt></ruby>ラーメンは<ruby>一杯<rt>いっぱい</rt></ruby>850<ruby>円<rt>えん</rt></ruby>でございます。";
                viMeaning = "Dạ một bát Tonkotsu Ramen có giá là 850 yên ạ.";
            }
            else if (lowerMsg.Contains("ラーメン") || lowerMsg.Contains("とんこつ") || lowerMsg.Contains("注文"))
            {
                jaReply = "かしこまりました！とんこつラーメン一杯ですね。少々お待ちください。他にご注文はございますか？";
                fHtmlReply = "かしこまりました！<ruby>豚骨<rt>とんこつ</rt></ruby>ラーメン<ruby>一杯<rt>いっぱい</rt></ruby>ですね。<ruby>少々<rt>しょうしょう</rt></ruby>お<ruby>待<rt>ま</rt></ruby>ちください。<ruby>他<rt>ほか</rt></ruby>にご<ruby>注文<rt>ちゅうもん</rt></ruby>はございますか？";
                viMeaning = "Dạ tôi đã rõ! Một bát Tonkotsu Ramen đúng không ạ. Xin quý khách vui lòng đợi một lát. Quý khách còn muốn gọi thêm gì nữa không ạ?";
            }
            else
            {
                jaReply = "はい、かしこまりました。他にご要望がございましたらお申し付けください。";
                fHtmlReply = "はい、かしこまりました。<ruby>他<rt>ほか</rt></ruby>にご<ruby>要望<rt>ようぼう</rt></ruby>がございましたらお<ruby>申<rt>もう</rt></ruby>し<ruby>付<rt>つ</rt></ruby>けください。";
                viMeaning = "Dạ vâng tôi đã hiểu. Nếu quý khách có thêm yêu cầu gì xin vui lòng cứ bảo tôi nhé.";
            }
        }
        else
        {
            var nextMission = pendingMissions.OrderBy(m => m.Order).FirstOrDefault();
            if (nextMission != null)
            {
                var criteria = (nextMission.CompletionCriteriaJson + " " + nextMission.Content).ToLowerInvariant();
                var isMatched = false;
                if (criteria.Contains("chào") || criteria.Contains("greet") || criteria.Contains("intro") || criteria.Contains("giới thiệu"))
                {
                    isMatched = lowerMsg.Contains("こんにちは") || lowerMsg.Contains("はじめまして") || lowerMsg.Contains("よろしく") || lowerMsg.Contains("です") || lowerMsg.Contains("申します");
                }
                else if (criteria.Contains("hỏi") || criteria.Contains("ask") || criteria.Contains("price") || criteria.Contains("giá") || criteria.Contains("hướng") || criteria.Contains("điểm đến"))
                {
                    isMatched = lowerMsg.Contains("ですか") || lowerMsg.Contains("いくら") || lowerMsg.Contains("どこ") || lowerMsg.Contains("なん") || lowerMsg.Contains("どちら");
                }
                else if (criteria.Contains("thank") || criteria.Contains("cảm ơn") || criteria.Contains("bye") || criteria.Contains("tạm biệt") || criteria.Contains("kết thúc"))
                {
                    isMatched = lowerMsg.Contains("ありがとう") || lowerMsg.Contains("失礼") || lowerMsg.Contains("さようなら") || lowerMsg.Contains("お気をつけて") || lowerMsg.Contains("気をつけて") || lowerMsg.Contains("お大事に") || lowerMsg.Contains("どういたしまして") || lowerMsg.Contains("お帰り") || lowerMsg.Contains("では");
                }
                else if (criteria.Contains("giúp") || criteria.Contains("help") || criteria.Contains("hỗ trợ"))
                {
                    isMatched = lowerMsg.Contains("手伝") || lowerMsg.Contains("助け") || lowerMsg.Contains("一緒") || lowerMsg.Contains("渡") || lowerMsg.Contains("大丈夫") || lowerMsg.Contains("喜んで");
                }
                else
                {
                    isMatched = Regex.IsMatch(userMessage, @"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]") && userMessage.Trim().Length >= 4;
                }

                if (isMatched)
                {
                    completedIds.Add(nextMission.Id);
                }
            }

            var remainingMissionsCount = pendingMissions.Count - completedIds.Count;
            if (remainingMissionsCount <= 0 && completedIds.Count > 0)
            {
                jaReply = "丁寧にご対応いただき、誠にありがとうございました。本日の練習はこれで終了です。大変よくできました！";
                fHtmlReply = "<ruby>丁寧<rt>ていねい</rt></ruby>にご<ruby>対応<rt>たいおう</rt></ruby>いただき、<ruby>誠<rt>まこと</rt></ruby>にありがとうございました。<ruby>本日<rt>ほんじつ</rt></ruby>の<ruby>練習<rt>れんしゅう</rt></ruby>はこれで<ruby>終了<rt>しゅうりょう</rt></ruby>です。<ruby>大変<rt>たいへん</rt></ruby>よくできました！";
                viMeaning = "Cảm ơn bạn rất nhiều vì đã trao đổi rất chu đáo và lịch sự. Bài luyện tập hôm nay đến đây là hoàn thành xuất sắc!";
                isNaturallyConcluded = true;
            }
            else
            {
                jaReply = "はい、承知いたしました。続けて会話を進めましょう。";
                fHtmlReply = "はい、<ruby>承知<rt>しょうち</rt></ruby>いたしました。<ruby>続<rt>つづ</rt></ruby>けて<ruby>会話<rt>かいわ</rt></ruby>を<ruby>進<rt>すす</rt></ruby>めましょう。";
                viMeaning = "Vâng, tôi đã hiểu rõ. Chúng ta cùng tiếp tục câu chuyện nhé.";
            }
        }

        var userViMeaning = TranslateUserUtteranceHeuristic(userMessage, scenarioTitle, persona);

        var naturalAlt = userMessage;
        if (isElderlyHelp && lowerMsg.Contains("いいえ") && lowerMsg.Contains("どういたしまして"))
        {
            naturalAlt = "いえいえ、どういたしまして。お気をつけてお帰りくださいね。";
        }

        var feedback = new LinguisticFeedbackDto
        {
            EvaluationSource = "Simulator",
            Status = "Good",
            Summary = "Phản xạ tự nhiên • Đúng ngữ cảnh",
            Details = new List<LinguisticDetailItemDto>
            {
                new() { Type = "success", Aspect = "Ngữ cảnh", Comment = $"Câu trả lời rất tự nhiên và phù hợp với tình huống đối thoại cùng {persona}." },
                new() { Type = "success", Aspect = "Văn phong", Comment = $"Sử dụng thể lịch sự chuẩn mực, thể hiện thái độ chu đáo và lễ phép." },
                new() { Type = "success", Aspect = "Từ vựng & Trợ từ", Comment = "Sử dụng từ vựng chính xác, cấu trúc câu gãy gọn rõ ràng." }
            },
            NaturalAlternative = naturalAlt,
            CulturalTip = isElderlyHelp
                ? "Khi giao tiếp và giúp đỡ người lớn tuổi ở Nhật, việc dùng ngữ điệu ấm áp kèm các lời chúc như 'お気をつけて' (chúc đi cẩn thận) hoặc 'お大事に' (chúc giữ gìn sức khỏe) thể hiện tinh thần Omotenashi và lễ nghĩa rất cao."
                : isBaito
                ? "Trong phỏng vấn xin việc ở Nhật, luôn dùng thể lịch sự desu/masu và giữ ánh mắt tự tin, mỉm cười nhẹ khi trả lời."
                : isRamen
                ? "Tại các quán ăn Nhật, khi gọi món nên dùng ください hoặc お願いします để thể hiện sự lịch thiệp."
                : "Trong giao tiếp thường ngày, sử dụng câu ngắn gọn, rõ ràng sẽ giúp đối phương dễ nắm bắt ý hơn."
        };

        return new AiTurnResult
        {
            JapaneseReply = jaReply,
            FuriganaHtml = fHtmlReply,
            VietnameseMeaning = viMeaning,
            UserVietnameseMeaning = userViMeaning,
            CompletedMissionIds = completedIds,
            IsNaturallyConcluded = isNaturallyConcluded,
            LinguisticFeedback = feedback
        };
    }

    private static RoleplayHintDto GenerateSimulatorHint(
        ScenarioLevelConfiguration levelConfig,
        List<Mission> pendingMissions)
    {
        var title = levelConfig?.Scenario?.Title ?? "";
        var persona = levelConfig?.AiPersona ?? "";
        bool isElderly = title.Contains("cụ già", StringComparison.OrdinalIgnoreCase) ||
                         title.Contains("người già", StringComparison.OrdinalIgnoreCase) ||
                         title.Contains("băng qua đường", StringComparison.OrdinalIgnoreCase) ||
                         persona.Contains("お年寄り", StringComparison.OrdinalIgnoreCase) ||
                         persona.Contains("cụ già", StringComparison.OrdinalIgnoreCase);

        var nextMission = pendingMissions.OrderBy(m => m.Order).FirstOrDefault();
        if (nextMission != null)
        {
            var criteria = (nextMission.CompletionCriteriaJson + " " + nextMission.Content).ToLowerInvariant();

            if (isElderly)
            {
                if (criteria.Contains("giúp") || criteria.Contains("help") || criteria.Contains("đề nghị"))
                {
                    return new RoleplayHintDto
                    {
                        JapaneseSuggestion = "はい、喜んでお手伝いします。一緒に渡りましょう。",
                        RomajiOrReading = "Hai, yorokonde otetsudai shimasu. Issho ni watarimashou.",
                        VietnameseMeaning = "Vâng, tôi rất sẵn lòng giúp đỡ. Chúng ta cùng sang đường nhé.",
                        ContextExplanation = "Cách đề nghị giúp đỡ nhiệt tình và lịch sự với người lớn tuổi."
                    };
                }
                if (criteria.Contains("hướng") || criteria.Contains("điểm đến") || criteria.Contains("direction"))
                {
                    return new RoleplayHintDto
                    {
                        JapaneseSuggestion = "どちらまで行かれますか。お手伝いしましょうか。",
                        RomajiOrReading = "Dochira made ikaremasu ka. Otetsudai shimashou ka.",
                        VietnameseMeaning = "Cụ định đi đến đâu vậy ạ? Để cháu giúp cụ nhé.",
                        ContextExplanation = "Hỏi điểm đến bằng kính ngữ tôn kính (ikaremasu ka)."
                    };
                }
                if (criteria.Contains("tạm biệt") || criteria.Contains("kết thúc") || criteria.Contains("cảm ơn"))
                {
                    return new RoleplayHintDto
                    {
                        JapaneseSuggestion = "いいえ、どういたしまして。お気をつけてお大事に。",
                        RomajiOrReading = "Iie, dou itashimashite. O ki wo tsukete odaiji ni.",
                        VietnameseMeaning = "Dạ không có gì đâu ạ. Chúc cụ đi cẩn thận và giữ gìn sức khỏe nhé.",
                        ContextExplanation = "Lời đáp lại lời cảm ơn và lời chúc lễ phép, ấm áp dành cho người già."
                    };
                }
            }

            if (criteria.Contains("price") || criteria.Contains("giá"))
            {
                return new RoleplayHintDto
                {
                    JapaneseSuggestion = "すみません、これはいくらですか？",
                    RomajiOrReading = "Sumimasen, kore wa ikura desu ka?",
                    VietnameseMeaning = "Xin lỗi, món này bao nhiêu tiền ạ?",
                    ContextExplanation = "Hỏi giá tiền một cách lịch sự bằng thể Desu ka."
                };
            }

            if (criteria.Contains("thank") || criteria.Contains("cảm ơn") || criteria.Contains("tạm biệt") || criteria.Contains("kết thúc"))
            {
                return new RoleplayHintDto
                {
                    JapaneseSuggestion = "どうもありがとうございました。失礼いたします。",
                    RomajiOrReading = "Doumo arigatou gozaimashita. Shitsurei itashimasu.",
                    VietnameseMeaning = "Cảm ơn bạn rất nhiều. Tôi xin phép chào bạn ạ.",
                    ContextExplanation = "Lời chào tạm biệt và cảm ơn chuẩn mực trong giao tiếp tiếng Nhật."
                };
            }
        }

        return new RoleplayHintDto
        {
            JapaneseSuggestion = "はい、わかりました。よろしくお願いします。",
            RomajiOrReading = "Hai, wakarimashita. Yoroshiku onegaishimasu.",
            VietnameseMeaning = "Vâng, tôi đã hiểu rõ. Rất mong được hợp tác.",
            ContextExplanation = "Mẫu câu hồi đáp đồng ý và hợp tác lịch sự."
        };
    }
}
