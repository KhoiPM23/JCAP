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
            .SingleOrDefaultAsync(scenario => scenario.Id == scenarioId && scenario.IsActive, cancellationToken);

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
                .OrderBy(vocabulary => vocabulary.Word)
                .Select(vocabulary => new TargetVocabularyDto
                {
                    Id = vocabulary.Id,
                    Word = vocabulary.Word,
                    Reading = vocabulary.Reading,
                    Meaning = vocabulary.Meaning
                })
                .ToList(),
            TargetGrammars = level.TargetGrammars
                .OrderBy(grammar => grammar.Pattern)
                .Select(grammar => new TargetGrammarDto
                {
                    Id = grammar.Id,
                    Pattern = grammar.Pattern,
                    Meaning = grammar.Meaning,
                    ExampleSentence = grammar.ExampleSentence
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
