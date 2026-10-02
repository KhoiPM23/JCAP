using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Scenario;

public class UpdateScenarioDto
{
    [Required(ErrorMessage = "Tiêu đề kịch bản không được để trống.")]
    [StringLength(200, ErrorMessage = "Tiêu đề không được vượt quá 200 ký tự.")]
    public string Title { get; set; } = string.Empty;

    [Required(ErrorMessage = "Mô tả kịch bản không được để trống.")]
    public string Description { get; set; } = string.Empty;

    public string? Thumbnail { get; set; }

    public string? ScenarioCode { get; set; }

    public bool IsActive { get; set; } = true;

    public List<CreateScenarioLevelConfigDto>? LevelConfigurations { get; set; }
}
