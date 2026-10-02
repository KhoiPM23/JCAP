using System.Text.Json;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Scenario;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations;

public class ScenarioService : IScenarioService
{
    private static readonly JsonSerializerOptions CriteriaJsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AppDbContext _dbContext;

    public ScenarioService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<ApiResponse<List<ScenarioListDto>>> GetScenariosAsync(string? query = null, CancellationToken cancellationToken = default)
    {
        var scenariosQuery = _dbContext.Scenarios
            .AsNoTracking()
            .Where(s => s.IsActive);

        if (!string.IsNullOrWhiteSpace(query))
        {
            var trimmedQuery = query.Trim();
            scenariosQuery = scenariosQuery.Where(s =>
                EF.Functions.Like(s.Title, $"%{trimmedQuery}%") ||
                EF.Functions.Like(s.Description, $"%{trimmedQuery}%") ||
                (s.ScenarioCode != null && EF.Functions.Like(s.ScenarioCode, $"%{trimmedQuery}%")));
        }

        var scenarios = await scenariosQuery
            .Include(s => s.LevelConfigurations)
            .OrderBy(s => s.Id)
            .ToListAsync(cancellationToken);

        var result = scenarios.Select(s => new ScenarioListDto
        {
            Id = s.Id,
            Title = s.Title,
            Description = s.Description,
            Thumbnail = s.Thumbnail,
            IsActive = s.IsActive,
            ScenarioCode = s.ScenarioCode,
            SupportedJLPTLevels = s.LevelConfigurations
                .Where(lc => lc.Status == "Published")
                .OrderBy(lc => lc.JLPTLevel)
                .Select(lc => lc.JLPTLevel)
                .ToList()
        }).ToList();

        return ApiResponse<List<ScenarioListDto>>.Ok(result, "Lấy danh sách scenarios thành công.");
    }

    public async Task<ApiResponse<ScenarioDetailsDto>> GetDetailsAsync(
        int scenarioId,
        CancellationToken cancellationToken = default)
    {
        var scenario = await _dbContext.Scenarios
            .AsNoTracking()
            .Include(s => s.LevelConfigurations.Where(level => level.Status == "Published"))
                .ThenInclude(level => level.Missions.OrderBy(mission => mission.Order))
            .Include(s => s.LevelConfigurations.Where(level => level.Status == "Published"))
                .ThenInclude(level => level.TargetVocabularies)
            .Include(s => s.LevelConfigurations.Where(level => level.Status == "Published"))
                .ThenInclude(level => level.TargetGrammars)
            .SingleOrDefaultAsync(s => s.Id == scenarioId && s.IsActive, cancellationToken);

        if (scenario == null)
        {
            return ApiResponse<ScenarioDetailsDto>.Fail("Không tìm thấy scenario hoặc scenario không còn hoạt động.");
        }

        var response = new ScenarioDetailsDto
        {
            Id = scenario.Id,
            Title = scenario.Title,
            Description = scenario.Description,
            Thumbnail = scenario.Thumbnail,
            IsActive = scenario.IsActive,
            ScenarioCode = scenario.ScenarioCode,
            LevelConfigurations = scenario.LevelConfigurations
                .OrderBy(level => level.JLPTLevel)
                .Select(MapLevel)
                .ToList()
        };

        return ApiResponse<ScenarioDetailsDto>.Ok(response, "Lấy chi tiết scenario thành công.");
    }

    public async Task<ApiResponse<List<string>>> GetSupportedLevelsAsync(
        int scenarioId,
        CancellationToken cancellationToken = default)
    {
        var scenario = await _dbContext.Scenarios
            .AsNoTracking()
            .Include(s => s.LevelConfigurations.Where(lc => lc.Status == "Published"))
            .SingleOrDefaultAsync(s => s.Id == scenarioId && s.IsActive, cancellationToken);

        if (scenario == null)
        {
            return ApiResponse<List<string>>.Fail("Không tìm thấy scenario hoặc scenario không còn hoạt động.");
        }

        var levels = scenario.LevelConfigurations
            .Select(lc => lc.JLPTLevel)
            .OrderBy(l => l)
            .ToList();

        return ApiResponse<List<string>>.Ok(levels, "Lấy danh sách JLPT levels hỗ trợ thành công.");
    }

    public async Task<ApiResponse<ScenarioLevelConfigurationDto>> GetLevelDetailsAsync(
        int scenarioId,
        string level,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(level))
        {
            return ApiResponse<ScenarioLevelConfigurationDto>.Fail("JLPT Level không được để trống.");
        }

        var normalizedLevel = level.Trim().ToUpperInvariant();

