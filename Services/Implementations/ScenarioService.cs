using System.Globalization;
using System.Text;
using System.Text.Json;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Scenario;
using JCAP.Models;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations;

public class ScenarioService : IScenarioService
{
    private static readonly JsonSerializerOptions CriteriaJsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AppDbContext _dbContext;
    private readonly IAiClient? _aiClient;
    private readonly IHttpClientFactory? _httpClientFactory;
    private readonly IConfiguration? _configuration;

    public ScenarioService(
        AppDbContext dbContext,
        IAiClient? aiClient = null,
        IHttpClientFactory? httpClientFactory = null,
        IConfiguration? configuration = null)
    {
        _dbContext = dbContext;
        _aiClient = aiClient;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
    }

    private static bool ContainsWholeVietnameseCue(string text, params string[] cues)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        foreach (var cue in cues)
        {
            if (string.IsNullOrWhiteSpace(cue)) continue;
            if (cue.Contains(' '))
            {
                if (text.Contains(cue, StringComparison.OrdinalIgnoreCase)) return true;
            }
            else if (System.Text.RegularExpressions.Regex.IsMatch(
                text,
                $@"(?<![\p{{L}}\p{{N}}]){System.Text.RegularExpressions.Regex.Escape(cue)}(?![\p{{L}}\p{{N}}])",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                return true;
            }
        }
        return false;
    }

    public static string ResolveScenarioTopicCode(Scenario s)
    {
        var code = (s.ScenarioCode ?? string.Empty).ToUpperInvariant();
        var title = (s.Title ?? string.Empty).ToLowerInvariant();
        var desc = (s.Description ?? string.Empty).ToLowerInvariant();

        // 1. Ưu tiên mã kịch bản tường minh (ScenarioCode) trước mô tả để tránh match nhầm từ khóa bối cảnh phụ
        if (code.Contains("BAITO") || code.Contains("OFFICE") || code.Contains("WORK") || code.Contains("JOB"))
            return "STUDY_WORK";
        if (code.Contains("RAMEN") || code.Contains("CAFE") || code.Contains("DINING") || code.Contains("RESTAURANT"))
            return "DINING";
        if (code.Contains("SHINJUKU") || code.Contains("TRAIN") || code.Contains("TRANSIT") || code.Contains("TRANSPORT") || code.Contains("STATION"))
            return "TRANSPORT";
        if (code.Contains("7ELEVEN") || code.Contains("SHOPPING") || code.Contains("KONBINI"))
            return "SHOPPING";

        // 2. Xét tiêu đề (Title) theo ranh giới từ chuẩn tiếng Việt (tránh "ăn" khớp nhầm với "băng qua đường")
        if (ContainsWholeVietnameseCue(title, "phỏng vấn", "công sở", "xin việc", "làm thêm", "baito"))
            return "STUDY_WORK";
        if (ContainsWholeVietnameseCue(title, "băng qua đường", "cụ già", "giúp đỡ", "bệnh viện", "hàng xóm", "khách sạn"))
            return "DAILY_LIFE";
        if (ContainsWholeVietnameseCue(title, "ramen", "cà phê", "cafe", "quán ăn", "gọi món", "đặt món", "trà chiều", "nhà hàng", "quán mì", "mì", "uống"))
            return "DINING";
        if (ContainsWholeVietnameseCue(title, "vé tàu", "nhà ga", "ga", "tàu", "hỏi đường", "xe buýt", "sân bay"))
            return "TRANSPORT";
        if (ContainsWholeVietnameseCue(title, "mua sắm", "cửa hàng tiện lợi", "siêu thị", "konbini", "7-eleven"))
            return "SHOPPING";

        // 3. Fallback cuối cùng mới xét mô tả (Description)
        if (ContainsWholeVietnameseCue(desc, "phỏng vấn", "công sở", "xin việc", "làm thêm", "công việc", "danh thiếp"))
            return "STUDY_WORK";
        if (ContainsWholeVietnameseCue(desc, "ramen", "cà phê", "món ăn", "quán ăn", "đồ uống", "trà chiều"))
            return "DINING";
        if (ContainsWholeVietnameseCue(desc, "tàu điện", "ga tàu", "mua vé", "lối đi"))
            return "TRANSPORT";
        if (ContainsWholeVietnameseCue(desc, "mua sắm", "thanh toán", "cửa hàng tiện lợi", "siêu thị"))
            return "SHOPPING";

        return "DAILY_LIFE";
    }

    public static (string Name, string Icon, bool IsPrimary) GetTopicMetadata(string topicCode) => topicCode switch
    {
        "DINING" => ("Ẩm thực", "restaurant", true),
        "TRANSPORT" => ("Di chuyển", "train", true),
        "DAILY_LIFE" => ("Đời sống", "home", true),
        "SHOPPING" => ("Mua sắm", "shopping_bag", false),
        "STUDY_WORK" => ("Công sở", "work", false),
        _ => ("Đời sống", "category", false)
    };

