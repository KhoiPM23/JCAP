using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Scenario;

public class GenerateScenarioLevelContentRequest
{
    [Required(ErrorMessage = "Tiêu đề kịch bản không được để trống.")]
    public string ScenarioTitle { get; set; } = string.Empty;

    public string ScenarioDescription { get; set; } = string.Empty;

    [Required(ErrorMessage = "Trình độ JLPT không được để trống.")]
    public string JLPTLevel { get; set; } = "N5"; // N5, N4, N3
}

public class GeneratedLevelContentDto
{
    public string JLPTLevel { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string AiPersona { get; set; } = string.Empty;
    public List<CreateMissionDto> Missions { get; set; } = [];
    public List<CreateVocabularyDto> TargetVocabularies { get; set; } = [];
    public List<CreateGrammarDto> TargetGrammars { get; set; } = [];
}
