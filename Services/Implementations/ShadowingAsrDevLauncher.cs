using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Chỉ dùng khi phát triển (đăng ký trong môi trường Development): `dotnet run` tự bật dịch vụ nhận dạng
    /// tools/shadowing-asr nếu nó chưa chạy, nạp sẵn model Whisper, và tắt nó khi backend dừng.
    /// Đã có dịch vụ đang chạy (vd. tự mở bằng scripts/run-shadowing-asr.ps1) thì dùng luôn, không mở thêm.
    /// Python: `Shadowing:Asr:PythonPath`, nếu không có thì môi trường ảo tools/shadowing-asr/.venv (do scripts/setup-shadowing.ps1 tạo),
    /// cuối cùng là python trên PATH. Tắt bằng `Shadowing:Asr:AutoStart=false`. Chỉ tự bật khi `Shadowing:Asr:BaseUrl` là máy này.
    /// Không ghi audio hay transcript ra log; chỉ chuyển dòng lỗi của tiến trình Python sang log backend.
    /// </summary>
    public sealed class ShadowingAsrDevLauncher : BackgroundService
    {
        private readonly IConfiguration _configuration;
        private readonly IHostEnvironment _environment;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<ShadowingAsrDevLauncher> _logger;
        private readonly Queue<string> _recentErrors = new();
        private Process? _process;

        public ShadowingAsrDevLauncher(IConfiguration configuration, IHostEnvironment environment, IHttpClientFactory httpClientFactory, ILogger<ShadowingAsrDevLauncher> logger)
        {
            _configuration = configuration;
            _environment = environment;
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        private string BaseUrl => (_configuration["Shadowing:Asr:BaseUrl"] ?? "http://127.0.0.1:50023").TrimEnd('/');

        /// <summary>Chỉ tự bật tiến trình cho địa chỉ trên chính máy này; dịch vụ ở máy khác thì không đụng tới.</summary>
        public static bool IsLocalUrl(string baseUrl, out int port)
        {
            port = 0;
            if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri)) return false;
            port = uri.Port;
            return uri.IsLoopback;
        }

        /// <summary>Chọn Python: cấu hình riêng → môi trường ảo của dịch vụ → python trên PATH.</summary>
        public static string ResolvePython(string? configured, string asrDir, bool isWindows, Func<string, bool> fileExists)
        {
            if (!string.IsNullOrWhiteSpace(configured)) return configured;
            var venvPython = isWindows
                ? Path.Combine(asrDir, ".venv", "Scripts", "python.exe")
                : Path.Combine(asrDir, ".venv", "bin", "python");
            if (fileExists(venvPython)) return venvPython;
            return isWindows ? "python" : "python3";
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            if (_configuration.GetValue<bool?>("Shadowing:Asr:AutoStart") == false) return;
            if (!IsLocalUrl(BaseUrl, out var port)) return;

            if (await IsHealthyAsync(stoppingToken))
            {
                _logger.LogInformation("Dịch vụ nhận dạng Shadowing đã chạy sẵn tại {Url}, dùng luôn.", BaseUrl);
                return;
            }

            var asrDir = Path.Combine(_environment.ContentRootPath, "tools", "shadowing-asr");
            if (!Directory.Exists(asrDir)) return;
            var python = ResolvePython(_configuration["Shadowing:Asr:PythonPath"], asrDir, OperatingSystem.IsWindows(), File.Exists);

            var start = new ProcessStartInfo(python, "-m app.main")
            {
                WorkingDirectory = asrDir,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            start.Environment["ASR_PORT"] = port.ToString();
            start.Environment["PYTHONIOENCODING"] = "utf-8";
            var token = _configuration["Shadowing:Asr:Token"];
            if (!string.IsNullOrEmpty(token)) start.Environment["ASR_TOKEN"] = token;

            try
            {
                _process = Process.Start(start);
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Không tự bật được dịch vụ nhận dạng Shadowing ({Message}). Cài Python rồi chạy .\\scripts\\setup-shadowing.ps1.", ex.Message);
                return;
            }
            if (_process == null) return;
            _process.OutputDataReceived += (_, e) => OnOutput(e.Data);
            _process.ErrorDataReceived += (_, e) => OnOutput(e.Data);
            _process.BeginOutputReadLine();
            _process.BeginErrorReadLine();
            _logger.LogInformation("Đang tự bật dịch vụ nhận dạng Shadowing ({Python}) tại {Url}…", python, BaseUrl);

            // Đợi dịch vụ lên (tối đa 60 giây), rồi nạp sẵn model để lần chấm đầu không bị quá giờ
            for (var i = 0; i < 60 && !stoppingToken.IsCancellationRequested; i++)
            {
                if (_process.HasExited)
                {
                    lock (_recentErrors)
                    {
                        _logger.LogWarning(
                            "Dịch vụ nhận dạng Shadowing dừng ngay khi bật (mã {Code}). Chạy một lần .\\scripts\\setup-shadowing.ps1 để cài thư viện. Lỗi cuối:{NewLine}{Errors}",
                            _process.ExitCode, Environment.NewLine, string.Join(Environment.NewLine, _recentErrors));
                    }
                    return;
                }
                if (await IsHealthyAsync(stoppingToken))
                {
                    _logger.LogInformation("Dịch vụ nhận dạng Shadowing đã sẵn sàng, đang nạp model Whisper (lần đầu có thể tải ~460 MB)…");
                    await WarmUpAsync(stoppingToken);
                    return;
                }
                try { await Task.Delay(1000, stoppingToken); } catch (OperationCanceledException) { return; }
            }
        }

        private void OnOutput(string? line)
        {
            if (string.IsNullOrWhiteSpace(line)) return;
            lock (_recentErrors)
            {
                _recentErrors.Enqueue(line);
                while (_recentErrors.Count > 8) _recentErrors.Dequeue();
            }
            // Dòng truy cập của uvicorn (đường dẫn + mã trạng thái) để ở mức Debug; lỗi đưa lên Warning
            if (line.Contains("error", StringComparison.OrdinalIgnoreCase) || line.Contains("Traceback", StringComparison.Ordinal))
                _logger.LogWarning("[shadowing-asr] {Line}", line);
            else
                _logger.LogDebug("[shadowing-asr] {Line}", line);
        }

        private async Task<bool> IsHealthyAsync(CancellationToken cancellationToken)
        {
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeout.CancelAfter(TimeSpan.FromSeconds(2));
                var client = _httpClientFactory.CreateClient();
                using var response = await client.GetAsync(BaseUrl + "/health", timeout.Token);
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>Gửi 0,5 giây im lặng (không phải giọng người dùng) để dịch vụ nạp model ngay.</summary>
        private async Task WarmUpAsync(CancellationToken cancellationToken)
        {
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, BaseUrl + "/v1/transcribe");
                var token = _configuration["Shadowing:Asr:Token"];
                if (!string.IsNullOrEmpty(token)) request.Headers.Add("X-Internal-Token", token);
                var form = new MultipartFormDataContent();
                var audio = new ByteArrayContent(SilentWav(16000, 8000));
                audio.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("audio/wav");
                form.Add(audio, "file", "warmup.wav");
                request.Content = form;

                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeout.CancelAfter(TimeSpan.FromMinutes(15));
                var client = _httpClientFactory.CreateClient();
                client.Timeout = Timeout.InfiniteTimeSpan;
                using var response = await client.SendAsync(request, timeout.Token);
                if (response.IsSuccessStatusCode)
                    _logger.LogInformation("Dịch vụ nhận dạng Shadowing đã nạp xong model, sẵn sàng chấm.");
                else
                    _logger.LogWarning("Nạp sẵn model nhận dạng Shadowing thất bại (HTTP {Status}).", (int)response.StatusCode);
            }
            catch (OperationCanceledException)
            {
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Nạp sẵn model nhận dạng Shadowing thất bại: {Message}", ex.Message);
            }
        }

        private static byte[] SilentWav(int sampleRate, int samples)
        {
            var dataBytes = samples * 2;
            using var ms = new MemoryStream(44 + dataBytes);
            using var w = new BinaryWriter(ms);
            w.Write("RIFF"u8.ToArray()); w.Write(36 + dataBytes); w.Write("WAVE"u8.ToArray());
            w.Write("fmt "u8.ToArray()); w.Write(16); w.Write((short)1); w.Write((short)1);
            w.Write(sampleRate); w.Write(sampleRate * 2); w.Write((short)2); w.Write((short)16);
            w.Write("data"u8.ToArray()); w.Write(dataBytes); w.Write(new byte[dataBytes]);
            w.Flush();
            return ms.ToArray();
        }

        public override async Task StopAsync(CancellationToken cancellationToken)
        {
            await base.StopAsync(cancellationToken);
            var process = _process;
            if (process == null) return;
            try
            {
                if (!process.HasExited) process.Kill(entireProcessTree: true);
            }
            catch (Exception ex)
            {
                _logger.LogDebug("Không tắt được tiến trình nhận dạng Shadowing: {Message}", ex.Message);
            }
            finally
            {
                process.Dispose();
                _process = null;
            }
        }
    }
}
