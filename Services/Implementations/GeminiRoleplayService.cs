using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
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
        var model = _configuration["Gemini:Model"] ?? "gemini-3.8-flash";

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogInformation("Gemini ApiKey chưa được cấu hình. Sử dụng Simulator cho câu mở đầu.");
            return GenerateSimulatorOpeningMessage(scenario, levelConfig);
        }

        try
        {
            var systemPrompt = BuildSystemInstruction(scenario, levelConfig);
            var userPrompt = @"Bạn hãy đóng vai nhân vật và nói câu mở đầu để bắt đầu cuộc trò chuyện với người học.
Trả về định dạng JSON thuần túy theo cấu trúc:
{
  ""replyJapanese"": ""Câu chào mở đầu bằng tiếng Nhật phù hợp với bối cảnh và persona"",
  ""replyVietnamese"": ""Dịch nghĩa tiếng Việt của câu chào""
}";

            var jsonResponse = await CallGeminiAsync(apiKey, model, systemPrompt, userPrompt, cancellationToken);
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
        var model = _configuration["Gemini:Model"] ?? "gemini-3.8-flash";

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogInformation("Gemini ApiKey chưa được cấu hình. Sử dụng Simulator cho lượt đối thoại.");
            return ProcessSimulatorTurn(levelConfig, userMessage, pendingMissions);
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

            var userPrompt = $@"Lịch sử hội thoại gần nhất:
{sbHistory}

Câu nói vừa rồi của người học:
""{userMessage}""

Danh sách các nhiệm vụ CHƯA hoàn thành:
{missionsDescription}

Yêu cầu phân tích và trả về:
1. replyJapanese: Câu thoại tiếp theo của bạn (đóng vai AI Persona, giữ đúng trình độ JLPT {levelConfig.JLPTLevel}).
2. replyVietnamese: Bản dịch tiếng Việt tự nhiên của câu thoại đó.
3. completedMissionIds: Mảng chứa các ID của mission mà câu nói của học viên đã thỏa mãn tiêu chí hoàn thành (nếu không có thì trả về mảng rỗng []).
4. isNaturallyConcluded: true nếu câu thoại này kết thúc tự nhiên tình huống (ví dụ: đã xong việc mua hàng, đã chào tạm biệt, đã giải quyết xong mục tiêu), ngược lại false.
5. linguisticFeedback: Đánh giá cách dùng từ và ngữ pháp của câu nói người học vừa gửi:
   - status: ""Good"" (chuẩn xác), ""Warning"" (cần điều chỉnh nhỏ/sai trợ từ khẩu ngữ), ""Error"" (sai cấu trúc nặng).
   - summary: Tóm tắt đánh giá (ví dụ: ""Khá tốt • Cần điều chỉnh nhỏ"").
   - details: Mảng các mục phân tích:
     - type: ""success"" | ""warning"" | ""error""
     - aspect: Tên khía cạnh (""Ngữ cảnh"", ""Trợ từ"", ""Văn phong"", ""Từ vựng"")
     - comment: Lời nhận xét
   - naturalAlternative: Câu nói tự nhiên hơn của người bản xứ (nếu có).
   - culturalTip: Mẹo văn hóa thực tế của người Nhật trong tình huống này.

Trả về JSON thuần túy theo cấu trúc:
{{
  ""replyJapanese"": ""..."",
  ""replyVietnamese"": ""..."",
  ""completedMissionIds"": [1, 2],
  ""isNaturallyConcluded"": false,
  ""linguisticFeedback"": {{
    ""status"": ""Good"",
    ""summary"": ""Rất tốt • Chuẩn ngữ cảnh"",
    ""details"": [
      {{ ""type"": ""success"", ""aspect"": ""Ngữ cảnh"", ""comment"": ""Đáp ứng đúng bối cảnh hội thoại."" }}
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

        return ProcessSimulatorTurn(levelConfig, userMessage, pendingMissions);
    }

    public async Task<RoleplayHintDto> GenerateHintAsync(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        List<RoleplayMessage> conversationHistory,
        List<Mission> pendingMissions,
        CancellationToken cancellationToken = default)
    {
        var apiKey = _configuration["Gemini:ApiKey"];
        var model = _configuration["Gemini:Model"] ?? "gemini-3.8-flash";

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return GenerateSimulatorHint(levelConfig, pendingMissions);
        }

        try
        {
            var systemPrompt = $"Bạn là trợ lý học tiếng Nhật giúp học viên gợi ý câu trả lời tiếp theo trong tình huống hội thoại cấp độ {levelConfig.JLPTLevel}.";

            var nextMission = pendingMissions.OrderBy(m => m.Order).FirstOrDefault();
            var targetMissionText = nextMission != null
                ? $"Nhiệm vụ cần đạt tiếp theo: {nextMission.Content}"
                : "Tất cả nhiệm vụ đã xong, gợi ý câu chào kết thúc hoặc xác nhận.";

            var lastAiMessage = conversationHistory.LastOrDefault(m => m.Sender == "Ai")?.JapaneseText ?? "";

            var userPrompt = $@"Tình huống: {scenario.Title} ({levelConfig.JLPTLevel})
Câu vừa rồi của nhân vật AI: ""{lastAiMessage}""
{targetMissionText}

Hãy gợi ý cho học viên 1 câu tiếng Nhật tự nhiên, đúng ngữ pháp cấp độ {levelConfig.JLPTLevel} để phản hồi lại.
Trả về JSON thuần túy theo mẫu:
{{
  ""japaneseSuggestion"": ""Câu tiếng Nhật mẫu"",
  ""romajiOrReading"": ""Cách đọc Romaji hoặc Hiragana"",
  ""vietnameseMeaning"": ""Ý nghĩa tiếng Việt"",
  ""contextExplanation"": ""Giải thích ngắn gọn ngữ cảnh dùng câu này""
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
        var sb = new StringBuilder();
        sb.AppendLine($"Bạn đang tham gia vào nền tảng luyện nói tiếng Nhật JCAP.");
        sb.AppendLine($"Vai của bạn: {levelConfig.AiPersona}.");
        sb.AppendLine($"Trình độ JLPT mục tiêu của học viên: {levelConfig.JLPTLevel}.");
        sb.AppendLine($"Bối cảnh tình huống: {scenario.Title} - {levelConfig.Description}.");
        sb.AppendLine($"Quy tắc quan trọng (Guardrails):");
        sb.AppendLine($"- Luôn giữ vai một cách tự nhiên và chân thực, tuyệt đối không được phá vỡ vai nhân vật.");
        sb.AppendLine($"- Sử dụng từ ngữ và cấu trúc ngữ pháp phù hợp với cấp độ {levelConfig.JLPTLevel}.");
        sb.AppendLine($"- Trả lời súc tích, ngắn gọn (1 - 2 câu) như một cuộc trò chuyện trực tiếp ngoài đời thực.");
        sb.AppendLine($"- Luôn trả về định dạng JSON thuần túy theo yêu cầu.");
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
        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        using var response = await _httpClient.PostAsync(endpoint, content, cancellationToken);
        var responseString = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Gemini API trả về lỗi status {StatusCode}: {Response}", response.StatusCode, responseString);
            throw new HttpRequestException($"Gemini API error ({response.StatusCode}): {responseString}");
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
        ScenarioLevelConfiguration levelConfig,
        string userMessage,
        List<Mission> pendingMissions)
    {
        var completedIds = new List<int>();
        var lowerMsg = userMessage.ToLower();

        // 1. Phân tích hoàn thành mission theo từ khóa thực tế
        foreach (var m in pendingMissions)
        {
            var criteria = m.CompletionCriteriaJson.ToLower();
            if (criteria.Contains("order") || criteria.Contains("ramen") || criteria.Contains("gọi món"))
            {
                if (lowerMsg.Contains("ラーメン") || lowerMsg.Contains("とんこつ") || lowerMsg.Contains("おねがい") || lowerMsg.Contains("ください") || lowerMsg.Contains("一杯") || lowerMsg.Contains("ひとつ"))
                {
                    completedIds.Add(m.Id);
                }
            }
            else if (criteria.Contains("price") || criteria.Contains("giá"))
            {
                if (lowerMsg.Contains("いくら") || lowerMsg.Contains("円") || lowerMsg.Contains("値段"))
                {
                    completedIds.Add(m.Id);
                }
            }
            else if (criteria.Contains("thank") || criteria.Contains("goodbye") || criteria.Contains("cảm ơn") || criteria.Contains("tạm biệt"))
            {
                if (lowerMsg.Contains("ありがとう") || lowerMsg.Contains("ごちそう") || lowerMsg.Contains("失礼") || lowerMsg.Contains("さようなら"))
                {
                    completedIds.Add(m.Id);
                }
            }
            else
            {
                // Fallback nếu có tin nhắn gửi đi
                if (userMessage.Length > 2)
                {
                    completedIds.Add(m.Id);
                }
            }
        }

        // 2. Sinh câu trả lời giả lập phù hợp
        string jaReply;
        string viMeaning;
        var isNaturallyConcluded = false;

        if (lowerMsg.Contains("ありがとう") || lowerMsg.Contains("ごちそう") || lowerMsg.Contains("失礼"))
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
            jaReply = "かしこまりました！とんこつラーメン一杯ですね。少々お待ちください。";
            viMeaning = "Dạ tôi đã rõ! Một bát Tonkotsu Ramen đúng không ạ. Xin quý khách vui lòng đợi một lát.";
            if (pendingMissions.Count <= 1)
            {
                isNaturallyConcluded = true;
            }
        }
        else
        {
            jaReply = "はい、かしこまりました。他にご注文はございますか？";
            viMeaning = "Dạ tôi hiểu rồi. Quý khách còn muốn gọi thêm gì nữa không ạ?";
        }

        var feedback = new LinguisticFeedbackDto
        {
            Status = lowerMsg.Contains("を") ? "Warning" : "Good",
            Summary = lowerMsg.Contains("を") ? "Khá tốt • Cần điều chỉnh nhỏ" : "Rất tốt • Chuẩn ngữ cảnh",
            Details = new List<LinguisticDetailItemDto>
            {
                new() { Type = "success", Aspect = "Ngữ cảnh", Comment = "Đáp ứng đúng bối cảnh hội thoại của tình huống." },
                new() {
                    Type = lowerMsg.Contains("を") ? "warning" : "success",
                    Aspect = "Trợ từ",
                    Comment = lowerMsg.Contains("を")
                        ? "Trong khẩu ngữ thực tế, người Nhật thường lược bỏ trợ từ 「を」khi gọi món (ví dụ: 生ビール二つ thay vì 生ビールを二つ)."
                        : "Cách dùng trợ từ tự nhiên và chính xác."
                },
                new() { Type = "success", Aspect = "Văn phong", Comment = $"Sử dụng thể lịch sự phù hợp với trình độ {levelConfig.JLPTLevel}." }
            },
            NaturalAlternative = "とりあえず、生二つと焼き鳥で！",
            CulturalTip = "Thêm 「とりあえず」(Trước mắt cứ...) sẽ giúp câu nói tự nhiên y hệt người Nhật khi vừa vào quán!"
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
