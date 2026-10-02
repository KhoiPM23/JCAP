using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Scenario;

public class CreateScenarioDto
{
    [Required(ErrorMessage = "Tiêu đề kịch bản không được để trống.")]
    [StringLength(200, ErrorMessage = "Tiêu đề không được vượt quá 200 ký tự.")]
    public string Title { get; set; } = string.Empty;

    [Required(ErrorMessage = "Mô tả kịch bản không được để trống.")]
    public string Description { get; set; } = string.Empty;

    public string? Thumbnail { get; set; }

    public string? ScenarioCode { get; set; }

    public bool IsActive { get; set; } = true;

    public List<CreateScenarioLevelConfigDto> LevelConfigurations { get; set; } = [];
}

public class CreateScenarioLevelConfigDto
{
    public int? Id { get; set; }

    [Required(ErrorMessage = "Trình độ JLPT không được để trống.")]
    public string JLPTLevel { get; set; } = "N5";

    [Required(ErrorMessage = "Tiêu đề cấu hình level không được để trống.")]
    public string Title { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string AiPersona { get; set; } = string.Empty;

    public int CreditCost { get; set; } = 5;

    public string Status { get; set; } = "Published";

    public List<CreateMissionDto> Missions { get; set; } = [];

    public List<CreateVocabularyDto> TargetVocabularies { get; set; } = [];

    public List<CreateGrammarDto> TargetGrammars { get; set; } = [];
}

public class CreateMissionDto
{
    public int? Id { get; set; }
    public string Content { get; set; } = string.Empty;
    public int Order { get; set; } = 1;
    public string Intent { get; set; } = string.Empty;
    public string Target { get; set; } = string.Empty;
    public List<string> Conditions { get; set; } = [];
}

public class CreateVocabularyDto
{
    public int? Id { get; set; }
    public string Word { get; set; } = string.Empty;
    public string? Reading { get; set; }
    public string Meaning { get; set; } = string.Empty;
}

public class CreateGrammarDto
{
    public int? Id { get; set; }
    public string Pattern { get; set; } = string.Empty;
    public string Meaning { get; set; } = string.Empty;
    public string? ExampleSentence { get; set; }
}
