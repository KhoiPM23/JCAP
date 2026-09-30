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
