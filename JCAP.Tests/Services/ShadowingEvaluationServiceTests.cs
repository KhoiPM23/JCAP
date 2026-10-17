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

    private static byte[] WebmBytes(int length = 2048)
    {
        var data = new byte[length];
        data[0] = 0x1A; data[1] = 0x45; data[2] = 0xDF; data[3] = 0xA3;
        return data;
    }

    private static ShadowingEvaluationService CreateService(IKanaReader? reader = null, IFluencyAnalyzer? fluencyAnalyzer = null) =>
        new(new KanaMoraComparer(new IKanaReader[] { reader ?? new TestKanaReader() }),
            new ConfigurationBuilder().Build(),
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
        var service = CreateService(fluencyAnalyzer: new FluencyAnalyzer());

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
        var service = CreateService(fluencyAnalyzer: new FluencyAnalyzer());

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
        var service = CreateService(fluencyAnalyzer: analyzer.Object);

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
            new KanaMoraComparer(new IKanaReader[] { new TestKanaReader() }),
            new ConfigurationBuilder().Build(),
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
            // Tín hiệu tổng hợp có thang khoảng cách khác giọng thật: nới lọc tin cậy để kiểm tra đường tích hợp.
            ["Shadowing:Duration:MaxAlignmentCost"] = "99",
            ["Shadowing:Duration:MaxTempoSpread"] = "99",
        };
        if (extra != null) foreach (var kv in extra) settings[kv.Key] = kv.Value;

        return new ShadowingEvaluationService(
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
        var service = CreateService(fluencyAnalyzer: new FluencyAnalyzer());

        var result = await service.EvaluateAsync(new ShadowingAudioEvaluationInput
        {
            Audio = WebmBytes(), MimeType = "audio/webm", TargetText = Target, AudioGateStatus = "good",
            ClientRecognitionStatus = "empty", AnalysisWav = FluencyWav()
        });

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Null(result.Fluency);
    }

    // Nhận dạng chạy trên trình duyệt: backend chỉ chấm theo transcript Web Speech ĐÃ CHỐT do client gửi
    [Fact]
    public async Task FinalBrowserTranscript_IsScored()
    {
        var result = await CreateService().EvaluateAsync(Input(clientTranscript: Target, clientStatus: "final"));

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal("web_speech", result.RecognitionSource);
        Assert.Equal("web_speech", result.Source);
        Assert.Null(result.FallbackReason);
        Assert.Equal(100, result.ContentMatchScore);
    }

    [Fact]
    public async Task AudioBytes_AreNotNeeded_ForScoring()
    {
        var result = await CreateService().EvaluateAsync(
            Input(clientTranscript: Target, clientStatus: "final", audio: new byte[10], mime: "audio/unknown"));

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal(100, result.ContentMatchScore);
    }

    // Không có transcript đã chốt: "chưa chấm được", không bao giờ là điểm 0 và không thay bằng câu mẫu
    [Theory]
    [InlineData("empty", "NO_SPEECH_DETECTED")]
    [InlineData("interim", "NO_SPEECH_DETECTED")]
    [InlineData("unsupported", "BROWSER_STT_UNSUPPORTED")]
    [InlineData("error", "BROWSER_STT_ERROR")]
    [InlineData(null, "NO_SPEECH_DETECTED")]
    public async Task WithoutFinalTranscript_IsUnavailableNotZero(string? clientStatus, string expectedCode)
    {
        var result = await CreateService().EvaluateAsync(Input(clientTranscript: Target, clientStatus: clientStatus));

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal(expectedCode, result.ErrorCode);
        Assert.Null(result.ContentMatchScore);
        Assert.Null(result.OverallScore);
        Assert.Equal(string.Empty, result.Tier);
        Assert.Equal(string.Empty, result.RecognizedText);
    }

    [Fact]
    public async Task FinalTranscriptContainingOnlyPunctuation_IsNotUsable()
    {
        var result = await CreateService().EvaluateAsync(Input(clientTranscript: " 。、 ", clientStatus: "final"));

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal("NO_SPEECH_DETECTED", result.ErrorCode);
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

    private static ShadowingAudioEvaluationInput Spoken(string transcript, string? target = null, string? gate = "good") =>
        Input(clientTranscript: transcript, clientStatus: "final", target: target, gate: gate);

    // 1. Transcript đúng
    [Fact]
    public async Task CorrectTranscript_ScoresFullContentMatch_AndLeavesUnmeasuredDimensionsNull()
    {
        var result = await CreateService().EvaluateAsync(Spoken(Target));

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal("recognized", result.RecognitionStatus);
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

    // 2. Transcript sai một phần: điểm và danh sách lỗi đến từ so khớp ở backend
    [Fact]
    public async Task PartiallyIncorrectTranscript_ScoresBetween0And100_AndDerivesErrorListsFromDiff()
    {
        var result = await CreateService().EvaluateAsync(Spoken("ひとりです。テーブル席でおねがいします。"));

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.InRange(result.ContentMatchScore!.Value, 1, 99);
        Assert.Equal(result.ContentMatchScore, result.OverallScore); // Overall = Content khi chưa đo Fluency
        Assert.Equal("kana-word-v1", result.ComparisonMethod);
        Assert.Equal("test", result.ReadingSource);
        Assert.Contains(result.DiffTokens, t => t.Status != "correct");
        Assert.NotEmpty(result.MismatchedWords);
        Assert.Contains("かうんたー", result.TargetReading);
    }

    // 3. Sai hoàn toàn: điểm 0 hợp lệ
    [Fact]
    public async Task CompletelyIncorrectTranscript_IsALegitimateZero()
    {
        var result = await CreateService().EvaluateAsync(Spoken("おはよう", target: "すみません。"));

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal(0, result.ContentMatchScore);
        Assert.Equal(0, result.OverallScore);
        Assert.Equal("red", result.Tier);
        Assert.Equal("おはよう", result.RecognizedText);
    }

    // Cách đọc không dùng được (engine VOICEVOX tắt): KHÔNG chấm, KHÔNG phải điểm thấp
    [Fact]
    public async Task ReadingSourceDown_IsNotScored_AndKeepsWhatWasHeard()
    {
        var result = await CreateService(new UnavailableKanaReader()).EvaluateAsync(Spoken(Target));

        Assert.Equal("failed", result.EvaluationStatus);
        Assert.Equal("READING_UNAVAILABLE", result.ErrorCode);
        Assert.Null(result.ContentMatchScore);
        Assert.Null(result.OverallScore);
        Assert.Equal(string.Empty, result.Tier);
        Assert.Equal(Target, result.RecognizedText); // vẫn cho người học thấy hệ thống nghe được gì
        Assert.Equal("recognized", result.RecognitionStatus);
        Assert.Equal("web_speech", result.RecognitionSource);
        Assert.Empty(result.DiffTokens);
    }

    [Fact]
    public async Task UnreadableKanjiInTarget_IsNotScored()
    {
        var result = await CreateService().EvaluateAsync(Spoken("とうきょうへいきました", target: "東京へ行きました。"));

        Assert.Equal("failed", result.EvaluationStatus);
        Assert.Equal("READING_UNAVAILABLE", result.ErrorCode);
        Assert.Null(result.ContentMatchScore);
    }

    // Âm thanh không đạt không được gán "good" bịa; có transcript không chứng minh âm thanh đủ tốt
    [Fact]
    public async Task NeedsRetryAudio_IsNotScored_EvenThoughClientHasTranscript_AndIsNeverReportedGood()
    {
        var result = await CreateService().EvaluateAsync(Spoken(Target, gate: "needs_retry"));

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal("AUDIO_QUALITY_INSUFFICIENT", result.ErrorCode);
        Assert.Equal("needs_retry", result.AudioQualityStatus);
        Assert.Null(result.OverallScore);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("excellent")]
    public async Task MissingOrUnknownGate_IsReportedAsUnmeasured_NotGood(string? gate)
    {
        var result = await CreateService().EvaluateAsync(Spoken(Target, gate: gate));

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal("unmeasured", result.AudioQualityStatus);
    }

    // Điểm và diff cùng dựa trên đúng một cặp (target, recognized)
    [Fact]
    public async Task ScoreAndDiff_AreBothDerivedFromTheSameTargetAndRecognizedText()
    {
        const string spoken = "ひとりです。テーブル席でおねがいします。";
        var result = await CreateService().EvaluateAsync(Spoken(spoken));

        var recomputed = await new KanaMoraComparer(new IKanaReader[] { new TestKanaReader() })
            .CompareAsync(Target, result.RecognizedText);

        Assert.Equal(Target, result.TargetText);
        Assert.Equal(spoken, result.RecognizedText);
        Assert.Equal(recomputed.ContentMatchScore, result.ContentMatchScore);
        Assert.Equal(
            recomputed.Tokens.Select(t => (t.Text, t.Status)),
            result.DiffTokens.Select(t => (t.Text, t.Status)));
    }

    // Nhất quán: cùng transcript + cùng phiên bản chấm → cùng điểm
    [Fact]
    public async Task SameTranscript_YieldsSameScore()
    {
        const string transcript = "ひとりです。テーブル席でおねがいします。";
        var first = await CreateService().EvaluateAsync(Spoken(transcript));
        var second = await CreateService().EvaluateAsync(Spoken(transcript));

        Assert.Equal(first.ContentMatchScore, second.ContentMatchScore);
        Assert.Equal(first.OverallScore, second.OverallScore);
        Assert.Equal(first.ScoringVersion, second.ScoringVersion);
    }

    [Fact]
    public async Task MissingTargetText_IsUnavailable()
    {
        var result = await CreateService().EvaluateAsync(new ShadowingAudioEvaluationInput
        {
            TargetText = "  ",
            ClientTranscript = Target,
            ClientRecognitionStatus = "final",
        });

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal("MISSING_TARGET_TEXT", result.ErrorCode);
    }
}
