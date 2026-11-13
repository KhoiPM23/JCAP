using JCAP.DTOs.Shadowing;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;

namespace JCAP.Tests.Services;

/// <summary>
/// Nguồn transcript để chấm: nhận dạng âm vị trên chính bản ghi của JCAP (ưu tiên), Web Speech của trình duyệt (dự phòng).
/// </summary>
public class ShadowingPhonemeSourceTests
{
    private const string Target = "一人です。カウンター席でお願いします。";

    private sealed class FakePhonemeRecognizer : IPhonemeRecognizer
    {
        private readonly Func<PhonemeRecognitionResult?> _result;
        public bool IsAvailable { get; init; } = true;
        public int Calls { get; private set; }

        public FakePhonemeRecognizer(Func<PhonemeRecognitionResult?> result) => _result = result;

        public PhonemeRecognitionResult? Recognize(float[] samples16k)
        {
            Calls++;
            return _result();
        }
    }

    /// <summary>Kết quả nhận dạng giả: mỗi mora một âm vị với độ tự tin cho trước (chỉ cần Kana và độ tự tin).</summary>
    private static PhonemeRecognitionResult Heard(string kana, double confidence = 0.9) => new()
    {
        Kana = kana,
        Phonemes = JapaneseMora.FromKana(kana).Select((m, i) => new RecognizedPhoneme(m.Canon, i * 100, i * 100 + 100, confidence)).ToList(),
        FrameMs = 20,
    };

    private static readonly KanaMoraComparer Comparer = new(new IKanaReader[] { new TestKanaReader() });

    private static ShadowingEvaluationService Service(IPhonemeRecognizer? recognizer, Dictionary<string, string?>? config = null) =>
        new(Comparer,
            new ConfigurationBuilder().AddInMemoryCollection(TestConfig.PhonemeContent).AddInMemoryCollection(config ?? new()).Build(),
            new Mock<ILogger<ShadowingEvaluationService>>().Object,
            fluencyAnalyzer: null,
            referenceProvider: null,
            phonemeRecognizer: recognizer);

    private static ShadowingAudioEvaluationInput Input(string? clientTranscript = null, byte[]? wav = null, string gate = "good") => new()
    {
        Audio = Array.Empty<byte>(), // bản ghi gốc tùy chọn; chấm trên AnalysisWav
        MimeType = "audio/webm",
        TargetText = Target,
        AudioGateStatus = gate,
        ClientTranscript = clientTranscript,
        ClientRecognitionStatus = clientTranscript == null ? "empty" : "final",
        AnalysisWav = wav ?? TestAudio.Wav(TestAudio.Utterance()),
    };

    private static async Task<string> TargetReading() => (await Comparer.CompareAsync(Target, Target)).TargetReading;

    [Fact]
    public async Task ReadsFromTheRecording_EvenWhenTheBrowserHeardSomethingElse()
    {
        var reading = await TargetReading();
        var recognizer = new FakePhonemeRecognizer(() => Heard(reading));

        var result = await Service(recognizer).EvaluateAsync(Input(clientTranscript: "ぜんぜんちがうぶんです"));

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal("phoneme", result.RecognitionSource);
        Assert.Equal(reading, result.RecognizedText);
        Assert.Equal(100, result.ContentMatchScore);
        Assert.Equal(1, recognizer.Calls);
    }

    [Fact]
    public async Task AMistakeHeardInTheRecording_IsScored_EvenIfTheBrowserWroteThePerfectSentence()
    {
        // Trình duyệt "sửa" thành câu đúng; bản ghi cho thấy người học bỏ mất một mora.
        var reading = await TargetReading();
        var missingOneMora = reading.Remove(1, 1);
        var service = Service(new FakePhonemeRecognizer(() => Heard(missingOneMora)));

        var result = await service.EvaluateAsync(Input(clientTranscript: Target));

        Assert.Equal("phoneme", result.RecognitionSource);
        Assert.True(result.ContentMatchScore < 100);
    }

    [Fact]
    public async Task KanaTranscript_IsNotReadAgain_SoItsLongVowelSpellingMatchesTheTarget()
    {
        var comparison = await Comparer.CompareWithReadingAsync("学校", "がっこお");
        Assert.False(comparison.ReadingUnavailable);
        Assert.Equal(100, comparison.ContentMatchScore);

        var missingSokuon = await Comparer.CompareWithReadingAsync("学校", "がこお");
        Assert.True(missingSokuon.ContentMatchScore < 100);
    }

