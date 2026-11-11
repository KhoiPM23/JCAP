using JCAP.Services.Implementations;

namespace JCAP.Tests.Services;

/// <summary>Kiểm tra âm thanh phía backend: không tin Content-Type hay kết quả kiểm tra của trình duyệt.</summary>
public class ShadowingAudioValidatorTests
{
    private static byte[] Speech(int ms = 1500, double amplitude = 0.3) =>
        TestAudio.Wav(TestAudio.Cat(TestAudio.Noise(300), TestAudio.Sine(ms, amplitude), TestAudio.Noise(300)));

    private static readonly byte[] WebmHeader = { 0x1A, 0x45, 0xDF, 0xA3, 0, 0, 0, 0 };

    [Fact]
    public void NormalSpeech_IsValid_AndReturnsTheSamples()
    {
        var r = ShadowingAudioValidator.Validate(Speech(), WebmHeader);

        Assert.True(r.IsValid);
        Assert.Null(r.ErrorCode);
        Assert.Contains(r.QualityStatus, new[] { "good", "acceptable" });
        Assert.NotNull(r.Samples16k);
        Assert.InRange(r.DurationMs, 2000, 2200);
    }

    [Fact]
    public void QuietButAudibleSpeech_IsAcceptable_NotGood()
    {
        var r = ShadowingAudioValidator.Validate(Speech(amplitude: 0.01), null);
        Assert.True(r.IsValid);
        Assert.Equal("acceptable", r.QualityStatus);
    }

    [Theory]
    [InlineData(null, null, "EMPTY_AUDIO")]
    [InlineData(new byte[0], new byte[0], "EMPTY_AUDIO")]
    public void NothingSent_IsEmptyAudio(byte[]? wav, byte[]? raw, string code) =>
        Assert.Equal(code, ShadowingAudioValidator.Validate(wav, raw).ErrorCode);

    [Fact]
    public void OnlyTheRawRecording_IsMissingTheAnalysisWav()
    {
        Assert.Equal("ANALYSIS_AUDIO_MISSING", ShadowingAudioValidator.Validate(null, WebmHeader).ErrorCode);
    }

    [Fact]
    public void RawRecordingWithUnknownBytes_IsRejected_WhateverItsContentType()
    {
        Assert.Equal("INVALID_AUDIO_FORMAT", ShadowingAudioValidator.Validate(Speech(), new byte[64]).ErrorCode);
    }

    [Fact]
    public void AnalysisWavThatIsNotAWav_IsRejected()
    {
        var notWav = new byte[4096];
        WebmHeader.CopyTo(notWav, 0); // vd. gửi nhầm webm vào trường WAV
        Assert.Equal("INVALID_AUDIO_FORMAT", ShadowingAudioValidator.Validate(notWav, null).ErrorCode);
    }

    [Fact]
    public void WavWithTheWrongSampleRate_IsRejected()
    {
        var wav44k = TestAudio.Wav(TestAudio.Sine(1500, sr: 44100), 44100);
        Assert.Equal("INVALID_AUDIO_FORMAT", ShadowingAudioValidator.Validate(wav44k, null).ErrorCode);
    }

    [Fact]
    public void StereoWav_IsRejected()
    {
        var stereo = TestAudio.Wav(TestAudio.Sine(1500), channels: 2);
        Assert.Equal("INVALID_AUDIO_FORMAT", ShadowingAudioValidator.Validate(stereo, null).ErrorCode);
    }

    [Fact]
    public void TooLarge_IsRejectedBeforeParsing()
    {
        var huge = new byte[ShadowingAudioValidator.MaxAnalysisWavBytes + 1];
        Assert.Equal("AUDIO_TOO_LARGE", ShadowingAudioValidator.Validate(huge, null).ErrorCode);
    }

    [Theory]
    [InlineData(200, "AUDIO_TOO_SHORT")]
    [InlineData(31_000, "AUDIO_TOO_LONG")]
    public void Duration_OutsideTheAllowedRange_IsRejected(int ms, string code)
    {
        var wav = TestAudio.Wav(TestAudio.Sine(ms));
        Assert.Equal(code, ShadowingAudioValidator.Validate(wav, null).ErrorCode);
    }

    [Fact]
    public void Silence_IsRejected()
    {
        var r = ShadowingAudioValidator.Validate(TestAudio.Wav(TestAudio.Zeros(1500)), null);
        Assert.Equal("AUDIO_SILENT", r.ErrorCode);
        Assert.Equal("needs_retry", r.QualityStatus);
        Assert.Null(r.Samples16k);
    }

    [Fact]
    public void FarTooQuiet_IsRejected()
    {
        var r = ShadowingAudioValidator.Validate(Speech(amplitude: 0.001), null);
        Assert.Equal("AUDIO_TOO_QUIET", r.ErrorCode);
    }

    [Fact]
    public void SteadyNoiseOnly_IsRejected()
    {
        var r = ShadowingAudioValidator.Validate(TestAudio.Wav(TestAudio.Noise(1500, amplitude: 0.05)), null);
        Assert.Equal("AUDIO_NOISE_ONLY", r.ErrorCode);
    }

    [Fact]
    public void HeavilyClipped_IsRejected()
    {
        var square = TestAudio.Sine(1500, amplitude: 1.0).Select(v => v >= 0 ? 1f : -1f).ToArray();
        var r = ShadowingAudioValidator.Validate(TestAudio.Wav(TestAudio.Cat(TestAudio.Noise(300), square, TestAudio.Noise(300))), null);
        Assert.Equal("AUDIO_CLIPPED", r.ErrorCode);
    }

    [Theory]
    [InlineData(new byte[] { 0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45 }, "wav")]
    [InlineData(new byte[] { 0x1A, 0x45, 0xDF, 0xA3 }, "webm")]
    [InlineData(new byte[] { 0x4F, 0x67, 0x67, 0x53 }, "ogg")]
    [InlineData(new byte[] { 0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70 }, "mp4")]
    [InlineData(new byte[] { 0xFF, 0xFB, 0x90, 0x00 }, null)] // mp3: không hỗ trợ
    public void Container_IsDetectedFromTheBytes(byte[] head, string? expected) =>
        Assert.Equal(expected, ShadowingAudioValidator.DetectContainer(head));
}

public class ShadowingRecognitionThrottleTests
{
    [Fact]
    public async Task OnlyTheConfiguredNumberRunAtOnce_TheRestTimeOut()
    {
        using var throttle = new ShadowingRecognitionThrottle(1, TimeSpan.FromMilliseconds(50));

        var first = await throttle.TryEnterAsync(CancellationToken.None);
        var second = await throttle.TryEnterAsync(CancellationToken.None);
        Assert.NotNull(first);
        Assert.Null(second); // chờ quá hạn → SERVER_BUSY ở tầng trên

        first!.Dispose();
        first.Dispose(); // giải phóng hai lần không làm tăng số chỗ
        var third = await throttle.TryEnterAsync(CancellationToken.None);
        var fourth = await throttle.TryEnterAsync(CancellationToken.None);
        Assert.NotNull(third);
        Assert.Null(fourth);
    }
}
