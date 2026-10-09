using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations;

public class AiClientResolver : IAiClient
{
    private readonly IServiceProvider _serviceProvider;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AiClientResolver> _logger;

    public AiClientResolver(
        IServiceProvider serviceProvider,
        IConfiguration configuration,
        ILogger<AiClientResolver> logger)
    {
        _serviceProvider = serviceProvider;
        _configuration = configuration;
        _logger = logger;
    }

    public Task<AiResponse> GenerateAsync(AiRequest request, CancellationToken cancellationToken = default)
    {
        var client = ResolveClient();
        return client.GenerateAsync(request, cancellationToken);
    }

    private IAiClient ResolveClient()
    {
        var provider = _configuration["AI:Provider"];

        if (string.IsNullOrWhiteSpace(provider))
        {
            if (!string.IsNullOrWhiteSpace(_configuration["OpenAI:ApiKey"]) ||
                (!string.IsNullOrWhiteSpace(_configuration["AI:BaseUrl"]) && _configuration["AI:BaseUrl"]!.Contains("groq", StringComparison.OrdinalIgnoreCase)))
            {
                provider = "OpenAI";
            }
            else
            {
                provider = "Gemini";
            }
        }

        if (string.Equals(provider, "OpenAI", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(provider, "Groq", StringComparison.OrdinalIgnoreCase))
        {
            return _serviceProvider.GetRequiredService<OpenAiCompatibleAiClient>();
        }

        return _serviceProvider.GetRequiredService<GeminiAiClient>();
    }
}
