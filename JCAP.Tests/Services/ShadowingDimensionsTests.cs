using JCAP.DTOs.Shadowing;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;

namespace JCAP.Tests.Services;

/// <summary>
/// Chấm theo chiều (Shadowing V2 M4): Nội dung từ ASR (mặc định Faster-Whisper), Phát âm UNAVAILABLE và không bao giờ suy ra từ
/// nội dung, Lưu loát chỉ là số đo, Ngữ điệu chưa có; ASR lỗi không tự chuyển nguồn khác.
/// </summary>
public class ShadowingDimensionsTests
{
    private const string Target = "学校に行きます";

    private sealed class FakeAsr : ISpeechRecognitionService
    {
        private readonly Func<SpeechRecognitionResult> _result;
        public int Calls;
        public FakeAsr(Func<SpeechRecognitionResult> result) => _result = result;
        public string Provider => "faster-whisper";
        public Task<SpeechRecognitionResult> RecognizeAsync(SpeechRecognitionRequest request, CancellationToken cancellationToken = default)
        {
            Calls++;
            return Task.FromResult(_result());
        }
        public Task<SpeechRecognitionHealth> CheckHealthAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new SpeechRecognitionHealth { Available = true, Provider = Provider });
    }

    /// <summary>Mô hình âm vị giả: đếm số lần gọi (đường ASR không được dùng nó để chấm).</summary>
    private sealed class CountingPhoneme : IPhonemeRecognizer
    {
        public int Calls;
        public bool IsAvailable => true;
        public PhonemeRecognitionResult? Recognize(float[] samples16k)
        {
            Calls++;
            return new PhonemeRecognitionResult { Kana = "がっこうにいきます" };
        }
    }

    private static SpeechRecognitionResult Heard(string text, string? reading = null, double compression = 1.0) => new()
    {
        Status = "completed",
        Provider = "faster-whisper",
        Model = "small",
        Text = text,
        Reading = reading,
        Segments = new List<SpeechRecognitionSegment> { new() { Start = 0, End = 1.5, Text = text, CompressionRatio = compression } },
    };

    private static ShadowingEvaluationService Service(ISpeechRecognitionService? asr, IPhonemeRecognizer? phoneme = null,
        Dictionary<string, string?>? config = null, IFluencyAnalyzer? fluency = null) =>
        new(new KanaMoraComparer(new IKanaReader[] { new TestKanaReader() }),
            new ConfigurationBuilder().AddInMemoryCollection(config ?? new()).Build(),
            new Mock<ILogger<ShadowingEvaluationService>>().Object,
            fluency, null, phoneme, null, asr);

    private static ShadowingAudioEvaluationInput Input() => new()
    {
        Audio = Array.Empty<byte>(),
        TargetText = Target,
        AudioGateStatus = "good",
        ClientTranscript = "ぜんぜんちがう", // trình duyệt: không bao giờ được chấm
        ClientRecognitionStatus = "final",
        AnalysisWav = TestAudio.Wav(TestAudio.Utterance()),
    };

    [Fact]
    public async Task ContentComesFromAsr_PronunciationIsUnavailable_AndOverallIsLabelledContentOnly()
    {
        var phoneme = new CountingPhoneme();
        var r = await Service(new FakeAsr(() => Heard("学校に行きます")), phoneme).EvaluateAsync(Input());

        Assert.Equal("completed", r.EvaluationStatus);
        Assert.Equal("faster-whisper", r.RecognitionSource);
        Assert.Equal("faster-whisper:small", r.AsrModel);
        Assert.Equal("学校に行きます", r.RecognizedText);
        Assert.Equal(100, r.ContentMatchScore);

        Assert.Equal("COMPLETED", r.Dimensions.Content.Status);
        Assert.Equal(100, r.Dimensions.Content.Score);
        Assert.Equal("faster-whisper:small", r.Dimensions.Content.Source);
        Assert.Equal("UNAVAILABLE", r.Dimensions.Pronunciation.Status);
        Assert.Equal("INSUFFICIENT_ACOUSTIC_EVIDENCE", r.Dimensions.Pronunciation.Reason);
        Assert.Null(r.Dimensions.Pronunciation.Score);
        Assert.Null(r.PronunciationScore); // không suy ra từ điểm nội dung
        Assert.Equal("UNAVAILABLE", r.Dimensions.Prosody.Status);
        Assert.Equal("NOT_IMPLEMENTED", r.Dimensions.Prosody.Reason);

        Assert.Equal(100, r.OverallScore);
        Assert.Equal("content", r.OverallScoreBasis);
        Assert.Equal(ShadowingScoring.Version, r.ScoringVersion);
        Assert.Equal(0, phoneme.Calls); // đường ASR không dùng mô hình âm vị để chấm
        Assert.True(r.ProcessingMs >= 0);
    }

    [Fact]
    public async Task AsrMisheardWord_IsAContentError_WithTheMissingWordShown()
    {
        // Câu có ranh giới từ trong nguồn cách đọc của test: người học bỏ mất cụm "おねがい"
        const string target = "一人です。カウンター席でお願いします。";
        var input = new ShadowingAudioEvaluationInput { TargetText = target, AnalysisWav = TestAudio.Wav(TestAudio.Utterance()) };
        var r = await Service(new FakeAsr(() => Heard("ひとりです。かうんたーせきでします。"))).EvaluateAsync(input);

        Assert.Equal("completed", r.EvaluationStatus);
        Assert.InRange(r.ContentMatchScore!.Value, 1, 99);
        Assert.Contains(r.DiffTokens, t => t.Status == "missing");
    }

    [Fact]
    public async Task ReadingFromTheAsrService_IsUsed_SoScoringDoesNotNeedAnotherReadingSource()
    {
        var comparer = new KanaMoraComparer(new IKanaReader[] { new TestKanaReader() });
        var r = await Service(new FakeAsr(() => Heard("がっこうにいきます", reading: "ガッコーニイキマス"))).EvaluateAsync(Input());

        Assert.Equal(100, r.ContentMatchScore);
        Assert.Equal("がっこうにいきます", r.RecognizedText);
    }

    [Theory]
    [InlineData("ASR_UNAVAILABLE", "unavailable")]
    [InlineData("ASR_TIMEOUT", "unavailable")]
    [InlineData("ASR_BUSY", "unavailable")]
    [InlineData("ASR_ERROR", "failed")]
    public async Task AsrNotWorking_ContentUnavailable_NoFallbackToAnotherSource(string code, string status)
    {
        var phoneme = new CountingPhoneme();
        var r = await Service(new FakeAsr(() => SpeechRecognitionResult.Unavailable("faster-whisper", code)), phoneme).EvaluateAsync(Input());

        Assert.Equal(status, r.EvaluationStatus);
        Assert.Equal(code, r.ErrorCode);
        Assert.Null(r.ContentMatchScore);
        Assert.Null(r.OverallScore); // KHÔNG phải 0
        Assert.Null(r.OverallScoreBasis);
        Assert.Equal(status == "failed" ? "FAILED" : "UNAVAILABLE", r.Dimensions.Content.Status);
        Assert.Equal(code, r.Dimensions.Content.Reason);
        Assert.Equal(0, phoneme.Calls); // không tự chuyển sang mô hình âm vị
    }

    [Fact]
    public async Task NoAsrRegistered_IsUnavailable()
    {
        var r = await Service(asr: null).EvaluateAsync(Input());
        Assert.Equal("ASR_UNAVAILABLE", r.ErrorCode);
    }

    [Fact]
    public async Task EmptyTranscript_IsNoSpeech_NotZero()
    {
        var r = await Service(new FakeAsr(() => Heard(" 。"))).EvaluateAsync(Input());
        Assert.Equal("NO_SPEECH_DETECTED", r.ErrorCode);
        Assert.Equal("no_speech", r.RecognitionStatus);
        Assert.Null(r.OverallScore);
    }

    [Fact]
    public async Task HallucinatedRepetitiveTranscript_IsNotTreatedAsTheLearnersMistake()
    {
        var r = await Service(new FakeAsr(() => Heard("ありがとうありがとうありがとう", compression: 3.1))).EvaluateAsync(Input());
        Assert.Equal("ASR_UNRELIABLE", r.ErrorCode);
        Assert.Null(r.ContentMatchScore);
    }

    [Fact]
    public async Task BadAudio_IsRejectedBeforeCallingTheAsr()
    {
        var asr = new FakeAsr(() => Heard(Target));
        var input = new ShadowingAudioEvaluationInput { TargetText = Target, AnalysisWav = TestAudio.Wav(TestAudio.Zeros(1500)) };
        var r = await Service(asr).EvaluateAsync(input);

        Assert.Equal("AUDIO_SILENT", r.ErrorCode);
        Assert.Equal(0, asr.Calls);
        Assert.Equal("UNAVAILABLE", r.Dimensions.Content.Status);
    }

    [Fact]
    public async Task Fluency_IsMeasuredButHasNoScore()
    {
        var r = await Service(new FakeAsr(() => Heard(Target)), fluency: new FluencyAnalyzer()).EvaluateAsync(Input());

        Assert.Equal("available", r.Fluency!.Status);
        Assert.Equal("COMPLETED", r.Dimensions.Fluency.Status);
        Assert.Null(r.Dimensions.Fluency.Score);
        Assert.Equal("SCORE_NOT_VALIDATED", r.Dimensions.Fluency.Reason);
        Assert.Null(r.FluencyScore);
    }

    [Fact]
    public async Task PhonemeContentProvider_StaysAvailableOnlyWhenExplicitlyConfigured()
    {
        var asr = new FakeAsr(() => Heard(Target));
        var phoneme = new CountingPhoneme();
        var r = await Service(asr, phoneme, new() { ["Shadowing:Content:Provider"] = "phoneme" }).EvaluateAsync(Input());

        Assert.Equal("phoneme", r.RecognitionSource);
        Assert.Equal(1, phoneme.Calls);
        Assert.Equal(0, asr.Calls);
        Assert.Equal("UNAVAILABLE", r.Dimensions.Pronunciation.Status);
    }
}
