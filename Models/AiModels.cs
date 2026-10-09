namespace JCAP.Services.Models;

public enum AiResponseFormat
{
    Text = 0,
    Json = 1
}

public class AiMessage
{
    public string Role { get; set; } = "user"; // "system", "user", "assistant"
    public string Content { get; set; } = string.Empty;

    public AiMessage() { }

    public AiMessage(string role, string content)
    {
        Role = role;
        Content = content;
    }
}

public class AiRequest
{
    public string? SystemInstruction { get; set; }
    public List<AiMessage> Messages { get; set; } = [];
    public AiResponseFormat ResponseFormat { get; set; } = AiResponseFormat.Json;
    public double Temperature { get; set; } = 0.7;

    public static AiRequest CreateJson(string? systemInstruction, string userPrompt, double temperature = 0.7)
    {
        var request = new AiRequest
        {
            SystemInstruction = systemInstruction,
            ResponseFormat = AiResponseFormat.Json,
            Temperature = temperature
        };
        request.Messages.Add(new AiMessage("user", userPrompt));
        return request;
    }

    public static AiRequest CreateText(string userPrompt, double temperature = 0.7)
    {
        var request = new AiRequest
        {
            ResponseFormat = AiResponseFormat.Text,
            Temperature = temperature
        };
        request.Messages.Add(new AiMessage("user", userPrompt));
        return request;
    }
}

public class AiResponse
{
    public bool IsSuccess { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? ErrorMessage { get; set; }
    public int? StatusCode { get; set; }

    public static AiResponse Ok(string content) => new()
    {
        IsSuccess = true,
        Content = content
    };

    public static AiResponse Fail(string errorMessage, int? statusCode = null) => new()
    {
        IsSuccess = false,
        ErrorMessage = errorMessage,
        StatusCode = statusCode
    };
}