    public async Task<ApiResponse<List<ScenarioTopicDto>>> GetTopicsAsync(CancellationToken cancellationToken = default)
    {
        var dbTopics = await _dbContext.LearningTopics
            .AsNoTracking()
            .Where(t => t.IsActive)
            .ToListAsync(cancellationToken);

        var scenarios = await _dbContext.Scenarios
            .AsNoTracking()
            .Where(s => s.IsActive)
            .ToListAsync(cancellationToken);

        var baseDbCodes = dbTopics
            .Select(t => t.Code.Contains('_') ? t.Code.Split('_')[0] : t.Code)
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .Distinct(StringComparer.OrdinalIgnoreCase);

        var topicCodes = new[] { "DINING", "TRANSPORT", "DAILY_LIFE", "SHOPPING", "STUDY_WORK" }
            .Union(baseDbCodes, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var result = new List<ScenarioTopicDto>();
        int autoId = 1;

        foreach (var code in topicCodes)
        {
            var meta = GetTopicMetadata(code);
            var matchingScenarios = scenarios.Count(s => ResolveScenarioTopicCode(s) == code);
            var matchedDbTopic = dbTopics.FirstOrDefault(t => string.Equals(t.Code, code, StringComparison.OrdinalIgnoreCase) || t.Code.StartsWith(code + "_", StringComparison.OrdinalIgnoreCase));
            var displayName = matchedDbTopic != null && !string.IsNullOrWhiteSpace(matchedDbTopic.Name) && !new[] { "DINING", "TRANSPORT", "DAILY_LIFE", "SHOPPING", "STUDY_WORK" }.Contains(code)
                ? matchedDbTopic.Name
                : meta.Name;

            result.Add(new ScenarioTopicDto
            {
                Id = matchedDbTopic?.Id ?? autoId++,
                Code = code,
                Name = displayName,
                Description = matchedDbTopic?.Description ?? $"Các tình huống đàm thoại chủ đề {displayName}",
                ScenarioCount = matchingScenarios,
                IsPrimary = meta.IsPrimary,
                Icon = meta.Icon
            });
        }

        return ApiResponse<List<ScenarioTopicDto>>.Ok(result, "Lấy danh sách chủ đề kịch bản thành công.");
    }

    public async Task<ApiResponse<List<ScenarioListDto>>> GetScenariosAsync(
        string? query = null,
        string? topic = null,
        CancellationToken cancellationToken = default)
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

        var dbTopics = await _dbContext.LearningTopics
            .AsNoTracking()
            .Where(t => t.IsActive)
            .ToListAsync(cancellationToken);

        var dtos = scenarios.Select(s =>
        {
            var tCode = ResolveScenarioTopicCode(s);
            var meta = GetTopicMetadata(tCode);
            var dbTopic = dbTopics.FirstOrDefault(t => t.Code == tCode || t.Code.StartsWith(tCode + "_"));
            return new ScenarioListDto
            {
                Id = s.Id,
                Title = s.Title,
                Description = s.Description,
                Thumbnail = s.Thumbnail,
                IsActive = s.IsActive,
                ScenarioCode = !string.IsNullOrWhiteSpace(s.ScenarioCode) ? s.ScenarioCode : $"SCN_{s.Id}",
                TopicId = dbTopic?.Id,
                TopicCode = tCode,
                TopicName = meta.Name,
                SupportedJLPTLevels = s.LevelConfigurations
                    .Where(lc => lc.Status == "Published")
                    .OrderBy(lc => lc.JLPTLevel)
                    .Select(lc => lc.JLPTLevel)
                    .ToList()
            };
        });

        if (!string.IsNullOrWhiteSpace(topic) && !string.Equals(topic, "ALL", StringComparison.OrdinalIgnoreCase))
        {
            var normTopic = topic.Trim().ToUpperInvariant();
            dtos = dtos.Where(s => s.TopicCode == normTopic || (s.TopicName != null && s.TopicName.Equals(topic.Trim(), StringComparison.OrdinalIgnoreCase)));
        }

        var result = dtos.ToList();
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

        var topicCode = ResolveScenarioTopicCode(scenario);
        var meta = GetTopicMetadata(topicCode);
        var dbTopics = await _dbContext.LearningTopics
            .AsNoTracking()
            .Include(t => t.TopicVocabularies)
                .ThenInclude(tv => tv.Vocabulary)
            .Include(t => t.TopicGrammars)
                .ThenInclude(tg => tg.Grammar)
            .Where(t => t.IsActive && (t.Code == topicCode || t.Code.StartsWith(topicCode + "_") || t.Name == meta.Name))
            .ToListAsync(cancellationToken);

        var matchedDbTopic = dbTopics.FirstOrDefault(t => t.Code == topicCode) ?? dbTopics.FirstOrDefault();

        var response = new ScenarioDetailsDto
        {
            Id = scenario.Id,
            Title = scenario.Title,
            Description = scenario.Description,
            Thumbnail = scenario.Thumbnail,
            IsActive = scenario.IsActive,
            ScenarioCode = !string.IsNullOrWhiteSpace(scenario.ScenarioCode) ? scenario.ScenarioCode : $"SCN_{scenario.Id}",
            TopicCode = topicCode,
            TopicName = matchedDbTopic != null && !string.IsNullOrWhiteSpace(matchedDbTopic.Name) ? matchedDbTopic.Name : meta.Name,
            TopicId = matchedDbTopic?.Id,
            LevelConfigurations = scenario.LevelConfigurations
                .OrderBy(level => level.JLPTLevel)
                .Select(MapLevel)
                .ToList()
        };

        // Bổ sung kho từ vựng/ngữ pháp mở rộng theo chủ đề cho từng level
        foreach (var lvlCfg in response.LevelConfigurations)
        {
            var targetWords = lvlCfg.TargetVocabularies.Select(v => v.Word.Trim()).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var targetPatterns = lvlCfg.TargetGrammars.Select(g => g.Pattern.Trim()).ToHashSet(StringComparer.OrdinalIgnoreCase);

            var lvlTopic = dbTopics.FirstOrDefault(t => t.JLPTLevel == lvlCfg.JLPTLevel) ?? matchedDbTopic;
            if (lvlTopic != null)
            {
                lvlCfg.TopicExpandedVocabularies = lvlTopic.TopicVocabularies
                    .Where(tv => tv.Vocabulary != null && tv.Vocabulary.IsActive && !targetWords.Contains(tv.Vocabulary.Word.Trim()))
                    .OrderBy(tv => tv.OrderIndex)
                    .Select(tv => new TargetVocabularyDto
                    {
                        Id = tv.VocabularyId,
                        Word = tv.Vocabulary.Word,
                        Reading = tv.Vocabulary.Reading,
                        Meaning = tv.Vocabulary.Meaning
                    })
                    .Take(8)
                    .ToList();

                lvlCfg.TopicExpandedGrammars = lvlTopic.TopicGrammars
                    .Where(tg => tg.Grammar != null && tg.Grammar.IsActive && !targetPatterns.Contains(tg.Grammar.Pattern.Trim()))
                    .OrderBy(tg => tg.OrderIndex)
                    .Select(tg => new TargetGrammarDto
                    {
                        Id = tg.GrammarId,
                        Pattern = tg.Grammar.Pattern,
                        Meaning = tg.Grammar.Meaning,
                        ExampleSentence = tg.Grammar.ExampleSentence
                    })
                    .Take(5)
                    .ToList();
            }
        }

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
            CreditCost = 0, // Bỏ phí 5 credit khi bắt đầu vào học: Phí khởi tạo phiên thoại luôn = 0
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
                    VocabularyId = v.VocabularyId,
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
                    GrammarId = g.GrammarId,
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
            .Include(s => s.LevelConfigurations)
            .OrderBy(s => s.Id)
            .ToListAsync(cancellationToken);

        // Tự động bổ sung ScenarioCode trong DB nếu bản ghi bị thiếu
        bool hasMissingCodes = false;
        foreach (var s in scenarios)
        {
            if (string.IsNullOrWhiteSpace(s.ScenarioCode))
            {
                s.ScenarioCode = $"SCN_{s.Id}";
                hasMissingCodes = true;
            }
        }

        if (hasMissingCodes)
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        var dbTopics = await _dbContext.LearningTopics
            .AsNoTracking()
            .Where(t => t.IsActive)
            .ToListAsync(cancellationToken);

        var result = scenarios.Select(s =>
        {
            var tCode = ResolveScenarioTopicCode(s);
            var meta = GetTopicMetadata(tCode);
            var dbTopic = dbTopics.FirstOrDefault(t => t.Code == tCode || t.Code.StartsWith(tCode + "_"));
            return new ScenarioListDto
            {
                Id = s.Id,
                Title = s.Title,
                Description = s.Description,
                Thumbnail = s.Thumbnail,
                IsActive = s.IsActive,
                ScenarioCode = !string.IsNullOrWhiteSpace(s.ScenarioCode) ? s.ScenarioCode : $"SCN_{s.Id}",
                TopicId = dbTopic?.Id,
                TopicCode = tCode,
                TopicName = meta.Name,
                SupportedJLPTLevels = s.LevelConfigurations
                    .Where(lc => lc.Status == "Published")
                    .OrderBy(lc => lc.JLPTLevel)
                    .Select(lc => lc.JLPTLevel)
                    .ToList()
            };
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

        var topicCode = ResolveScenarioTopicCode(scenario);
        var meta = GetTopicMetadata(topicCode);
        var dbTopics = await _dbContext.LearningTopics
            .AsNoTracking()
            .Include(t => t.TopicVocabularies)
                .ThenInclude(tv => tv.Vocabulary)
            .Include(t => t.TopicGrammars)
                .ThenInclude(tg => tg.Grammar)
            .Where(t => t.IsActive && (t.Code == topicCode || t.Code.StartsWith(topicCode + "_") || t.Name == meta.Name))
            .ToListAsync(cancellationToken);

        var matchedDbTopic = dbTopics.FirstOrDefault(t => t.Code == topicCode) ?? dbTopics.FirstOrDefault();

        var response = new ScenarioDetailsDto
        {
            Id = scenario.Id,
            Title = scenario.Title,
            Description = scenario.Description,
            Thumbnail = scenario.Thumbnail,
            IsActive = scenario.IsActive,
            ScenarioCode = !string.IsNullOrWhiteSpace(scenario.ScenarioCode) ? scenario.ScenarioCode : $"SCN_{scenario.Id}",
            TopicCode = topicCode,
            TopicName = matchedDbTopic != null && !string.IsNullOrWhiteSpace(matchedDbTopic.Name) ? matchedDbTopic.Name : meta.Name,
            TopicId = matchedDbTopic?.Id,
            LevelConfigurations = scenario.LevelConfigurations
                .OrderBy(level => level.JLPTLevel)
                .Select(MapLevel)
                .ToList()
        };

        // Bổ sung kho từ vựng/ngữ pháp mở rộng theo chủ đề cho từng level
        foreach (var lvlCfg in response.LevelConfigurations)
        {
            var targetWords = lvlCfg.TargetVocabularies.Select(v => v.Word.Trim()).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var targetPatterns = lvlCfg.TargetGrammars.Select(g => g.Pattern.Trim()).ToHashSet(StringComparer.OrdinalIgnoreCase);

            var lvlTopic = dbTopics.FirstOrDefault(t => t.JLPTLevel == lvlCfg.JLPTLevel) ?? matchedDbTopic;
            if (lvlTopic != null)
            {
                lvlCfg.TopicExpandedVocabularies = lvlTopic.TopicVocabularies
                    .Where(tv => tv.Vocabulary != null && tv.Vocabulary.IsActive && !targetWords.Contains(tv.Vocabulary.Word.Trim()))
                    .OrderBy(tv => tv.OrderIndex)
                    .Select(tv => new TargetVocabularyDto
                    {
                        Id = tv.VocabularyId,
                        Word = tv.Vocabulary.Word,
                        Reading = tv.Vocabulary.Reading,
                        Meaning = tv.Vocabulary.Meaning
                    })
                    .Take(8)
                    .ToList();

                lvlCfg.TopicExpandedGrammars = lvlTopic.TopicGrammars
                    .Where(tg => tg.Grammar != null && tg.Grammar.IsActive && !targetPatterns.Contains(tg.Grammar.Pattern.Trim()))
                    .OrderBy(tg => tg.OrderIndex)
                    .Select(tg => new TargetGrammarDto
                    {
                        Id = tg.GrammarId,
                        Pattern = tg.Grammar.Pattern,
                        Meaning = tg.Grammar.Meaning,
                        ExampleSentence = tg.Grammar.ExampleSentence
                    })
                    .Take(5)
                    .ToList();
            }
        }

        return ApiResponse<ScenarioDetailsDto>.Ok(response, "Lấy chi tiết kịch bản (Admin) thành công.");
    }

    public async Task<ApiResponse<ScenarioDetailsDto>> CreateScenarioAsync(CreateScenarioDto dto, CancellationToken cancellationToken = default)
    {
        if (dto == null)
        {
            return ApiResponse<ScenarioDetailsDto>.Fail("Dữ liệu tạo kịch bản không hợp lệ.");
        }

        var (vocabsById, grammarsById, resolveError) = await ResolveRepositoryKnowledgeAsync(
            dto.LevelConfigurations ?? [],
            cancellationToken);
        if (resolveError != null)
        {
            return ApiResponse<ScenarioDetailsDto>.Fail(resolveError);
        }

        // Tự động sinh ScenarioCode duy nhất nếu không được truyền vào
        var generatedCode = !string.IsNullOrWhiteSpace(dto.ScenarioCode)
            ? dto.ScenarioCode.Trim().ToUpperInvariant()
            : $"SCN_{DateTime.UtcNow:yyyyMMdd}_{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";

        var scenario = new Scenario
        {
            Title = dto.Title.Trim(),
            Description = dto.Description.Trim(),
            Thumbnail = dto.Thumbnail?.Trim(),
            ScenarioCode = generatedCode,
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

                foreach (var vDto in FilterDistinctKnowledgeVocabs(levelDto.TargetVocabularies))
                {
                    var master = vocabsById[vDto.VocabularyId!.Value];
                    levelConfig.TargetVocabularies.Add(BuildTargetVocabulary(0, master));
                }

                foreach (var gDto in FilterDistinctKnowledgeGrammars(levelDto.TargetGrammars))
                {
                    var master = grammarsById[gDto.GrammarId!.Value];
                    levelConfig.TargetGrammars.Add(BuildTargetGrammar(0, master));
                }

                scenario.LevelConfigurations.Add(levelConfig);
            }
        }

        _dbContext.Scenarios.Add(scenario);
        await _dbContext.SaveChangesAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(dto.ScenarioCode))
        {
            // Tự động gán mã kịch bản chuẩn theo ID: SCN_{id} nếu chưa có
            scenario.ScenarioCode = $"SCN_{scenario.Id}";
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return await GetAdminScenarioDetailsAsync(scenario.Id, cancellationToken);
    }

    public async Task<ApiResponse<ScenarioDetailsDto>> UpdateScenarioAsync(int id, UpdateScenarioDto dto, CancellationToken cancellationToken = default)
    {
        if (id <= 0 || dto == null)
        {
            return ApiResponse<ScenarioDetailsDto>.Fail("Thông tin cập nhật không hợp lệ.");
        }

        var (vocabsById, grammarsById, resolveError) = await ResolveRepositoryKnowledgeAsync(
            dto.LevelConfigurations ?? [],
            cancellationToken);
        if (resolveError != null)
        {
            return ApiResponse<ScenarioDetailsDto>.Fail(resolveError);
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
        if (!string.IsNullOrWhiteSpace(dto.ScenarioCode))
        {
            scenario.ScenarioCode = dto.ScenarioCode.Trim().ToUpperInvariant();
        }
        else if (string.IsNullOrWhiteSpace(scenario.ScenarioCode))
        {
            scenario.ScenarioCode = $"SCN_{scenario.Id}";
        }
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

                    // Update TargetVocabularies in-place (strictly hydrated from central Vocabularies repository)
                    var existingVocabs = existingConfig.TargetVocabularies.ToList();
                    var incomingVocabs = FilterDistinctKnowledgeVocabs(levelDto.TargetVocabularies);

                    var handledVocabIds = new HashSet<int>();
                    foreach (var vDto in incomingVocabs)
                    {
                        var masterVocab = vocabsById[vDto.VocabularyId!.Value];
                        TargetVocabulary? vocab = null;
                        if (vDto.Id.HasValue && vDto.Id.Value > 0)
                        {
                            vocab = existingVocabs.FirstOrDefault(v => v.Id == vDto.Id.Value && !handledVocabIds.Contains(v.Id));
                        }
                        vocab ??= existingVocabs.FirstOrDefault(v => v.VocabularyId == masterVocab.Id && !handledVocabIds.Contains(v.Id));
                        vocab ??= existingVocabs.FirstOrDefault(v => !handledVocabIds.Contains(v.Id));

                        if (vocab != null)
                        {
                            handledVocabIds.Add(vocab.Id);
                            ApplyMasterVocabulary(vocab, masterVocab);
                        }
                        else
                        {
                            existingConfig.TargetVocabularies.Add(BuildTargetVocabulary(existingConfig.Id, masterVocab));
                        }
                    }

                    var vocabsToDelete = existingVocabs.Where(v => !handledVocabIds.Contains(v.Id)).ToList();
                    foreach (var vocabToRemove in vocabsToDelete)
                    {
                        _dbContext.TargetVocabularies.Remove(vocabToRemove);
                        existingConfig.TargetVocabularies.Remove(vocabToRemove);
                    }

                    // Update TargetGrammars in-place (strictly hydrated from central Grammars repository)
                    var existingGrammars = existingConfig.TargetGrammars.ToList();
                    var incomingGrammars = FilterDistinctKnowledgeGrammars(levelDto.TargetGrammars);

                    var handledGrammarIds = new HashSet<int>();
                    foreach (var gDto in incomingGrammars)
                    {
                        var masterGrammar = grammarsById[gDto.GrammarId!.Value];
                        TargetGrammar? grammar = null;
                        if (gDto.Id.HasValue && gDto.Id.Value > 0)
                        {
                            grammar = existingGrammars.FirstOrDefault(g => g.Id == gDto.Id.Value && !handledGrammarIds.Contains(g.Id));
                        }
                        grammar ??= existingGrammars.FirstOrDefault(g => g.GrammarId == masterGrammar.Id && !handledGrammarIds.Contains(g.Id));
                        grammar ??= existingGrammars.FirstOrDefault(g => !handledGrammarIds.Contains(g.Id));

                        if (grammar != null)
                        {
                            handledGrammarIds.Add(grammar.Id);
                            ApplyMasterGrammar(grammar, masterGrammar);
                        }
                        else
                        {
                            existingConfig.TargetGrammars.Add(BuildTargetGrammar(existingConfig.Id, masterGrammar));
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

                    foreach (var vDto in FilterDistinctKnowledgeVocabs(levelDto.TargetVocabularies))
                    {
                        var master = vocabsById[vDto.VocabularyId!.Value];
                        newConfig.TargetVocabularies.Add(BuildTargetVocabulary(0, master));
                    }

                    foreach (var gDto in FilterDistinctKnowledgeGrammars(levelDto.TargetGrammars))
                    {
                        var master = grammarsById[gDto.GrammarId!.Value];
                        newConfig.TargetGrammars.Add(BuildTargetGrammar(0, master));
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

        const int maxItemsPerList = 20;
        int missionCount = Math.Clamp(request.MissionCount, 3, maxItemsPerList);
        int vocabCount = Math.Clamp(request.VocabularyCount, 3, maxItemsPerList);
        int grammarCount = Math.Clamp(request.GrammarCount, 3, maxItemsPerList);

        // Các mục admin đã nhập sẵn: bỏ dòng trống, bỏ trùng, không vượt quá số lượng yêu cầu
        var existingMissions = (request.ExistingMissions ?? [])
            .Where(m => m != null && !string.IsNullOrWhiteSpace(m.Content))
            .Select(m => new CreateMissionDto
            {
                Id = m.Id,
                Content = m.Content.Trim(),
                Target = string.IsNullOrWhiteSpace(m.Target) ? m.Content.Trim() : m.Target.Trim(),
                Intent = string.IsNullOrWhiteSpace(m.Intent) ? "CompleteMission" : m.Intent,
                Conditions = m.Conditions ?? []
            })
            .DistinctBy(m => NormalizeGenKey(m.Content))
            .Take(missionCount)
            .ToList();
        var existingVocabs = (request.ExistingVocabularies ?? [])
            .Where(v => v != null && !string.IsNullOrWhiteSpace(v.Word))
            .Select(v => new CreateVocabularyDto
            {
                Id = v.Id,
                Word = v.Word.Trim(),
                Reading = v.Reading?.Trim() ?? string.Empty,
                Meaning = v.Meaning?.Trim() ?? string.Empty
            })
            .DistinctBy(v => NormalizeGenKey(v.Word))
            .Take(vocabCount)
            .ToList();
        var existingGrammars = (request.ExistingGrammars ?? [])
            .Where(g => g != null && !string.IsNullOrWhiteSpace(g.Pattern))
            .Select(g => new CreateGrammarDto
            {
                Id = g.Id,
                Pattern = g.Pattern.Trim(),
                Meaning = g.Meaning?.Trim() ?? string.Empty,
                ExampleSentence = g.ExampleSentence?.Trim() ?? string.Empty
            })
            .DistinctBy(g => NormalizeGenKey(g.Pattern))
            .Take(grammarCount)
            .ToList();

        var result = new GeneratedLevelContentDto
        {
            JLPTLevel = level,
            Title = $"{title} ({level})",
            Description = !string.IsNullOrWhiteSpace(desc)
                ? $"Thực hành giao tiếp trình độ {level}: {desc}"
                : $"Thực hành giao tiếp trình độ {level} cho chủ đề '{title}'.",
        };

        if (_aiClient != null)
        {
            try
            {
                var (vocabPool, grammarPool) = await LoadLevelKnowledgePoolsAsync(
                    level,
                    $"{title} {desc}",
                    cancellationToken);

                var aiResult = await TryGenerateWithAiClientAsync(
                    title, desc, level, missionCount, vocabCount, grammarCount,
                    existingMissions, existingVocabs, existingGrammars,
                    vocabPool, grammarPool, cancellationToken);
                if (aiResult != null &&
                    TryFinalizeGeneratedContent(aiResult, missionCount, vocabCount, grammarCount,
                        existingMissions, existingVocabs, existingGrammars))
                {
                    await HydrateAndPadGeneratedKnowledgeFromDbAsync(
                        aiResult,
                        level,
                        $"{title} {desc}",
                        vocabCount,
                        grammarCount,
                        existingVocabs,
                        existingGrammars,
                        cancellationToken);

                    return ApiResponse<GeneratedLevelContentDto>.Ok(aiResult, $"Tạo gợi ý nội dung AI cho trình độ {level} thành công.");
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
                result.AiPersona = "Nhân viên quán ăn - 店員 (nói chậm, thân thiện)";
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
                result.AiPersona = "Quản lý cửa hàng - 店長 (nói chậm, rõ ràng)";
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
                result.AiPersona = "Người bản xứ - 日本人 (câu ngắn, từ vựng N5)";
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
                result.AiPersona = "Bếp trưởng - 料理長 (gợi ý món đặc biệt)";
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
                result.AiPersona = "Trưởng ca cửa hàng - 店長 (hỏi về kinh nghiệm)";
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
                result.AiPersona = "Người phụ trách - 担当者 (giao tiếp tự nhiên N4)";
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
                result.AiPersona = "Quản lý nhà hàng - 支配人 (dùng kính ngữ)";
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
                result.AiPersona = "Giám đốc nhân sự - 人事部長 (phỏng vấn chuyên sâu)";
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
                result.AiPersona = "Quản lý cấp cao - 上司 (giao tiếp kính ngữ N3)";
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

        // Ghép: mục admin đã nhập (ưu tiên giữ) + kho gợi ý theo chủ đề, bỏ trùng
        var mergedMissions = existingMissions
            .Concat(candidateMissions)
            .DistinctBy(m => NormalizeGenKey(m.Content))
            .ToList();

        var mergedVocabs = existingVocabs
            .Select(v =>
            {
                // Bổ sung trường còn thiếu nếu từ đó có trong kho gợi ý
                var match = candidateVocabs.FirstOrDefault(c => NormalizeGenKey(c.Word) == NormalizeGenKey(v.Word));
                return new CreateVocabularyDto
                {
                    Id = v.Id,
                    Word = v.Word,
                    Reading = string.IsNullOrWhiteSpace(v.Reading) ? match?.Reading ?? string.Empty : v.Reading,
                    Meaning = string.IsNullOrWhiteSpace(v.Meaning) ? match?.Meaning ?? string.Empty : v.Meaning
                };
            })
            .Concat(candidateVocabs)
            .DistinctBy(v => NormalizeGenKey(v.Word))
            .ToList();

        var mergedGrammars = existingGrammars
            .Select(g =>
            {
                var match = candidateGrammars.FirstOrDefault(c => NormalizeGenKey(c.Pattern) == NormalizeGenKey(g.Pattern));
                return new CreateGrammarDto
                {
                    Id = g.Id,
                    Pattern = g.Pattern,
                    Meaning = string.IsNullOrWhiteSpace(g.Meaning) ? match?.Meaning ?? string.Empty : g.Meaning,
                    ExampleSentence = string.IsNullOrWhiteSpace(g.ExampleSentence) ? match?.ExampleSentence ?? string.Empty : g.ExampleSentence
                };
            })
            .Concat(candidateGrammars)
            .DistinctBy(g => NormalizeGenKey(g.Pattern))
            .ToList();

        // Pad remaining missions if needed (missions stay domain-authored, while vocab/grammar come strictly from DB)
        var paddedMissions = mergedMissions
            .Take(missionCount)
            .ToList();
        while (paddedMissions.Count < missionCount)
        {
            int nextOrder = paddedMissions.Count + 1;
            paddedMissions.Add(new CreateMissionDto
            {
                Order = nextOrder,
                Content = $"Mở rộng trao đổi chi tiết bước {nextOrder} trong tình huống '{title}' ({level})",
                Target = $"Hoàn thành mục tiêu giao tiếp số {nextOrder}"
            });
        }

        result.Missions = paddedMissions
            .OrderBy(m => GetMissionPhase(m.Content))
            .Select((m, idx) => new CreateMissionDto
            {
                Id = m.Id,
                Order = idx + 1,
                Content = m.Content,
                Target = string.IsNullOrWhiteSpace(m.Target) ? m.Content : m.Target,
                Intent = string.IsNullOrWhiteSpace(m.Intent) ? "CompleteMission" : m.Intent,
                Conditions = m.Conditions ?? []
            })
            .ToList();

        result.TargetVocabularies = mergedVocabs.ToList();
        result.TargetGrammars = mergedGrammars.ToList();

        await HydrateAndPadGeneratedKnowledgeFromDbAsync(
            result,
            level,
            $"{title} {desc}",
            vocabCount,
            grammarCount,
            existingVocabs,
            existingGrammars,
            cancellationToken);

        return ApiResponse<GeneratedLevelContentDto>.Ok(result, $"Tạo gợi ý nội dung AI cho trình độ {level} thành công.");
    }

    private async Task<GeneratedLevelContentDto?> TryGenerateWithAiClientAsync(
        string title,
        string desc,
        string level,
        int missionCount,
        int vocabCount,
        int grammarCount,
        List<CreateMissionDto> existingMissions,
        List<CreateVocabularyDto> existingVocabs,
        List<CreateGrammarDto> existingGrammars,
        List<Vocabulary> vocabPool,
        List<Grammar> grammarPool,
        CancellationToken cancellationToken)
    {
        if (_aiClient == null) return null;

        var existingMissionsJson = JsonSerializer.Serialize(
            existingMissions.Select(m => new { id = m.Id, content = m.Content, target = m.Target }), CriteriaJsonOptions);
        var existingVocabsJson = JsonSerializer.Serialize(
            existingVocabs.Select(v => new { id = v.Id, vocabularyId = v.VocabularyId, word = v.Word, reading = v.Reading, meaning = v.Meaning }), CriteriaJsonOptions);
        var existingGrammarsJson = JsonSerializer.Serialize(
            existingGrammars.Select(g => new { id = g.Id, grammarId = g.GrammarId, pattern = g.Pattern, meaning = g.Meaning, exampleSentence = g.ExampleSentence }), CriteriaJsonOptions);

        var vocabCatalogJson = JsonSerializer.Serialize(
            vocabPool.Select(v => new { vocabularyId = v.Id, word = v.Word, reading = v.Reading, meaning = ClampText(v.Meaning, 80), level = v.JLPTLevel }),
            CriteriaJsonOptions);
        var grammarCatalogJson = JsonSerializer.Serialize(
            grammarPool.Select(g => new { grammarId = g.Id, pattern = g.Pattern, meaning = ClampText(g.Meaning, 80), level = g.JLPTLevel }),
            CriteriaJsonOptions);

        var prompt = $@"Bạn là chuyên gia thiết kế bài học hội thoại tiếng Nhật JLPT {level}.
Chủ đề kịch bản: ""{title}""
Mô tả kịch bản: ""{desc}""
Trình độ JLPT: {level}

DỮ LIỆU ADMIN ĐÃ CHỌN SẴN (có thể rỗng):
- Nhiệm vụ đã có ({existingMissions.Count}): {existingMissionsJson}
- Từ vựng đã có ({existingVocabs.Count}): {existingVocabsJson}
- Ngữ pháp đã có ({existingGrammars.Count}): {existingGrammarsJson}

DANH MỤC KHO HỌC LIỆU HỢP LỆ TỪ DATABASE (BẮT BUỘC CHỈ CHỌN TỪ ĐÂY):
- Kho Từ vựng ({vocabPool.Count}): {vocabCatalogJson}
- Kho Ngữ pháp ({grammarPool.Count}): {grammarCatalogJson}

YÊU CẦU BẮT BUỘC:
1. Số lượng CHÍNH XÁC (không hơn, không kém):
   - missions: đúng {missionCount} nhiệm vụ.
   - targetVocabularies: đúng {vocabCount} từ vựng (hoặc tối đa bằng số lượng trong Kho Từ vựng nếu kho ít hơn).
   - targetGrammars: đúng {grammarCount} mẫu ngữ pháp (hoặc tối đa bằng số lượng trong Kho Ngữ pháp nếu kho ít hơn).
2. TUYỆT ĐỐI KHÔNG TỰ BỊA từ vựng hay ngữ pháp ngoài DANH MỤC KHO HỌC LIỆU phía trên:
   - Mỗi phần tử trong targetVocabularies PHẢI lấy đúng ""vocabularyId"" từ Kho Từ vựng (hoặc giữ nguyên từ vựng admin đã chọn sẵn).
   - Mỗi phần tử trong targetGrammars PHẢI lấy đúng ""grammarId"" từ Kho Ngữ pháp (hoặc giữ nguyên ngữ pháp admin đã chọn sẵn).
3. GIỮ LẠI toàn bộ ý của các mục đã có: với mission giữ lại, trả đúng ""id"" cũ; mục mới để ""id"": null.
4. KHÔNG trùng lặp từ vựng (vocabularyId) hay ngữ pháp (grammarId).
5. SẮP XẾP nhiệm vụ theo đúng mạch hội thoại: mở đầu → trao đổi chính → xác nhận → cảm ơn / chào tạm biệt; ""order"" liên tục từ 1.
6. ""aiPersona"" NGẮN GỌN, TỐI ĐA 60 ký tự (dạng ""Vai trò tiếng Việt - 日本語"").

Trả về JSON thuần túy theo cấu trúc:
{{
  ""title"": ""{title} ({level})"",
  ""description"": ""Mô tả bối cảnh cụ thể cho trình độ {level}"",
  ""aiPersona"": ""Vai trò ngắn gọn - 日本語"",
  ""missions"": [
    {{ ""id"": null, ""order"": 1, ""content"": ""Nội dung nhiệm vụ 1"", ""target"": ""Mục tiêu ngắn gọn"" }}
  ],
  ""targetVocabularies"": [
    {{ ""id"": null, ""vocabularyId"": 123, ""word"": ""Từ tiếng Nhật"", ""reading"": ""Cách đọc"", ""meaning"": ""Nghĩa tiếng Việt"" }}
  ],
  ""targetGrammars"": [
    {{ ""id"": null, ""grammarId"": 45, ""pattern"": ""Mẫu ngữ pháp"", ""meaning"": ""Ý nghĩa"", ""exampleSentence"": ""Ví dụ"" }}
  ]
}}";

        var aiRequest = AiRequest.CreateJson(null, prompt);
        var aiResponse = await _aiClient.GenerateAsync(aiRequest, cancellationToken);
        if (!aiResponse.IsSuccess || string.IsNullOrWhiteSpace(aiResponse.Content)) return null;

        var parsed = JsonSerializer.Deserialize<GeneratedLevelContentDto>(aiResponse.Content, CriteriaJsonOptions);
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

    /// <summary>
    /// Ràng buộc kết quả AI: giữ mission/vocab/grammar hợp lệ và chuẩn hóa cấu trúc trước khi hydrate từ DB.
    /// </summary>
    private static bool TryFinalizeGeneratedContent(
        GeneratedLevelContentDto gen,
        int missionCount,
        int vocabCount,
        int grammarCount,
        List<CreateMissionDto> existingMissions,
        List<CreateVocabularyDto> existingVocabs,
        List<CreateGrammarDto> existingGrammars)
    {
        var allowedMissionIds = existingMissions.Where(m => m.Id.HasValue).Select(m => m.Id!.Value).ToHashSet();
        var allowedVocabRowIds = existingVocabs.Where(v => v.Id.HasValue).Select(v => v.Id!.Value).ToHashSet();
        var allowedGrammarRowIds = existingGrammars.Where(g => g.Id.HasValue).Select(g => g.Id!.Value).ToHashSet();

        var missions = (gen.Missions ?? [])
            .Where(m => m != null && !string.IsNullOrWhiteSpace(m.Content))
            .DistinctBy(m => NormalizeGenKey(m.Content))
            .ToList();
        var vocabs = (gen.TargetVocabularies ?? [])
            .Where(v => v != null && (v.VocabularyId is > 0 || !string.IsNullOrWhiteSpace(v.Word)))
            .ToList();
        var grammars = (gen.TargetGrammars ?? [])
            .Where(g => g != null && (g.GrammarId is > 0 || !string.IsNullOrWhiteSpace(g.Pattern)))
            .ToList();

        if (missions.Count < missionCount)
        {
            return false;
        }

        var usedMissionIds = new HashSet<int>();
        gen.AiPersona = ShortenPersona(gen.AiPersona);
        gen.Missions = missions
            .Take(missionCount)
            .OrderBy(m => GetMissionPhase(m.Content))
            .Select((m, idx) => new CreateMissionDto
            {
                Id = m.Id.HasValue && allowedMissionIds.Contains(m.Id.Value) && usedMissionIds.Add(m.Id.Value) ? m.Id : null,
                Order = idx + 1,
                Content = m.Content.Trim(),
                Target = string.IsNullOrWhiteSpace(m.Target) ? m.Content.Trim() : m.Target.Trim(),
                Intent = string.IsNullOrWhiteSpace(m.Intent) ? "CompleteMission" : m.Intent,
                Conditions = m.Conditions ?? []
            })
            .ToList();

        var usedVocabRowIds = new HashSet<int>();
        gen.TargetVocabularies = vocabs
            .Take(vocabCount * 2) // giữ dư chút để bộ lọc DB loại bỏ ID ảo mà vẫn đủ ứng viên
            .Select(v => new CreateVocabularyDto
            {
                Id = v.Id.HasValue && allowedVocabRowIds.Contains(v.Id.Value) && usedVocabRowIds.Add(v.Id.Value) ? v.Id : null,
                VocabularyId = v.VocabularyId,
                Word = v.Word?.Trim() ?? string.Empty,
                Reading = v.Reading?.Trim(),
                Meaning = v.Meaning?.Trim() ?? string.Empty
            })
            .ToList();

        var usedGrammarRowIds = new HashSet<int>();
        gen.TargetGrammars = grammars
            .Take(grammarCount * 2)
            .Select(g => new CreateGrammarDto
            {
                Id = g.Id.HasValue && allowedGrammarRowIds.Contains(g.Id.Value) && usedGrammarRowIds.Add(g.Id.Value) ? g.Id : null,
                GrammarId = g.GrammarId,
                Pattern = g.Pattern?.Trim() ?? string.Empty,
                Meaning = g.Meaning?.Trim() ?? string.Empty,
                ExampleSentence = g.ExampleSentence?.Trim()
            })
            .ToList();

        return true;
    }

    public async Task<ApiResponse<List<KnowledgeSearchItemDto>>> SearchKnowledgeAsync(
        string type,
        string? query = null,
        string? level = null,
        int limit = 20,
        CancellationToken cancellationToken = default)
    {
        var normalizedType = (type ?? "vocab").Trim().ToLowerInvariant();
        if (normalizedType != "vocab" && normalizedType != "grammar")
        {
            return ApiResponse<List<KnowledgeSearchItemDto>>.Fail("Loại học liệu phải là 'vocab' hoặc 'grammar'.");
        }

        int cappedLimit = Math.Clamp(limit, 1, 50);
        string? levelFilter = string.IsNullOrWhiteSpace(level) || level.Equals("ALL", StringComparison.OrdinalIgnoreCase)
            ? null
            : level.Trim().ToUpperInvariant();
        string rawQuery = (query ?? string.Empty).Trim();
        string foldedQuery = FoldVietnamese(rawQuery);
        string[] queryTokens = foldedQuery.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        string normalizedPatternQuery = NormalizeGrammarKey(rawQuery);

        if (normalizedType == "vocab")
        {
            var rows = await _dbContext.Vocabularies
                .AsNoTracking()
                .Where(v => v.IsActive)
                .Select(v => new
                {
                    v.Id,
                    v.Word,
                    v.Reading,
                    v.Meaning,
                    v.Explanation,
                    v.JLPTLevel,
                    v.PartOfSpeech
                })
                .ToListAsync(cancellationToken);

            var filtered = rows.Where(v =>
                levelFilter == null || string.Equals(v.JLPTLevel?.Trim(), levelFilter, StringComparison.OrdinalIgnoreCase));

            var scored = filtered
                .Select(v =>
                {
                    int score = ComputeSearchScore(
                        rawQuery,
                        foldedQuery,
                        queryTokens,
                        normalizedPatternQuery,
                        v.Word,
                        v.Reading,
                        v.Meaning,
                        v.Explanation,
                        v.JLPTLevel,
                        levelFilter,
                        isGrammar: false);
                    return new { Item = v, Score = score };
                })
                .Where(x => string.IsNullOrEmpty(foldedQuery) || x.Score > 0)
                .OrderByDescending(x => x.Score)
                .ThenBy(x => x.Item.Word.Length)
                .ThenBy(x => x.Item.Id)
                .Take(cappedLimit)
                .Select(x => ToKnowledgeDto(
                    x.Item.Id,
                    "vocab",
                    x.Item.Word,
                    x.Item.Reading,
                    x.Item.Meaning,
                    null,
                    x.Item.JLPTLevel,
                    x.Item.PartOfSpeech))
                .ToList();

            return ApiResponse<List<KnowledgeSearchItemDto>>.Ok(scored, "Tìm kiếm từ vựng trong kho thành công.");
        }
        else
        {
            var rows = await _dbContext.Grammars
                .AsNoTracking()
                .Where(g => g.IsActive)
                .Select(g => new
                {
                    g.Id,
                    g.Pattern,
                    g.Reading,
                    g.Meaning,
                    g.Explanation,
                    g.ExampleSentence,
                    g.JLPTLevel
                })
                .ToListAsync(cancellationToken);

            var filtered = rows.Where(g =>
                levelFilter == null || string.Equals(g.JLPTLevel?.Trim(), levelFilter, StringComparison.OrdinalIgnoreCase));

            var scored = filtered
                .Select(g =>
                {
                    int score = ComputeSearchScore(
                        rawQuery,
                        foldedQuery,
                        queryTokens,
                        normalizedPatternQuery,
                        g.Pattern,
                        g.Reading,
                        g.Meaning,
                        g.Explanation,
                        g.JLPTLevel,
                        levelFilter,
                        isGrammar: true);
                    return new { Item = g, Score = score };
                })
                .Where(x => string.IsNullOrEmpty(foldedQuery) || x.Score > 0)
                .OrderByDescending(x => x.Score)
                .ThenBy(x => x.Item.Pattern.Length)
                .ThenBy(x => x.Item.Id)
                .Take(cappedLimit)
                .Select(x => ToKnowledgeDto(
                    x.Item.Id,
                    "grammar",
                    x.Item.Pattern,
                    x.Item.Reading,
                    x.Item.Meaning,
                    x.Item.ExampleSentence,
                    x.Item.JLPTLevel,
                    null))
                .ToList();

            return ApiResponse<List<KnowledgeSearchItemDto>>.Ok(scored, "Tìm kiếm ngữ pháp trong kho thành công.");
        }
    }

    public async Task<ApiResponse<SuggestScenarioKnowledgeResponse>> SuggestKnowledgeAsync(
        SuggestScenarioKnowledgeRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request == null)
        {
            return ApiResponse<SuggestScenarioKnowledgeResponse>.Fail("Yêu cầu gợi ý không hợp lệ.");
        }

        var normalizedType = (request.Type ?? "vocab").Trim().ToLowerInvariant();
        if (normalizedType != "vocab" && normalizedType != "grammar")
        {
            return ApiResponse<SuggestScenarioKnowledgeResponse>.Fail("Loại học liệu phải là 'vocab' hoặc 'grammar'.");
        }

        int cappedLimit = Math.Clamp(request.Limit <= 0 ? 8 : request.Limit, 1, 20);
        var excludeSet = (request.ExcludeIds ?? []).ToHashSet();
        var targetLevel = string.IsNullOrWhiteSpace(request.JlptLevel) ? "N5" : request.JlptLevel.Trim().ToUpperInvariant();
        var contextText = $"{request.ScenarioTitle} {request.ScenarioDescription} {request.Query}".Trim();

        List<KnowledgeSearchItemDto> candidates;
        if (normalizedType == "vocab")
        {
            var pool = await LoadVocabularyCandidatesAsync(targetLevel, contextText, 50, excludeSet, cancellationToken);
            candidates = pool
                .Select(v => ToKnowledgeDto(v.Id, "vocab", v.Word, v.Reading, v.Meaning, null, v.JLPTLevel, v.PartOfSpeech))
                .ToList();
        }
        else
        {
            var pool = await LoadGrammarCandidatesAsync(targetLevel, contextText, 45, excludeSet, cancellationToken);
            candidates = pool
                .Select(g => ToKnowledgeDto(g.Id, "grammar", g.Pattern, g.Reading, g.Meaning, g.ExampleSentence, g.JLPTLevel, null))
                .ToList();
        }

        if (candidates.Count == 0)
        {
            return ApiResponse<SuggestScenarioKnowledgeResponse>.Ok(new SuggestScenarioKnowledgeResponse(), "Không còn mục mới phù hợp trong kho.");
        }

        bool usedAi = false;
        List<KnowledgeSearchItemDto> selected = [];

        if (_aiClient != null)
        {
            try
            {
                var candidateById = candidates.ToDictionary(c => c.Id);
                var compactPoolJson = JsonSerializer.Serialize(
                    candidates.Select(c => new
                    {
                        id = c.Id,
                        text = c.PrimaryText,
                        reading = c.Reading,
                        meaning = ClampText(c.Meaning, 70),
                        level = c.JlptLevel
                    }),
                    CriteriaJsonOptions);

                var prompt = $@"Chọn tối đa {cappedLimit} mục phù hợp nhất cho tình huống hội thoại tiếng Nhật sau.
Kịch bản: ""{request.ScenarioTitle}""
Mô tả: ""{request.ScenarioDescription}""
Cấp độ mục tiêu: {targetLevel}
Từ khóa tìm thêm: ""{request.Query}""

DANH SÁCH ỨNG VIÊN TỪ DATABASE (CHỈ ĐƯỢC CHỌN ID TRONG DANH SÁCH NÀY):
{compactPoolJson}

Trả về JSON thuần túy:
{{ ""selectedIds"": [1, 2, 3] }}";

                var aiResponse = await _aiClient.GenerateAsync(AiRequest.CreateJson(null, prompt), cancellationToken);
                if (aiResponse.IsSuccess && !string.IsNullOrWhiteSpace(aiResponse.Content))
                {
                    using var doc = JsonDocument.Parse(aiResponse.Content);
                    if (doc.RootElement.TryGetProperty("selectedIds", out var idsEl) && idsEl.ValueKind == JsonValueKind.Array)
                    {
                        var seen = new HashSet<int>();
                        foreach (var el in idsEl.EnumerateArray())
                        {
                            if (el.TryGetInt32(out int cid) && candidateById.TryGetValue(cid, out var item) && seen.Add(cid))
                            {
                                selected.Add(item);
                                if (selected.Count >= cappedLimit) break;
                            }
                        }
                        if (selected.Count > 0) usedAi = true;
                    }
                }
            }
            catch
            {
                // Fallback deterministically to ranked DB candidates below
            }
        }

        if (selected.Count < cappedLimit)
        {
            var pickedIds = selected.Select(s => s.Id).ToHashSet();
            foreach (var fallbackItem in candidates)
            {
                if (pickedIds.Add(fallbackItem.Id))
                {
                    selected.Add(fallbackItem);
                    if (selected.Count >= cappedLimit) break;
                }
            }
        }

        return ApiResponse<SuggestScenarioKnowledgeResponse>.Ok(
            new SuggestScenarioKnowledgeResponse { Items = selected, UsedAi = usedAi },
            usedAi ? "Đã gợi ý thông minh từ Kho bằng AI." : "Đã gợi ý từ Kho học liệu.");
    }

    private async Task<(Dictionary<int, Vocabulary> Vocabs, Dictionary<int, Grammar> Grammars, string? Error)> ResolveRepositoryKnowledgeAsync(
        IEnumerable<CreateScenarioLevelConfigDto> levels,
        CancellationToken cancellationToken)
    {
        var levelList = levels.ToList();
        var requestedVocabIds = new HashSet<int>();
        var requestedGrammarIds = new HashSet<int>();

        foreach (var lvl in levelList)
        {
            foreach (var v in lvl.TargetVocabularies ?? [])
            {
                if (v == null) continue;
                bool hasAnyContent = v.VocabularyId.HasValue
                    || !string.IsNullOrWhiteSpace(v.Word)
                    || !string.IsNullOrWhiteSpace(v.Reading)
                    || !string.IsNullOrWhiteSpace(v.Meaning);
                if (!hasAnyContent) continue;

                if (!v.VocabularyId.HasValue || v.VocabularyId.Value <= 0)
                {
                    return (new(), new(), $"Mọi từ vựng trọng tâm (cấp {lvl.JLPTLevel}) bắt buộc phải chọn từ Kho học liệu, không được nhập tự do.");
                }
                requestedVocabIds.Add(v.VocabularyId.Value);
            }

            foreach (var g in lvl.TargetGrammars ?? [])
            {
                if (g == null) continue;
                bool hasAnyContent = g.GrammarId.HasValue
                    || !string.IsNullOrWhiteSpace(g.Pattern)
                    || !string.IsNullOrWhiteSpace(g.Meaning)
                    || !string.IsNullOrWhiteSpace(g.ExampleSentence);
                if (!hasAnyContent) continue;

                if (!g.GrammarId.HasValue || g.GrammarId.Value <= 0)
                {
                    return (new(), new(), $"Mọi mẫu ngữ pháp trọng tâm (cấp {lvl.JLPTLevel}) bắt buộc phải chọn từ Kho học liệu, không được nhập tự do.");
                }
                requestedGrammarIds.Add(g.GrammarId.Value);
            }
        }

        var vocabsById = requestedVocabIds.Count > 0
            ? await _dbContext.Vocabularies
                .AsNoTracking()
                .Where(v => requestedVocabIds.Contains(v.Id) && v.IsActive)
                .ToDictionaryAsync(v => v.Id, cancellationToken)
            : new Dictionary<int, Vocabulary>();

        var missingVocabIds = requestedVocabIds.Where(id => !vocabsById.ContainsKey(id)).ToList();
        if (missingVocabIds.Count > 0)
        {
            return (new(), new(), $"Từ vựng được chọn không tồn tại hoặc đã bị vô hiệu hóa trong Kho học liệu (ID: {string.Join(", ", missingVocabIds)}).");
        }

        var grammarsById = requestedGrammarIds.Count > 0
            ? await _dbContext.Grammars
                .AsNoTracking()
                .Where(g => requestedGrammarIds.Contains(g.Id) && g.IsActive)
                .ToDictionaryAsync(g => g.Id, cancellationToken)
            : new Dictionary<int, Grammar>();

        var missingGrammarIds = requestedGrammarIds.Where(id => !grammarsById.ContainsKey(id)).ToList();
        if (missingGrammarIds.Count > 0)
        {
            return (new(), new(), $"Mẫu ngữ pháp được chọn không tồn tại hoặc đã bị vô hiệu hóa trong Kho học liệu (ID: {string.Join(", ", missingGrammarIds)}).");
        }

        return (vocabsById, grammarsById, null);
    }

    private static List<CreateVocabularyDto> FilterDistinctKnowledgeVocabs(IEnumerable<CreateVocabularyDto>? items)
    {
        if (items == null) return [];
        var seen = new HashSet<int>();
        var list = new List<CreateVocabularyDto>();
        foreach (var v in items)
        {
            if (v?.VocabularyId is > 0 && seen.Add(v.VocabularyId.Value))
            {
                list.Add(v);
            }
        }
        return list;
    }

    private static List<CreateGrammarDto> FilterDistinctKnowledgeGrammars(IEnumerable<CreateGrammarDto>? items)
    {
        if (items == null) return [];
        var seen = new HashSet<int>();
        var list = new List<CreateGrammarDto>();
        foreach (var g in items)
        {
            if (g?.GrammarId is > 0 && seen.Add(g.GrammarId.Value))
            {
                list.Add(g);
            }
        }
        return list;
    }

    private static TargetVocabulary BuildTargetVocabulary(int levelConfigId, Vocabulary master) => new()
    {
        ScenarioLevelConfigurationId = levelConfigId,
        VocabularyId = master.Id,
        Word = ClampText(master.Word, 100),
        Reading = ClampNullableText(master.Reading, 100),
        Meaning = ClampText(string.IsNullOrWhiteSpace(master.Meaning) ? master.Word : master.Meaning, 200)
    };

    private static void ApplyMasterVocabulary(TargetVocabulary target, Vocabulary master)
    {
        target.VocabularyId = master.Id;
        target.Word = ClampText(master.Word, 100);
        target.Reading = ClampNullableText(master.Reading, 100);
        target.Meaning = ClampText(string.IsNullOrWhiteSpace(master.Meaning) ? master.Word : master.Meaning, 200);
    }

    private static TargetGrammar BuildTargetGrammar(int levelConfigId, Grammar master) => new()
    {
        ScenarioLevelConfigurationId = levelConfigId,
        GrammarId = master.Id,
        Pattern = ClampText(master.Pattern, 100),
        Meaning = ClampText(string.IsNullOrWhiteSpace(master.Meaning) ? master.Pattern : master.Meaning, 200),
        ExampleSentence = ClampNullableText(master.ExampleSentence, 500)
    };

    private static void ApplyMasterGrammar(TargetGrammar target, Grammar master)
    {
        target.GrammarId = master.Id;
        target.Pattern = ClampText(master.Pattern, 100);
        target.Meaning = ClampText(string.IsNullOrWhiteSpace(master.Meaning) ? master.Pattern : master.Meaning, 200);
        target.ExampleSentence = ClampNullableText(master.ExampleSentence, 500);
    }

    private async Task<(List<Vocabulary> Vocabs, List<Grammar> Grammars)> LoadLevelKnowledgePoolsAsync(
        string level,
        string contextText,
        CancellationToken cancellationToken)
    {
        var vocabs = await LoadVocabularyCandidatesAsync(level, contextText, 55, null, cancellationToken);
        var grammars = await LoadGrammarCandidatesAsync(level, contextText, 40, null, cancellationToken);
        return (vocabs, grammars);
    }

    private async Task<List<Vocabulary>> LoadVocabularyCandidatesAsync(
        string level,
        string contextText,
        int take,
        HashSet<int>? excludeIds,
        CancellationToken cancellationToken)
    {
        var all = await _dbContext.Vocabularies
            .AsNoTracking()
            .Where(v => v.IsActive)
            .ToListAsync(cancellationToken);

        var tokens = ExtractContextTokens(contextText);
        return all
            .Where(v => excludeIds == null || !excludeIds.Contains(v.Id))
            .OrderByDescending(v => ScoreContextRelevance(v.Word, v.Reading, v.Meaning, v.JLPTLevel, level, tokens))
            .ThenBy(v => v.Id)
            .Take(take)
            .ToList();
    }

    private async Task<List<Grammar>> LoadGrammarCandidatesAsync(
        string level,
        string contextText,
        int take,
        HashSet<int>? excludeIds,
        CancellationToken cancellationToken)
    {
        var all = await _dbContext.Grammars
            .AsNoTracking()
            .Where(g => g.IsActive)
            .ToListAsync(cancellationToken);

        var tokens = ExtractContextTokens(contextText);
        return all
            .Where(g => excludeIds == null || !excludeIds.Contains(g.Id))
            .OrderByDescending(g => ScoreContextRelevance(g.Pattern, g.Reading, g.Meaning, g.JLPTLevel, level, tokens))
            .ThenBy(g => g.Id)
            .Take(take)
            .ToList();
    }

    private async Task HydrateAndPadGeneratedKnowledgeFromDbAsync(
        GeneratedLevelContentDto gen,
        string level,
        string contextText,
        int vocabCount,
        int grammarCount,
        List<CreateVocabularyDto> existingVocabs,
        List<CreateGrammarDto> existingGrammars,
        CancellationToken cancellationToken)
    {
        var allVocabs = await _dbContext.Vocabularies.AsNoTracking().Where(v => v.IsActive).ToListAsync(cancellationToken);
        var vocabById = allVocabs.ToDictionary(v => v.Id);
        var vocabByWord = allVocabs
            .GroupBy(v => NormalizeGenKey(v.Word))
            .ToDictionary(g => g.Key, g => g.OrderByDescending(x => string.Equals(x.JLPTLevel, level, StringComparison.OrdinalIgnoreCase)).First());

        var usedVocabIds = new HashSet<int>();
        var hydratedVocabs = new List<CreateVocabularyDto>();

        void TryAddVocab(CreateVocabularyDto item)
        {
            Vocabulary? master = null;
            if (item.VocabularyId.HasValue && vocabById.TryGetValue(item.VocabularyId.Value, out var byId))
            {
                master = byId;
            }
            else if (!string.IsNullOrWhiteSpace(item.Word) && vocabByWord.TryGetValue(NormalizeGenKey(item.Word), out var byWord))
            {
                master = byWord;
            }

            if (master != null && usedVocabIds.Add(master.Id))
            {
                hydratedVocabs.Add(new CreateVocabularyDto
                {
                    Id = item.Id,
                    VocabularyId = master.Id,
                    Word = ClampText(master.Word, 100),
                    Reading = ClampNullableText(master.Reading, 100),
                    Meaning = ClampText(string.IsNullOrWhiteSpace(master.Meaning) ? master.Word : master.Meaning, 200)
                });
            }
        }

        foreach (var ev in existingVocabs) TryAddVocab(ev);
        foreach (var gv in gen.TargetVocabularies ?? []) TryAddVocab(gv);

        if (hydratedVocabs.Count < vocabCount)
        {
            var tokens = ExtractContextTokens(contextText);
            var padPool = allVocabs
                .Where(v => !usedVocabIds.Contains(v.Id))
                .OrderByDescending(v => ScoreContextRelevance(v.Word, v.Reading, v.Meaning, v.JLPTLevel, level, tokens))
                .ThenBy(v => v.Id);

            foreach (var v in padPool)
            {
                if (hydratedVocabs.Count >= vocabCount) break;
                usedVocabIds.Add(v.Id);
                hydratedVocabs.Add(new CreateVocabularyDto
                {
                    VocabularyId = v.Id,
                    Word = ClampText(v.Word, 100),
                    Reading = ClampNullableText(v.Reading, 100),
                    Meaning = ClampText(string.IsNullOrWhiteSpace(v.Meaning) ? v.Word : v.Meaning, 200)
                });
            }
        }

        gen.TargetVocabularies = hydratedVocabs.Take(vocabCount).ToList();

        var allGrammars = await _dbContext.Grammars.AsNoTracking().Where(g => g.IsActive).ToListAsync(cancellationToken);
        var grammarById = allGrammars.ToDictionary(g => g.Id);
        var grammarByNorm = allGrammars
            .GroupBy(g => NormalizeGrammarKey(g.Pattern))
            .Where(g => g.Key.Length > 0)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(x => string.Equals(x.JLPTLevel, level, StringComparison.OrdinalIgnoreCase)).First());

        var usedGrammarIds = new HashSet<int>();
        var hydratedGrammars = new List<CreateGrammarDto>();

        void TryAddGrammar(CreateGrammarDto item)
        {
            Grammar? master = null;
            if (item.GrammarId.HasValue && grammarById.TryGetValue(item.GrammarId.Value, out var byId))
            {
                master = byId;
            }
            else if (!string.IsNullOrWhiteSpace(item.Pattern) && grammarByNorm.TryGetValue(NormalizeGrammarKey(item.Pattern), out var byPat))
            {
                master = byPat;
            }

            if (master != null && usedGrammarIds.Add(master.Id))
            {
                hydratedGrammars.Add(new CreateGrammarDto
                {
                    Id = item.Id,
                    GrammarId = master.Id,
                    Pattern = ClampText(master.Pattern, 100),
                    Meaning = ClampText(string.IsNullOrWhiteSpace(master.Meaning) ? master.Pattern : master.Meaning, 200),
                    ExampleSentence = ClampNullableText(master.ExampleSentence, 500)
                });
            }
        }

        foreach (var eg in existingGrammars) TryAddGrammar(eg);
        foreach (var gg in gen.TargetGrammars ?? []) TryAddGrammar(gg);

        if (hydratedGrammars.Count < grammarCount)
        {
            var tokens = ExtractContextTokens(contextText);
            var padPool = allGrammars
                .Where(g => !usedGrammarIds.Contains(g.Id))
                .OrderByDescending(g => ScoreContextRelevance(g.Pattern, g.Reading, g.Meaning, g.JLPTLevel, level, tokens))
                .ThenBy(g => g.Id);

            foreach (var g in padPool)
            {
                if (hydratedGrammars.Count >= grammarCount) break;
                usedGrammarIds.Add(g.Id);
                hydratedGrammars.Add(new CreateGrammarDto
                {
                    GrammarId = g.Id,
                    Pattern = ClampText(g.Pattern, 100),
                    Meaning = ClampText(string.IsNullOrWhiteSpace(g.Meaning) ? g.Pattern : g.Meaning, 200),
                    ExampleSentence = ClampNullableText(g.ExampleSentence, 500)
                });
            }
        }

        gen.TargetGrammars = hydratedGrammars.Take(grammarCount).ToList();
    }

    private static KnowledgeSearchItemDto ToKnowledgeDto(
        int id,
        string type,
        string primaryText,
        string? reading,
        string meaning,
        string? exampleSentence,
        string? jlptLevel,
        string? partOfSpeech) => new()
        {
            Id = id,
            Type = type,
            PrimaryText = primaryText,
            Reading = reading,
            Meaning = meaning,
            ExampleSentence = exampleSentence,
            JlptLevel = string.IsNullOrWhiteSpace(jlptLevel) ? "N5" : jlptLevel.Trim().ToUpperInvariant(),
            PartOfSpeech = partOfSpeech
        };

    private static int ComputeSearchScore(
        string rawQuery,
        string foldedQuery,
        string[] queryTokens,
        string normalizedPatternQuery,
        string primaryText,
        string? reading,
        string? meaning,
        string? explanation,
        string? itemLevel,
        string? requestedLevel,
        bool isGrammar)
    {
        bool levelMatch = !string.IsNullOrEmpty(requestedLevel)
            && string.Equals(itemLevel?.Trim(), requestedLevel, StringComparison.OrdinalIgnoreCase);

        if (string.IsNullOrEmpty(foldedQuery))
        {
            return levelMatch ? 20 : 10;
        }

        string primaryLower = primaryText.Trim().ToLowerInvariant();
        string primaryNorm = isGrammar ? NormalizeGrammarKey(primaryText) : primaryLower;
        string readingLower = (reading ?? string.Empty).Trim().ToLowerInvariant();
        string foldedMeaning = FoldVietnamese(meaning);
        string foldedExplanation = FoldVietnamese(explanation);

        int score = 0;
        if (string.Equals(primaryLower, rawQuery.ToLowerInvariant(), StringComparison.Ordinal)
            || (isGrammar && normalizedPatternQuery.Length > 0 && primaryNorm == normalizedPatternQuery)
            || (readingLower.Length > 0 && readingLower == rawQuery.ToLowerInvariant())
            || foldedMeaning == foldedQuery)
        {
            score += 120;
        }
        else if (primaryLower.StartsWith(rawQuery, StringComparison.OrdinalIgnoreCase)
            || (isGrammar && normalizedPatternQuery.Length > 0 && primaryNorm.StartsWith(normalizedPatternQuery, StringComparison.Ordinal))
            || readingLower.StartsWith(rawQuery, StringComparison.OrdinalIgnoreCase)
            || foldedMeaning.StartsWith(foldedQuery, StringComparison.Ordinal))
        {
            score += 75;
        }
        else if (primaryLower.Contains(rawQuery, StringComparison.OrdinalIgnoreCase)
            || (isGrammar && normalizedPatternQuery.Length > 0 && primaryNorm.Contains(normalizedPatternQuery, StringComparison.Ordinal))
            || readingLower.Contains(rawQuery, StringComparison.OrdinalIgnoreCase))
        {
            score += 50;
        }
        else if (foldedMeaning.Contains(foldedQuery, StringComparison.Ordinal))
        {
            score += 35;
        }
        else if (queryTokens.Length > 1 && queryTokens.All(t =>
            foldedMeaning.Contains(t, StringComparison.Ordinal)
            || foldedExplanation.Contains(t, StringComparison.Ordinal)
            || primaryLower.Contains(t, StringComparison.OrdinalIgnoreCase)
            || readingLower.Contains(t, StringComparison.OrdinalIgnoreCase)))
        {
            score += 25;
        }
        else if (foldedExplanation.Contains(foldedQuery, StringComparison.Ordinal))
        {
            score += 12;
        }

        if (score > 0 && levelMatch)
        {
            score += 15;
        }

        return score;
    }

    private static int ScoreContextRelevance(
        string primaryText,
        string? reading,
        string? meaning,
        string? itemLevel,
        string targetLevel,
        string[] contextTokens)
    {
        int score = string.Equals(itemLevel?.Trim(), targetLevel, StringComparison.OrdinalIgnoreCase) ? 30 : 0;
        if (contextTokens.Length == 0) return score;

        var combined = $"{primaryText} {reading} {FoldVietnamese(meaning)}".ToLowerInvariant();
        foreach (var tok in contextTokens)
        {
            if (combined.Contains(tok, StringComparison.OrdinalIgnoreCase))
            {
                score += 18;
            }
        }
        return score;
    }

    private static string[] ExtractContextTokens(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return [];
        var folded = FoldVietnamese(text);
        var stopWords = new HashSet<string>(StringComparer.Ordinal)
        {
            "va", "cua", "cho", "tai", "khi", "voi", "trong", "nhu", "the", "cac", "mot", "bai", "tinh", "huong", "hoi", "thoai", "giao", "tiep"
        };
        return folded
            .Split([' ', ',', '.', ':', ';', '(', ')', '/', '-', '&'], StringSplitOptions.RemoveEmptyEntries)
            .Select(t => t.Trim())
            .Where(t => t.Length >= 2 && !stopWords.Contains(t))
            .Distinct()
            .Take(12)
            .ToArray();
    }

    private static string FoldVietnamese(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        var formD = input.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(formD.Length);
        foreach (var ch in formD)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(ch switch
            {
                'đ' => 'd',
                'Đ' => 'd',
                _ => char.ToLowerInvariant(ch)
            });
        }
        return string.Join(' ', sb.ToString().Normalize(NormalizationForm.FormC).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    private static string NormalizeGrammarKey(string? pattern)
    {
        if (string.IsNullOrWhiteSpace(pattern)) return string.Empty;
        return pattern
            .Normalize(NormalizationForm.FormC)
            .Replace("～", string.Empty)
            .Replace("〜", string.Empty)
            .Replace("~", string.Empty)
            .Replace(" ", string.Empty)
            .Replace("\u3000", string.Empty)
            .Trim()
            .ToLowerInvariant();
    }

    private static string ClampText(string? value, int maxLen)
    {
        var trimmed = (value ?? string.Empty).Trim();
        return trimmed.Length <= maxLen ? trimmed : trimmed[..maxLen];
    }

    private static string? ClampNullableText(string? value, int maxLen)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length <= maxLen ? trimmed : trimmed[..maxLen];
    }

    /// <summary>Giới hạn độ dài vai AI theo cột DB (ScenarioLevelConfiguration.AiPersona tối đa 100 ký tự).</summary>
    private const int MaxAiPersonaLength = 100;

    /// <summary>
    /// Rút gọn vai AI: nếu quá dài thì bỏ phần ghi chú trong ngoặc, sau đó cắt theo ranh giới từ.
    /// </summary>
    private static string ShortenPersona(string? persona)
    {
        var text = string.Join(' ', (persona ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (text.Length <= MaxAiPersonaLength) return text;

        var parenIdx = text.IndexOf('(');
        if (parenIdx > 0)
        {
            var head = text[..parenIdx].Trim();
            if (head.Length is > 0 and <= MaxAiPersonaLength) return head;
        }

        var cut = text[..MaxAiPersonaLength];
        var lastSpace = cut.LastIndexOf(' ');
        if (lastSpace > MaxAiPersonaLength / 2) cut = cut[..lastSpace];
        return cut.TrimEnd(' ', ',', '/', '-', '(', ';', ':');
    }

    /// <summary>Khóa so sánh trùng lặp: chuẩn hóa Unicode, bỏ khoảng trắng thừa, không phân biệt hoa thường.</summary>
    private static string NormalizeGenKey(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        var normalized = value.Normalize(NormalizationForm.FormC).Trim().ToLowerInvariant();
        return string.Join(' ', normalized.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    /// <summary>
    /// Phân pha nhiệm vụ trong mạch hội thoại: 0 = chào hỏi/mở đầu, 1 = trao đổi chính, 2 = kết thúc.
    /// Dùng sắp xếp ổn định (stable) nên thứ tự bên trong mỗi pha được giữ nguyên.
    /// </summary>
    private static int GetMissionPhase(string? content)
    {
        var text = NormalizeGenKey(content);
        if (text.Length == 0) return 1;

        string[] closingKeywords = ["tạm biệt", "kết thúc", "tổng kết", "ra về", "rời quán", "rời đi", "rời khỏi"];
        if (closingKeywords.Any(text.Contains)) return 2;

        string[] openingKeywords = ["chào hỏi", "mở đầu", "tự giới thiệu", "giới thiệu bản thân", "giới thiệu tên", "bắt đầu hội thoại", "bắt đầu cuộc"];
        if (text.StartsWith("chào") || openingKeywords.Any(text.Contains)) return 0;

        if (text.Contains("cảm ơn")) return 2;

        return 1;
    }
}
