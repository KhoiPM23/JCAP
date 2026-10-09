namespace JCAP.Services.Models;

public class AiConfigurationOptions
{
    public const string SectionName = "AI";

    public string Provider { get; set; } = "Gemini";
    public string Model { get; set; } = "gemini-3.1-flash-lite";
    public string ApiKey { get; set; } = string.Empty;
    public string? BaseUrl { get; set; }
}
