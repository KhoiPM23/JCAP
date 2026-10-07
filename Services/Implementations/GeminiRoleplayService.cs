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
        var hasKey = !string.IsNullOrWhiteSpace(_configuration["GroqCloud:ApiKey"]) || !string.IsNullOrWhiteSpace(_configuration["Gemini:ApiKey"]);

        if (!hasKey)
        {
            _logger.LogInformation("Chưa cấu hình API Key (GroqCloud / Gemini). Sử dụng Simulator cho câu mở đầu.");
            return GenerateSimulatorOpeningMessage(scenario, levelConfig);
        }

        try
        {
            var systemPrompt = BuildSystemInstruction(scenario, levelConfig);
            var userPrompt = @"Start the conversation as your persona with an appropriate opening line.
Return strictly pure JSON matching:
{
  ""replyJapanese"": ""Opening greeting in Japanese suitable for the persona and context"",
  ""replyVietnamese"": ""Natural translation in Vietnamese""
}";

            var jsonResponse = await CallAiAsync(systemPrompt, userPrompt, cancellationToken);
            if (!string.IsNullOrWhiteSpace(jsonResponse))
            {
                using var doc = JsonDocument.Parse(jsonResponse);
                var root = doc.RootElement;
                var ja = root.TryGetProperty("replyJapanese", out var jaProp) ? jaProp.GetString() ?? "" : "";
                var vi = root.TryGetProperty("replyVietnamese", out var viProp) ? viProp.GetString() ?? "" : "";

                if (!string.IsNullOrWhiteSpace(ja))
                {
                    return new AiOpeningMessageResult
                    {
                        JapaneseText = ja.Trim(),
                        VietnameseMeaning = vi.Trim()
                    };
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Lỗi khi gọi AI API cho câu mở đầu. Tự động chuyển sang Simulator.");
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
        var hasKey = !string.IsNullOrWhiteSpace(_configuration["GroqCloud:ApiKey"]) || !string.IsNullOrWhiteSpace(_configuration["Gemini:ApiKey"]);

        if (!hasKey)
        {
            _logger.LogInformation("Chưa cấu hình API Key (GroqCloud / Gemini). Sử dụng Simulator cho lượt đối thoại.");
            return ProcessSimulatorTurn(scenario, levelConfig, userMessage, pendingMissions);
        }

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
   - replyVietnamese: Natural translation in Vietnamese.
   - completedMissionIds: Array of Mission IDs satisfied in a contextually appropriate manner:
     * On open-ended cues (e.g. ""Anything else?""), the learner is FREE to initiate ANY pending mission.
     * Only reject if the learner blatantly ignores a specific direct question (steer them back in replyJapanese). Return [] if none.
   - isNaturallyConcluded: Boolean (true if the conversation naturally ends, e.g. transaction finished, farewell exchanged).
   - linguisticFeedback: Linguistic evaluation of the learner's utterance (MUST write all explanations/comments in Vietnamese):
     * status: ""Good"" | ""Warning"" | ""Error""
     * summary: Short Vietnamese summary (e.g. ""Rất tốt • Đúng ngữ cảnh"")
     * details: Array of items:
       - type: ""success"" | ""warning"" | ""error""
       - aspect: Aspect in Vietnamese (""Ngữ cảnh"" | ""Trợ từ"" | ""Văn phong"" | ""Từ vựng"")
       - comment: Specific constructive feedback in Vietnamese
       - For every normal Japanese utterance, include at least one grammar-related item
         (""Ngữ pháp"", ""Trợ từ"", ""Cấu trúc"" or ""Chia động từ""), one ""Từ vựng""
         item, and one communication-impression item (""Ngữ cảnh"", ""Văn phong"" or ""Lịch sự"").
       - Positive usage MUST be recorded as type ""success""; do not return only mistakes.
     * naturalAlternative: More natural native phrasing in Japanese (or null if already natural)
     * culturalTip: Relevant practical cultural tip in Vietnamese

Return strictly pure JSON matching this schema:
{{
  ""replyJapanese"": ""..."",
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

            var jsonResponse = await CallAiAsync(systemPrompt, userPrompt, cancellationToken);
            if (!string.IsNullOrWhiteSpace(jsonResponse))
            {
                using var doc = JsonDocument.Parse(jsonResponse);
                var root = doc.RootElement;
                var ja = root.TryGetProperty("replyJapanese", out var jaProp) ? jaProp.GetString() ?? "" : "";
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
                        VietnameseMeaning = vi.Trim(),
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
        var hasKey = !string.IsNullOrWhiteSpace(_configuration["GroqCloud:ApiKey"]) || !string.IsNullOrWhiteSpace(_configuration["Gemini:ApiKey"]);

        if (!hasKey)
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

            var jsonResponse = await CallAiAsync(systemPrompt, userPrompt, cancellationToken);
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
            _logger.LogWarning(ex, "Lỗi khi gọi AI API cho gợi ý câu tiếp theo. Tự động chuyển sang Simulator.");
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

    private async Task<string> CallAiAsync(
        string systemPrompt,
        string userPrompt,
        CancellationToken cancellationToken)
    {
        var groqKey = _configuration["GroqCloud:ApiKey"];
        var groqModel = _configuration["GroqCloud:Model"] ?? "llama-3.3-70b-versatile";

        if (!string.IsNullOrWhiteSpace(groqKey))
        {
            try
            {
                var groqResult = await CallGroqAsync(groqKey, groqModel, systemPrompt, userPrompt, cancellationToken);
                if (!string.IsNullOrWhiteSpace(groqResult))
                {
                    return groqResult;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Gọi GroqCloud API thất bại, chuyển sang Gemini nếu có.");
            }
        }

        var geminiKey = _configuration["Gemini:ApiKey"];
        var geminiModel = _configuration["Gemini:Model"] ?? "gemini-3.1-flash-lite";

        if (!string.IsNullOrWhiteSpace(geminiKey))
        {
            return await CallGeminiAsync(geminiKey, geminiModel, systemPrompt, userPrompt, cancellationToken);
        }

        throw new InvalidOperationException("Không tìm thấy cấu hình API Key hợp lệ cho GroqCloud hoặc Gemini.");
    }

    private async Task<string> CallGroqAsync(
        string apiKey,
        string model,
        string systemPrompt,
        string userPrompt,
        CancellationToken cancellationToken)
    {
        var endpoint = "https://api.groq.com/openai/v1/chat/completions";

        var requestBody = new
        {
            model = model,
            messages = new[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userPrompt }
            },
            response_format = new { type = "json_object" },
            temperature = 0.6,
            max_tokens = 1500
        };

        var json = JsonSerializer.Serialize(requestBody, JsonOptions);
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _httpClient.SendAsync(request, cancellationToken);
        var responseString = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("GroqCloud API error ({StatusCode}): {Response}", response.StatusCode, responseString);
            throw new HttpRequestException($"GroqCloud API error ({response.StatusCode}): {responseString}");
        }

        using var doc = JsonDocument.Parse(responseString);
        var choices = doc.RootElement.GetProperty("choices");
        if (choices.GetArrayLength() > 0)
        {
            var content = choices[0].GetProperty("message").GetProperty("content").GetString();
            return content ?? string.Empty;
        }

        return string.Empty;
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
    // ==========================================
    private static AiOpeningMessageResult GenerateSimulatorOpeningMessage(Scenario scenario, ScenarioLevelConfiguration levelConfig)
    {
        if (scenario.Title.Contains("Ramen", StringComparison.OrdinalIgnoreCase))
        {
            return new AiOpeningMessageResult
            {
                JapaneseText = "いらっしゃいませ！何名様ですか？",
                VietnameseMeaning = "Kính chào quý khách! Quý khách đi mấy người ạ?"
            };
        }

        if (scenario.Title.Contains("tàu", StringComparison.OrdinalIgnoreCase) || scenario.Title.Contains("Shinjuku", StringComparison.OrdinalIgnoreCase))
        {
            return new AiOpeningMessageResult
            {
                JapaneseText = "はい、こちらは駅員室です。どうなさいましたか？",
                VietnameseMeaning = "Vâng, đây là phòng trực ga. Tôi có thể giúp gì cho quý khách?"
            };
        }

        return new AiOpeningMessageResult
        {
            JapaneseText = $"こんにちは。本日の{scenario.Title}を始めましょう。よろしくお願いします。",
            VietnameseMeaning = $"Xin chào. Chúng ta hãy bắt đầu bài luyện tập {scenario.Title}. Rất mong được hợp tác."
        };
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
        bool isBaito = scenarioTitle.Contains("baito", StringComparison.OrdinalIgnoreCase) ||
                       scenarioTitle.Contains("phỏng vấn", StringComparison.OrdinalIgnoreCase) ||
                       scenarioTitle.Contains("xin việc", StringComparison.OrdinalIgnoreCase);
        bool isRamen = scenarioTitle.Contains("ramen", StringComparison.OrdinalIgnoreCase) ||
                       scenarioTitle.Contains("quán", StringComparison.OrdinalIgnoreCase) ||
                       scenarioTitle.Contains("ăn", StringComparison.OrdinalIgnoreCase);

        string jaReply;
        string viMeaning;
        var isNaturallyConcluded = false;

        if (isBaito)
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
                viMeaning = "Cảm ơn bạn đã ứng tuyển. Chúng ta bắt đầu nhé, một tuần bạn có thể làm việc khoảng mấy ngày và vào những thứ mấy?";
            }
            else if (nextMission != null && (nextMission.Order == 2 || nextMission.Content.Contains("ngày", StringComparison.OrdinalIgnoreCase) || nextMission.Content.Contains("tuần", StringComparison.OrdinalIgnoreCase) || nextMission.Content.Contains("ca", StringComparison.OrdinalIgnoreCase)))
            {
                if (lowerMsg.Contains("日") || lowerMsg.Contains("週") || lowerMsg.Contains("曜日") || lowerMsg.Contains("シフト") || lowerMsg.Contains("午後") || lowerMsg.Contains("午前") || lowerMsg.Contains("時間") || lowerMsg.Contains("月") || lowerMsg.Contains("火") || lowerMsg.Contains("水") || lowerMsg.Contains("木") || lowerMsg.Contains("金") || lowerMsg.Contains("土"))
                {
                    completedIds.Add(nextMission.Id);
                }
                jaReply = "承知いたしました。シフトの希望はよくわかりました。最後に、当店で働く意気込みや志望動機をお聞かせいただけますか？";
                viMeaning = "Tôi hiểu rồi. Nguyện vọng về ca làm việc rất rõ ràng. Cuối cùng, bạn có thể chia sẻ tinh thần làm việc hoặc động lực ứng tuyển vào quán được không?";
            }
            else if (nextMission != null)
            {
                if (lowerMsg.Contains("頑張") || lowerMsg.Contains("がんば") || lowerMsg.Contains("努力") || lowerMsg.Contains("一生懸命") || lowerMsg.Contains("ありがとう") || lowerMsg.Contains("よろしく") || lowerMsg.Contains("失礼"))
                {
                    completedIds.Add(nextMission.Id);
                }
                jaReply = "素晴らしい意気込みですね！本日は面接にお越しいただき、誠にありがとうございました。採用結果は3日以内にご連絡いたします。";
                viMeaning = "Tinh thần của bạn rất tuyệt vời! Cảm ơn bạn rất nhiều vì đã đến tham gia phỏng vấn hôm nay. Kết quả chúng tôi sẽ liên hệ trong vòng 3 ngày tới ạ.";
                isNaturallyConcluded = true;
            }
            else
            {
                jaReply = "本日の面接は終了となります。お疲れ様でした。";
                viMeaning = "Buổi phỏng vấn hôm nay đến đây là kết thúc. Cảm ơn bạn đã vất vả.";
                isNaturallyConcluded = true;
            }
        }
        else if (isRamen)
        {
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
                    if (lowerMsg.Contains("ありがとう") || lowerMsg.Contains("ごちそう") || lowerMsg.Contains("失礼") || lowerMsg.Contains("さようなら") || lowerMsg.Contains("会計"))
                    {
                        completedIds.Add(m.Id);
                        break;
                    }
                }
            }

            if (lowerMsg.Contains("ありがとう") || lowerMsg.Contains("ごちそう") || lowerMsg.Contains("失礼") || lowerMsg.Contains("会計"))
            {
                jaReply = "ありがとうございました！またのお越しをお待ちしております。";
                viMeaning = "Cảm ơn quý khách rất nhiều! Hẹn gặp lại quý khách lần sau ạ.";
                isNaturallyConcluded = true;
            }
            else if (lowerMsg.Contains("いくら") || lowerMsg.Contains("値段"))
            {
                jaReply = "とんこつラーメンは一杯850円でございます。";
                viMeaning = "Dạ một bát Tonkotsu Ramen có giá là 850 yên ạ.";
            }
            else if (lowerMsg.Contains("ラーメン") || lowerMsg.Contains("とんこつ") || lowerMsg.Contains("注文"))
            {
                jaReply = "かしこまりました！とんこつラーメン一杯ですね。少々お待ちください。他にご注文はございますか？";
                viMeaning = "Dạ tôi đã rõ! Một bát Tonkotsu Ramen đúng không ạ. Xin quý khách vui lòng đợi một lát. Quý khách còn muốn gọi thêm gì nữa không ạ?";
            }
            else
            {
                jaReply = "はい、かしこまりました。ご注文がお決まりになりましたらお呼びください。";
                viMeaning = "Dạ vâng, khi nào quý khách chọn xong món xin vui lòng gọi tôi nhé.";
            }
        }
        else
        {
            var nextMission = pendingMissions.OrderBy(m => m.Order).FirstOrDefault();
            if (nextMission != null && userMessage.Trim().Length >= 6)
            {
                completedIds.Add(nextMission.Id);
            }

            if (pendingMissions.Count <= 1)
            {
                jaReply = "よく分かりました。本日の練習はこれで終了です。大変よくできました！";
                viMeaning = "Tôi đã hiểu rõ. Buổi luyện tập hôm nay đến đây là kết thúc. Bạn đã làm rất tốt!";
                isNaturallyConcluded = true;
            }
            else
            {
                jaReply = "はい、承知いたしました。続けて次の会話を進めましょう。";
                viMeaning = "Vâng, tôi đã hiểu. Chúng ta cùng tiếp tục câu chuyện nhé.";
            }
        }

        var feedback = new LinguisticFeedbackDto
        {
            EvaluationSource = "Simulator",
            Status = "Good",
            Summary = "Phản xạ tự nhiên • Đúng ngữ cảnh",
            Details = new List<LinguisticDetailItemDto>
            {
                new() { Type = "success", Aspect = "Ngữ cảnh", Comment = "Câu trả lời phù hợp với tình huống giao tiếp." },
                new() { Type = "success", Aspect = "Văn phong", Comment = $"Sử dụng thể lịch sự phù hợp với trình độ {levelConfig.JLPTLevel}." }
            },
            NaturalAlternative = userMessage,
            CulturalTip = isBaito
                ? "Trong phỏng vấn xin việc ở Nhật, luôn dùng thể lịch sự desu/masu và giữ ánh mắt tự tin, mỉm cười nhẹ khi trả lời."
                : "Trong giao tiếp thường ngày, sử dụng câu ngắn gọn, rõ ràng sẽ giúp đối phương dễ nắm bắt ý hơn."
        };

        return new AiTurnResult
        {
            JapaneseReply = jaReply,
            VietnameseMeaning = viMeaning,
            CompletedMissionIds = completedIds,
            IsNaturallyConcluded = isNaturallyConcluded,
            LinguisticFeedback = feedback
        };
    }

    private static RoleplayHintDto GenerateSimulatorHint(
        ScenarioLevelConfiguration levelConfig,
        List<Mission> pendingMissions)
    {
        var nextMission = pendingMissions.OrderBy(m => m.Order).FirstOrDefault();
        if (nextMission != null)
        {
            var criteria = nextMission.CompletionCriteriaJson.ToLower();
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

            if (criteria.Contains("thank") || criteria.Contains("cảm ơn"))
            {
                return new RoleplayHintDto
                {
                    JapaneseSuggestion = "ごちそうさまでした。美味しかったです！",
                    RomajiOrReading = "Gochisousama deshita. Oishikatta desu!",
                    VietnameseMeaning = "Cảm ơn vì bữa ăn. Món ăn rất ngon ạ!",
                    ContextExplanation = "Câu chào cảm ơn truyền thống của người Nhật khi ăn xong tại quán ăn."
                };
            }
        }

        return new RoleplayHintDto
        {
            JapaneseSuggestion = "とんこつラーメンを一つお願いします。",
            RomajiOrReading = "Tonkotsu raamen o hitotsu onegaishimasu.",
            VietnameseMeaning = "Làm ơn cho tôi một bát mì Tonkotsu Ramen.",
            ContextExplanation = "Mẫu câu gọi món cơ bản và lịch sự trong tiếng Nhật N5."
        };
    }
}