    /// <summary>Nguồn cách đọc giả có ranh giới từ: chuẩn hoá trường âm TRONG từng từ, giống VOICEVOX.</summary>
    private sealed class WordReader : IKanaReader
    {
        private readonly Dictionary<string, string[]> _words;
        public WordReader(Dictionary<string, string[]> words) => _words = words;
        public string SourceId => "words";

        public Task<KanaReading?> TryReadAsync(string text, CancellationToken cancellationToken = default)
        {
            var parts = _words.TryGetValue(text, out var w) ? w : new[] { text };
            var moras = new List<Mora>();
            var starts = new List<int>();
            foreach (var part in parts)
            {
                starts.Add(moras.Count);
                moras.AddRange(JapaneseMora.FromKana(part, preserveLongVowelSpelling: false));
            }
            return Task.FromResult<KanaReading?>(new KanaReading { Moras = moras, WordStarts = starts, Source = SourceId });
        }
    }

    private static KanaMoraComparer WordComparer() => new(new IKanaReader[]
    {
        new WordReader(new()
        {
            ["電車があります"] = new[] { "でんしゃが", "あります" },
            ["先生にあいます"] = new[] { "せんせいに", "あいます" },
            ["おばあさんがいます"] = new[] { "おばあさんが", "います" },
        }),
    });

    [Theory]
    [InlineData("電車があります", "でんしゃがあります")]   // が｜あ (hai từ) và があ liền nhau (bị gộp thành trường âm)
    [InlineData("先生にあいます", "せんせいにあいます")]
    public async Task SameSound_AcrossAWordBoundary_IsNotAnError(string target, string spokenKana)
    {
        var comparison = await WordComparer().CompareWithReadingAsync(target, spokenKana);
        Assert.Equal(100, comparison.ContentMatchScore);
    }

    [Fact]
    public async Task Display_UsesTheTargetsKanjiForCorrectWords_AndKeepsKanaWhereTheLearnerDiffered()
    {
        var comparer = WordComparer();

        var allCorrect = await comparer.CompareWithReadingAsync("電車があります", "でんしゃがあります");
        Assert.Equal("電車があります", allCorrect.RecognizedDisplay);

        // Từ đầu đúng → chữ của câu mẫu; từ sau đọc sai → kana như đã nghe (không "sửa" thành câu mẫu)
        var oneWrong = await comparer.CompareWithReadingAsync("電車があります", "でんしゃがあるます");
        Assert.StartsWith("電車が", oneWrong.RecognizedDisplay);
        Assert.Contains("る", oneWrong.RecognizedDisplay);
        Assert.DoesNotContain("あります", oneWrong.RecognizedDisplay);

        // Nói thừa ở cuối: giữ kana của phần thừa
        var extra = await comparer.CompareWithReadingAsync("電車があります", "でんしゃがありますね");
        Assert.Equal("電車がありますね", extra.RecognizedDisplay);

        // Nói câu khác hẳn: toàn bộ là kana đã nghe, không có chữ nào của câu mẫu
        var other = await comparer.CompareWithReadingAsync("電車があります", "きょうはあついです");
        Assert.DoesNotContain("電車", other.RecognizedDisplay);
    }

    [Fact]
    public async Task Response_CarriesBothTheRawKanaAndTheDisplayText()
    {
        var reading = await TargetReading();
        var result = await Service(new FakePhonemeRecognizer(() => Heard(reading))).EvaluateAsync(Input());

        Assert.Equal(reading, result.RecognizedText);          // transcript đã chấm: kana đúng như nghe được
        Assert.Contains("一人", result.RecognizedDisplayText); // hiển thị: đọc đúng nên dùng chữ của câu mẫu
    }

    [Fact]
    public async Task RealMissingLongVowel_IsStillAnError()
    {
        var comparison = await WordComparer().CompareWithReadingAsync("おばあさんがいます", "おばさんがいます");
        Assert.True(comparison.ContentMatchScore < 100);
        Assert.Contains(comparison.Tokens, t => t.Status != "correct" && t.ErrorType == "chouon");
    }

    [Fact]
    public async Task MissingVowelAcrossBoundary_IsStillAnError()
    {
        // Bỏ hẳn âm あ của あります (không phải cách ghi khác của cùng một âm) vẫn bị tính sai.
        var comparison = await WordComparer().CompareWithReadingAsync("電車があります", "でんしゃがります");
        Assert.True(comparison.ContentMatchScore < 100);
    }

