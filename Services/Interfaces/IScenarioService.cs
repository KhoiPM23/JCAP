using JCAP.DTOs.Common;
using JCAP.DTOs.Scenario;

namespace JCAP.Services.Interfaces;

public interface IScenarioService
{
    Task<ApiResponse<List<ScenarioListDto>>> GetScenariosAsync(string? query = null, CancellationToken cancellationToken = default);
    Task<ApiResponse<ScenarioDetailsDto>> GetDetailsAsync(int scenarioId, CancellationToken cancellationToken = default);
    Task<ApiResponse<List<string>>> GetSupportedLevelsAsync(int scenarioId, CancellationToken cancellationToken = default);
    Task<ApiResponse<ScenarioLevelConfigurationDto>> GetLevelDetailsAsync(int scenarioId, string level, CancellationToken cancellationToken = default);

    // Admin CRUD Operations (UC-22, UC-23, UC-24)
    Task<ApiResponse<List<ScenarioListDto>>> GetAllScenariosForAdminAsync(CancellationToken cancellationToken = default);
    Task<ApiResponse<ScenarioDetailsDto>> GetAdminScenarioDetailsAsync(int scenarioId, CancellationToken cancellationToken = default);
    Task<ApiResponse<ScenarioDetailsDto>> CreateScenarioAsync(CreateScenarioDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<ScenarioDetailsDto>> UpdateScenarioAsync(int id, UpdateScenarioDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<bool>> DeleteScenarioAsync(int id, CancellationToken cancellationToken = default);
    Task<ApiResponse<GeneratedLevelContentDto>> GenerateLevelContentAsync(GenerateScenarioLevelContentRequest request, CancellationToken cancellationToken = default);
}
