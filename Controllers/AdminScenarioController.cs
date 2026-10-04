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

    /// <summary>
    /// GET /api/admin/scenarios/ai-status - Lấy thông tin model AI đang cấu hình (Gemini, ChatGPT, Claude, v.v.).
    /// </summary>
    [HttpGet("ai-status")]
    public IActionResult GetAiStatus()
    {
        var rawModel = _configuration["AI:Model"]
            ?? _configuration["Gemini:Model"]
            ?? _configuration["OpenAI:Model"]
            ?? _configuration["Claude:Model"]
            ?? "gemini-3.1-flash-lite";

        var apiKey = _configuration["AI:ApiKey"]
            ?? _configuration["Gemini:ApiKey"]
            ?? _configuration["OpenAI:ApiKey"]
            ?? _configuration["Claude:ApiKey"];

        var displayName = FormatAiModelDisplayName(rawModel);

        return Ok(ApiResponse<object>.Ok(new
        {
            modelId = rawModel,
            displayName,
            isReady = true,
            mode = string.IsNullOrWhiteSpace(apiKey) ? "Simulator" : "Live AI"
        }));
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
            .Split(['-', '_'], StringSplitOptions.RemoveEmptyEntries)
            .Select(part => char.ToUpperInvariant(part[0]) + part[1..].ToLowerInvariant());

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