    [Fact]
    public async Task NothingHeardInTheRecording_IsNoSpeech_NotZero()
    {
        var result = await Service(new FakePhonemeRecognizer(() => Heard(string.Empty))).EvaluateAsync(Input(clientTranscript: Target));

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal("NO_SPEECH_DETECTED", result.ErrorCode);
        Assert.Equal("phoneme", result.RecognitionSource);
        Assert.Null(result.ContentMatchScore);
    }

    [Fact]
    public async Task ASingleLowConfidenceMora_IsTreatedAsNoise()
    {
        var result = await Service(new FakePhonemeRecognizer(() => Heard("あ", confidence: 0.4))).EvaluateAsync(Input());
        Assert.Equal("NO_SPEECH_DETECTED", result.ErrorCode);
    }

    [Fact]
    public async Task ASingleConfidentMora_IsStillScored()
    {
        var result = await Service(new FakePhonemeRecognizer(() => Heard("あ", confidence: 0.95))).EvaluateAsync(Input());
        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal("phoneme", result.RecognitionSource);
    }

    // Không có nguồn chấm dự phòng: model hỏng/thiếu, WAV hỏng → "chưa chấm được" kèm mã lỗi, KHÔNG chấm bằng chữ Web Speech.
    [Fact]
    public async Task ModelNotAvailable_IsUnavailable_NotScoredFromTheBrowser()
    {
        var recognizer = new FakePhonemeRecognizer(() => Heard("x")) { IsAvailable = false };
        var result = await Service(recognizer).EvaluateAsync(Input(clientTranscript: Target));

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal("RECOGNIZER_UNAVAILABLE", result.ErrorCode);
        Assert.Null(result.ContentMatchScore);
        Assert.Equal(0, recognizer.Calls);
    }

    [Fact]
    public async Task NoRecognizerRegistered_IsUnavailable()
    {
        var result = await Service(recognizer: null).EvaluateAsync(Input(clientTranscript: Target));
        Assert.Equal("RECOGNIZER_UNAVAILABLE", result.ErrorCode);
        Assert.Null(result.OverallScore);
    }

    [Fact]
    public async Task CorruptAnalysisWav_IsRejected_BeforeTheModelRuns()
    {
        var recognizer = new FakePhonemeRecognizer(() => Heard("x"));
        var result = await Service(recognizer).EvaluateAsync(Input(clientTranscript: Target, wav: new byte[300]));

        Assert.Equal("INVALID_AUDIO_FORMAT", result.ErrorCode);
        Assert.Equal(0, recognizer.Calls);
    }

    [Fact]
    public async Task OldBrowserSourceSetting_NoLongerTurnsOffTheModel()
    {
        var recognizer = new FakePhonemeRecognizer(() => Heard("x"));
        var service = Service(recognizer, new() { ["Shadowing:Recognition:Source"] = "web_speech" });

        var result = await service.EvaluateAsync(Input(clientTranscript: Target));

        Assert.Equal("phoneme", result.RecognitionSource);
        Assert.Equal(1, recognizer.Calls);
    }

    [Fact]
    public async Task RecognizerCrash_IsUnavailable_NotZero()
    {
        var recognizer = new FakePhonemeRecognizer(() => throw new InvalidOperationException("onnx"));
        var result = await Service(recognizer).EvaluateAsync(Input(clientTranscript: Target));

        Assert.Equal("unavailable", result.EvaluationStatus);
        Assert.Equal("RECOGNIZER_UNAVAILABLE", result.ErrorCode);
        Assert.Null(result.OverallScore);
    }

    [Fact]
    public async Task ClientGateNeedsRetry_DoesNotStopABackendCheckedRecording()
    {
        var reading = await TargetReading();
        var recognizer = new FakePhonemeRecognizer(() => Heard(reading));
        var result = await Service(recognizer).EvaluateAsync(Input(clientTranscript: Target, gate: "needs_retry"));

        Assert.Equal("completed", result.EvaluationStatus);
        Assert.Equal(1, recognizer.Calls);
    }
}

/// <summary>Các sửa đổi ở bộ so khớp phát hiện khi đối chiếu câu thật (dấu câu, cách đọc hợp lệ khác của chữ Hán).</summary>
public class ComparerRegressionTests
{
    private sealed class FixedReader : IKanaReader
    {
        private readonly Dictionary<string, (string Kana, int[] Starts)> _map;
        public FixedReader(Dictionary<string, (string, int[])> map) => _map = map;
        public string SourceId => "fixed";

