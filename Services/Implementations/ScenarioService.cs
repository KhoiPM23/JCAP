using System.Text;
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
    private readonly IHttpClientFactory? _httpClientFactory;
    private readonly IConfiguration? _configuration;

    public ScenarioService(
        AppDbContext dbContext,
        IHttpClientFactory? httpClientFactory = null,
        IConfiguration? configuration = null)
    {
        _dbContext = dbContext;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
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
                .ThenInclude(level => level.Missions.Where(mission => mission.IsActive).OrderBy(mission => mission.Order))
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
                .ThenInclude(lc => lc.Missions.Where(m => m.IsActive).OrderBy(m => m.Order))
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
                .Where(mission => mission.IsActive)
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
                .Where(lc => lc.Status == "Published")
                .OrderBy(lc => lc.JLPTLevel)
                .Select(lc => lc.JLPTLevel)
                .ToList()
        }).ToList();

        return ApiResponse<List<ScenarioListDto>>.Ok(result, "Lấy toàn bộ danh sách scenario (Admin) thành công.");
    }

    public async Task<ApiResponse<ScenarioDetailsDto>> GetAdminScenarioDetailsAsync(
        int scenarioId,
        CancellationToken cancellationToken = default)
    {
        var scenario = await _dbContext.Scenarios
            .AsNoTracking()
            .Include(s => s.LevelConfigurations)
                .ThenInclude(level => level.Missions.Where(mission => mission.IsActive).OrderBy(mission => mission.Order))
            .Include(s => s.LevelConfigurations)
                .ThenInclude(level => level.TargetVocabularies)
            .Include(s => s.LevelConfigurations)
                .ThenInclude(level => level.TargetGrammars)
            .SingleOrDefaultAsync(s => s.Id == scenarioId, cancellationToken);

        if (scenario == null)
        {
            return ApiResponse<ScenarioDetailsDto>.Fail($"Không tìm thấy kịch bản với ID = {scenarioId}.");
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

        return ApiResponse<ScenarioDetailsDto>.Ok(response, "Lấy chi tiết kịch bản (Admin) thành công.");
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
                var normalizedLevel = levelDto.JLPTLevel.Trim().ToUpperInvariant();
                var levelConfig = new ScenarioLevelConfiguration
                {
                    JLPTLevel = normalizedLevel,
                    Title = string.IsNullOrWhiteSpace(levelDto.Title) ? $"{scenario.Title} ({normalizedLevel})" : levelDto.Title.Trim(),
                    Description = string.IsNullOrWhiteSpace(levelDto.Description) ? $"Cấu hình {normalizedLevel} cho {scenario.Title}" : levelDto.Description.Trim(),
                    AiPersona = string.IsNullOrWhiteSpace(levelDto.AiPersona) ? "Nhân viên hỗ trợ / Hướng dẫn viên" : levelDto.AiPersona.Trim(),
                    CreditCost = levelDto.CreditCost > 0 ? levelDto.CreditCost : 5,
                    Status = string.IsNullOrWhiteSpace(levelDto.Status) ? "Published" : levelDto.Status.Trim(),
                    CreatedAt = DateTime.UtcNow
                };

                if (levelDto.Missions != null && levelDto.Missions.Count > 0)
                {
                    int order = 1;
                    foreach (var m in levelDto.Missions)
                    {
                        if (string.IsNullOrWhiteSpace(m.Content)) continue;
                        var criteria = new MissionCompletionCriteria
                        {
                            Intent = string.IsNullOrWhiteSpace(m.Intent) ? "CompleteMission" : m.Intent,
                            Target = string.IsNullOrWhiteSpace(m.Target) ? m.Content : m.Target,
                            Conditions = m.Conditions ?? []
                        };
                        levelConfig.Missions.Add(new Mission
                        {
                            Content = m.Content.Trim(),
                            Order = m.Order > 0 ? m.Order : order++,
                            CompletionCriteriaJson = JsonSerializer.Serialize(criteria, CriteriaJsonOptions)
                        });
                    }
                }

                if (levelDto.TargetVocabularies != null && levelDto.TargetVocabularies.Count > 0)
                {
                    foreach (var v in levelDto.TargetVocabularies)
                    {
                        if (string.IsNullOrWhiteSpace(v.Word)) continue;
                        levelConfig.TargetVocabularies.Add(new TargetVocabulary
                        {
                            Word = v.Word.Trim(),
                            Reading = v.Reading?.Trim(),
                            Meaning = v.Meaning.Trim()
                        });
                    }
                }

                if (levelDto.TargetGrammars != null && levelDto.TargetGrammars.Count > 0)
                {
                    foreach (var g in levelDto.TargetGrammars)
                    {
                        if (string.IsNullOrWhiteSpace(g.Pattern)) continue;
                        levelConfig.TargetGrammars.Add(new TargetGrammar
                        {
                            Pattern = g.Pattern.Trim(),
                            Meaning = g.Meaning.Trim(),
                            ExampleSentence = g.ExampleSentence?.Trim()
                        });
                    }
                }

                scenario.LevelConfigurations.Add(levelConfig);
            }
        }

        _dbContext.Scenarios.Add(scenario);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return await GetAdminScenarioDetailsAsync(scenario.Id, cancellationToken);
    }

    public async Task<ApiResponse<ScenarioDetailsDto>> UpdateScenarioAsync(int id, UpdateScenarioDto dto, CancellationToken cancellationToken = default)
    {
        if (id <= 0 || dto == null)
        {
            return ApiResponse<ScenarioDetailsDto>.Fail("Thông tin cập nhật không hợp lệ.");
        }

        var scenario = await _dbContext.Scenarios
            .Include(s => s.LevelConfigurations)
                .ThenInclude(lc => lc.Missions)
            .Include(s => s.LevelConfigurations)
                .ThenInclude(lc => lc.TargetVocabularies)
            .Include(s => s.LevelConfigurations)
                .ThenInclude(lc => lc.TargetGrammars)
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
            var requestedLevels = dto.LevelConfigurations
                .Select(lc => lc.JLPTLevel.Trim().ToUpperInvariant())
                .ToHashSet();

            // 1. Handle levels that are no longer selected by Admin
            var toRemove = scenario.LevelConfigurations
                .Where(lc => !requestedLevels.Contains(lc.JLPTLevel.ToUpperInvariant()))
                .ToList();

            foreach (var rem in toRemove)
            {
                rem.Status = "Archived";
                foreach (var m in rem.Missions)
                {
                    m.IsActive = false;
                }
            }

            // 2. Add or update selected levels
            foreach (var levelDto in dto.LevelConfigurations)
            {
                var normalizedLevel = levelDto.JLPTLevel.Trim().ToUpperInvariant();
                var existingConfig = scenario.LevelConfigurations
                    .FirstOrDefault(lc => lc.JLPTLevel.ToUpperInvariant() == normalizedLevel);

                if (existingConfig != null)
                {
                    existingConfig.Title = string.IsNullOrWhiteSpace(levelDto.Title) ? $"{scenario.Title} ({normalizedLevel})" : levelDto.Title.Trim();
                    existingConfig.Description = string.IsNullOrWhiteSpace(levelDto.Description) ? $"Cấu hình {normalizedLevel} cho {scenario.Title}" : levelDto.Description.Trim();
                    existingConfig.AiPersona = string.IsNullOrWhiteSpace(levelDto.AiPersona) ? "Nhân viên hỗ trợ / Hướng dẫn viên" : levelDto.AiPersona.Trim();
                    existingConfig.CreditCost = levelDto.CreditCost > 0 ? levelDto.CreditCost : 5;
                    existingConfig.Status = "Published";
                    existingConfig.UpdatedAt = DateTime.UtcNow;

                    // Update Missions in-place to preserve IDs and avoid FK constraint errors
                    var existingMissions = existingConfig.Missions.ToList();
                    var incomingMissions = (levelDto.Missions ?? [])
                        .Where(m => !string.IsNullOrWhiteSpace(m.Content))
                        .ToList();

                    var handledExistingMissionIds = new HashSet<int>();
                    int order = 1;

                    foreach (var mDto in incomingMissions)
                    {
                        Mission? mission = null;
                        if (mDto.Id.HasValue && mDto.Id.Value > 0)
                        {
                            mission = existingMissions.FirstOrDefault(m => m.Id == mDto.Id.Value);
                        }
                        mission ??= existingMissions.FirstOrDefault(m => !handledExistingMissionIds.Contains(m.Id));

                        var criteria = new MissionCompletionCriteria
                        {
                            Intent = string.IsNullOrWhiteSpace(mDto.Intent) ? "CompleteMission" : mDto.Intent,
                            Target = string.IsNullOrWhiteSpace(mDto.Target) ? mDto.Content : mDto.Target,
                            Conditions = mDto.Conditions ?? []
                        };

                        if (mission != null)
                        {
                            handledExistingMissionIds.Add(mission.Id);
                            mission.IsActive = true;
                            mission.Content = mDto.Content.Trim();
                            mission.Order = mDto.Order > 0 ? mDto.Order : order++;
                            mission.CompletionCriteriaJson = JsonSerializer.Serialize(criteria, CriteriaJsonOptions);
                        }
                        else
                        {
                            existingConfig.Missions.Add(new Mission
                            {
                                ScenarioLevelConfigurationId = existingConfig.Id,
                                IsActive = true,
                                Content = mDto.Content.Trim(),
                                Order = mDto.Order > 0 ? mDto.Order : order++,
                                CompletionCriteriaJson = JsonSerializer.Serialize(criteria, CriteriaJsonOptions)
                            });
                        }
                    }

                    // Soft delete (deactivate) existing missions that are no longer in the updated list
                    // This preserves all learner historical sessions, evaluations, and results in the database
                    var missionsToDeactivate = existingMissions.Where(m => !handledExistingMissionIds.Contains(m.Id)).ToList();
                    foreach (var missionToDeactivate in missionsToDeactivate)
                    {
                        missionToDeactivate.IsActive = false;
                    }

                    // Update TargetVocabularies in-place
                    var existingVocabs = existingConfig.TargetVocabularies.ToList();
                    var incomingVocabs = (levelDto.TargetVocabularies ?? [])
                        .Where(v => !string.IsNullOrWhiteSpace(v.Word))
                        .ToList();

                    var handledVocabIds = new HashSet<int>();
                    foreach (var vDto in incomingVocabs)
                    {
                        TargetVocabulary? vocab = null;
                        if (vDto.Id.HasValue && vDto.Id.Value > 0)
                        {
                            vocab = existingVocabs.FirstOrDefault(v => v.Id == vDto.Id.Value);
                        }
                        vocab ??= existingVocabs.FirstOrDefault(v => !handledVocabIds.Contains(v.Id));

                        if (vocab != null)
                        {
                            handledVocabIds.Add(vocab.Id);
                            vocab.Word = vDto.Word.Trim();
                            vocab.Reading = vDto.Reading?.Trim();
                            vocab.Meaning = vDto.Meaning.Trim();
                        }
                        else
                        {
                            existingConfig.TargetVocabularies.Add(new TargetVocabulary
                            {
                                ScenarioLevelConfigurationId = existingConfig.Id,
                                Word = vDto.Word.Trim(),
                                Reading = vDto.Reading?.Trim(),
                                Meaning = vDto.Meaning.Trim()
                            });
                        }
                    }

                    var vocabsToDelete = existingVocabs.Where(v => !handledVocabIds.Contains(v.Id)).ToList();
                    foreach (var vocabToRemove in vocabsToDelete)
                    {
                        _dbContext.TargetVocabularies.Remove(vocabToRemove);
                        existingConfig.TargetVocabularies.Remove(vocabToRemove);
                    }

                    // Update TargetGrammars in-place
                    var existingGrammars = existingConfig.TargetGrammars.ToList();
                    var incomingGrammars = (levelDto.TargetGrammars ?? [])
                        .Where(g => !string.IsNullOrWhiteSpace(g.Pattern))
                        .ToList();

                    var handledGrammarIds = new HashSet<int>();
                    foreach (var gDto in incomingGrammars)
                    {
                        TargetGrammar? grammar = null;
                        if (gDto.Id.HasValue && gDto.Id.Value > 0)
                        {
                            grammar = existingGrammars.FirstOrDefault(g => g.Id == gDto.Id.Value);
                        }
                        grammar ??= existingGrammars.FirstOrDefault(g => !handledGrammarIds.Contains(g.Id));

                        if (grammar != null)
                        {
                            handledGrammarIds.Add(grammar.Id);
                            grammar.Pattern = gDto.Pattern.Trim();
                            grammar.Meaning = gDto.Meaning.Trim();
                            grammar.ExampleSentence = gDto.ExampleSentence?.Trim();
                        }
                        else
                        {
                            existingConfig.TargetGrammars.Add(new TargetGrammar
                            {
                                ScenarioLevelConfigurationId = existingConfig.Id,
                                Pattern = gDto.Pattern.Trim(),
                                Meaning = gDto.Meaning.Trim(),
                                ExampleSentence = gDto.ExampleSentence?.Trim()
                            });
                        }
                    }

                    var grammarsToDelete = existingGrammars.Where(g => !handledGrammarIds.Contains(g.Id)).ToList();
                    foreach (var grammarToRemove in grammarsToDelete)
                    {
                        _dbContext.TargetGrammars.Remove(grammarToRemove);
                        existingConfig.TargetGrammars.Remove(grammarToRemove);
                    }
                }
                else
                {
                    var newConfig = new ScenarioLevelConfiguration
                    {
                        ScenarioId = scenario.Id,
                        JLPTLevel = normalizedLevel,
                        Title = string.IsNullOrWhiteSpace(levelDto.Title) ? $"{scenario.Title} ({normalizedLevel})" : levelDto.Title.Trim(),
                        Description = string.IsNullOrWhiteSpace(levelDto.Description) ? $"Cấu hình {normalizedLevel} cho {scenario.Title}" : levelDto.Description.Trim(),
                        AiPersona = string.IsNullOrWhiteSpace(levelDto.AiPersona) ? "Nhân viên hỗ trợ / Hướng dẫn viên" : levelDto.AiPersona.Trim(),
                        CreditCost = levelDto.CreditCost > 0 ? levelDto.CreditCost : 5,
                        Status = string.IsNullOrWhiteSpace(levelDto.Status) ? "Published" : levelDto.Status.Trim(),
                        CreatedAt = DateTime.UtcNow
                    };

                    if (levelDto.Missions != null)
                    {
                        int order = 1;
                        foreach (var m in levelDto.Missions)
                        {
                            if (string.IsNullOrWhiteSpace(m.Content)) continue;
                            var criteria = new MissionCompletionCriteria
                            {
                                Intent = string.IsNullOrWhiteSpace(m.Intent) ? "CompleteMission" : m.Intent,
                                Target = string.IsNullOrWhiteSpace(m.Target) ? m.Content : m.Target,
                                Conditions = m.Conditions ?? []
                            };
                            newConfig.Missions.Add(new Mission
                            {
                                Content = m.Content.Trim(),
                                Order = m.Order > 0 ? m.Order : order++,
                                CompletionCriteriaJson = JsonSerializer.Serialize(criteria, CriteriaJsonOptions)
                            });
                        }
                    }

                    if (levelDto.TargetVocabularies != null)
                    {
                        foreach (var v in levelDto.TargetVocabularies)
                        {
                            if (string.IsNullOrWhiteSpace(v.Word)) continue;
                            newConfig.TargetVocabularies.Add(new TargetVocabulary
                            {
                                Word = v.Word.Trim(),
                                Reading = v.Reading?.Trim(),
                                Meaning = v.Meaning.Trim()
                            });
                        }
                    }

                    if (levelDto.TargetGrammars != null)
                    {
                        foreach (var g in levelDto.TargetGrammars)
                        {
                            if (string.IsNullOrWhiteSpace(g.Pattern)) continue;
                            newConfig.TargetGrammars.Add(new TargetGrammar
                            {
                                Pattern = g.Pattern.Trim(),
                                Meaning = g.Meaning.Trim(),
                                ExampleSentence = g.ExampleSentence?.Trim()
                            });
                        }
                    }

                    scenario.LevelConfigurations.Add(newConfig);
                }
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        return await GetAdminScenarioDetailsAsync(scenario.Id, cancellationToken);
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

    public async Task<ApiResponse<GeneratedLevelContentDto>> GenerateLevelContentAsync(
        GenerateScenarioLevelContentRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.ScenarioTitle))
        {
            return ApiResponse<GeneratedLevelContentDto>.Fail("Tiêu đề kịch bản không được để trống.");
        }

        var level = (request.JLPTLevel ?? "N5").Trim().ToUpperInvariant();
        var title = request.ScenarioTitle.Trim();
        var desc = request.ScenarioDescription?.Trim() ?? string.Empty;

        int missionCount = Math.Max(3, request.MissionCount);
        int vocabCount = Math.Max(3, request.VocabularyCount);
        int grammarCount = Math.Max(3, request.GrammarCount);

        var result = new GeneratedLevelContentDto
        {
            JLPTLevel = level,
            Title = $"{title} ({level})",
            Description = !string.IsNullOrWhiteSpace(desc)
                ? $"Thực hành giao tiếp trình độ {level}: {desc}"
                : $"Thực hành giao tiếp trình độ {level} cho chủ đề '{title}'.",
        };

        var activeProvider = _configuration?["AI:ActiveProvider"];
        bool isSimulatorSelected = string.Equals(activeProvider, "Simulator", StringComparison.OrdinalIgnoreCase);
        bool isGeminiPreferred = string.Equals(activeProvider, "Gemini", StringComparison.OrdinalIgnoreCase);

        var groqApiKey = _configuration?["GroqCloud:ApiKey"] ?? _configuration?["GrokqCloud:ApiKey"];
        var groqModel = _configuration?["GroqCloud:Model"] ?? _configuration?["GrokqCloud:Model"] ?? "openai/gpt-oss-120b";

        if (!isSimulatorSelected && !isGeminiPreferred && !string.IsNullOrWhiteSpace(groqApiKey) && _httpClientFactory != null)
        {
            try
            {
                var groqResult = await TryGenerateWithGroqCloudAsync(
                    groqApiKey, groqModel, title, desc, level, missionCount, vocabCount, grammarCount, cancellationToken);
                if (groqResult != null &&
                    groqResult.Missions.Count >= missionCount &&
                    groqResult.TargetVocabularies.Count >= vocabCount &&
                    groqResult.TargetGrammars.Count >= grammarCount)
                {
                    return ApiResponse<GeneratedLevelContentDto>.Ok(groqResult, $"Tạo gợi ý nội dung AI ({groqModel}) cho trình độ {level} thành công.");
                }
            }
            catch
            {
                // Fallback to Gemini or built-in generator below
            }
        }

        var apiKey = _configuration?["Gemini:ApiKey"];
        var model = _configuration?["Gemini:Model"] ?? "gemini-3.1-flash-lite";

        if (!isSimulatorSelected && !string.IsNullOrWhiteSpace(apiKey) && _httpClientFactory != null)
        {
            try
            {
                var geminiResult = await TryGenerateWithGeminiAsync(
                    apiKey, model, title, desc, level, missionCount, vocabCount, grammarCount, cancellationToken);
                if (geminiResult != null &&
                    geminiResult.Missions.Count >= missionCount &&
                    geminiResult.TargetVocabularies.Count >= vocabCount &&
                    geminiResult.TargetGrammars.Count >= grammarCount)
                {
                    return ApiResponse<GeneratedLevelContentDto>.Ok(geminiResult, $"Tạo gợi ý nội dung AI ({model}) cho trình độ {level} thành công.");
                }
            }
            catch
            {
                // Fallback to built-in generator below
            }
        }

        bool isFood = title.Contains("Ramen", StringComparison.OrdinalIgnoreCase) ||
                      title.Contains("mì", StringComparison.OrdinalIgnoreCase) ||
                      title.Contains("ăn", StringComparison.OrdinalIgnoreCase) ||
                      title.Contains("quán", StringComparison.OrdinalIgnoreCase) ||
                      title.Contains("nhà hàng", StringComparison.OrdinalIgnoreCase);

        bool isJob = title.Contains("Baito", StringComparison.OrdinalIgnoreCase) ||
                     title.Contains("việc", StringComparison.OrdinalIgnoreCase) ||
                     title.Contains("phỏng vấn", StringComparison.OrdinalIgnoreCase) ||
                     title.Contains("làm thêm", StringComparison.OrdinalIgnoreCase);

        List<CreateMissionDto> candidateMissions;
        List<CreateVocabularyDto> candidateVocabs;
        List<CreateGrammarDto> candidateGrammars;

        if (level == "N5")
        {
            if (isFood)
            {
                result.AiPersona = "Nhân viên phục vụ quán (nói tiếng Nhật cơ bản, chậm rãi và nhiệt tình)";
                candidateMissions =
                [
                    new() { Order = 1, Content = "Chào nhân viên và hỏi xem thực đơn (Menu)", Target = "Hỏi thực đơn" },
                    new() { Order = 2, Content = "Gọi món ăn chính và chọn khẩu phần theo sở thích", Target = "Gọi món kèm yêu cầu" },
                    new() { Order = 3, Content = "Hỏi tính tiền và nói lời cảm ơn khi rời quán", Target = "Thanh toán & Cảm ơn" },
                    new() { Order = 4, Content = "Hỏi nhân viên về đồ uống hoặc nước lọc dùng kèm", Target = "Gọi đồ uống" },
                    new() { Order = 5, Content = "Hỏi giá tiền của món ăn trước khi xác nhận đặt món", Target = "Hỏi giá món ăn" },
                    new() { Order = 6, Content = "Xin thêm đũa, thìa hoặc khăn giấy tại bàn ăn", Target = "Xin dụng cụ ăn uống" }
                ];
                candidateVocabs =
                [
                    new() { Word = "メニュー", Reading = "めにゅー", Meaning = "Thực đơn" },
                    new() { Word = "注文", Reading = "ちゅうもん", Meaning = "Gọi món / Đặt hàng" },
                    new() { Word = "お会計", Reading = "おかいけい", Meaning = "Tính tiền" },
                    new() { Word = "お水", Reading = "おみず", Meaning = "Nước lọc" },
                    new() { Word = "おいしい", Reading = "おいしい", Meaning = "Ngon" },
                    new() { Word = "いくら", Reading = "いくら", Meaning = "Bao nhiêu tiền" }
                ];
                candidateGrammars =
                [
                    new() { Pattern = "～をください", Meaning = "Xin vui lòng cho tôi...", ExampleSentence = "お水をください。" },
                    new() { Pattern = "～はありますか", Meaning = "Có ... không?", ExampleSentence = "メニューはありますか。" },
                    new() { Pattern = "～をお願いします", Meaning = "Làm ơn cho tôi...", ExampleSentence = "お会計をお願いします。" },
                    new() { Pattern = "～はいくらですか", Meaning = "...giá bao nhiêu tiền?", ExampleSentence = "これはいくらですか。" },
                    new() { Pattern = "～たいです", Meaning = "Tôi muốn...", ExampleSentence = "これを食べたいです。" }
                ];
            }
            else if (isJob)
            {
                result.AiPersona = "Quản lý cửa hàng (nói chậm, phát âm rõ ràng, hỗ trợ ứng viên N5)";
                candidateMissions =
                [
                    new() { Order = 1, Content = "Chào hỏi và giới thiệu tên, trường học của bản thân", Target = "Chào hỏi & Tự giới thiệu" },
                    new() { Order = 2, Content = "Nêu số ngày và các buổi trong tuần có thể đi làm", Target = "Trao đổi ca làm việc" },
                    new() { Order = 3, Content = "Xác nhận tinh thần làm việc chăm chỉ và cảm ơn người phỏng vấn", Target = "Cam kết & Kết thúc" },
                    new() { Order = 4, Content = "Cho biết phương tiện và thời gian di chuyển từ nhà đến chỗ làm", Target = "Nêu cách đi lại" },
                    new() { Order = 5, Content = "Trả lời về ngày có thể bắt đầu đi làm chính thức", Target = "Xác nhận ngày bắt đầu" },
                    new() { Order = 6, Content = "Hỏi về đồng phục hoặc giờ nghỉ giải lao trong ca làm", Target = "Hỏi thông tin ca làm" }
                ];
                candidateVocabs =
                [
                    new() { Word = "アルバイト", Reading = "あるばいと", Meaning = "Việc làm thêm" },
                    new() { Word = "留学生", Reading = "りゅうがくせい", Meaning = "Du học sinh" },
                    new() { Word = "平日", Reading = "へいじつ", Meaning = "Ngày trong tuần" },
                    new() { Word = "頑張ります", Reading = "がんばります", Meaning = "Sẽ cố gắng hết sức" },
                    new() { Word = "週末", Reading = "しゅうまつ", Meaning = "Cuối tuần" },
                    new() { Word = "時間", Reading = "じかん", Meaning = "Thời gian / Giờ giấc" }
                ];
                candidateGrammars =
                [
                    new() { Pattern = "～から来ました", Meaning = "Đến từ...", ExampleSentence = "ベトナムから来ました。" },
                    new() { Pattern = "～ができます", Meaning = "Có thể làm...", ExampleSentence = "火曜日と木曜日に働くことができます。" },
                    new() { Pattern = "よろしくお願いします", Meaning = "Xin nhờ giúp đỡ/chiếu cố", ExampleSentence = "どうぞよろしくお願いします。" },
                    new() { Pattern = "～から～まで", Meaning = "Từ... đến...", ExampleSentence = "9時から5時まで働けます。" },
                    new() { Pattern = "～で来ます", Meaning = "Đến bằng (phương tiện)...", ExampleSentence = "自転車で来ます。" }
                ];
            }
            else
            {
                result.AiPersona = $"Người đối thoại bản xứ trong tình huống '{title}' (dùng từ vựng N5 đơn giản, câu ngắn dễ hiểu)";
                candidateMissions =
                [
                    new() { Order = 1, Content = $"Chào hỏi lịch sự và mở đầu cuộc trò chuyện về '{title}'", Target = "Chào hỏi ban đầu" },
                    new() { Order = 2, Content = $"Trình bày thông tin hoặc câu hỏi chính liên quan đến '{title}'", Target = "Nêu yêu cầu chính" },
                    new() { Order = 3, Content = "Xác nhận lại thông tin vừa trao đổi và cảm ơn / chào tạm biệt lịch sự", Target = "Xác nhận & Chào tạm biệt" },
                    new() { Order = 4, Content = "Hỏi thêm thông tin chi tiết về thời gian, địa điểm hoặc hướng dẫn cụ thể", Target = "Hỏi thông tin chi tiết" },
                    new() { Order = 5, Content = "Nhờ người đối thoại nói chậm lại hoặc nhắc lại thông tin quan trọng", Target = "Xin nhắc lại thông tin" },
                    new() { Order = 6, Content = "Bày tỏ sự đồng ý và xác nhận các bước thực hiện tiếp theo", Target = "Đồng ý & Xác nhận" }
                ];
                candidateVocabs =
                [
                    new() { Word = "すみません", Reading = "すみません", Meaning = "Xin lỗi / Xin hỏi" },
                    new() { Word = "お願いします", Reading = "おねがいします", Meaning = "Làm ơn" },
                    new() { Word = "ありがとうございます", Reading = "ありがとうございます", Meaning = "Xin cảm ơn" },
                    new() { Word = "わかりました", Reading = "わかりました", Meaning = "Tôi đã hiểu rồi" },
                    new() { Word = "大丈夫", Reading = "だいじょうぶ", Meaning = "Không sao / Ổn" },
                    new() { Word = "もう一度", Reading = "もういちど", Meaning = "Một lần nữa" }
                ];
                candidateGrammars =
                [
                    new() { Pattern = "～はどこですか", Meaning = "...ở đâu vậy?", ExampleSentence = "受付はどこですか。" },
                    new() { Pattern = "～をください", Meaning = "Cho tôi...", ExampleSentence = "これをください。" },
                    new() { Pattern = "～たいです", Meaning = "Tôi muốn...", ExampleSentence = "確認したいです。" },
                    new() { Pattern = "～ませんか", Meaning = "Cùng làm... nhé / Có được không?", ExampleSentence = "一緒に確認しませんか。" },
                    new() { Pattern = "～てください", Meaning = "Xin hãy làm...", ExampleSentence = "もう一度言ってください。" }
                ];
            }
        }
        else if (level == "N4")
        {
            if (isFood)
            {
                result.AiPersona = "Bếp trưởng / Nhân viên lâu năm (giao tiếp tự nhiên, gợi ý món đặc biệt)";
                candidateMissions =
                [
                    new() { Order = 1, Content = "Hỏi thăm món ăn nổi bật hoặc set ăn đề xuất của quán hôm nay", Target = "Hỏi món đề xuất (Osusume)" },
                    new() { Order = 2, Content = "Yêu cầu điều chỉnh thành phần món ăn theo khẩu vị cá nhân", Target = "Tùy biến món ăn theo sở thích" },
                    new() { Order = 3, Content = "Khen ngợi món ăn ngon miệng và yêu cầu xuất hóa đơn", Target = "Phản hồi & Xin hóa đơn" },
                    new() { Order = 4, Content = "Hỏi về thời gian chờ món ăn và các nguyên liệu có trong món", Target = "Hỏi nguyên liệu & Thời gian chờ" },
                    new() { Order = 5, Content = "Hỏi về phương thức thanh toán (thẻ, tiền mặt, mã QR)", Target = "Hỏi phương thức thanh toán" },
                    new() { Order = 6, Content = "Gọi thêm món tráng miệng hoặc đồ uống sau bữa chính", Target = "Gọi thêm món phụ" }
                ];
                candidateVocabs =
                [
                    new() { Word = "おすすめ", Reading = "おすすめ", Meaning = "Món khuyên dùng/gợi ý" },
                    new() { Word = "大盛り", Reading = "おおもり", Meaning = "Phần lớn / Bát to" },
                    new() { Word = "領収書", Reading = "りょうしゅうしょ", Meaning = "Hóa đơn biên nhận" },
                    new() { Word = "別々", Reading = "べつべつ", Meaning = "Tính tiền riêng" },
                    new() { Word = "材料", Reading = "ざいりょう", Meaning = "Nguyên liệu" },
                    new() { Word = "現金", Reading = "げんきん", Meaning = "Tiền mặt" }
                ];
                candidateGrammars =
                [
                    new() { Pattern = "～てもいいですか", Meaning = "Làm... có được không?", ExampleSentence = "ネギを少なめにしてもいいですか。" },
                    new() { Pattern = "～たらどうですか", Meaning = "Nếu thử... thì sao?", ExampleSentence = "このセットにしたらどうですか。" },
                    new() { Pattern = "～てほしいです", Meaning = "Muốn ai đó làm...", ExampleSentence = "領収書を書いてほしいです。" },
                    new() { Pattern = "～ないでください", Meaning = "Xin đừng làm...", ExampleSentence = "わさびを入れないでください。" },
                    new() { Pattern = "～ことができます", Meaning = "Có thể...", ExampleSentence = "カードで払うことができますか。" }
                ];
            }
            else if (isJob)
            {
                result.AiPersona = "Trưởng ca cửa hàng (hỏi kỹ kinh nghiệm, tình huống xử lý khi đông khách)";
                candidateMissions =
                [
                    new() { Order = 1, Content = "Trình bày lý do chọn cửa hàng này để nộp hồ sơ xin việc", Target = "Động lực xin việc (Shibou Douki)" },
                    new() { Order = 2, Content = "Chia sẻ về kinh nghiệm làm việc trước đây hoặc kỹ năng mềm của bản thân", Target = "Trình bày kinh nghiệm" },
                    new() { Order = 3, Content = "Đặt câu hỏi về chế độ hỗ trợ chi phí đi lại và quy trình đào tạo", Target = "Hỏi câu hỏi ngược (Gyakushitsumon)" },
                    new() { Order = 4, Content = "Giải thích cách xử lý khi bận việc đột xuất hoặc cần đổi ca làm", Target = "Cách báo nghỉ / đổi ca" },
                    new() { Order = 5, Content = "Nêu điểm mạnh của bản thân khi làm việc nhóm cùng đồng nghiệp", Target = "Nêu điểm mạnh cá nhân" },
                    new() { Order = 6, Content = "Xác nhận thời gian nhận kết quả phỏng vấn và chào ra về lịch sự", Target = "Xác nhận kết quả & Chào tạm biệt" }
                ];
                candidateVocabs =
                [
                    new() { Word = "志望動機", Reading = "しぼうどうき", Meaning = "Lý do/động lực xin việc" },
                    new() { Word = "接客", Reading = "せっきゃく", Meaning = "Phục vụ khách hàng" },
                    new() { Word = "交通費", Reading = "こうつうひ", Meaning = "Phí đi lại" },
                    new() { Word = "研修", Reading = "けんしゅう", Meaning = "Đào tạo/tập huấn" },
                    new() { Word = "経験", Reading = "けいけん", Meaning = "Kinh nghiệm" },
                    new() { Word = "シフト", Reading = "しふと", Meaning = "Ca làm việc" }
                ];
                candidateGrammars =
                [
                    new() { Pattern = "～たことがあります", Meaning = "Đã từng...", ExampleSentence = "飲食店で働いたことがあります。" },
                    new() { Pattern = "～ようになりたいです", Meaning = "Muốn trở nên...", ExampleSentence = "早く仕事を覚えられるようになりたいです。" },
                    new() { Pattern = "～について教えていただけませんか", Meaning = "Có thể chỉ cho tôi về... không?", ExampleSentence = "研修期間について教えていただけませんか。" },
                    new() { Pattern = "～と思います", Meaning = "Tôi nghĩ rằng...", ExampleSentence = "接客の仕事が合っていると思います。" },
                    new() { Pattern = "～ば～ほど", Meaning = "Càng... càng...", ExampleSentence = "練習すればするほど上手になります。" }
                ];
            }
            else
            {
                result.AiPersona = $"Người phụ trách / Đối tác giao tiếp trong tình huống '{title}' (trao đổi tự nhiên ở trình độ trung cấp N4)";
                candidateMissions =
                [
                    new() { Order = 1, Content = $"Trình bày rõ bối cảnh cụ thể và lý do phát sinh sự việc trong '{title}'", Target = "Giải thích nguyên nhân" },
                    new() { Order = 2, Content = "Đưa ra giải pháp đề xuất hoặc xin lời khuyên từ người đối thoại", Target = "Tham vấn ý kiến" },
                    new() { Order = 3, Content = "Thống nhất mốc thời gian, phương án xử lý và kế hoạch tiếp theo", Target = "Chốt kế hoạch" },
                    new() { Order = 4, Content = "Hỏi kỹ về các điều kiện hoặc lưu ý cần chuẩn bị trước", Target = "Hỏi điều kiện & Lưu ý" },
                    new() { Order = 5, Content = "Giải thích thêm về hoàn cảnh cá nhân để nhận được sự hỗ trợ phù hợp", Target = "Chia sẻ hoàn cảnh cụ thể" },
                    new() { Order = 6, Content = "Xác nhận lại toàn bộ nội dung đã thống nhất và cảm ơn sự hỗ trợ", Target = "Tổng kết & Cảm ơn" }
                ];
                candidateVocabs =
                [
                    new() { Word = "相談", Reading = "そうだん", Meaning = "Trao đổi, thảo luận" },
                    new() { Word = "連絡", Reading = "れんらく", Meaning = "Liên lạc" },
                    new() { Word = "確認", Reading = "かくにん", Meaning = "Xác nhận" },
                    new() { Word = "予定", Reading = "よてい", Meaning = "Dự định, lịch trình" },
                    new() { Word = "準備", Reading = "じゅんび", Meaning = "Chuẩn bị" },
                    new() { Word = "説明", Reading = "せつめい", Meaning = "Giải thích, trình bày" }
                ];
                candidateGrammars =
                [
                    new() { Pattern = "～ていただけませんか", Meaning = "Có thể làm ơn... được không?", ExampleSentence = "確認していただけませんか。" },
                    new() { Pattern = "～なければなりません", Meaning = "Phải làm...", ExampleSentence = "明日までに連絡しなければなりません。" },
                    new() { Pattern = "～てもいいですか", Meaning = "Làm... có được không?", ExampleSentence = "ここで待ってもいいですか。" },
                    new() { Pattern = "～たらどうですか", Meaning = "Nếu thử... thì sao?", ExampleSentence = "担当者に相談したらどうですか。" },
                    new() { Pattern = "～ので", Meaning = "Vì... nên...", ExampleSentence = "用事があるので、少し遅れます。" }
                ];
            }
        }
        else // N3
        {
            if (isFood)
            {
                result.AiPersona = "Chủ quán / Quản lý nhà hàng cao cấp (giao tiếp tinh tế, sử dụng kính ngữ chuẩn mực)";
                candidateMissions =
                [
                    new() { Order = 1, Content = "Đặt bàn trước và hỏi về các món ăn theo mùa hoặc thực đơn cho người kiêng ăn", Target = "Trao đổi yêu cầu ẩm thực đặc biệt" },
                    new() { Order = 2, Content = "Xử lý khéo léo khi có sự nhầm lẫn nhỏ trong món ăn bằng ngôn từ lịch thiệp", Target = "Góp ý tế nhị bằng kính ngữ" },
                    new() { Order = 3, Content = "Bày tỏ sự cảm kích về phong cách phục vụ và ngỏ ý giới thiệu cho bạn bè", Target = "Tạo thiện cảm & Quan hệ khách quen" },
                    new() { Order = 4, Content = "Yêu cầu bố trí phòng riêng hoặc chỗ ngồi yên tĩnh cho buổi tiếp khách", Target = "Đặt chỗ ngồi theo yêu cầu" },
                    new() { Order = 5, Content = "Tham khảo ý kiến quản lý về cách kết hợp đồ uống phù hợp với món chính", Target = "Tham vấn kết hợp ẩm thực" },
                    new() { Order = 6, Content = "Xác nhận chi phí dịch vụ và xuất hóa đơn công ty đầy đủ thông tin", Target = "Thanh toán & Xuất hóa đơn công ty" }
                ];
                candidateVocabs =
                [
                    new() { Word = "旬の食材", Reading = "しゅんのしょくざい", Meaning = "Nguyên liệu theo mùa" },
                    new() { Word = "アレルギー", Reading = "あれるぎー", Meaning = "Dị ứng thực phẩm" },
                    new() { Word = "恐れ入ります", Reading = "おそれいります", Meaning = "Xin thứ lỗi/thật ngại quá" },
                    new() { Word = "堪能する", Reading = "たんのうする", Meaning = "Thưởng thức trọn vẹn" },
                    new() { Word = "予約", Reading = "よやく", Meaning = "Đặt chỗ trước" },
                    new() { Word = "個室", Reading = "こしつ", Meaning = "Phòng riêng" }
                ];
                candidateGrammars =
                [
                    new() { Pattern = "～につきましては", Meaning = "Về vấn đề...", ExampleSentence = "アレルギーの件につきましては、事前に対応可能でしょうか。" },
                    new() { Pattern = "～させていただきます", Meaning = "Xin phép được...", ExampleSentence = "こちらの席を利用させていただきます。" },
                    new() { Pattern = "～ていただけますと幸いです", Meaning = "Nếu có thể... thì tôi rất biết ơn", ExampleSentence = "ご確認いただけますと幸いです。" },
                    new() { Pattern = "～かねます", Meaning = "Khó có thể...", ExampleSentence = "本日は変更いたしかねます。" },
                    new() { Pattern = "～おかげで", Meaning = "Nhờ có...", ExampleSentence = "スタッフの皆様のおかげで楽しい時間を過ごせました。" }
                ];
            }
            else if (isJob)
            {
                result.AiPersona = "Giám đốc nhân sự / Chủ doanh nghiệp (phỏng vấn sâu về định hướng nghề nghiệp và năng lực giải quyết vấn đề)";
                candidateMissions =
                [
                    new() { Order = 1, Content = "Dùng kính ngữ Keigo mở đầu trang trọng và giới thiệu điểm mạnh nổi trội", Target = "Mở đầu trang trọng & Nêu điểm mạnh" },
                    new() { Order = 2, Content = "Trình bày cách xử lý một xung đột hoặc tình huống khó khăn với khách hàng khó tính", Target = "Giải quyết tình huống nghiệp vụ phức tạp" },
                    new() { Order = 3, Content = "Nêu định hướng phát triển lâu dài và bày tỏ mong muốn đóng góp cho tổ chức", Target = "Cam kết cống hiến & Kết thúc phỏng vấn" },
                    new() { Order = 4, Content = "Phân tích bài học rút ra từ một thất bại hoặc thử thách trong quá khứ", Target = "Phân tích kinh nghiệm thực tế" },
                    new() { Order = 5, Content = "Trao đổi chuyên sâu về văn hóa làm việc và kỳ vọng đối với vị trí ứng tuyển", Target = "Tìm hiểu văn hóa & Kỳ vọng" },
                    new() { Order = 6, Content = "Đề xuất giải pháp cải thiện hiệu suất công việc dựa trên kỹ năng cá nhân", Target = "Đề xuất giá trị đóng góp" }
                ];
                candidateVocabs =
                [
                    new() { Word = "強み", Reading = "つよみ", Meaning = "Điểm mạnh, sở trường" },
                    new() { Word = "柔軟性", Reading = "じゅうなんせい", Meaning = "Tính linh hoạt" },
                    new() { Word = "トラブル対応", Reading = "とらぶるたいおう", Meaning = "Xử lý sự cố" },
                    new() { Word = "貢献する", Reading = "こうけんする", Meaning = "Đóng góp, cống hiến" },
                    new() { Word = "責任感", Reading = "せきにんかん", Meaning = "Tinh thần trách nhiệm" },
                    new() { Word = "キャリア", Reading = "きゃりあ", Meaning = "Sự nghiệp / Định hướng" }
                ];
                candidateGrammars =
                [
                    new() { Pattern = "～と存じます", Meaning = "Tôi nghĩ/tin rằng (khiêm nhường)", ExampleSentence = "貴社の力になれると存じます。" },
                    new() { Pattern = "～にもかかわらず", Meaning = "Mặc dù... nhưng vẫn...", ExampleSentence = "未経験にもかかわらず、挑戦したいと考えております。" },
                    new() { Pattern = "～わけにはまいりません", Meaning = "Không thể làm...", ExampleSentence = "お客様にご迷惑をおかけするわけにはまいりません。" },
                    new() { Pattern = "～を通じて", Meaning = "Thông qua...", ExampleSentence = "アルバイトを通じて多くのことを学びました。" },
                    new() { Pattern = "～に関して", Meaning = "Liên quan đến...", ExampleSentence = "業務内容に関して質問させていただいてもよろしいでしょうか。" }
                ];
            }
            else
            {
                result.AiPersona = $"Quản lý cấp cao / Đối tác chuyên môn trong tình huống '{title}' (giao tiếp lịch thiệp bằng kính ngữ N3)";
                candidateMissions =
                [
                    new() { Order = 1, Content = $"Trình bày mục đích cuộc trao đổi về '{title}' với ngôn ngữ lịch sự chuẩn mực", Target = "Mở đầu trang trọng" },
                    new() { Order = 2, Content = "Phân tích tình hình, phản hồi các câu hỏi và đưa ra lập luận thuyết phục", Target = "Thuyết phục & Thảo luận đa chiều" },
                    new() { Order = 3, Content = "Tổng hợp thỏa thuận chung và xác nhận các bước phối hợp tiếp theo", Target = "Chốt phương án & Thỏa thuận" },
                    new() { Order = 4, Content = "Đề xuất phương án dự phòng để xử lý các rủi ro có thể phát sinh", Target = "Đề xuất phương án dự phòng" },
                    new() { Order = 5, Content = "Xin ý kiến đánh giá và phản hồi từ đối tác để hoàn thiện kế hoạch", Target = "Tiếp nhận phản hồi chuyên môn" },
                    new() { Order = 6, Content = "Bày tỏ lòng biết ơn sâu sắc về sự hợp tác và hẹn lịch làm việc tiếp theo", Target = "Bày tỏ sự trân trọng & Hẹn lịch" }
                ];
                candidateVocabs =
                [
                    new() { Word = "検討", Reading = "けんとう", Meaning = "Cân nhắc, xem xét" },
                    new() { Word = "承知", Reading = "しょうち", Meaning = "Hiểu rõ / Chấp thuận" },
                    new() { Word = "日程調整", Reading = "にっていちょうせい", Meaning = "Điều chỉnh lịch hẹn" },
                    new() { Word = "ご配慮", Reading = "ごはいりょ", Meaning = "Sự quan tâm, chu đáo" },
                    new() { Word = "提案", Reading = "ていあん", Meaning = "Đề xuất, kiến nghị" },
                    new() { Word = "解決", Reading = "かいけつ", Meaning = "Giải quyết問題" }
                ];
                candidateGrammars =
                [
                    new() { Pattern = "～につきまして", Meaning = "Liên quan đến...", ExampleSentence = "今後の進め方につきましてご相談がございます。" },
                    new() { Pattern = "お～申し上げます", Meaning = "Xin phép được...", ExampleSentence = "心より感謝申し上げます。" },
                    new() { Pattern = "～させていただきます", Meaning = "Xin phép được làm...", ExampleSentence = "詳細をご説明させていただきます。" },
                    new() { Pattern = "～ていただけますでしょうか", Meaning = "Có thể vui lòng... được không ạ?", ExampleSentence = "ご検討いただけますでしょうか。" },
                    new() { Pattern = "～に関して", Meaning = "Về việc / Liên quan đến...", ExampleSentence = "この件に関してご意見を伺いたいです。" }
                ];
            }
        }

        // Pad if requested count exceeds candidate pool
        while (candidateMissions.Count < missionCount)
        {
            int nextOrder = candidateMissions.Count + 1;
            candidateMissions.Add(new CreateMissionDto
            {
                Order = nextOrder,
                Content = $"Mở rộng trao đổi chi tiết bước {nextOrder} trong tình huống '{title}' ({level})",
                Target = $"Hoàn thành mục tiêu giao tiếp số {nextOrder}"
            });
        }

        while (candidateVocabs.Count < vocabCount)
        {
            int nextIdx = candidateVocabs.Count + 1;
            candidateVocabs.Add(new CreateVocabularyDto
            {
                Word = $"表現 {nextIdx}",
                Reading = $"ひょうげん {nextIdx}",
                Meaning = $"Từ vựng mở rộng số {nextIdx} cho '{title}'"
            });
        }

        while (candidateGrammars.Count < grammarCount)
        {
            int nextIdx = candidateGrammars.Count + 1;
            candidateGrammars.Add(new CreateGrammarDto
            {
                Pattern = $"～表現パターン({nextIdx})",
                Meaning = $"Mẫu câu giao tiếp mở rộng số {nextIdx} ({level})",
                ExampleSentence = $"この場面でよく使われる表現（{nextIdx}）です。"
            });
        }

        result.Missions = candidateMissions
            .Take(missionCount)
            .Select((m, idx) => new CreateMissionDto
            {
                Order = idx + 1,
                Content = m.Content,
                Target = m.Target,
                Intent = m.Intent ?? "CompleteMission",
                Conditions = m.Conditions ?? []
            })
            .ToList();

        result.TargetVocabularies = candidateVocabs.Take(vocabCount).ToList();
        result.TargetGrammars = candidateGrammars.Take(grammarCount).ToList();

        return ApiResponse<GeneratedLevelContentDto>.Ok(result, $"Tạo gợi ý nội dung AI cho trình độ {level} thành công.");
    }

    private async Task<GeneratedLevelContentDto?> TryGenerateWithGeminiAsync(
        string apiKey,
        string model,
        string title,
        string desc,
        string level,
        int missionCount,
        int vocabCount,
        int grammarCount,
        CancellationToken cancellationToken)
    {
        var httpClient = _httpClientFactory!.CreateClient();
        var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

        var prompt = $@"Bạn là chuyên gia thiết kế bài học hội thoại tiếng Nhật JLPT {level}.
Chủ đề kịch bản: ""{title}""
Mô tả kịch bản: ""{desc}""
Trình độ JLPT: {level}

Hãy tạo nội dung cấu hình kịch bản phù hợp chặt chẽ với chủ đề trên theo yêu cầu số lượng chính xác sau:
- Số lượng nhiệm vụ (missions): đúng {missionCount} nhiệm vụ (bằng tiếng Việt, cụ thể theo đúng tình huống ""{title}"").
- Số lượng từ vựng (targetVocabularies): đúng {vocabCount} từ vựng tiếng Nhật trình độ {level} liên quan trực tiếp đến ""{title}"".
- Số lượng ngữ pháp (targetGrammars): đúng {grammarCount} mẫu ngữ pháp trình độ {level} phù hợp với ""{title}"".

Trả về JSON thuần túy theo cấu trúc:
{{
  ""title"": ""{title} ({level})"",
  ""description"": ""Mô tả bối cảnh cụ thể cho trình độ {level}"",
  ""aiPersona"": ""Vai trò của AI trong tình huống này (tiếng Việt)"",
  ""missions"": [
    {{ ""order"": 1, ""content"": ""Nội dung nhiệm vụ 1"", ""target"": ""Mục tiêu ngắn gọn"" }}
  ],
  ""targetVocabularies"": [
    {{ ""word"": ""Từ tiếng Nhật"", ""reading"": ""Cách đọc Hiragana"", ""meaning"": ""Nghĩa tiếng Việt"" }}
  ],
  ""targetGrammars"": [
    {{ ""pattern"": ""Mẫu ngữ pháp"", ""meaning"": ""Ý nghĩa tiếng Việt"", ""exampleSentence"": ""Câu ví dụ tiếng Nhật"" }}
  ]
}}";

        var requestBody = new
        {
            contents = new[]
            {
                new
                {
                    role = "user",
                    parts = new[] { new { text = prompt } }
                }
            },
            generationConfig = new
            {
                temperature = 0.7,
                responseMimeType = "application/json"
            }
        };

        var json = JsonSerializer.Serialize(requestBody, CriteriaJsonOptions);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        var response = await httpClient.PostAsync(endpoint, content, cancellationToken);
        if (!response.IsSuccessStatusCode) return null;

        var responseString = await response.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(responseString);
        var candidates = doc.RootElement.GetProperty("candidates");
        if (candidates.GetArrayLength() == 0) return null;

        var text = candidates[0].GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString();
        if (string.IsNullOrWhiteSpace(text)) return null;

        var parsed = JsonSerializer.Deserialize<GeneratedLevelContentDto>(text, CriteriaJsonOptions);
        if (parsed == null) return null;

        parsed.JLPTLevel = level;
        for (int i = 0; i < parsed.Missions.Count; i++)
        {
            parsed.Missions[i].Order = i + 1;
            if (string.IsNullOrWhiteSpace(parsed.Missions[i].Target))
            {
                parsed.Missions[i].Target = parsed.Missions[i].Content;
            }
        }

        return parsed;
    }

    private async Task<GeneratedLevelContentDto?> TryGenerateWithGroqCloudAsync(
        string apiKey,
        string model,
        string title,
        string desc,
        string level,
        int missionCount,
        int vocabCount,
        int grammarCount,
        CancellationToken cancellationToken)
    {
        var httpClient = _httpClientFactory!.CreateClient();
        const string endpoint = "https://api.groq.com/openai/v1/chat/completions";

        var prompt = $@"Bạn là chuyên gia thiết kế bài học hội thoại tiếng Nhật JLPT {level}.
Chủ đề kịch bản: ""{title}""
Mô tả kịch bản: ""{desc}""
Trình độ JLPT: {level}

Hãy tạo nội dung cấu hình kịch bản phù hợp chặt chẽ với chủ đề trên theo yêu cầu số lượng chính xác sau:
- Số lượng nhiệm vụ (missions): đúng {missionCount} nhiệm vụ (bằng tiếng Việt, cụ thể theo đúng tình huống ""{title}"").
- Số lượng từ vựng (targetVocabularies): đúng {vocabCount} từ vựng tiếng Nhật trình độ {level} liên quan trực tiếp đến ""{title}"".
- Số lượng ngữ pháp (targetGrammars): đúng {grammarCount} mẫu ngữ pháp trình độ {level} phù hợp với ""{title}"".

Trả về JSON thuần túy theo cấu trúc:
{{
  ""title"": ""{title} ({level})"",
  ""description"": ""Mô tả bối cảnh cụ thể cho trình độ {level}"",
  ""aiPersona"": ""Vai trò của AI trong tình huống này (tiếng Việt)"",
  ""missions"": [
    {{ ""order"": 1, ""content"": ""Nội dung nhiệm vụ 1"", ""target"": ""Mục tiêu ngắn gọn"" }}
  ],
  ""targetVocabularies"": [
    {{ ""word"": ""Từ tiếng Nhật"", ""reading"": ""Cách đọc Hiragana"", ""meaning"": ""Nghĩa tiếng Việt"" }}
  ],
  ""targetGrammars"": [
    {{ ""pattern"": ""Mẫu ngữ pháp"", ""meaning"": ""Ý nghĩa tiếng Việt"", ""exampleSentence"": ""Câu ví dụ tiếng Nhật"" }}
  ]
}}";

        var requestBody = new
        {
            model,
            messages = new[]
            {
                new { role = "user", content = prompt }
            },
            temperature = 0.7,
            response_format = new { type = "json_object" }
        };

        var json = JsonSerializer.Serialize(requestBody, CriteriaJsonOptions);
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

        var response = await httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode) return null;

        var responseString = await response.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(responseString);
        var choices = doc.RootElement.GetProperty("choices");
        if (choices.GetArrayLength() == 0) return null;

        var text = choices[0].GetProperty("message").GetProperty("content").GetString();
        if (string.IsNullOrWhiteSpace(text)) return null;

        var parsed = JsonSerializer.Deserialize<GeneratedLevelContentDto>(text, CriteriaJsonOptions);
        if (parsed == null) return null;

        parsed.JLPTLevel = level;
        for (int i = 0; i < parsed.Missions.Count; i++)
        {
            parsed.Missions[i].Order = i + 1;
            if (string.IsNullOrWhiteSpace(parsed.Missions[i].Target))
            {
                parsed.Missions[i].Target = parsed.Missions[i].Content;
            }
        }

        return parsed;
    }
}
