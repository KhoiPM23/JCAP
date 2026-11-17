using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations;

/// <summary>
/// Background service dọn dẹp an toàn các file ghi âm tạm thời của học viên (stt_*.wav, stt_*.webm...)
/// sinh ra bởi Whisper Engine sau 24 giờ để tối ưu dung lượng đĩa cứng trên máy chủ.
/// </summary>
public class BackgroundAudioCleanupService : BackgroundService
{
    private readonly ILogger<BackgroundAudioCleanupService> _logger;
    private readonly IWebHostEnvironment? _environment;
    private readonly TimeSpan _checkInterval;
    private readonly TimeSpan _fileMaxAge;
    private readonly string? _customTargetDirectory;

    public BackgroundAudioCleanupService(
        ILogger<BackgroundAudioCleanupService> logger,
        IWebHostEnvironment? environment = null,
        IConfiguration? configuration = null)
    {
        _logger = logger;
        _environment = environment;

        var intervalHours = configuration?.GetValue<double>("AudioCleanup:IntervalHours", 24.0) ?? 24.0;
        _checkInterval = TimeSpan.FromHours(Math.Max(1.0, intervalHours));

        var maxAgeHours = configuration?.GetValue<double>("AudioCleanup:MaxAgeHours", 24.0) ?? 24.0;
        _fileMaxAge = TimeSpan.FromHours(Math.Max(1.0, maxAgeHours));

        _customTargetDirectory = configuration?["AudioCleanup:TargetDirectory"];
    }

    /// <summary>
    /// Phương thức quét và xoá an toàn các file audio stt_* cũ hơn thời hạn quy định.
    /// Có thể gọi độc lập trong unit tests hoặc admin maintenance jobs.
    /// </summary>
    public int CleanupOldAudioFiles(string directoryPath, TimeSpan maxAge)
    {
        if (string.IsNullOrWhiteSpace(directoryPath) || !Directory.Exists(directoryPath))
        {
            _logger.LogInformation("Thư mục âm thanh không tồn tại hoặc chưa được khởi tạo: {Dir}", directoryPath);
            return 0;
        }

        int deletedCount = 0;
        var thresholdTime = DateTime.UtcNow.Subtract(maxAge);

        try
        {
            var files = Directory.GetFiles(directoryPath, "stt_*.*", SearchOption.TopDirectoryOnly);
            foreach (var filePath in files)
            {
                try
                {
                    var lastWriteUtc = File.GetLastWriteTimeUtc(filePath);
                    if (lastWriteUtc < thresholdTime)
                    {
                        File.Delete(filePath);
                        deletedCount++;
                        _logger.LogDebug("Đã dọn dẹp file Whisper audio quá hạn: {File}", Path.GetFileName(filePath));
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Không thể xóa file audio quá hạn: {File}", filePath);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi xảy ra khi quét thư mục audio: {Dir}", directoryPath);
        }

        if (deletedCount > 0)
        {
            _logger.LogInformation("Hoàn tất chu kỳ dọn dẹp audio: đã xóa {Count} file 'stt_*' cũ hơn {Hours}h tại {Dir}",
                deletedCount, maxAge.TotalHours, directoryPath);
        }

        return deletedCount;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("BackgroundAudioCleanupService đã khởi động. Chu kỳ quét: {IntervalHours}h, Tuổi thọ file tối đa: {MaxAgeHours}h",
            _checkInterval.TotalHours, _fileMaxAge.TotalHours);

        // Đợi 10 giây sau khi ứng dụng khởi động xong trước khi chạy chu kỳ đầu tiên
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken).ConfigureAwait(false);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                string targetDir = ResolveTargetDirectory();
                CleanupOldAudioFiles(targetDir, _fileMaxAge);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Lỗi không mong muốn trong chu kỳ dọn dẹp audio định kỳ.");
            }

            try
            {
                await Task.Delay(_checkInterval, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _logger.LogInformation("BackgroundAudioCleanupService đang dừng lại.");
    }

    private string ResolveTargetDirectory()
    {
        if (!string.IsNullOrWhiteSpace(_customTargetDirectory))
        {
            return _customTargetDirectory;
        }

        if (_environment != null && !string.IsNullOrWhiteSpace(_environment.WebRootPath))
        {
            return Path.Combine(_environment.WebRootPath, "audio", "roleplay");
        }

        // Fallback thư mục tương đối chuẩn
        return Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "audio", "roleplay");
    }
}
