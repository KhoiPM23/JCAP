using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text.Json;
using JCAP.DTOs.Stt;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations;

public class WhisperSttService : IWhisperSttService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<WhisperSttService> _logger;
    private readonly IHostEnvironment? _environment;
    private readonly string _baseUrl;

    private static readonly object _processLock = new();
    private static Process? _engineProcess;
    private static bool _isStarting;
    private static DateTime _lastAutoStartAttempt = DateTime.MinValue;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public WhisperSttService(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<WhisperSttService> logger,
        IHostEnvironment? environment = null)
    {
        _configuration = configuration;
        _logger = logger;
        _environment = environment;

        var rawBaseUrl = configuration["Whisper:BaseUrl"];
        _baseUrl = (string.IsNullOrWhiteSpace(rawBaseUrl) ? "http://127.0.0.1:50022" : rawBaseUrl)
            .Trim()
            .TrimEnd('/');

        var timeoutSeconds = configuration.GetValue<int?>("Whisper:TimeoutSeconds") ?? 20;
        _httpClient = httpClientFactory.CreateClient();
        _httpClient.BaseAddress = new Uri(_baseUrl);
        _httpClient.Timeout = TimeSpan.FromSeconds(Math.Max(1, timeoutSeconds));
    }

    public static bool IsLocalUrl(string? baseUrl)
    {
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            return false;
        }

        if (!Uri.TryCreate(baseUrl.Trim(), UriKind.Absolute, out var uri))
        {
            return false;
        }

        return uri.IsLoopback;
    }

    private bool CanAutoStart()
    {
        return (_environment?.IsDevelopment() ?? false)
            && _configuration.GetValue<bool>("Whisper:AutoStart", true)
            && IsLocalUrl(_baseUrl);
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string relativePath)
    {
        var request = new HttpRequestMessage(method, relativePath);
        var token = _configuration["Whisper:Token"];
        if (!string.IsNullOrWhiteSpace(token))
        {
            request.Headers.Add("X-Internal-Token", token.Trim());
        }

        return request;
    }

    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromMilliseconds(1800));
            using var request = CreateRequest(HttpMethod.Get, "/health");
            using var response = await _httpClient.SendAsync(request, cts.Token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            // Nếu engine chưa chạy ở local dev, tự kích hoạt khởi động ngầm
            if (CanAutoStart())
            {
                _ = TryAutoStartEngineAsync(CancellationToken.None);
            }
            return false;
        }
    }

    public Task<bool> TryAutoStartEngineAsync(CancellationToken cancellationToken = default)
    {
        if (!CanAutoStart())
        {
            return Task.FromResult(false);
        }

        lock (_processLock)
        {
            if (_isStarting || (DateTime.UtcNow - _lastAutoStartAttempt).TotalSeconds < 25)
            {
                return Task.FromResult(false);
            }

            _isStarting = true;
            _lastAutoStartAttempt = DateTime.UtcNow;
        }

        _ = Task.Run(() =>
        {
            try
            {
                // Tìm vị trí script server.py
                var baseDirs = new[]
                {
                    Directory.GetCurrentDirectory(),
                    AppContext.BaseDirectory,
                    Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..")),
                    Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), ".."))
                };

                string? scriptPath = null;
                foreach (var dir in baseDirs)
                {
                    var candidate = Path.Combine(dir, "tools", "whisper_engine", "server.py");
                    if (File.Exists(candidate))
                    {
                        scriptPath = Path.GetFullPath(candidate);
                        break;
                    }
                }

                if (scriptPath == null)
                {
                    _logger.LogWarning("[Whisper Engine] Không tìm thấy file script server.py trong thư mục tools/whisper_engine");
                    return;
                }

                var scriptDir = Path.GetDirectoryName(scriptPath)!;
                var venvCandidates = new[]
                {
                    Path.Combine(scriptDir, "venv", "Scripts", "python.exe"),
                    Path.Combine(scriptDir, ".venv", "Scripts", "python.exe"),
                    Path.Combine(Directory.GetCurrentDirectory(), "venv", "Scripts", "python.exe"),
                    Path.Combine(Directory.GetCurrentDirectory(), ".venv", "Scripts", "python.exe"),
                    Path.Combine(scriptDir, "venv", "bin", "python"),
                    Path.Combine(scriptDir, ".venv", "bin", "python")
                };

                var pythonCandidates = venvCandidates
                    .Where(File.Exists)
                    .Concat(new[] { "python", "py", "python3" })
                    .Distinct();

                Process? startedProcess = null;
                foreach (var pyCmd in pythonCandidates)
                {
                    try
                    {
                        var psi = new ProcessStartInfo
                        {
                            FileName = pyCmd,
                            Arguments = $"\"{scriptPath}\"",
                            WorkingDirectory = scriptDir,
                            CreateNoWindow = true,
                            UseShellExecute = false,
                            RedirectStandardOutput = false,
                            RedirectStandardError = false
                        };
                        if (Uri.TryCreate(_baseUrl, UriKind.Absolute, out var whisperUri) && whisperUri.Port > 0)
                        {
                            psi.Environment["WHISPER_PORT"] = whisperUri.Port.ToString();
                        }
                        psi.Environment["PYTHONIOENCODING"] = "utf-8";
                        var whisperToken = _configuration["Whisper:Token"];
                        if (!string.IsNullOrWhiteSpace(whisperToken))
                        {
                            psi.Environment["WHISPER_TOKEN"] = whisperToken.Trim();
                        }

                        var proc = Process.Start(psi);
                        if (proc != null && !proc.HasExited)
                        {
                            startedProcess = proc;
                            _logger.LogInformation("[Whisper Engine] Đã tự động kích hoạt tiến trình Faster-Whisper ngầm bằng '{PyCmd}' (PID: {Pid}) tại {Script}",
                                pyCmd, proc.Id, scriptPath);
                            break;
                        }
                    }
                    catch
                    {
                        // Thử candidate tiếp theo
                    }
                }

                _engineProcess = startedProcess;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[Whisper Engine] Không thể tự động khởi động server.py. Học viên có thể dùng Web Speech API tự nhiên.");
            }
            finally
            {
                lock (_processLock)
                {
                    _isStarting = false;
                }
            }
        });

        return Task.FromResult(true);
    }

    public async Task<WhisperTranscribeResponseDto?> TranscribeAsync(
        Stream audioStream,
        string fileName,
        string language = "ja",
        CancellationToken cancellationToken = default)
    {
        if (audioStream == null || audioStream.Length == 0)
        {
            return null;
        }

        try
        {
            using var content = new MultipartFormDataContent();
            var streamContent = new StreamContent(audioStream);
            var mimeType = fileName.EndsWith(".webm", StringComparison.OrdinalIgnoreCase)
                ? "audio/webm"
                : (fileName.EndsWith(".ogg", StringComparison.OrdinalIgnoreCase) ? "audio/ogg" : "audio/wav");
            streamContent.Headers.ContentType = new MediaTypeHeaderValue(mimeType);
            content.Add(streamContent, "file", string.IsNullOrWhiteSpace(fileName) ? "speech.webm" : fileName);

            var url = $"/transcribe?language={Uri.EscapeDataString(language)}";
            using var request = CreateRequest(HttpMethod.Post, url);
            request.Content = content;
            using var response = await _httpClient.SendAsync(request, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning("Whisper Engine transcribe failed ({StatusCode}): {Body}", response.StatusCode, errorBody);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            return JsonSerializer.Deserialize<WhisperTranscribeResponseDto>(json, JsonOptions);
        }
        catch (HttpRequestException ex)
        {
            if (CanAutoStart())
            {
                _logger.LogWarning("Không thể kết nối đến Whisper Engine tại {BaseUrl}: {Message}. Kích hoạt tự khởi động.", _baseUrl, ex.Message);
                _ = TryAutoStartEngineAsync(CancellationToken.None);
            }
            else
            {
                _logger.LogWarning("Không thể kết nối đến Whisper Engine tại {BaseUrl}: {Message}.", _baseUrl, ex.Message);
            }
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi khi xử lý nhận diện giọng nói qua Whisper Engine");
            return null;
        }
    }
}
