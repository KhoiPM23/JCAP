using System;
using System.IO;
using JCAP.Services.Implementations;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace JCAP.Tests.Services;

public class BackgroundAudioCleanupServiceTests : IDisposable
{
    private readonly string _tempDirectory;
    private readonly BackgroundAudioCleanupService _service;

    public BackgroundAudioCleanupServiceTests()
    {
        _tempDirectory = Path.Combine(Path.GetTempPath(), "jcap_audio_cleanup_test_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDirectory);
        _service = new BackgroundAudioCleanupService(NullLogger<BackgroundAudioCleanupService>.Instance);
    }

    [Fact]
    public void CleanupOldAudioFiles_DeletesOnlySttFilesOlderThanMaxAge()
    {
        // 1. File stt cũ (> 24h)
        var oldSttFile = Path.Combine(_tempDirectory, "stt_test_old_123.wav");
        File.WriteAllText(oldSttFile, "dummy audio data");
        File.SetLastWriteTimeUtc(oldSttFile, DateTime.UtcNow.AddHours(-25));

        // 2. File stt mới (< 24h)
        var newSttFile = Path.Combine(_tempDirectory, "stt_test_new_456.wav");
        File.WriteAllText(newSttFile, "dummy audio data");
        File.SetLastWriteTimeUtc(newSttFile, DateTime.UtcNow.AddHours(-2));

        // 3. File không phải stt (dù cũ cũng không được xóa)
        var nonSttFile = Path.Combine(_tempDirectory, "important_config.json");
        File.WriteAllText(nonSttFile, "important data");
        File.SetLastWriteTimeUtc(nonSttFile, DateTime.UtcNow.AddHours(-30));

        var deletedCount = _service.CleanupOldAudioFiles(_tempDirectory, TimeSpan.FromHours(24));

        Assert.Equal(1, deletedCount);
        Assert.False(File.Exists(oldSttFile), "File stt cũ hơn 24h phải bị xoá");
        Assert.True(File.Exists(newSttFile), "File stt mới hơn 24h phải được giữ nguyên");
        Assert.True(File.Exists(nonSttFile), "File không phải stt không được bị xoá");
    }

    [Fact]
    public void CleanupOldAudioFiles_ReturnsZeroWhenDirectoryDoesNotExist()
    {
        var nonExistentDir = Path.Combine(Path.GetTempPath(), "jcap_non_existent_" + Guid.NewGuid().ToString("N"));
        var deletedCount = _service.CleanupOldAudioFiles(nonExistentDir, TimeSpan.FromHours(24));

        Assert.Equal(0, deletedCount);
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_tempDirectory))
            {
                Directory.Delete(_tempDirectory, true);
            }
        }
        catch
        {
            // Ignore cleanup errors
        }
    }
}
