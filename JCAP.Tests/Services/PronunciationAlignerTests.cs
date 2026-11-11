using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;

namespace JCAP.Tests.Services;

/// <summary>
/// Chấm theo câu mẫu trên đầu ra CTC giả lập: mỗi âm vị "phát ra" vài khung với xác suất cao, xen nhãn trống.
/// </summary>
public class PronunciationAlignerTests
{
    // Đúng thứ tự nhãn của models/phoneme/vocab.json
    internal static readonly string[] Labels =
    {
        "PAD", "UNK", "SOS", "EOS", "a", "i", "u", "e", "o", "I", "U", "k", "g", "s", "z", "t", "d", "n", "h", "b", "p", "m",
        "y", "r", "w", "f", "j", "v", "N", "cl", "sh", "ch", "ts", "gy", "ky", "hy", "by", "py", "my", "ny", "ry", "fy", "dy",
        "kw", "gw", "pau", "sil",
    };

    /// <summary>Đầu ra giả của mô hình khi nghe đúng chuỗi âm vị này (có khoảng lặng hai đầu).</summary>
    internal static float[][] Emit(IEnumerable<string> phonemes, double peak = 0.9)
    {
        var frames = new List<float[]>();
        float[] Frame(string label)
        {
            var id = Array.IndexOf(Labels, label);
            var rest = (1 - peak) / (Labels.Length - 1);
            return Labels.Select((_, i) => (float)Math.Log(i == id ? peak : rest)).ToArray();
        }
        for (var i = 0; i < 10; i++) frames.Add(Frame("PAD"));
        foreach (var p in phonemes)
        {
            for (var i = 0; i < 3; i++) frames.Add(Frame(p));
            frames.Add(Frame("PAD"));
        }
        for (var i = 0; i < 10; i++) frames.Add(Frame("PAD"));
        return frames.ToArray();
    }

    internal static List<string> PhonemesOf(string kana)
    {
        var moras = JapaneseMora.FromKana(kana, preserveLongVowelSpelling: false);
        var list = new List<string>();
        char? prev = null;
        foreach (var m in moras)
        {
            var ph = PronunciationAligner.PhonemesOf(m, prev)!;
            list.AddRange(ph);
            if (!m.IsLong) prev = ph[^1].Length == 1 && "aiueo".Contains(ph[^1][0]) ? ph[^1][0] : null;
        }
        return list;
    }

    private static AlignedRecognition Align(string target, string spoken) =>
        PronunciationAligner.Align(JapaneseMora.FromKana(target, preserveLongVowelSpelling: false), Emit(PhonemesOf(spoken)), Labels)!;

    private static string Heard(AlignedRecognition a) => string.Concat(a.Heard.Select(m => m.Canon));

    [Fact]
    public void Ctc_TheSequenceThatWasSpoken_ScoresHigherThanAnother()
    {
        var scorer = new CtcScorer(Emit(new[] { "k", "a" }), new[] { 0, 45, 46 });
        int[] T(string l) => new[] { Array.IndexOf(Labels, l) };
        var said = scorer.LogLikelihood(new[] { T("k"), T("a") });
        var other = scorer.LogLikelihood(new[] { T("g"), T("a") });
        Assert.True(said > other + 5);
        Assert.True(scorer.BestAlignmentLogLikelihood(new[] { T("k"), T("a") }) <= said + 1e-9);
        Assert.True(scorer.UnconstrainedBestPath() >= scorer.BestAlignmentLogLikelihood(new[] { T("k"), T("a") }) - 1e-9);
    }

    [Fact]
    public void Ctc_ALongVowel_NeedsTwoVowelsSeparatedByBlank()
    {
        int[] T(string l) => new[] { Array.IndexOf(Labels, l) };
        var longO = new CtcScorer(Emit(new[] { "o", "o" }), new[] { 0, 45, 46 });
        Assert.True(longO.LogLikelihood(new[] { T("o"), T("o") }) > longO.LogLikelihood(new[] { T("o") }));
        var shortO = new CtcScorer(Emit(new[] { "o" }), new[] { 0, 45, 46 });
        Assert.True(shortO.LogLikelihood(new[] { T("o") }) > shortO.LogLikelihood(new[] { T("o"), T("o") }));
    }

    [Fact]
    public void ReadCorrectly_EveryMoraIsOk_AndHeardIsTheTarget()
    {
        var a = Align("ぱすぽーとをみせてください", "ぱすぽーとをみせてください");
        Assert.False(a.IsMismatch);
        Assert.All(a.Moras, m => Assert.Contains(m.Kind, new[] { "ok", "unjudged" }));
        Assert.Equal(string.Concat(JapaneseMora.FromKana("ぱすぽーとをみせてください", false).Select(m => m.Canon)), Heard(a));
    }

    [Fact]
    public void MissingSokuon_IsReportedAsSokuon()
    {
        var a = Align("がっこう", "がこう");
        Assert.Contains(a.Moras, m => m.Target == "っ" && m.Kind == "sokuon");
        Assert.Equal("がこー", Heard(a));
    }

    [Fact]
    public void ShortLongVowel_IsReportedAsShort()
    {
        var a = Align("ぱすぽーと", "ぱすぽと");
        Assert.Contains(a.Moras, m => m.Target == "ー" && m.Kind == "short");
    }

