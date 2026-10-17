using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace JCAP.Tests.Services;

public class ShadowingEvaluationServiceTests
{
    private const string Target = "一人です。カウンター席でお願いします。";

    private sealed class FakeRecognizer : IShadowingSpeechRecognizer
    {
        private readonly SpeechRecognitionResult _result;
        public int Calls { get; private set; }
        public TimeSpan? LastTimeout { get; private set; }

        public FakeRecognizer(SpeechRecognitionResult result) => _result = result;

        public Task<SpeechRecognitionResult> TranscribeAsync(
            byte[] audio, string mimeType, CancellationToken cancellationToken = default, TimeSpan? timeout = null)
        {
            Calls++;
            LastTimeout = timeout;
            return Task.FromResult(_result);
        }
    }

    private static SpeechRecognitionResult Heard(string text) =>
        new() { Outcome = SpeechRecognitionOutcome.Recognized, Text = text };

    private static SpeechRecognitionResult Failure(SpeechRecognitionOutcome outcome, string code) =>
        new() { Outcome = outcome, ErrorCode = code };

    private static byte[] WebmBytes(int length = 2048)
    {
        var data = new byte[length];
        data[0] = 0x1A; data[1] = 0x45; data[2] = 0xDF; data[3] = 0xA3;
        return data;
    }

    private static byte[] WavBytes(int length = 2048)
    {
        var data = new byte[length];
        "RIFF"u8.CopyTo(data);
        "WAVE"u8.CopyTo(data.AsSpan(8));
        return data;
    }

