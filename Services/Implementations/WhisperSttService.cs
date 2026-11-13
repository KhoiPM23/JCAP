using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text.Json;
using JCAP.DTOs.Stt;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations;

public class WhisperSttService : IWhisperSttService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<WhisperSttService> _logger;
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
        ILogger<WhisperSttService> logger)
    {
        _logger = logger;
        _baseUrl = configuration["Whisper:BaseUrl"] ?? "http://127.0.0.1:50022";
        _httpClient = httpClientFactory.CreateClient();
        _httpClient.BaseAddress = new Uri(_baseUrl);
        _httpClient.Timeout = TimeSpan.FromSeconds(20);
    }

    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromMilliseconds(1800));
            var response = await _httpClient.GetAsync("/health", cts.Token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            // Nếu engine chưa chạy, tự kích hoạt khởi động ngầm (giới hạn 30s giữa các lần gọi)
            _ = TryAutoStartEngineAsync(CancellationToken.None);
            return false;
        }
    }

    public Task<bool> TryAutoStartEngineAsync(CancellationToken cancellationToken = default)
    {
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
            var response = await _httpClient.PostAsync(url, content, cancellationToken);

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
            _logger.LogWarning("Không thể kết nối đến Whisper Engine tại {BaseUrl}: {Message}. Kích hoạt tự khởi động.", _baseUrl, ex.Message);
            _ = TryAutoStartEngineAsync(CancellationToken.None);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi khi xử lý nhận diện giọng nói qua Whisper Engine");
            return null;
        }
    }
}
