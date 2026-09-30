using JCAP.DTOs.Common;
using JCAP.DTOs.Scenario;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers;

[ApiController]
[Route("api/admin/scenarios")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = "Admin")]
public class AdminScenarioController : ControllerBase
{
    private readonly IScenarioService _scenarioService;
    private readonly IConfiguration _configuration;

    public AdminScenarioController(IScenarioService scenarioService, IConfiguration configuration)
    {
        _scenarioService = scenarioService;
        _configuration = configuration;
    }

    public class SwitchAiModelRequest
    {
        public string ModelId { get; set; } = string.Empty;
    }

    private record AiModelOption(
        string Id,
        string DisplayName,
        string Provider,
        string Badge,
        string Description,
        bool IsConfigured);

    private List<AiModelOption> GetAvailableModelCatalog()
    {
        var groqKey = _configuration["GroqCloud:ApiKey"] ?? _configuration["GrokqCloud:ApiKey"];
        var geminiKey = _configuration["Gemini:ApiKey"];
        bool hasGroq = !string.IsNullOrWhiteSpace(groqKey);
        bool hasGemini = !string.IsNullOrWhiteSpace(geminiKey);

        return
        [
            new AiModelOption(
                "openai/gpt-oss-120b",
                "OpenAI GPT-OSS 120B",
                "GroqCloud",
                "GroqCloud • Khuyên dùng",
                "Mô hình 120B tốc độ cao trên hạ tầng GroqCloud, phản hồi hội thoại & tạo kịch bản chuẩn xác.",
                hasGroq),
            new AiModelOption(
                "llama-3.3-70b-versatile",
                "Llama 3.3 70B Versatile",
                "GroqCloud",
                "GroqCloud • Đa năng",
                "Mô hình 70B của Meta trên GroqCloud, đối thoại tiếng Nhật tự nhiên & chấm nhiệm vụ mượt mà.",
                hasGroq),
            new AiModelOption(
                "llama-3.1-8b-instant",
                "Llama 3.1 8B Instant",
                "GroqCloud",
                "GroqCloud • Siêu tốc",
                "Mô hình 8B gọn nhẹ với độ trễ cực thấp, phù hợp luyện phản xạ nhanh.",
                hasGroq),
            new AiModelOption(
                "gemini-3.1-flash-lite",
                "Gemini 3.1 Flash Lite",
                "Gemini",
                "Google AI",
                "Mô hình Gemini 3.1 Flash Lite tối ưu tốc độ của Google AI Studio.",
                hasGemini),
            new AiModelOption(
                "gemini-2.5-flash",
                "Gemini 2.5 Flash",
                "Gemini",
                "Google AI",
                "Mô hình Gemini 2.5 Flash cân bằng giữa tốc độ và phân tích ngữ pháp chuyên sâu.",
                hasGemini),
            new AiModelOption(
                "simulator",
                "JCAP Simulator (Offline)",
                "Simulator",
                "Nội bộ • Không tốn API",
                "Chế độ giả lập kịch bản nội bộ, hoạt động tức thì không cần kết nối API bên ngoài.",
                true)
        ];
    }

    private object BuildAiStatusResponse()
    {
        var catalog = GetAvailableModelCatalog();
        var groqKey = _configuration["GroqCloud:ApiKey"] ?? _configuration["GrokqCloud:ApiKey"];
        var groqModel = _configuration["GroqCloud:Model"] ?? _configuration["GrokqCloud:Model"];

        var activeModelId = _configuration["AI:ActiveModel"]
            ?? (!string.IsNullOrWhiteSpace(groqKey) ? groqModel : null)
            ?? _configuration["AI:Model"]
            ?? _configuration["Gemini:Model"]
            ?? "gemini-3.1-flash-lite";

        var matched = catalog.FirstOrDefault(m => m.Id.Equals(activeModelId, StringComparison.OrdinalIgnoreCase));
        var activeProvider = _configuration["AI:ActiveProvider"]
            ?? matched?.Provider
            ?? (!string.IsNullOrWhiteSpace(groqKey) ? "GroqCloud" : "Gemini");

        var displayName = matched?.DisplayName ?? FormatAiModelDisplayName(activeModelId);
        bool isLiveMode = activeProvider != "Simulator" && (matched?.IsConfigured ?? !string.IsNullOrWhiteSpace(groqKey));

        return new
        {
            modelId = activeModelId,
            displayName,
            provider = activeProvider,
            isReady = true,
            mode = isLiveMode ? "Live AI" : "Simulator",
            availableModels = catalog.Select(m => new
            {
                id = m.Id,
                displayName = m.DisplayName,
                provider = m.Provider,
                badge = m.Badge,
                description = m.Description,
                isConfigured = m.IsConfigured
            })
        };
    }

    /// <summary>
    /// GET /api/admin/scenarios/ai-status - Lấy thông tin model AI đang cấu hình và danh sách model có thể chuyển đổi.
    /// </summary>
    [HttpGet("ai-status")]
    public IActionResult GetAiStatus()
    {
        return Ok(ApiResponse<object>.Ok(BuildAiStatusResponse()));
    }

