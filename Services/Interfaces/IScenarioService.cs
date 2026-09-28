using JCAP.DTOs.Common;
using JCAP.DTOs.Scenario;

namespace JCAP.Services.Interfaces;

public interface IScenarioService
{
    Task<ApiResponse<List<ScenarioListDto>>> GetScenariosAsync(CancellationToken cancellationToken = default);
    Task<ApiResponse<ScenarioDetailsDto>> GetDetailsAsync(int scenarioId, CancellationToken cancellationToken = default);
    Task<ApiResponse<List<string>>> GetSupportedLevelsAsync(int scenarioId, CancellationToken cancellationToken = default);
    Task<ApiResponse<ScenarioLevelConfigurationDto>> GetLevelDetailsAsync(int scenarioId, string level, CancellationToken cancellationToken = default);
}