    private static ShadowingEvaluationService CreateService(
        FakeRecognizer recognizer, IKanaReader? reader = null, string provider = "gemini",
        IFluencyAnalyzer? fluencyAnalyzer = null) =>
        new(recognizer,
            new KanaMoraComparer(new IKanaReader[] { reader ?? new TestKanaReader() }),
            new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?> { ["Shadowing:Recognition:Provider"] = provider })
                .Build(),
            new Mock<ILogger<ShadowingEvaluationService>>().Object,
            fluencyAnalyzer);

    private static byte[] FluencyWav()
    {
        // 300 ms nền + 1.5 s "tiếng nói" + 300 ms nền, PCM16 mono 16 kHz
        var samples = new List<short>();
        samples.AddRange(Enumerable.Repeat((short)3, 4800));
        for (int i = 0; i < 24000; i++) samples.Add((short)(9000 * Math.Sin(2 * Math.PI * 180 * i / 16000)));
        samples.AddRange(Enumerable.Repeat((short)3, 4800));
        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms);
        w.Write("RIFF"u8.ToArray()); w.Write(36 + samples.Count * 2); w.Write("WAVE"u8.ToArray());
        w.Write("fmt "u8.ToArray()); w.Write(16); w.Write((short)1); w.Write((short)1);
        w.Write(16000); w.Write(32000); w.Write((short)2); w.Write((short)16);
        w.Write("data"u8.ToArray()); w.Write(samples.Count * 2);
        foreach (var s in samples) w.Write(s);
        w.Flush();
        return ms.ToArray();
    }

    // Nhịp nói: số liệu thô đi kèm kết quả, không đổi điểm
    [Fact]
    public async Task Fluency_IsAttachedAsRawMetrics_AndDoesNotChangeScores()
    {
        var recognizer = new FakeRecognizer(Heard("x"));
        var service = CreateService(recognizer, provider: "browser", fluencyAnalyzer: new FluencyAnalyzer());

        var withWav = await service.EvaluateAsync(new ShadowingAudioEvaluationInput
        {
            Audio = WebmBytes(), MimeType = "audio/webm", TargetText = Target, AudioGateStatus = "good",
            ClientTranscript = Target, ClientRecognitionStatus = "final", AnalysisWav = FluencyWav()
        });
        var withoutWav = await service.EvaluateAsync(Input(clientTranscript: Target, clientStatus: "final"));

        Assert.NotNull(withWav.Fluency);
        Assert.Equal("available", withWav.Fluency!.Status);
        Assert.True(withWav.Fluency.MoraCount > 0);
        Assert.Equal(JapaneseMora.FromKana(withWav.TargetReading).Count, withWav.Fluency.MoraCount);
        Assert.Null(withWav.FluencyScore);                       // vẫn chưa có điểm Fluency
        Assert.Contains("fluency", withWav.UnavailableDimensions);
        Assert.Null(withoutWav.Fluency);
        Assert.Equal(withoutWav.OverallScore, withWav.OverallScore);
        Assert.Equal(withoutWav.ContentMatchScore, withWav.ContentMatchScore);
    }

    [Fact]
    public async Task Fluency_BadWav_NeverBreaksTheContentScore()
    {
        var service = CreateService(new FakeRecognizer(Heard("x")), provider: "browser", fluencyAnalyzer: new FluencyAnalyzer());

        var result = await service.EvaluateAsync(new ShadowingAudioEvaluationInput
        {
            Audio = WebmBytes(), MimeType = "audio/webm", TargetText = Target, AudioGateStatus = "good",
            ClientTranscript = Target, ClientRecognitionStatus = "final", AnalysisWav = new byte[500]
        });

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal(100, result.ContentMatchScore);
        Assert.Equal("unavailable", result.Fluency!.Status);
        Assert.Equal("INVALID_WAV", result.Fluency.ReasonCode);
    }

    [Fact]
    public async Task Fluency_AnalyzerThrowing_IsReportedAsUnavailable_NotFailure()
    {
        var analyzer = new Mock<IFluencyAnalyzer>();
        analyzer.Setup(a => a.Analyze(It.IsAny<byte[]>(), It.IsAny<int?>())).Throws(new InvalidOperationException("boom"));
        var service = CreateService(new FakeRecognizer(Heard("x")), provider: "browser", fluencyAnalyzer: analyzer.Object);

        var result = await service.EvaluateAsync(new ShadowingAudioEvaluationInput
        {
            Audio = WebmBytes(), MimeType = "audio/webm", TargetText = Target, AudioGateStatus = "good",
            ClientTranscript = Target, ClientRecognitionStatus = "final", AnalysisWav = FluencyWav()
        });

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal(100, result.OverallScore);
        Assert.Equal("ANALYSIS_ERROR", result.Fluency!.ReasonCode);
    }

    private static byte[] LearnerWavFor(double speed, int pauseMs = 300) =>
        TestAudio.Wav(TestAudio.Utterance(speed, pauseMs));

    private static IReferenceVoiceProvider ProviderReturning(byte[]? wav)
    {
        var provider = new Mock<IReferenceVoiceProvider>();
        provider.Setup(p => p.GetAsync(It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(wav == null ? null : new ReferenceVoice { Wav = wav, SpeakerId = 3 });
        return provider.Object;
    }

    private static ShadowingEvaluationService ServiceWithReference(IReferenceVoiceProvider provider)
    {
        var s = new FluencyAnalyzer();
        return new ShadowingEvaluationService(
            new FakeRecognizer(Heard("x")),
            new KanaMoraComparer(new IKanaReader[] { new TestKanaReader() }),
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Shadowing:Recognition:Provider"] = "browser" }).Build(),
            new Mock<ILogger<ShadowingEvaluationService>>().Object,
            s, provider);
    }

    private static ShadowingAudioEvaluationInput InputWith(byte[] wav, string transcript, int? speaker = null) => new()
    {
        Audio = WebmBytes(), MimeType = "audio/webm", TargetText = Target, AudioGateStatus = "good",
        ClientTranscript = transcript, ClientRecognitionStatus = "final", AnalysisWav = wav, ReferenceSpeakerId = speaker
    };

    [Fact]
    public async Task FluencyComparison_SlowReading_YieldsEvidenceBasedObservation_AndLeavesScoresAlone()
    {
        var reference = TestAudio.Wav(TestAudio.Utterance(sr: 24000), 24000);
        var service = ServiceWithReference(ProviderReturning(reference));

        var slow = await service.EvaluateAsync(InputWith(LearnerWavFor(1.9), Target, speaker: 3));
        var same = await service.EvaluateAsync(InputWith(LearnerWavFor(1.0), Target, speaker: 3));

        Assert.Equal("available", slow.Fluency!.Comparison!.Status);
        Assert.Contains(slow.Fluency.Observations, o => o.Code == "slow_vs_reference");
        Assert.Equal(3, slow.Fluency.Reference!.SpeakerId);
        Assert.Equal("available", slow.Fluency.Reference.Metrics.Status);
        Assert.Empty(same.Fluency!.Observations);
        Assert.Null(slow.FluencyScore);
        Assert.Equal(same.OverallScore, slow.OverallScore); // nhịp nói không đổi điểm nội dung
    }

    private static ShadowingEvaluationService ServiceWithDurationConfig(IReferenceVoiceProvider provider, Dictionary<string, string?>? extra = null)
    {
        var settings = new Dictionary<string, string?>
        {
            ["Shadowing:Recognition:Provider"] = "browser",
            // Tín hiệu tổng hợp có thang khoảng cách khác giọng thật: nới lọc tin cậy để kiểm tra đường tích hợp.
            ["Shadowing:Duration:MaxAlignmentCost"] = "99",
            ["Shadowing:Duration:MaxTempoSpread"] = "99",
        };
        if (extra != null) foreach (var kv in extra) settings[kv.Key] = kv.Value;

        return new ShadowingEvaluationService(
            new FakeRecognizer(Heard("x")),
            new KanaMoraComparer(new IKanaReader[] { new TestKanaReader() }),
            new ConfigurationBuilder().AddInMemoryCollection(settings).Build(),
            new Mock<ILogger<ShadowingEvaluationService>>().Object,
            new FluencyAnalyzer(), provider);
    }

    private static IReferenceVoiceProvider SyntheticReference(bool withTimeline = true)
    {
        var provider = new Mock<IReferenceVoiceProvider>();
        provider.Setup(p => p.GetAsync(It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ReferenceVoice
            {
                Wav = TestAudio.Wav(MoraDurationTests.Render(_ => 1.0)),
                SpeakerId = 3,
                Timeline = withTimeline ? MoraDurationTests.Timeline() : null,
            });
        return provider.Object;
    }

    [Fact]
    public async Task MoraDuration_ShortenedLongVowel_AppearsAsExperimentalObservation_AndLeavesScoresAlone()
    {
        var service = ServiceWithDurationConfig(SyntheticReference());
        var shortened = await service.EvaluateAsync(InputWith(TestAudio.Wav(MoraDurationTests.Render(k => k == 2 ? 0 : 1.0)), Target));
        var same = await service.EvaluateAsync(InputWith(TestAudio.Wav(MoraDurationTests.Render(_ => 1.0)), Target));

        var obs = Assert.Single(shortened.Fluency!.Observations, o => o.Code == "chouon_short");
        Assert.Equal(true, obs.Data["experimental"]);
        Assert.Equal("available", shortened.Fluency.Duration!.Status);
        Assert.True(shortened.Fluency.Duration.Units.Single().Flagged);

        Assert.DoesNotContain(same.Fluency!.Observations, o => o.Code == "chouon_short");
        Assert.False(same.Fluency.Duration!.Units.Single().Flagged);

        Assert.Null(shortened.FluencyScore);
        Assert.Equal(same.OverallScore, shortened.OverallScore); // không đổi điểm nội dung
    }

    [Fact]
    public async Task MoraDuration_Disabled_ProducesNothing()
    {
        var service = ServiceWithDurationConfig(SyntheticReference(), new() { ["Shadowing:Duration:Enabled"] = "false" });
        var result = await service.EvaluateAsync(InputWith(TestAudio.Wav(MoraDurationTests.Render(k => k == 2 ? 0 : 1.0)), Target));

        Assert.Null(result.Fluency!.Duration);
        Assert.DoesNotContain(result.Fluency.Observations, o => o.Code == "chouon_short");
    }

    [Fact]
    public async Task MoraDuration_MissingTimeline_IsUnavailable_NotAFailure()
    {
        var service = ServiceWithDurationConfig(SyntheticReference(withTimeline: false));
        var result = await service.EvaluateAsync(InputWith(TestAudio.Wav(MoraDurationTests.Render(k => k == 2 ? 0 : 1.0)), Target));

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal("TIMELINE_UNAVAILABLE", result.Fluency!.Duration!.ReasonCode);
        Assert.DoesNotContain(result.Fluency.Observations, o => o.Code == "chouon_short");
    }

    [Fact]
    public async Task MoraDuration_NotAttempted_WhenContentMatchTooLow()
    {
        var service = ServiceWithDurationConfig(SyntheticReference());
        var result = await service.EvaluateAsync(InputWith(TestAudio.Wav(MoraDurationTests.Render(k => k == 2 ? 0 : 1.0)), "ぜんぜんちがうぶんです。"));

        Assert.Null(result.Fluency!.Duration);
        Assert.Empty(result.Fluency.Observations);
    }

    [Fact]
    public async Task MoraDuration_ObservationsStayWithinTheCap_WithChoukonFirst()
    {
        // Người học vừa rút ngắn trường âm vừa đọc rất chậm: nhận xét tổng không vượt 3 và trường âm đứng đầu.
        var service = ServiceWithDurationConfig(SyntheticReference());
        var result = await service.EvaluateAsync(InputWith(TestAudio.Wav(MoraDurationTests.Render(k => k == 2 ? 0 : 1.0, tempo: 2.2)), Target));

        Assert.True(result.Fluency!.Observations.Count <= 3);
        Assert.Equal("chouon_short", result.Fluency.Observations.First().Code);
    }

    [Fact]
    public async Task FluencyComparison_LowContentMatch_IsNotCompared_AndSkipsReferenceLookup()
    {
        var provider = new Mock<IReferenceVoiceProvider>(MockBehavior.Strict);
        var service = ServiceWithReference(provider.Object);

        var result = await service.EvaluateAsync(InputWith(LearnerWavFor(1.9), "ぜんぜんちがうぶんです。"));

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.True(result.ContentMatchScore < 70);
        Assert.Equal("unavailable", result.Fluency!.Comparison!.Status);
        Assert.Contains(result.Fluency.Comparison.ReasonCode, new[] { "CONTENT_BELOW_THRESHOLD", "TRANSCRIPT_MORA_MISMATCH" });
        Assert.Empty(result.Fluency.Observations);
        Assert.Null(result.Fluency.SpeakingRateMoraPerSec); // không tính mora/giây khi người học không đọc đúng câu mẫu
        provider.Verify(p => p.GetAsync(It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task FluencyComparison_MissingReference_ReportsUnavailable_NotAFailure()
    {
        var service = ServiceWithReference(ProviderReturning(null));

        var result = await service.EvaluateAsync(InputWith(LearnerWavFor(1.9), Target));

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal(100, result.OverallScore);
        Assert.Equal("REFERENCE_UNAVAILABLE", result.Fluency!.Comparison!.ReasonCode);
        Assert.Null(result.Fluency.Reference);
        Assert.Empty(result.Fluency.Observations);
    }

    [Fact]
    public async Task FluencyComparison_CorruptReferenceAudio_IsUnavailable()
    {
        var service = ServiceWithReference(ProviderReturning(new byte[300]));
        var result = await service.EvaluateAsync(InputWith(LearnerWavFor(1.9), Target));
        Assert.Equal("REFERENCE_UNAVAILABLE", result.Fluency!.Comparison!.ReasonCode);
    }

    [Fact]
    public async Task FluencyComparison_PassesLearnersVoiceChoiceToTheProvider()
    {
        var provider = new Mock<IReferenceVoiceProvider>();
        provider.Setup(p => p.GetAsync(It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ReferenceVoice?)null);
        await ServiceWithReference(provider.Object).EvaluateAsync(InputWith(LearnerWavFor(1.0), Target, speaker: 8));

        provider.Verify(p => p.GetAsync(Target, 8, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Fluency_NotAttached_WhenNothingWasScored()
    {
        var service = CreateService(new FakeRecognizer(Heard("x")), provider: "browser", fluencyAnalyzer: new FluencyAnalyzer());

        var result = await service.EvaluateAsync(new ShadowingAudioEvaluationInput
        {
            Audio = WebmBytes(), MimeType = "audio/webm", TargetText = Target, AudioGateStatus = "good",
            ClientRecognitionStatus = "empty", AnalysisWav = FluencyWav()
        });

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Null(result.Fluency);
    }

    // Chế độ trình duyệt (mặc định): không gọi Gemini, chỉ chấm theo transcript Web Speech đã chốt
    [Fact]
    public async Task BrowserMode_ScoresClientFinalTranscript_WithoutCallingGemini()
    {
        var recognizer = new FakeRecognizer(Heard("không dùng"));
        var result = await CreateService(recognizer, provider: "browser")
            .EvaluateAsync(Input(clientTranscript: Target, clientStatus: "final"));

        Assert.Equal(0, recognizer.Calls);
        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal("web_speech", result.RecognitionSource);
        Assert.Null(result.FallbackReason);
        Assert.Equal(100, result.ContentMatchScore);
    }

    [Fact]
    public async Task BrowserMode_DoesNotRequireAudioBytes()
    {
        var recognizer = new FakeRecognizer(Heard("không dùng"));
        var result = await CreateService(recognizer, provider: "browser").EvaluateAsync(
            Input(clientTranscript: Target, clientStatus: "final", audio: new byte[10], mime: "audio/unknown"));

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal(100, result.ContentMatchScore);
    }

    [Theory]
    [InlineData("empty", "NO_SPEECH_DETECTED")]
    [InlineData("unsupported", "BROWSER_STT_UNSUPPORTED")]
    [InlineData("error", "BROWSER_STT_ERROR")]
    [InlineData(null, "NO_SPEECH_DETECTED")]
    public async Task BrowserMode_WithoutFinalTranscript_IsUnavailableNotZero(string? clientStatus, string expectedCode)
    {
        var result = await CreateService(new FakeRecognizer(Heard("x")), provider: "browser")
            .EvaluateAsync(Input(clientStatus: clientStatus));

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal(expectedCode, result.ErrorCode);
        Assert.Null(result.ContentMatchScore);
        Assert.Null(result.OverallScore);
    }

    [Fact]
    public async Task BrowserMode_NeedsRetryGate_StillBlocksScoring()
    {
        var result = await CreateService(new FakeRecognizer(Heard("x")), provider: "browser")
            .EvaluateAsync(Input(clientTranscript: Target, clientStatus: "final", gate: "needs_retry"));

        Assert.Equal("AUDIO_QUALITY_INSUFFICIENT", result.ErrorCode);
        Assert.Null(result.OverallScore);
    }

    private static ShadowingAudioEvaluationInput Input(
        string? clientTranscript = null,
        string? clientStatus = null,
        string? gate = "good",
        byte[]? audio = null,
        string mime = "audio/webm;codecs=opus",
        string? target = null) => new()
    {
        Audio = audio ?? WebmBytes(),
        MimeType = mime,
        TargetText = target ?? Target,
        ClientTranscript = clientTranscript,
        ClientRecognitionStatus = clientStatus,
        AudioGateStatus = gate
    };

    // 1. Transcript đúng
    [Fact]
    public async Task CorrectTranscript_ScoresFullContentMatch_AndLeavesUnmeasuredDimensionsNull()
    {
        var recognizer = new FakeRecognizer(Heard(Target));
        var result = await CreateService(recognizer).EvaluateAsync(Input());

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal("recognized", result.RecognitionStatus);
        Assert.Equal("gemini", result.RecognitionSource);
        Assert.Null(result.FallbackReason);
        Assert.Equal(100, result.ContentMatchScore);
        Assert.Equal(100, result.OverallScore);
        Assert.Equal("green", result.Tier);
        Assert.Null(result.FluencyScore);       // không còn gán cứng 88
        Assert.Null(result.PronunciationScore); // không bịa điểm phát âm
        Assert.Contains("fluency", result.UnavailableDimensions);
        Assert.Contains("pronunciation", result.UnavailableDimensions);
        Assert.Equal(ShadowingScoring.Version, result.ScoringVersion);
        Assert.All(result.DiffTokens, t => Assert.Equal("correct", t.Status));
    }

    // 2. Transcript sai một phần: điểm và danh sách lỗi đến từ so khớp ở backend, không từ AI
    [Fact]
    public async Task PartiallyIncorrectTranscript_ScoresBetween0And100_AndDerivesErrorListsFromDiff()
    {
        var recognizer = new FakeRecognizer(Heard("ひとりです。テーブル席でおねがいします。"));
        var result = await CreateService(recognizer).EvaluateAsync(Input());

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.InRange(result.ContentMatchScore!.Value, 1, 99);
        Assert.Equal(result.ContentMatchScore, result.OverallScore); // Overall = Content khi chưa đo Fluency
        Assert.Equal("kana-word-v1", result.ComparisonMethod);
        Assert.Equal("test", result.ReadingSource);
        // Danh sách lỗi và diff do backend tính từ so khớp mora, không lấy từ nhà cung cấp AI
        Assert.Contains(result.DiffTokens, t => t.Status != "correct");
        Assert.NotEmpty(result.MismatchedWords);
        Assert.Contains("かうんたー", result.TargetReading);
    }

    // 3. Sai hoàn toàn: điểm 0 hợp lệ, KHÔNG được chuyển sang nguồn khác
    [Fact]
    public async Task CompletelyIncorrectTranscript_IsALegitimateZero_AndDoesNotTriggerFallback()
    {
        var recognizer = new FakeRecognizer(Heard("おはよう"));
        // Transcript Web Speech khớp 100% câu mẫu: nếu bị dùng thay thế thì điểm sẽ là 100.
        var result = await CreateService(recognizer).EvaluateAsync(
            Input(clientTranscript: "すみません。", clientStatus: "final", target: "すみません。"));

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal("gemini", result.RecognitionSource);
        Assert.Equal(0, result.ContentMatchScore);
        Assert.Equal(0, result.OverallScore);
        Assert.Equal("red", result.Tier);
        Assert.Equal("おはよう", result.RecognizedText);
        Assert.Equal(1, recognizer.Calls);
    }

    // Cách đọc không dùng được (engine VOICEVOX tắt): KHÔNG chấm, KHÔNG phải điểm thấp
    [Fact]
    public async Task ReadingSourceDown_IsNotScored_AndKeepsWhatWasHeard()
    {
        var recognizer = new FakeRecognizer(Heard(Target));
        var result = await CreateService(recognizer, new UnavailableKanaReader()).EvaluateAsync(Input());

        Assert.Equal("failed", result.EvaluationStatus);
        Assert.Equal("READING_UNAVAILABLE", result.ErrorCode);
        Assert.Null(result.ContentMatchScore);
        Assert.Null(result.OverallScore);
        Assert.Equal(string.Empty, result.Tier);
        Assert.Equal(Target, result.RecognizedText); // vẫn cho người học thấy hệ thống nghe được gì
        Assert.Equal("recognized", result.RecognitionStatus);
        Assert.Equal("gemini", result.RecognitionSource);
        Assert.Empty(result.DiffTokens);
    }

    [Fact]
    public async Task ReadingSourceDown_AlsoAppliesToTheWebSpeechFallback()
    {
        var recognizer = new FakeRecognizer(Failure(SpeechRecognitionOutcome.Timeout, "AI_TIMEOUT"));
        var result = await CreateService(recognizer, new UnavailableKanaReader())
            .EvaluateAsync(Input(clientTranscript: Target, clientStatus: "final"));

        Assert.Equal("failed", result.EvaluationStatus);
        Assert.Equal("READING_UNAVAILABLE", result.ErrorCode);
        Assert.Equal("web_speech", result.RecognitionSource);
        Assert.Null(result.OverallScore);
    }

    [Fact]
    public async Task UnreadableKanjiInTarget_IsNotScored()
    {
        var recognizer = new FakeRecognizer(Heard("とうきょうへいきました"));
        var result = await CreateService(recognizer).EvaluateAsync(Input(target: "東京へ行きました。"));

        Assert.Equal("failed", result.EvaluationStatus);
        Assert.Equal("READING_UNAVAILABLE", result.ErrorCode);
        Assert.Null(result.ContentMatchScore);
    }

    // Độ trễ: có dự phòng thì chờ Gemini ngắn hơn; không có dự phòng thì chờ theo cấu hình mặc định
    [Fact]
    public async Task WithAFinalWebSpeechTranscript_GeminiIsGivenAShorterTimeout()
    {
        var recognizer = new FakeRecognizer(Heard(Target));
        await CreateService(recognizer).EvaluateAsync(Input(clientTranscript: Target, clientStatus: "final"));

        Assert.Equal(TimeSpan.FromSeconds(8), recognizer.LastTimeout);
    }

    [Fact]
    public async Task WithoutAFallback_GeminiKeepsTheDefaultTimeout()
    {
        var recognizer = new FakeRecognizer(Heard(Target));
        await CreateService(recognizer).EvaluateAsync(Input());
        await CreateService(recognizer).EvaluateAsync(Input(clientTranscript: Target, clientStatus: "empty"));

        Assert.Null(recognizer.LastTimeout);
    }

    // 4. Thiếu transcript: không có điểm 0, không thay bằng câu mẫu
    [Fact]
    public async Task NoSpeechDetected_IsUnavailable_NotZero_AndNeverEchoesTarget()
    {
        var recognizer = new FakeRecognizer(Failure(SpeechRecognitionOutcome.NoSpeech, "NO_SPEECH_DETECTED"));
        // Dù client có transcript, Gemini báo không có tiếng nói thì không đổi nguồn.
        var result = await CreateService(recognizer).EvaluateAsync(Input(clientTranscript: Target, clientStatus: "final"));

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal("no_speech", result.RecognitionStatus);
        Assert.Null(result.ContentMatchScore);
        Assert.Null(result.OverallScore);
        Assert.Equal(string.Empty, result.Tier);
        Assert.Equal(string.Empty, result.RecognizedText);
        Assert.NotEqual(Target, result.RecognizedText);
        Assert.Equal(1, recognizer.Calls);
    }

    // 5. Gemini timeout: dùng đúng chính sách dự phòng và ghi lại nguồn + lý do
    [Fact]
    public async Task GeminiTimeout_WithFinalClientTranscript_UsesWebSpeechAndRecordsWhy()
    {
        var recognizer = new FakeRecognizer(Failure(SpeechRecognitionOutcome.Timeout, "AI_TIMEOUT"));
        var result = await CreateService(recognizer).EvaluateAsync(Input(clientTranscript: Target, clientStatus: "final"));

        Assert.Equal("partial", result.EvaluationStatus);
        Assert.Equal("web_speech", result.RecognitionSource);
        Assert.Equal("web_speech", result.Source);
        Assert.Equal("AI_TIMEOUT", result.FallbackReason);
        Assert.Equal(100, result.ContentMatchScore);
        Assert.Equal(1, recognizer.Calls); // không gọi lặp
    }

    [Fact]
    public async Task GeminiTimeout_WithoutClientTranscript_Fails_InsteadOfScoringZero()
    {
        var recognizer = new FakeRecognizer(Failure(SpeechRecognitionOutcome.Timeout, "AI_TIMEOUT"));
        var result = await CreateService(recognizer).EvaluateAsync(Input());

        Assert.Equal("failed", result.EvaluationStatus);
        Assert.Equal("AI_TIMEOUT", result.ErrorCode);
        Assert.Null(result.ContentMatchScore);
        Assert.Null(result.OverallScore);
        Assert.Equal(string.Empty, result.RecognizedText);
    }

    // 6. Quota / lỗi nhà cung cấp
    [Theory]
    [InlineData(SpeechRecognitionOutcome.QuotaExceeded, "AI_QUOTA_EXCEEDED")]
    [InlineData(SpeechRecognitionOutcome.ProviderError, "AI_HTTP_500")]
    [InlineData(SpeechRecognitionOutcome.NotConfigured, "AI_KEY_NOT_CONFIGURED")]
    public async Task ProviderFailures_FallBackWithRecordedReason_OrFailWithoutScore(SpeechRecognitionOutcome outcome, string code)
    {
        var withFallback = await CreateService(new FakeRecognizer(Failure(outcome, code)))
            .EvaluateAsync(Input(clientTranscript: Target, clientStatus: "final"));
        Assert.Equal("partial", withFallback.EvaluationStatus);
        Assert.Equal(code, withFallback.FallbackReason);

        var withoutFallback = await CreateService(new FakeRecognizer(Failure(outcome, code))).EvaluateAsync(Input());
        Assert.Equal("failed", withoutFallback.EvaluationStatus);
        Assert.Equal(code, withoutFallback.ErrorCode);
        Assert.Null(withoutFallback.OverallScore);
    }

    // 7. Phản hồi hỏng được coi là lỗi kỹ thuật (chi tiết parse ở GeminiSpeechRecognizerTests)
    [Fact]
    public async Task MalformedProviderResponse_IsTechnicalFailure_NotScoreZero()
    {
        var recognizer = new FakeRecognizer(Failure(SpeechRecognitionOutcome.MalformedResponse, "AI_MALFORMED_RESPONSE"));
        var result = await CreateService(recognizer).EvaluateAsync(Input());

        Assert.Equal("failed", result.EvaluationStatus);
        Assert.Null(result.ContentMatchScore);
    }

    // Interim / transcript chưa chốt không bao giờ được chấm
    [Theory]
    [InlineData("interim")]
    [InlineData("empty")]
    [InlineData("unsupported")]
    [InlineData("error")]
    [InlineData(null)]
    public async Task NonFinalClientTranscript_IsNeverScored(string? status)
    {
        var recognizer = new FakeRecognizer(Failure(SpeechRecognitionOutcome.Timeout, "AI_TIMEOUT"));
        var result = await CreateService(recognizer).EvaluateAsync(Input(clientTranscript: Target, clientStatus: status));

        Assert.Equal("failed", result.EvaluationStatus);
        Assert.Null(result.ContentMatchScore);
    }

    [Fact]
    public async Task FinalClientTranscriptContainingOnlyPunctuation_IsNotUsable()
    {
        var recognizer = new FakeRecognizer(Failure(SpeechRecognitionOutcome.Timeout, "AI_TIMEOUT"));
        var result = await CreateService(recognizer).EvaluateAsync(Input(clientTranscript: " 。、 ", clientStatus: "final"));

        Assert.Equal("failed", result.EvaluationStatus);
    }

    // 10. MIME không khớp nội dung / không hỗ trợ
    [Fact]
    public async Task DeclaredMimeThatDoesNotMatchContent_IsRejected_WithoutCallingProvider()
    {
        var recognizer = new FakeRecognizer(Heard(Target));
        var result = await CreateService(recognizer).EvaluateAsync(Input(audio: WavBytes(), mime: "audio/webm"));

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal("AUDIO_FORMAT_MISMATCH", result.ErrorCode);
        Assert.Null(result.OverallScore);
        Assert.Equal(0, recognizer.Calls);
    }

    [Fact]
    public async Task UnsupportedMime_IsRejected_WithoutCallingProvider()
    {
        var recognizer = new FakeRecognizer(Heard(Target));
        var result = await CreateService(recognizer).EvaluateAsync(Input(mime: "audio/amr"));

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal("UNSUPPORTED_AUDIO_TYPE", result.ErrorCode);
        Assert.Equal(0, recognizer.Calls);
    }

    [Fact]
    public async Task MimeWithCodecParameters_MatchingContent_IsAccepted()
    {
        var recognizer = new FakeRecognizer(Heard(Target));
        var result = await CreateService(recognizer).EvaluateAsync(Input(audio: WavBytes(), mime: "audio/wav"));

        Assert.Equal("completed", result.EvaluationStatus);
    }

    [Fact]
    public async Task TooShortAudio_IsUnavailable()
    {
        var recognizer = new FakeRecognizer(Heard(Target));
        var result = await CreateService(recognizer).EvaluateAsync(Input(audio: WebmBytes(200)));

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal("AUDIO_TOO_SHORT", result.ErrorCode);
        Assert.Equal(0, recognizer.Calls);
    }

    // 11. Âm thanh không đạt không được gán "good" bịa; có transcript không chứng minh âm thanh đủ tốt
    [Fact]
    public async Task NeedsRetryAudio_IsNotScored_EvenThoughClientHasTranscript_AndIsNeverReportedGood()
    {
        var recognizer = new FakeRecognizer(Heard(Target));
        var result = await CreateService(recognizer).EvaluateAsync(
            Input(clientTranscript: Target, clientStatus: "final", gate: "needs_retry"));

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal("AUDIO_QUALITY_INSUFFICIENT", result.ErrorCode);
        Assert.Equal("needs_retry", result.AudioQualityStatus);
        Assert.Null(result.OverallScore);
        Assert.Equal(0, recognizer.Calls);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("excellent")]
    public async Task MissingOrUnknownGate_IsReportedAsUnmeasured_NotGood(string? gate)
    {
        var recognizer = new FakeRecognizer(Heard(Target));
        var result = await CreateService(recognizer).EvaluateAsync(Input(gate: gate));

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal("unmeasured", result.AudioQualityStatus);
    }

    // 13. Điểm và diff cùng dựa trên đúng một cặp (target, recognized)
    [Fact]
    public async Task ScoreAndDiff_AreBothDerivedFromTheSameTargetAndRecognizedText()
    {
        const string spoken = "ひとりです。テーブル席でおねがいします。";
        var result = await CreateService(new FakeRecognizer(Heard(spoken))).EvaluateAsync(Input());

        var recomputed = await new KanaMoraComparer(new IKanaReader[] { new TestKanaReader() })
            .CompareAsync(Target, result.RecognizedText);

        Assert.Equal(Target, result.TargetText);
        Assert.Equal(spoken, result.RecognizedText);
        Assert.Equal(recomputed.ContentMatchScore, result.ContentMatchScore);
        Assert.Equal(
            recomputed.Tokens.Select(t => (t.Text, t.Status)),
            result.DiffTokens.Select(t => (t.Text, t.Status)));
    }

    // Nhất quán: cùng transcript cuối cùng + cùng phiên bản chấm → cùng điểm, bất kể nguồn
    [Fact]
    public async Task SameFinalTranscript_YieldsSameScore_RegardlessOfRecognitionSource()
    {
        const string transcript = "ひとりです。テーブル席でおねがいします。";

        var viaGemini = await CreateService(new FakeRecognizer(Heard(transcript))).EvaluateAsync(Input());
        var viaFallback = await CreateService(new FakeRecognizer(Failure(SpeechRecognitionOutcome.Timeout, "AI_TIMEOUT")))
            .EvaluateAsync(Input(clientTranscript: transcript, clientStatus: "final"));

        Assert.Equal("gemini", viaGemini.RecognitionSource);
        Assert.Equal("web_speech", viaFallback.RecognitionSource);
        Assert.Equal(viaGemini.ContentMatchScore, viaFallback.ContentMatchScore);
        Assert.Equal(viaGemini.OverallScore, viaFallback.OverallScore);
        Assert.Equal(viaGemini.ScoringVersion, viaFallback.ScoringVersion);
    }

    [Fact]
    public async Task MissingTargetText_IsUnavailable()
    {
        var recognizer = new FakeRecognizer(Heard(Target));
        var input = Input();
        var result = await CreateService(recognizer).EvaluateAsync(new ShadowingAudioEvaluationInput
        {
            Audio = input.Audio,
            MimeType = input.MimeType,
            TargetText = "  "
        });

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal(0, recognizer.Calls);
    }
}