    /// <summary>
    /// POST /api/admin/scenarios/ai-model - Chuyển đổi nóng (Hot-swap) model AI cho toàn hệ thống Roleplay & Scenario Generator.
    /// </summary>
    [HttpPost("ai-model")]
    public IActionResult SwitchAiModel([FromBody] SwitchAiModelRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.ModelId))
        {
            return BadRequest(ApiResponse<object>.Fail("Vui lòng chọn một Model AI hợp lệ."));
        }

        var catalog = GetAvailableModelCatalog();
        var selected = catalog.FirstOrDefault(m => m.Id.Equals(request.ModelId.Trim(), StringComparison.OrdinalIgnoreCase));
        if (selected == null)
        {
            return BadRequest(ApiResponse<object>.Fail($"Model '{request.ModelId}' không nằm trong danh mục hỗ trợ."));
        }

        _configuration["AI:ActiveModel"] = selected.Id;
        _configuration["AI:ActiveProvider"] = selected.Provider;

        if (selected.Provider == "GroqCloud")
        {
            _configuration["GroqCloud:Model"] = selected.Id;
        }
        else if (selected.Provider == "Gemini")
        {
            _configuration["Gemini:Model"] = selected.Id;
        }

        return Ok(ApiResponse<object>.Ok(
            BuildAiStatusResponse(),
            $"Đã chuyển đổi sang model '{selected.DisplayName}' thành công."));
    }

    private static string FormatAiModelDisplayName(string rawModel)
    {
        if (string.IsNullOrWhiteSpace(rawModel))
        {
            return "Gemini 3.1 Flash Lite";
        }

        var trimmed = rawModel.Trim();
        var lower = trimmed.ToLowerInvariant();

        if (lower.StartsWith("gpt-") || lower.StartsWith("chatgpt-") || lower.StartsWith("o1") || lower.StartsWith("o3") || lower.StartsWith("o4"))
        {
            return $"ChatGPT ({trimmed.ToUpperInvariant()})";
        }

        var parts = trimmed
            .Split(['-', '_', '/'], StringSplitOptions.RemoveEmptyEntries)
            .Select(part =>
            {
                if (part.Equals("gpt", StringComparison.OrdinalIgnoreCase)) return "GPT";
                if (part.Equals("oss", StringComparison.OrdinalIgnoreCase)) return "OSS";
                if (part.Equals("ai", StringComparison.OrdinalIgnoreCase)) return "AI";
                return char.ToUpperInvariant(part[0]) + part[1..].ToLowerInvariant();
            });

        return string.Join(" ", parts);
    }

    /// <summary>
    /// GET /api/admin/scenarios - Lấy toàn bộ kịch bản đàm thoại dành cho Admin.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        var result = await _scenarioService.GetAllScenariosForAdminAsync(cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// GET /api/admin/scenarios/{id} - Lấy chi tiết kịch bản bao gồm cấu hình các level, mission, từ vựng, ngữ pháp.
    /// </summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id, CancellationToken cancellationToken)
    {
        if (id <= 0)
        {
            return BadRequest(ApiResponse<ScenarioDetailsDto>.Fail("Scenario ID không hợp lệ."));
        }

        var result = await _scenarioService.GetAdminScenarioDetailsAsync(id, cancellationToken);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// POST /api/admin/scenarios/generate-level-content - AI gợi ý nội dung (Vai AI, Nhiệm vụ, Từ vựng, Ngữ pháp) theo level.
    /// </summary>
    [HttpPost("generate-level-content")]
    public async Task<IActionResult> GenerateLevelContent([FromBody] GenerateScenarioLevelContentRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ApiResponse<GeneratedLevelContentDto>.Fail("Dữ liệu yêu cầu không hợp lệ."));
        }

        var result = await _scenarioService.GenerateLevelContentAsync(request, cancellationToken);
        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// POST /api/admin/scenarios - UC-22: Tạo mới một kịch bản đàm thoại (Admin).
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateScenarioDto dto, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ApiResponse<ScenarioDetailsDto>.Fail("Dữ liệu gửi lên không hợp lệ."));
        }

        var result = await _scenarioService.CreateScenarioAsync(dto, cancellationToken);
        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// PUT /api/admin/scenarios/{id} - UC-23: Cập nhật thông tin kịch bản đàm thoại (Admin).
    /// </summary>
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateScenarioDto dto, CancellationToken cancellationToken)
    {
        if (id <= 0)
        {
            return BadRequest(ApiResponse<ScenarioDetailsDto>.Fail("Scenario ID không hợp lệ."));
        }

        if (!ModelState.IsValid)
        {
            return BadRequest(ApiResponse<ScenarioDetailsDto>.Fail("Dữ liệu gửi lên không hợp lệ."));
        }

        var result = await _scenarioService.UpdateScenarioAsync(id, dto, cancellationToken);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// DELETE /api/admin/scenarios/{id} - UC-24: Xóa mềm kịch bản đàm thoại (Admin).
    /// </summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        if (id <= 0)
        {
            return BadRequest(ApiResponse<bool>.Fail("Scenario ID không hợp lệ."));
        }

        var result = await _scenarioService.DeleteScenarioAsync(id, cancellationToken);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }
}
