using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Scenario;

public class GenerateScenarioLevelContentRequest
{
    [Required(ErrorMessage = "Tiêu đề kịch bản không được để trống.")]
    public string ScenarioTitle { get; set; } = string.Empty;

    public string ScenarioDescription { get; set; } = string.Empty;

    [Required(ErrorMessage = "Trình độ JLPT không được để trống.")]
    public string JLPTLevel { get; set; } = "N5"; // N5, N4, N3

    public int MissionCount { get; set; } = 3;

    public int VocabularyCount { get; set; } = 3;

    public int GrammarCount { get; set; } = 3;

    /// <summary>
    /// Các nhiệm vụ admin đã nhập sẵn. AI sẽ giữ ý, chỉnh câu chữ cho mạch lạc,
    /// sắp xếp lại thứ tự hợp lý và điền thêm cho đủ MissionCount.
    /// </summary>
    public List<CreateMissionDto> ExistingMissions { get; set; } = [];

    /// <summary>Các từ vựng admin đã nhập sẵn (giữ lại, bổ sung trường còn thiếu, điền thêm cho đủ).</summary>
    public List<CreateVocabularyDto> ExistingVocabularies { get; set; } = [];

    /// <summary>Các mẫu ngữ pháp admin đã nhập sẵn (giữ lại, bổ sung trường còn thiếu, điền thêm cho đủ).</summary>
    public List<CreateGrammarDto> ExistingGrammars { get; set; } = [];
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
