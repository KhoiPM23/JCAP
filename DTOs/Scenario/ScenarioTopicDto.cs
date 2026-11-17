namespace JCAP.DTOs.Scenario;

public class ScenarioTopicDto
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int ScenarioCount { get; set; }
    public bool IsPrimary { get; set; }
    public string Icon { get; set; } = "folder";
}
