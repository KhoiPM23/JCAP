using JCAP.DTOs.Shadowing;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using JCAP.Tests.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace JCAP.Tests.Integration;

/// <summary>Chỉ chạy khi JCAP_ASR_URL trỏ tới dịch vụ tools/shadowing-asr đang chạy và VOICEVOX đang bật (tạo giọng thử).</summary>
public sealed class AsrIntegrationFactAttribute : FactAttribute
{
    public AsrIntegrationFactAttribute()
    {
        if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("JCAP_ASR_URL")))
            Skip = "Tích hợp ASR: đặt JCAP_ASR_URL (và JCAP_ASR_TOKEN nếu dịch vụ dùng token), bật VOICEVOX.";
    }
}

/// <summary>
/// Toàn bộ pipeline chấm với dịch vụ Faster-Whisper THẬT: .NET gửi đúng WAV, nhận transcript, chấm chiều Nội dung;
/// dịch vụ tắt → Content UNAVAILABLE (không chuyển nguồn khác). Giọng thử là VOICEVOX (không đại diện người học).
/// </summary>
public class ShadowingAsrPipelineTests
{
    private static IConfiguration Config(string? url = null) => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Shadowing:Asr:BaseUrl"] = url ?? Environment.GetEnvironmentVariable("JCAP_ASR_URL"),
        ["Shadowing:Asr:Token"] = Environment.GetEnvironmentVariable("JCAP_ASR_TOKEN"),
        ["Shadowing:Asr:TimeoutMs"] = "60000",
    }).Build();

    private static ShadowingEvaluationService Service(IConfiguration config)
    {
        VoiceVoxKanaReader.ResetStateForTests();
        var reader = new VoiceVoxKanaReader(new HttpClient(), config, NullLogger<VoiceVoxKanaReader>.Instance);
        var asr = new FasterWhisperSpeechRecognitionService(new HttpClient(), config, NullLogger<FasterWhisperSpeechRecognitionService>.Instance);
        return new ShadowingEvaluationService(new KanaMoraComparer(new IKanaReader[] { reader }), config,
            NullLogger<ShadowingEvaluationService>.Instance, new FluencyAnalyzer(), null, null, null, asr);
    }

    private static async Task<byte[]> VoiceVoxWav16k(string text)
    {
        using var http = new HttpClient { BaseAddress = new Uri("http://127.0.0.1:50021") };
        var query = await (await http.PostAsync($"/audio_query?speaker=3&text={Uri.EscapeDataString(text)}", null)).Content.ReadAsStringAsync();
        var wav = await (await http.PostAsync("/synthesis?speaker=3", new StringContent(query, System.Text.Encoding.UTF8, "application/json"))).Content.ReadAsByteArrayAsync();
        var samples = WavPcmReader.ResampleTo16k(WavPcmReader.ReadMonoAnyRate(wav, out var rate), rate);
        // Thêm khoảng lặng hai đầu như bản ghi thật
        return TestAudio.Wav(TestAudio.Cat(TestAudio.Noise(300), samples, TestAudio.Noise(300)));
    }

    [AsrIntegrationFact]
    public async Task RealAsr_ScoresContent_AndKeepsPronunciationUnavailable()
    {
        const string target = "学校に行きます";
        var result = await Service(Config()).EvaluateAsync(new ShadowingAudioEvaluationInput
        {
            TargetText = target,
            AnalysisWav = await VoiceVoxWav16k(target),
        });

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal("faster-whisper", result.RecognitionSource);
        Assert.StartsWith("faster-whisper:", result.AsrModel);
        Assert.False(string.IsNullOrWhiteSpace(result.RecognizedText));
        Assert.Equal("COMPLETED", result.Dimensions.Content.Status);
        Assert.True(result.ContentMatchScore >= 80, $"Nội dung {result.ContentMatchScore} (ASR: {result.RecognizedText})");
        Assert.Equal("UNAVAILABLE", result.Dimensions.Pronunciation.Status);
        Assert.Equal("content", result.OverallScoreBasis);
    }

    [AsrIntegrationFact]
    public async Task AsrServiceDown_ContentUnavailable_NotZero()
    {
        var result = await Service(Config("http://127.0.0.1:1")).EvaluateAsync(new ShadowingAudioEvaluationInput
        {
            TargetText = "学校に行きます",
            AnalysisWav = TestAudio.Wav(TestAudio.Utterance()),
        });

        Assert.Equal("ASR_UNAVAILABLE", result.ErrorCode);
        Assert.Null(result.OverallScore);
        Assert.Equal("UNAVAILABLE", result.Dimensions.Content.Status);
    }
}
