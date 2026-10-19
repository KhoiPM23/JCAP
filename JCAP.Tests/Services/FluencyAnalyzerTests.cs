using System.Text;
using JCAP.Services.Implementations;
using Xunit;

namespace JCAP.Tests.Services;

public class FluencyAnalyzerTests
{
    private const int Sr = 16000;
    private static readonly Random Rng = new(42);

    // ---- tín hiệu tổng hợp ----
    private static float[] Sine(int ms, double amplitude = 0.3, double hz = 180)
    {
        var n = Sr * ms / 1000;
        var data = new float[n];
        for (int i = 0; i < n; i++) data[i] = (float)(amplitude * Math.Sin(2 * Math.PI * hz * i / Sr));
        return data;
    }

    private static float[] Noise(int ms, double amplitude = 0.0005)
    {
        var n = Sr * ms / 1000;
        var data = new float[n];
        for (int i = 0; i < n; i++) data[i] = (float)((Rng.NextDouble() * 2 - 1) * amplitude);
        return data;
    }

    private static float[] Zeros(int ms) => new float[Sr * ms / 1000];

    private static float[] Cat(params float[][] parts) => parts.SelectMany(p => p).ToArray();

    private static byte[] Wav(float[] samples, int sampleRate = Sr, short channels = 1, short bits = 16)
    {
        var dataLen = samples.Length * 2;
        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms, Encoding.ASCII, leaveOpen: true);
        w.Write(Encoding.ASCII.GetBytes("RIFF"));
        w.Write(36 + dataLen);
        w.Write(Encoding.ASCII.GetBytes("WAVE"));
        w.Write(Encoding.ASCII.GetBytes("fmt "));
        w.Write(16);
        w.Write((short)1);
        w.Write(channels);
        w.Write(sampleRate);
        w.Write(sampleRate * channels * bits / 8);
        w.Write((short)(channels * bits / 8));
        w.Write(bits);
        w.Write(Encoding.ASCII.GetBytes("data"));
        w.Write(dataLen);
        foreach (var s in samples) w.Write((short)Math.Clamp(s * 32767, -32768, 32767));
        w.Flush();
        return ms.ToArray();
    }

    private static readonly FluencyAnalyzer Analyzer = new();

    // ---- trường hợp không đo được: unavailable kèm mã lý do, không phải số 0 ----

    [Fact]
    public void DigitalSilence_IsUnavailable_NoSignal()
    {
        var r = Analyzer.Analyze(Wav(Zeros(2000)), 10);
        Assert.Equal("unavailable", r.Status);
        Assert.Equal("NO_SIGNAL", r.ReasonCode);
        Assert.Null(r.SpeakingRateMoraPerSec);
    }

    [Fact]
    public void VeryQuietRecording_IsUnavailable_LowLevel()
    {
        var r = Analyzer.Analyze(Wav(Cat(Noise(300), Sine(1000, 0.001), Noise(300))), 10);
        Assert.Equal("unavailable", r.Status);
        Assert.Contains(r.ReasonCode, new[] { "LOW_LEVEL", "NOISE_ONLY" });
    }

    [Fact]
    public void LoudConstantNoise_IsNotSpeech()
    {
        var r = Analyzer.Analyze(Wav(Noise(3000, 0.05)), 10);
        Assert.Equal("unavailable", r.Status);
        Assert.Equal("NOISE_ONLY", r.ReasonCode);
    }

    [Fact]
    public void TooShortAudio_IsUnavailable()
    {
        var r = Analyzer.Analyze(Wav(Sine(150)), 3);
        Assert.Equal("unavailable", r.Status);
        Assert.Equal("AUDIO_TOO_SHORT", r.ReasonCode);
    }

    [Fact]
    public void TooShortSpeech_IsUnavailable()
    {
        var r = Analyzer.Analyze(Wav(Cat(Noise(500), Sine(100), Noise(500))), 3);
        Assert.Equal("unavailable", r.Status);
        Assert.Equal("SPEECH_TOO_SHORT", r.ReasonCode);
    }

    [Fact]
    public void WrongSampleRate_IsRejected_NotSilentlyAnalyzed()
    {
        var r = Analyzer.Analyze(Wav(Cat(Noise(300), Sine(1500), Noise(300)), sampleRate: 48000), 10);
        Assert.Equal("unavailable", r.Status);
        Assert.Equal("UNSUPPORTED_WAV_FORMAT", r.ReasonCode);
    }

    [Fact]
    public void StereoWav_IsRejected()
    {
        var r = Analyzer.Analyze(Wav(Cat(Noise(300), Sine(1500), Noise(300)), channels: 2), 10);
        Assert.Equal("UNSUPPORTED_WAV_FORMAT", r.ReasonCode);
    }

    [Fact]
    public void GarbageBytes_AreInvalidWav()
    {
        var r = Analyzer.Analyze(new byte[2000], 10);
        Assert.Equal("unavailable", r.Status);
        Assert.Equal("INVALID_WAV", r.ReasonCode);
    }

    // ---- đo được ----

    [Fact]
    public void SingleUtterance_EdgesAndSpanCloseToTruth()
    {
        var r = Analyzer.Analyze(Wav(Cat(Noise(500), Sine(1500), Noise(500))), 10);
        Assert.Equal("available", r.Status);
        Assert.InRange(r.LeadingSilenceMs!.Value, 400, 600);
        Assert.InRange(r.SpeechSpanMs!.Value, 1400, 1600);
        Assert.Equal(0, r.PauseCount);
        Assert.Equal(0, r.TotalPauseMs);
        Assert.InRange(r.SpeechRatio!.Value, 0.99, 1.0);
    }

    [Fact]
    public void SpeakingRate_IsMoraPerSecondOverSpan()
    {
        var r = Analyzer.Analyze(Wav(Cat(Noise(300), Sine(2000), Noise(300))), 10);
        Assert.Equal(10, r.MoraCount);
        Assert.InRange(r.SpeakingRateMoraPerSec!.Value, 4.7, 5.3);
        Assert.Equal(r.SpeakingRateMoraPerSec, r.ArticulationRateMoraPerSec); // không có khoảng dừng
    }

    [Fact]
    public void WithoutMoraCount_RatesAreNull_ButPauseMetricsStillReported()
    {
        var r = Analyzer.Analyze(Wav(Cat(Noise(300), Sine(800), Noise(500), Sine(800), Noise(300))), null);
        Assert.Equal("available", r.Status);
        Assert.Null(r.SpeakingRateMoraPerSec);
        Assert.Null(r.MoraCount);
        Assert.Equal(1, r.PauseCount);
    }

    [Fact]
    public void Pause_IsDetectedWithDuration_AndArticulationRateExcludesIt()
    {
        var r = Analyzer.Analyze(Wav(Cat(Noise(300), Sine(800), Noise(500), Sine(800), Noise(300))), 10);
        Assert.Equal(1, r.PauseCount);
        Assert.InRange(r.LongestPauseMs!.Value, 440, 560);
        Assert.InRange(r.PauseRatio!.Value, 0.2, 0.3);
        Assert.True(r.ArticulationRateMoraPerSec > r.SpeakingRateMoraPerSec);
        Assert.Single(r.Pauses);
    }

    [Fact]
    public void ShortGap_LikeSokuonClosure_IsNotAPause()
    {
        var r = Analyzer.Analyze(Wav(Cat(Noise(300), Sine(600), Noise(80), Sine(600), Noise(300))), 8);
        Assert.Equal(0, r.PauseCount);
        Assert.InRange(r.SpeechRatio!.Value, 0.99, 1.0);
    }

    [Fact]
    public void MidSizedGap_BelowPauseThreshold_IsNeitherPauseNorSpeech()
    {
        // 180 ms: dài hơn mức lấp (120) nhưng ngắn hơn ngưỡng khoảng dừng (250)
        var r = Analyzer.Analyze(Wav(Cat(Noise(300), Sine(600), Noise(180), Sine(600), Noise(300))), 8);
        Assert.Equal(0, r.PauseCount);
        Assert.True(r.SpeechRatio < 0.95);
    }

    [Fact]
    public void Hysteresis_DipBetweenExitAndEnterThresholds_DoesNotSplitSpeech()
    {
        // Đoạn trũng ~ -49 dB nằm giữa ngưỡng thoát và ngưỡng vào: đã vào tiếng nói thì giữ nguyên, không bị cắt.
        var r = Analyzer.Analyze(Wav(Cat(Noise(400), Sine(600), Sine(200, 0.005), Sine(600), Noise(400))), 10);
        Assert.Equal("available", r.Status);
        Assert.InRange(r.SpeechRatio!.Value, 0.99, 1.0);
        Assert.Equal(0, r.PauseCount);
    }

    [Fact]
    public void SameInput_GivesIdenticalOutput()
    {
        var wav = Wav(Cat(Noise(300), Sine(800), Noise(500), Sine(800), Noise(300)));
        var a = Analyzer.Analyze(wav, 10);
        var b = Analyzer.Analyze(wav, 10);
        Assert.Equal(a.SpeechSpanMs, b.SpeechSpanMs);
        Assert.Equal(a.PauseCount, b.PauseCount);
        Assert.Equal(a.SpeakingRateMoraPerSec, b.SpeakingRateMoraPerSec);
    }

    [Fact]
    public void WavWithExtraChunkBeforeData_IsParsed()
    {
        var wav = Wav(Cat(Noise(300), Sine(1000), Noise(300)));
        // chèn khối LIST (có byte đệm) trước khối data
        var list = new List<byte>();
        list.AddRange(Encoding.ASCII.GetBytes("LIST"));
        list.AddRange(BitConverter.GetBytes(3));
        list.AddRange(new byte[] { 1, 2, 3, 0 });
        var withList = wav.Take(36).Concat(list).Concat(wav.Skip(36)).ToArray();
        var r = Analyzer.Analyze(withList, 8);
        Assert.Equal("available", r.Status);
    }
}