        var scenario = await _dbContext.Scenarios
            .AsNoTracking()
            .Include(s => s.LevelConfigurations.Where(lc => lc.JLPTLevel.ToUpper() == normalizedLevel && lc.Status == "Published"))
                .ThenInclude(lc => lc.Missions.OrderBy(m => m.Order))
            .Include(s => s.LevelConfigurations.Where(lc => lc.JLPTLevel.ToUpper() == normalizedLevel && lc.Status == "Published"))
                .ThenInclude(lc => lc.TargetVocabularies)
            .Include(s => s.LevelConfigurations.Where(lc => lc.JLPTLevel.ToUpper() == normalizedLevel && lc.Status == "Published"))
                .ThenInclude(lc => lc.TargetGrammars)
            .SingleOrDefaultAsync(s => s.Id == scenarioId && s.IsActive, cancellationToken);

        if (scenario == null)
        {
            return ApiResponse<ScenarioLevelConfigurationDto>.Fail("Không tìm thấy scenario hoặc scenario không còn hoạt động.");
        }

        var levelConfig = scenario.LevelConfigurations.FirstOrDefault();
        if (levelConfig == null)
        {
            return ApiResponse<ScenarioLevelConfigurationDto>.Fail($"Cấu hình cho trình độ {normalizedLevel} không tồn tại hoặc chưa được phát hành.");
        }