        public Task<KanaReading?> TryReadAsync(string text, CancellationToken cancellationToken = default)
        {
            if (!_map.TryGetValue(text, out var v)) return Task.FromResult<KanaReading?>(null);
            return Task.FromResult<KanaReading?>(new KanaReading
            {
                Moras = JapaneseMora.FromKana(v.Kana, preserveLongVowelSpelling: false),
                WordStarts = v.Starts,
                Source = SourceId,
            });
        }
    }

    [Fact]
    public async Task AfterPunctuation_ANewWordStarts_EvenIfTheReaderMergedEverything()
    {
        // Nguồn cách đọc trả CẢ CÂU là một cụm (như khi dấu câu bị bỏ): lỗi ở 入国 không được làm sai cả こんにちは.
        var comparer = new KanaMoraComparer(new IKanaReader[]
        {
            new FixedReader(new() { ["みなさん、こんにちは。入国"] = ("みなさんこんにちわにゅうこく", new[] { 0 }) }),
        });

        var result = await comparer.CompareWithReadingAsync("みなさん、こんにちは。入国", "みなさんこんにちわにゅこく");

        Assert.Contains(result.Tokens, t => t.Status == "correct" && t.Text.Contains("こんにちは"));
        Assert.Contains(result.Tokens, t => t.Status == "mismatched" && t.Text.Contains("入国"));
        Assert.True(result.ContentMatchScore >= 50);
    }

    [Theory]
    [InlineData("なんですか", true)]  // cách đọc người Nhật hay dùng
    [InlineData("なにですか", true)]  // cách G2P chọn
    [InlineData("なのですか", false)] // không phải cách đọc của 何
    public async Task Nani_AcceptsBothValidReadings_ButNothingElse(string spoken, bool correct)
    {
        var comparer = new KanaMoraComparer(new IKanaReader[]
        {
            new FixedReader(new() { ["何ですか"] = ("なにですか", new[] { 0 }) }),
        });

        var result = await comparer.CompareWithReadingAsync("何ですか", spoken);

        Assert.Equal(correct, result.ContentMatchScore == 100);
    }

    [Fact]
    public void ReadingQuery_KeepsPunctuation_AndDropsWhitespace()
    {
        Assert.Equal("みなさん、こんにちは。入国", VoiceVoxKanaReader.ForEngine(" みなさん、 こんにちは。入国 "));
    }
}

public class PhonemePreprocessingTests
{
    [Fact]
    public void Default_IsHighPassPlusEdgePadding_AsChosenByTheBench()
    {
        var d = PhonemePreprocessing.Default;
        Assert.True(d.HighPass);
        Assert.True(d.PadEdges);
        Assert.False(d.TrimSilence);
        Assert.False(d.NormalizeLevel);
    }

    [Fact]
    public void Pad_AddsHalfASecondOfSilenceOnEachSide()
    {
        var x = Enumerable.Repeat(0.5f, 1000).ToArray();
        var y = PhonemePreprocessing.Pad(x);
        Assert.Equal(1000 + 2 * 8000, y.Length);
        Assert.All(y.Take(8000), v => Assert.Equal(0f, v));
        Assert.All(y.Skip(8000).Take(1000), v => Assert.Equal(0.5f, v));
        Assert.All(y.Skip(9000), v => Assert.Equal(0f, v));
    }

    [Fact]
    public void HighPass_RemovesHumAndOffset_ButKeepsSpeechBand()
    {
        static double Rms(float[] s) => Math.Sqrt(s.Skip(1600).Average(v => (double)v * v)); // bỏ đoạn đầu để bộ lọc ổn định
        var hum = Enumerable.Range(0, 16000).Select(i => (float)(0.1 + 0.1 * Math.Sin(2 * Math.PI * 30 * i / 16000))).ToArray();
        var voice = Enumerable.Range(0, 16000).Select(i => (float)(0.1 * Math.Sin(2 * Math.PI * 300 * i / 16000))).ToArray();

        Assert.True(Rms(PhonemePreprocessing.ApplyHighPass(hum)) < 0.4 * Rms(hum));
        Assert.True(Rms(PhonemePreprocessing.ApplyHighPass(voice)) > 0.9 * Rms(voice));
    }
}
