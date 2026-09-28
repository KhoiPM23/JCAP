using JCAP.DTOs.Common;
using JCAP.DTOs.Scenario;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers;

[ApiController]
[Route("api/scenarios")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class ScenarioController : ControllerBase
{
    private readonly IScenarioService _scenarioService;

    public ScenarioController(IScenarioService scenarioService)
    {
        _scenarioService = scenarioService;
    }

    /// <summary>
    /// GET /api/scenarios - Lấy danh sách các scenario đang hoạt động (hỗ trợ tìm kiếm theo query).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetScenarios([FromQuery] string? query, CancellationToken cancellationToken)
    {
        var result = await _scenarioService.GetScenariosAsync(query, cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// GET /api/scenarios/{scenarioId} - Lấy thông tin chi tiết scenario.
    /// </summary>
    [HttpGet("{scenarioId:int}")]
    public async Task<IActionResult> GetDetails(int scenarioId, CancellationToken cancellationToken)
    {
        if (scenarioId <= 0)
        {
            return BadRequest(ApiResponse<ScenarioDetailsDto>.Fail("Scenario ID không hợp lệ."));
        }

        var result = await _scenarioService.GetDetailsAsync(scenarioId, cancellationToken);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// GET /api/scenarios/{scenarioId}/levels - Lấy danh sách các trình độ JLPT (N5, N4, N3) đang mở.
    /// </summary>
    [HttpGet("{scenarioId:int}/levels")]
    public async Task<IActionResult> GetSupportedLevels(int scenarioId, CancellationToken cancellationToken)
    {
        if (scenarioId <= 0)
        {
            return BadRequest(ApiResponse<List<string>>.Fail("Scenario ID không hợp lệ."));
        }

        var result = await _scenarioService.GetSupportedLevelsAsync(scenarioId, cancellationToken);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// GET /api/scenarios/{scenarioId}/levels/{level} - Lấy chi tiết cấu hình level (AI Persona, Missions, Từ vựng & Ngữ pháp).
    /// </summary>
    [HttpGet("{scenarioId:int}/levels/{level}")]
    public async Task<IActionResult> GetLevelDetails(int scenarioId, string level, CancellationToken cancellationToken)
    {
        if (scenarioId <= 0)
        {
            return BadRequest(ApiResponse<ScenarioLevelConfigurationDto>.Fail("Scenario ID không hợp lệ."));
        }

        if (string.IsNullOrWhiteSpace(level))
        {
            return BadRequest(ApiResponse<ScenarioLevelConfigurationDto>.Fail("JLPT Level không được để trống."));
        }

        var result = await _scenarioService.GetLevelDetailsAsync(scenarioId, level, cancellationToken);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// GET /api/scenarios/admin/all - Lấy toàn bộ danh sách scenario dành cho Admin (bao gồm cả bị vô hiệu hóa).
    /// </summary>
    [HttpGet("admin/all")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetAllForAdmin(CancellationToken cancellationToken)
    {
        var result = await _scenarioService.GetAllScenariosForAdminAsync(cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// POST /api/scenarios - UC-22: Tạo mới một kịch bản đàm thoại (Admin).
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> CreateScenario([FromBody] CreateScenarioDto dto, CancellationToken cancellationToken)
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

        return CreatedAtAction(nameof(GetDetails), new { scenarioId = result.Data!.Id }, result);
    }

    /// <summary>
    /// PUT /api/scenarios/{scenarioId} - UC-23: Chỉnh sửa thông tin kịch bản đàm thoại (Admin).
    /// </summary>
    [HttpPut("{scenarioId:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateScenario(int scenarioId, [FromBody] UpdateScenarioDto dto, CancellationToken cancellationToken)
    {
        if (scenarioId <= 0)
        {
            return BadRequest(ApiResponse<ScenarioDetailsDto>.Fail("Scenario ID không hợp lệ."));
        }

        if (!ModelState.IsValid)
        {
            return BadRequest(ApiResponse<ScenarioDetailsDto>.Fail("Dữ liệu gửi lên không hợp lệ."));
        }

        var result = await _scenarioService.UpdateScenarioAsync(scenarioId, dto, cancellationToken);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// DELETE /api/scenarios/{scenarioId} - UC-24: Xóa mềm kịch bản đàm thoại (IsActive = false) (Admin).
    /// </summary>
    [HttpDelete("{scenarioId:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteScenario(int scenarioId, CancellationToken cancellationToken)
    {
        if (scenarioId <= 0)
        {
            return BadRequest(ApiResponse<bool>.Fail("Scenario ID không hợp lệ."));
        }

        var result = await _scenarioService.DeleteScenarioAsync(scenarioId, cancellationToken);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }
}
