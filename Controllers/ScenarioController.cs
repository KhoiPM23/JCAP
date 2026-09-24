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
}
