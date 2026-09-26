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

    public async Task<ApiResponse<List<ScenarioListDto>>> GetScenariosAsync(CancellationToken cancellationToken = default)
    {
        var scenarios = await _dbContext.Scenarios
            .AsNoTracking()
            .Where(s => s.IsActive)
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
}