    [Fact]
    public void LostFirstMora_IsReportedAsMissing()
    {
        var a = Align("ぱすぽーと", "すぽーと");
        Assert.Equal("missing", a.Moras[0].Kind);
        Assert.Equal("すぽーと", Heard(a));
    }

    [Fact]
    public void ConfusedConsonantAndMora_AreReportedWithWhatWasHeard()
    {
        var voicing = Align("かばん", "がばん");
        Assert.Equal("が", voicing.Moras[0].Heard);

        var fuHi = Align("ふじさん", "ひじさん");
        Assert.Equal("ひ", fuHi.Moras[0].Heard);
    }

    [Fact]
    public void Hatsuon_IsNeverJudged()
    {
        var a = Align("こんにちは", "こにちは");
        Assert.Equal("unjudged", a.Moras[1].Kind);
    }

    [Fact]
    public void ADifferentSentence_IsAMismatch()
    {
        var a = Align("ぱすぽーとをみせてください", "きょうはいいてんきですね");
        Assert.True(a.IsMismatch);
    }

    [Fact]
    public void UnknownMora_CannotBeAligned()
    {
        var moras = new List<Mora> { new("?漢", "漢") };
        Assert.Null(PronunciationAligner.Align(moras, Emit(new[] { "a" }), Labels));
    }
}

/// <summary>Luồng chấm: chấm theo câu mẫu khi mô hình trả xác suất, nhận dạng tự do khi tắt hoặc đọc câu khác.</summary>
public class ShadowingAlignedScoringTests
{
    private const string Target = "学校に行きます";
    private static readonly KanaMoraComparer Comparer = new(new IKanaReader[] { new TestKanaReader() });

    private sealed class Recognizer : IPhonemeRecognizer
    {
        private readonly PhonemeRecognitionResult _result;
        public Recognizer(PhonemeRecognitionResult result) => _result = result;
        public bool IsAvailable => true;
        public PhonemeRecognitionResult? Recognize(float[] samples16k) => _result;
    }

    private static async Task<string> Reading() => (await Comparer.CompareAsync(Target, Target)).TargetReading;

    private static PhonemeRecognitionResult Result(string spokenKana, string freeKana) => new()
    {
        Kana = freeKana,
        Phonemes = JapaneseMora.FromKana(freeKana).Select((m, i) => new RecognizedPhoneme(m.Canon, i * 100, i * 100 + 100, 0.9)).ToList(),
        FrameMs = 20,
        LogProbabilities = PronunciationAlignerTests.Emit(PronunciationAlignerTests.PhonemesOf(spokenKana)),
        Labels = PronunciationAlignerTests.Labels,
    };

    private static ShadowingEvaluationService Service(PhonemeRecognitionResult r, Dictionary<string, string?>? config = null) =>
        new(Comparer,
            new ConfigurationBuilder().AddInMemoryCollection(config ?? new()).Build(),
            new Mock<ILogger<ShadowingEvaluationService>>().Object,
            phonemeRecognizer: new Recognizer(r));

    private static ShadowingAudioEvaluationInput Input() => new()
    {
        Audio = Array.Empty<byte>(),
        MimeType = "audio/webm",
        TargetText = Target,
        AudioGateStatus = "good",
        ClientRecognitionStatus = "empty",
        AnalysisWav = TestAudio.Wav(TestAudio.Utterance()),
    };

    [Fact]
    public async Task ReadCorrectly_ScoresFullMarks_EvenWhenFreeRecognitionWasMessy()
    {
        var reading = await Reading();
        var result = await Service(Result(reading, freeKana: "あっこにきます")).EvaluateAsync(Input());

        Assert.Equal("aligned", result.RecognitionMode);
        Assert.Equal(100, result.ContentMatchScore);
        Assert.Equal(Target, result.RecognizedDisplayText);
        Assert.Equal("あっこにきます", result.FreeRecognizedText);
    }

    [Fact]
    public async Task AMistake_IsScoredAgainstTheTarget()
    {
        var reading = await Reading();
        var withoutSokuon = reading.Replace("っ", "");
        var result = await Service(Result(withoutSokuon, freeKana: withoutSokuon)).EvaluateAsync(Input());

        Assert.Equal("aligned", result.RecognitionMode);
        Assert.True(result.ContentMatchScore < 100);
        Assert.Contains(result.DiffTokens, t => t.Status == "mismatched" && t.ErrorType == "sokuon");
    }

    [Fact]
    public async Task ADifferentSentence_FallsBackToFreeRecognition()
    {
        var other = "きのうはともだちとえいがをみましたよ";
        var result = await Service(Result(other, freeKana: other)).EvaluateAsync(Input());

        Assert.Equal("free", result.RecognitionMode);
        Assert.True(result.ContentMatchScore < 50);
    }

    [Fact]
    public async Task FreeMode_CanBeForcedByConfiguration()
    {
        var reading = await Reading();
        var result = await Service(Result(reading, freeKana: "あっこにきます"), new() { ["Shadowing:Recognition:Mode"] = "free" }).EvaluateAsync(Input());

        Assert.Equal("free", result.RecognitionMode);
        Assert.True(result.ContentMatchScore < 100);
    }
}
