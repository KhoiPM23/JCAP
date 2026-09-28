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

    public AdminScenarioController(IScenarioService scenarioService)
    {
        _scenarioService = scenarioService;
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