        var response = MapLevel(levelConfig);
        return ApiResponse<ScenarioLevelConfigurationDto>.Ok(response, $"Lấy chi tiết cấu hình trình độ {normalizedLevel} thành công.");
    }

    private static ScenarioLevelConfigurationDto MapLevel(ScenarioLevelConfiguration level)
    {
        return new ScenarioLevelConfigurationDto
        {
            Id = level.Id,
            ScenarioId = level.ScenarioId,
            JLPTLevel = level.JLPTLevel,
            Title = level.Title,
            Description = level.Description,
            AiPersona = level.AiPersona,
            CreditCost = level.CreditCost,
            Status = level.Status,
            Missions = level.Missions
                .OrderBy(mission => mission.Order)
                .Select(MapMission)
                .ToList(),
            TargetVocabularies = level.TargetVocabularies
                .OrderBy(v => v.Word)
                .Select(v => new TargetVocabularyDto
                {
                    Id = v.Id,
                    Word = v.Word,
                    Reading = v.Reading,
                    Meaning = v.Meaning
                })
                .ToList(),
            TargetGrammars = level.TargetGrammars
                .OrderBy(g => g.Pattern)
                .Select(g => new TargetGrammarDto
                {
                    Id = g.Id,
                    Pattern = g.Pattern,
                    Meaning = g.Meaning,
                    ExampleSentence = g.ExampleSentence
                })
                .ToList()
        };
    }

    private static MissionDto MapMission(Mission mission)
    {
        var criteria = DeserializeCriteria(mission.CompletionCriteriaJson);

        return new MissionDto
        {
            Id = mission.Id,
            Content = mission.Content,
            Order = mission.Order,
            CompletionCriteria = new MissionCompletionCriteriaDto
            {
                Intent = criteria.Intent,
                Target = criteria.Target,
                Conditions = criteria.Conditions
            }
        };
    }

    private static MissionCompletionCriteria DeserializeCriteria(string criteriaJson)
    {
        try
        {
            return JsonSerializer.Deserialize<MissionCompletionCriteria>(criteriaJson, CriteriaJsonOptions)
                ?? new MissionCompletionCriteria();
        }
        catch (JsonException)
        {
            return new MissionCompletionCriteria();
        }
    }

    public async Task<ApiResponse<List<ScenarioListDto>>> GetAllScenariosForAdminAsync(CancellationToken cancellationToken = default)
    {
        var scenarios = await _dbContext.Scenarios
            .AsNoTracking()
            .Include(s => s.LevelConfigurations)
            .OrderByDescending(s => s.Id)
            .ToListAsync(cancellationToken);

        var result = scenarios.Select(s => new ScenarioListDto
        {
            Id = s.Id,
            Title = s.Title,
            Description = s.Description,
            Thumbnail = s.Thumbnail,
            IsActive = s.IsActive,
            ScenarioCode = s.ScenarioCode,
            SupportedJLPTLevels = s.LevelConfigurations
                .OrderBy(lc => lc.JLPTLevel)
                .Select(lc => lc.JLPTLevel)
                .ToList()
        }).ToList();

        return ApiResponse<List<ScenarioListDto>>.Ok(result, "Lấy toàn bộ danh sách scenario (Admin) thành công.");
    }

    public async Task<ApiResponse<ScenarioDetailsDto>> CreateScenarioAsync(CreateScenarioDto dto, CancellationToken cancellationToken = default)
    {
        if (dto == null)
        {
            return ApiResponse<ScenarioDetailsDto>.Fail("Dữ liệu tạo kịch bản không hợp lệ.");
        }

        var scenario = new Scenario
        {
            Title = dto.Title.Trim(),
            Description = dto.Description.Trim(),
            Thumbnail = dto.Thumbnail?.Trim(),
            ScenarioCode = dto.ScenarioCode?.Trim().ToUpperInvariant(),
            IsActive = dto.IsActive
        };

        if (dto.LevelConfigurations != null && dto.LevelConfigurations.Count > 0)
        {
            foreach (var levelDto in dto.LevelConfigurations)
            {
                scenario.LevelConfigurations.Add(new ScenarioLevelConfiguration
                {
                    JLPTLevel = levelDto.JLPTLevel.Trim().ToUpperInvariant(),
                    Title = levelDto.Title.Trim(),
                    Description = levelDto.Description.Trim(),
                    AiPersona = levelDto.AiPersona.Trim(),
                    CreditCost = levelDto.CreditCost > 0 ? levelDto.CreditCost : 5,
                    Status = string.IsNullOrWhiteSpace(levelDto.Status) ? "Published" : levelDto.Status.Trim(),
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        _dbContext.Scenarios.Add(scenario);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return await GetDetailsAsync(scenario.Id, cancellationToken);
    }

    public async Task<ApiResponse<ScenarioDetailsDto>> UpdateScenarioAsync(int id, UpdateScenarioDto dto, CancellationToken cancellationToken = default)
    {
        if (id <= 0 || dto == null)
        {
            return ApiResponse<ScenarioDetailsDto>.Fail("Thông tin cập nhật không hợp lệ.");
        }

        var scenario = await _dbContext.Scenarios
            .Include(s => s.LevelConfigurations)
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);

        if (scenario == null)
        {
            return ApiResponse<ScenarioDetailsDto>.Fail($"Không tìm thấy kịch bản với ID = {id}.");
        }

        scenario.Title = dto.Title.Trim();
        scenario.Description = dto.Description.Trim();
        scenario.Thumbnail = dto.Thumbnail?.Trim();
        scenario.ScenarioCode = dto.ScenarioCode?.Trim().ToUpperInvariant();
        scenario.IsActive = dto.IsActive;

        if (dto.LevelConfigurations != null)
        {
            foreach (var levelDto in dto.LevelConfigurations)
            {
                var normalizedLevel = levelDto.JLPTLevel.Trim().ToUpperInvariant();
                var existingConfig = scenario.LevelConfigurations
                    .FirstOrDefault(lc => lc.JLPTLevel.ToUpper() == normalizedLevel);

                if (existingConfig != null)
                {
                    existingConfig.Title = levelDto.Title.Trim();
                    existingConfig.Description = levelDto.Description.Trim();
                    existingConfig.AiPersona = levelDto.AiPersona.Trim();
                    existingConfig.CreditCost = levelDto.CreditCost;
                    existingConfig.Status = levelDto.Status;
                    existingConfig.UpdatedAt = DateTime.UtcNow;
                }
                else
                {
                    scenario.LevelConfigurations.Add(new ScenarioLevelConfiguration
                    {
                        ScenarioId = scenario.Id,
                        JLPTLevel = normalizedLevel,
                        Title = levelDto.Title.Trim(),
                        Description = levelDto.Description.Trim(),
                        AiPersona = levelDto.AiPersona.Trim(),
                        CreditCost = levelDto.CreditCost > 0 ? levelDto.CreditCost : 5,
                        Status = string.IsNullOrWhiteSpace(levelDto.Status) ? "Published" : levelDto.Status.Trim(),
                        CreatedAt = DateTime.UtcNow
                    });
                }
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        return await GetDetailsAsync(scenario.Id, cancellationToken);
    }

    public async Task<ApiResponse<bool>> DeleteScenarioAsync(int id, CancellationToken cancellationToken = default)
    {
        if (id <= 0)
        {
            return ApiResponse<bool>.Fail("Scenario ID không hợp lệ.");
        }

        var scenario = await _dbContext.Scenarios.FindAsync([id], cancellationToken);
        if (scenario == null)
        {
            return ApiResponse<bool>.Fail($"Không tìm thấy kịch bản với ID = {id}.");
        }

        // Soft Delete (UC-24)
        scenario.IsActive = false;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return ApiResponse<bool>.Ok(true, $"Đã vô hiệu hóa (xóa mềm) kịch bản '{scenario.Title}' thành công.");
    }
}
