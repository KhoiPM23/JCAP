using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Tác vụ nền: sau khi khởi động, tạo dần dữ liệu câu mẫu còn thiếu/đã cũ (cách đọc + giọng mẫu của các giọng cấu hình),
    /// từng lô nhỏ, tuần tự (engine VOICEVOX xử lý tuần tự). VOICEVOX tắt thì dừng, lần khởi động sau chạy tiếp.
    /// Cấu hình: `Shadowing:Assets:BackfillOnStartup` (mặc định true), `Shadowing:Assets:Speakers` (mặc định [3] — giọng mặc định
    /// của trang luyện), `Shadowing:Assets:BackfillDelaySeconds` (mặc định 30), `Shadowing:Assets:BatchSize` (mặc định 20).
    /// </summary>
    public sealed class ShadowingAssetBackfillService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopes;
        private readonly IConfiguration _configuration;
        private readonly ILogger<ShadowingAssetBackfillService> _logger;

        public ShadowingAssetBackfillService(IServiceScopeFactory scopes, IConfiguration configuration, ILogger<ShadowingAssetBackfillService> logger)
        {
            _scopes = scopes;
            _configuration = configuration;
            _logger = logger;
        }

        public static int[] ConfiguredSpeakers(IConfiguration configuration)
        {
            var speakers = configuration.GetSection("Shadowing:Assets:Speakers").Get<int[]>();
            return speakers is { Length: > 0 } ? speakers.Distinct().ToArray() : new[] { 3 };
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            if (_configuration.GetValue<bool?>("Shadowing:Assets:BackfillOnStartup") == false) return;
            var delay = TimeSpan.FromSeconds(_configuration.GetValue<int?>("Shadowing:Assets:BackfillDelaySeconds") ?? 30);
            var batch = Math.Clamp(_configuration.GetValue<int?>("Shadowing:Assets:BatchSize") ?? 20, 1, 200);
            var speakers = ConfiguredSpeakers(_configuration);

            try
            {
                await Task.Delay(delay, stoppingToken);
                int readings = 0, audios = 0;
                for (var round = 0; round < 500 && !stoppingToken.IsCancellationRequested; round++)
                {
                    using var scope = _scopes.CreateScope();
                    var assets = scope.ServiceProvider.GetRequiredService<IShadowingSentenceAssetService>();
                    var report = await assets.GenerateMissingAsync(speakers, batch, stoppingToken);
                    readings += report.ReadingsCreated;
                    audios += report.AudiosCreated;
                    if (report.EngineUnavailable)
                    {
                        _logger.LogInformation("Tạo dữ liệu câu mẫu tạm dừng: VOICEVOX chưa chạy (đã tạo {Readings} cách đọc, {Audios} giọng mẫu).", readings, audios);
                        return;
                    }
                    // Không còn câu thiếu, hoặc lô này không tạo được gì (chỉ còn câu lỗi): dừng
                    if (report.ReadingsCreated + report.AudiosCreated == 0) break;
                }
                if (readings + audios > 0)
                    _logger.LogInformation("Đã tạo dữ liệu câu mẫu: {Readings} cách đọc, {Audios} giọng mẫu.", readings, audios);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // ứng dụng dừng
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Tác vụ tạo dữ liệu câu mẫu lỗi; lần khởi động sau sẽ chạy lại.");
            }
        }
    }
}
