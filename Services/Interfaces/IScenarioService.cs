using JCAP.DTOs.Common;
using JCAP.DTOs.Scenario;

namespace JCAP.Services.Interfaces;

public interface IScenarioService
{
    Task<ApiResponse<ScenarioDetailsDto>> GetDetailsAsync(int scenarioId, CancellationToken cancellationToken = default);
}
