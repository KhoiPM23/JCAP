namespace JCAP.DTOs.Scenario;

public class ScenarioListDto
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? Thumbnail { get; set; }
    public bool IsActive { get; set; }
    public string? ScenarioCode { get; set; }
    public List<string> SupportedJLPTLevels { get; set; } = [];
}
