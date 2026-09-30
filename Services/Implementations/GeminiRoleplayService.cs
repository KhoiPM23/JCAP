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
        var model = _configuration["Gemini:Model"] ?? "gemini-3.1-flash-lite";

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogInformation("Gemini ApiKey chưa được cấu hình. Sử dụng Simulator cho câu mở đầu.");
            return GenerateSimulatorOpeningMessage(scenario, levelConfig);
        }

        try
        {
            var systemPrompt = BuildSystemInstruction(scenario, levelConfig);
            var firstMission = levelConfig.Missions?
                .Where(m => m.IsActive)
                .OrderBy(m => m.Order)
                .FirstOrDefault();
            var missionContext = firstMission != null
                ? $"\nLưu ý: Nhiệm vụ đầu tiên của NGƯỜI HỌC là \"{firstMission.Content}\". Hãy đóng đúng vai của bạn ({levelConfig.AiPersona}) để mở lời tự nhiên và tạo cơ hội cho người học thực hiện nhiệm vụ này (tuyệt đối KHÔNG nói thay câu của người học)."
                : "";

            var userPrompt = $@"Bạn hãy đóng vai nhân vật ({levelConfig.AiPersona}) và nói câu mở đầu để bắt đầu cuộc trò chuyện với người học.{missionContext}
Trả về định dạng JSON thuần túy theo cấu trúc:
{{
  ""replyJapanese"": ""Câu chào mở đầu bằng tiếng Nhật phù hợp với bối cảnh và persona"",
  ""replyVietnamese"": ""Dịch nghĩa tiếng Việt của câu chào""
}}";

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
        var model = _configuration["Gemini:Model"] ?? "gemini-3.1-flash-lite";

        var orderedPending = pendingMissions.OrderBy(m => m.Order).ToList();

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogInformation("Gemini ApiKey chưa được cấu hình. Sử dụng Simulator cho lượt đối thoại.");
            return ProcessSimulatorTurn(scenario, levelConfig, userMessage, orderedPending);
        }

        try
        {
            var systemPrompt = BuildSystemInstruction(scenario, levelConfig);

            var sbHistory = new StringBuilder();
            foreach (var msg in conversationHistory.TakeLast(10))
            {
                sbHistory.AppendLine($"[{msg.Sender}]: {msg.JapaneseText}");
            }

            var currentMission = orderedPending.FirstOrDefault();
            var missionsDescription = new StringBuilder();
            foreach (var m in orderedPending)
            {
                var priorityTag = currentMission != null && m.Id == currentMission.Id
                    ? "[NHIỆM VỤ HIỆN TẠI ĐANG XÉT]"
                    : "[Nhiệm vụ tiếp theo sau đó]";
                missionsDescription.AppendLine($"- {priorityTag} Mission ID {m.Id} (Bước {m.Order}): {m.Content}. Tiêu chí hoàn thành (JSON): {m.CompletionCriteriaJson}");
            }

            var userPrompt = $@"Lịch sử hội thoại gần nhất:
{sbHistory}

Câu nói vừa rồi của người học:
""{userMessage}""

Danh sách các nhiệm vụ CHƯA hoàn thành của người học (theo thứ tự từng bước):
{missionsDescription}

Yêu cầu phân tích và trả về:
1. replyJapanese: Câu thoại tiếp theo của bạn (đóng vai {levelConfig.AiPersona}, giữ đúng trình độ JLPT {levelConfig.JLPTLevel}, dẫn dắt để người học thực hiện nhiệm vụ tiếp theo nếu còn).
2. replyVietnamese: Bản dịch tiếng Việt tự nhiên của câu thoại đó.
3. completedMissionIds: Mảng chứa ID của nhiệm vụ mà câu nói VỪA RỒI của học viên (""{userMessage}"") đã trực tiếp và rõ ràng hoàn thành.
   QUY TẮC NGHIÊM NGẶT KHI CHẤM NHIỆM VỤ:
   - Chỉ chấm dựa trên câu nói vừa rồi của NGƯỜI HỌC, tuyệt đối không chấm dựa trên lời thoại của AI.
   - Các nhiệm vụ diễn ra tuần tự từng bước. Mỗi lượt nói chỉ đánh dấu hoàn thành TỐI ĐA 1 nhiệm vụ (ưu tiên xét nhiệm vụ hiện tại Bước {currentMission?.Order ?? 1} trước).
   - Tuyệt đối KHÔNG tự động đánh dấu hoàn thành tất cả nhiệm vụ hoặc các nhiệm vụ ở bước sau khi người học chưa thực sự nói nội dung của bước đó. Nếu câu nói chưa đạt yêu cầu của nhiệm vụ nào thì trả về mảng rỗng [].
4. isNaturallyConcluded: Chỉ trả về true khi TẤT CẢ nhiệm vụ đã hoàn thành xong VÀ hai bên đã kết thúc/chào tạm biệt tự nhiên; nếu vẫn còn nhiệm vụ chưa xong thì bắt buộc trả về false.
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
  ""completedMissionIds"": [],
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
                        if (elem.TryGetInt32(out var id) && orderedPending.Any(m => m.Id == id) && !completedIds.Contains(id))
                        {
                            completedIds.Add(id);
                        }
                    }
                }

                // Guardrail: Đảm bảo hoàn thành theo từng bước, tối đa 1 nhiệm vụ mỗi lượt nói để không bao giờ tự động hoàn thành tràn lan tất cả nhiệm vụ cùng lúc
                if (completedIds.Count > 1)
                {
                    completedIds = completedIds
                        .OrderBy(id => orderedPending.First(m => m.Id == id).Order)
                        .Take(1)
                        .ToList();
                }

                // Chỉ cho phép kết thúc tự nhiên khi không còn nhiệm vụ nào chưa hoàn thành
                var remainingCount = orderedPending.Count(m => !completedIds.Contains(m.Id));
                if (remainingCount > 0)
                {
                    isConcluded = false;
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

        return ProcessSimulatorTurn(scenario, levelConfig, userMessage, orderedPending);
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
        sb.AppendLine($"Vai của bạn (AI Persona): {levelConfig.AiPersona}.");
        sb.AppendLine($"Trình độ JLPT mục tiêu của học viên: {levelConfig.JLPTLevel}.");
        sb.AppendLine($"Bối cảnh tình huống: {scenario.Title} - {levelConfig.Description}.");

        var learnerMissions = levelConfig.Missions?
            .Where(m => m.IsActive)
            .OrderBy(m => m.Order)
            .ToList();
        if (learnerMissions != null && learnerMissions.Count > 0)
        {
            sb.AppendLine("Danh sách nhiệm vụ của NGƯỜI HỌC (User) trong tình huống này:");
            foreach (var m in learnerMissions)
            {
                sb.AppendLine($"  {m.Order}. {m.Content}");
            }
            sb.AppendLine("Lưu ý vai trò: Các nhiệm vụ trên là việc NGƯỜI HỌC phải thực hiện. Bạn đóng vai đối phương để lắng nghe, phản hồi và dẫn dắt tự nhiên giúp người học thực hiện lần lượt từng nhiệm vụ. Tuyệt đối KHÔNG đóng thay vai của người học và KHÔNG nói thay câu của người học.");
        }

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
                       scenarioTitle.Contains("quán ăn", StringComparison.OrdinalIgnoreCase) ||
                       scenarioTitle.Contains("quán mì", StringComparison.OrdinalIgnoreCase) ||
                       scenarioTitle.Contains("nhà hàng", StringComparison.OrdinalIgnoreCase);

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
                    isNaturallyConcluded = orderedPending.Count <= 1;
                }
                jaReply = "素晴らしい意気込みですね！本日は面接にお越しいただき、誠にありがとうございました。採用結果は3日以内にご連絡いたします。";
                viMeaning = "Tinh thần của bạn rất tuyệt vời! Cảm ơn bạn rất nhiều vì đã đến tham gia phỏng vấn hôm nay. Kết quả chúng tôi sẽ liên hệ trong vòng 3 ngày tới ạ.";
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
                isNaturallyConcluded = pendingMissions.Count(m => !completedIds.Contains(m.Id)) == 0;
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
            bool hasJapaneseChar = userMessage.Any(c =>
                (c >= '\u3040' && c <= '\u309F') || // Hiragana
                (c >= '\u30A0' && c <= '\u30FF') || // Katakana
                (c >= '\u4E00' && c <= '\u9FAF'));  // Kanji
            if (nextMission != null && hasJapaneseChar && userMessage.Trim().Length >= 4)
            {
                completedIds.Add(nextMission.Id);
            }

            var remainingAfterTurn = pendingMissions.Count(m => !completedIds.Contains(m.Id));
            if (remainingAfterTurn == 0 && pendingMissions.Count > 0)
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
