using JCAP.DTOs.Shadowing;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Xunit;
using static JCAP.Tests.Services.TestAudio;

namespace JCAP.Tests.Services;

/// <summary>Kiểm thử đo thời lượng mora trên tín hiệu TỔNG HỢP (nguyên âm giả lập bằng formant). Không phải giọng người thật.</summary>
public class MoraDurationTests
{
    private const int Sr = 16000;

    // おばあさんがいます theo mốc thật của audio_query (ms): (kana, phụ âm, nguyên âm)
    private static readonly (string text, int consonant, int vowel)[] Moras =
    {
        ("オ", 0, 120), ("バ", 69, 100), ("ア", 0, 112), ("サ", 96, 130), ("ン", 0, 72),
        ("ガ", 46, 107), ("イ", 0, 66), ("マ", 68, 121), ("ス", 72, 97),
    };

    private static readonly Dictionary<char, (double f1, double f2)> Formants = new()
    {
        ['a'] = (800, 1200), ['i'] = (300, 2300), ['u'] = (350, 1200), ['e'] = (500, 1900), ['o'] = (500, 900),
    };

    private static char VowelOfText(string kana) => kana switch
    {
        "オ" => 'o', "バ" => 'a', "ア" => 'a', "サ" => 'a', "ン" => 'u', "ガ" => 'a', "イ" => 'i', "マ" => 'a', "ス" => 'u', _ => 'a',
    };

    internal static IReadOnlyList<MoraTiming> Timeline()
    {
        var list = new List<MoraTiming>();
        double cursor = 0.1;
        foreach (var (text, c, v) in Moras)
        {
            list.Add(new MoraTiming(text, cursor, c / 1000.0, v / 1000.0, false));
            cursor += (c + v) / 1000.0;
        }
        return list;
    }

    private static float[] Vowel(char v, int ms, double pitch)
    {
        var (f1, f2) = Formants[v];
        var n = Sr * ms / 1000;
        var data = new float[n];
        double f0 = 130 * pitch;
        for (int h = 1; h * f0 < 4000; h++)
        {
            double f = h * f0;
            double amp = Math.Exp(-Math.Pow((f - f1 * pitch / pitch) / 160, 2)) + 0.6 * Math.Exp(-Math.Pow((f - f2) / 260, 2));
            if (amp < 0.02) continue;
            for (int i = 0; i < n; i++) data[i] += (float)(0.12 * amp * Math.Sin(2 * Math.PI * f * i / Sr));
        }
        // bao biên độ mềm ở hai đầu để tránh tiếng "lách tách"
        int fade = Math.Min(n / 4, Sr / 200);
        for (int i = 0; i < fade; i++) { var g = (float)i / fade; data[i] *= g; data[n - 1 - i] *= g; }
        return data;
    }

    /// <summary>Render theo mốc; durationScale[k] = 0 nghĩa là bỏ hẳn mora đó (người học không đọc), tempo nhân đều mọi độ dài.</summary>
    internal static float[] Render(Func<int, double> durationScale, double tempo = 1.0, double pitch = 1.0, int gapAfterMora = -1, int gapMs = 0)
    {
        var parts = new List<float[]> { Noise(300) };
        char previous = 'a';
        for (int k = 0; k < Moras.Length; k++)
        {
            var (text, c, v) = Moras[k];
            var scale = durationScale(k) * tempo;
            if (scale <= 0) continue;
            var vowel = VowelOfText(text);
            if (text == "ア") vowel = previous; // trường âm: nguyên âm kéo dài
            if (c > 0) parts.Add(Noise((int)(c * tempo), 0.01));
            parts.Add(Vowel(vowel, Math.Max(20, (int)(v * scale)), pitch));
            previous = vowel;
            if (k == gapAfterMora && gapMs > 0) parts.Add(Noise(gapMs));
        }
        parts.Add(Noise(300));
        return Cat(parts.ToArray());
    }

    private static readonly MoraDurationOptions Options = new() { MaxAlignmentCost = 99, MaxTempoSpread = 99 };

    private static MoraDurationDto Analyze(float[] learner, float[]? reference = null) =>
        MoraDurationAnalyzer.Analyze(learner, reference ?? Render(_ => 1.0), Timeline(), Options);

    // ---- đo được ----

    [Fact]
    public void SameTiming_IsNotFlagged()
    {
        var r = Analyze(Render(_ => 1.0));
        Assert.Equal("available", r.Status);
        var unit = Assert.Single(r.Units);
        Assert.Equal("ばあ", unit.Text);
        Assert.InRange(unit.RelativeRatio, 0.85, 1.15);
        Assert.False(unit.Flagged);
    }

    [Fact]
    public void ShortenedLongVowel_IsFlagged_WithMeasuredRatio()
    {
        var r = Analyze(Render(k => k == 2 ? 0 : 1.0)); // bỏ mora trường âm "ア": おばさん
        var unit = Assert.Single(r.Units);
        Assert.True(unit.Flagged);
        Assert.InRange(unit.RelativeRatio, 0.3, 0.65);
        Assert.True(unit.LearnerMs < unit.ReferenceMs);

        var obs = Assert.Single(MoraDurationAnalyzer.ToObservations(r, Options, 2));
        Assert.Equal("chouon_short", obs.Code);
        Assert.Contains("ばあ", obs.Message);
        Assert.Equal(true, obs.Data["experimental"]);
        Assert.Equal(Options.ShortRatio, obs.Threshold);
    }

    [Theory]
    [InlineData(0.7)]
    [InlineData(1.4)]
    public void UniformTempoChange_IsNotMistakenForAShortVowel(double tempo)
    {
        var r = Analyze(Render(_ => 1.0, tempo));
        Assert.Equal("available", r.Status);
        Assert.False(r.Units.Single().Flagged);
        Assert.InRange(r.TempoRatio!.Value, tempo * 0.8, tempo * 1.2);
    }

    [Fact]
    public void ShortVowelAtDifferentTempo_IsStillFlagged()
    {
        var r = Analyze(Render(k => k == 2 ? 0 : 1.0, tempo: 1.3));
        Assert.True(r.Units.Single().Flagged);
    }

    [Fact]
    public void DifferentPitch_DoesNotCreateAFlag()
    {
        var r = Analyze(Render(_ => 1.0, pitch: 1.5));
        Assert.False(r.Units.Single().Flagged);
    }

    [Fact]
    public void FlagsOnlyTheLongUnit_NotOtherMoras()
    {
        // Rút ngắn một mora thường (サ) không được coi là lỗi trường âm.
        var r = Analyze(Render(k => k == 3 ? 0.4 : 1.0));
        Assert.False(r.Units.Single().Flagged);
    }

    // ---- không đủ điều kiện ----

    [Fact]
    public void NoLongVowelInSentence_IsUnavailable()
    {
        var timeline = new List<MoraTiming>
        {
            new("オ", 0.1, 0, 0.12, false), new("バ", 0.22, 0.07, 0.1, false), new("サ", 0.39, 0.09, 0.13, false), new("ン", 0.61, 0, 0.07, false),
        };
        var r = MoraDurationAnalyzer.Analyze(Render(_ => 1.0), Render(_ => 1.0), timeline, Options);
        Assert.Equal("unavailable", r.Status);
        Assert.Equal("NO_LONG_VOWEL", r.ReasonCode);
    }

    [Fact]
    public void TimelineNotMatchingTheReferenceAudio_IsRejected()
    {
        var origin = Timeline()[0].StartSec;
        var shifted = Timeline().Select(m => m with { StartSec = origin + (m.StartSec - origin) * 2, ConsonantSec = m.ConsonantSec * 2, VowelSec = m.VowelSec * 2 }).ToList();
        var r = MoraDurationAnalyzer.Analyze(Render(_ => 1.0), Render(_ => 1.0), shifted, Options);
        Assert.Equal("TIMELINE_MISMATCH", r.ReasonCode);
    }

    [Fact]
    public void Silence_IsUnavailable()
    {
        var r = MoraDurationAnalyzer.Analyze(Zeros(3000), Render(_ => 1.0), Timeline(), Options);
        Assert.Equal("LEARNER_UNAVAILABLE", r.ReasonCode);
    }

    [Fact]
    public void BrokenReferenceAudio_IsUnavailable()
    {
        var r = MoraDurationAnalyzer.Analyze(Render(_ => 1.0), Zeros(3000), Timeline(), Options);
        Assert.Equal("REFERENCE_UNAVAILABLE", r.ReasonCode);
    }

    [Fact]
    public void UnreliableAlignment_ReportsMeasurementsButNeverFlags()
    {
        var strict = new MoraDurationOptions { MaxAlignmentCost = 0.0001 };
        var r = MoraDurationAnalyzer.Analyze(Render(k => k == 2 ? 0 : 1.0), Render(_ => 1.0), Timeline(), strict);
        Assert.Equal("unavailable", r.Status);
        Assert.Equal("ALIGNMENT_UNRELIABLE", r.ReasonCode);
        Assert.NotEmpty(r.Units);
        Assert.All(r.Units, u => Assert.False(u.Flagged));
        Assert.Empty(MoraDurationAnalyzer.ToObservations(r, strict, 2));
    }

    [Fact]
    public void Options_CanBeOverriddenFromConfiguration()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Shadowing:Duration:ShortRatio"] = "0.5",
            ["Shadowing:Duration:MaxAlignmentCost"] = "9",
        }).Build();
        var o = MoraDurationOptions.FromConfiguration(config);
        Assert.Equal(0.5, o.ShortRatio);
        Assert.Equal(9, o.MaxAlignmentCost);
        Assert.Equal(new MoraDurationOptions().MaxTempoSpread, o.MaxTempoSpread);
    }

    [Fact]
    public void Analysis_IsDeterministic()
    {
        var learner = Render(k => k == 2 ? 0 : 1.0);
        var reference = Render(_ => 1.0);
        var a = Analyze(learner, reference);
        var b = Analyze(learner, reference);
        Assert.Equal(a.Units.Single().RelativeRatio, b.Units.Single().RelativeRatio);
        Assert.Equal(a.AlignmentCost, b.AlignmentCost);
    }
}

public class DtwAndFeaturesTests
{
    private static float[] Tone(double hz, int ms) => TestAudio.Sine(ms, 0.3, hz);

    [Fact]
    public void Features_AreFiniteAndHaveExpectedShape()
    {
        var f = SpeechFeatures.Compute(TestAudio.Cat(Tone(300, 500), Tone(900, 500)));
        Assert.Equal(1 + (16000 - 400) / 160, f.Length);
        Assert.All(f, v =>
        {
            Assert.Equal(SpeechFeatures.Dimensions, v.Length);
            Assert.All(v, x => Assert.True(float.IsFinite(x)));
        });
    }

    [Fact]
    public void TooShortAudio_GivesNoFrames() =>
        Assert.Empty(SpeechFeatures.Compute(new float[100]));

    [Fact]
    public void DifferentTones_AreFartherApartThanTheSameTone()
    {
        var a = SpeechFeatures.Compute(TestAudio.Cat(Tone(300, 400), Tone(1500, 400)));
        var b = SpeechFeatures.Compute(TestAudio.Cat(Tone(300, 400), Tone(1500, 400)));
        var c = SpeechFeatures.Compute(TestAudio.Cat(Tone(1500, 400), Tone(300, 400)));
        Assert.Equal(0, SpeechFeatures.Distance(a[10], b[10]), 6);
        Assert.True(SpeechFeatures.Distance(a[10], c[10]) > 1.0);
    }

    [Fact]
    public void Dtw_RecoversATimeWarp()
    {
        // Y chậm gấp đôi ở nửa sau: đường căn chỉnh phải ánh xạ ranh giới đúng.
        var x = SpeechFeatures.Compute(TestAudio.Cat(Tone(300, 600), Tone(1500, 600)));
        var y = SpeechFeatures.Compute(TestAudio.Cat(Tone(300, 600), Tone(1500, 1200)));
        var r = Dtw.Align(x, y);
        Assert.NotNull(r);
        // Ranh giới của X ở ~khung 60 phải rơi gần khung 60 của Y (nửa đầu có cùng độ dài).
        Assert.InRange(r!.MapXToY[60], 50, 70);
        // Cuối X (khung ~118) phải ứng với cuối Y (~khung 178).
        Assert.InRange(r.MapXToY[^1], 165, 180);
    }

    [Fact]
    public void Dtw_IdenticalSequences_HaveZeroCost()
    {
        var x = SpeechFeatures.Compute(TestAudio.Cat(Tone(300, 400), Tone(1500, 400)));
        var r = Dtw.Align(x, x)!;
        Assert.Equal(0, r.AverageCost, 6);
    }

    [Fact]
    public void Dtw_EmptyInput_ReturnsNull() =>
        Assert.Null(Dtw.Align(Array.Empty<float[]>(), SpeechFeatures.Compute(Tone(300, 500))));

    [Fact]
    public void ParseTimeline_BuildsCumulativeTimesIncludingPauses()
    {
        const string json = """
        {"accent_phrases":[
          {"moras":[{"text":"コ","consonant_length":0.05,"vowel_length":0.1},{"text":"ン","consonant_length":null,"vowel_length":0.07}],
           "pause_mora":{"text":"、","vowel_length":0.4}},
          {"moras":[{"text":"ニ","consonant_length":0.06,"vowel_length":0.09}]}],
         "prePhonemeLength":0.1,"pauseLengthScale":1.0}
        """;
        var tl = VoiceVoxService.ParseTimeline(json)!;
        Assert.Equal(4, tl.Count);
        Assert.Equal(0.1, tl[0].StartSec, 6);
        Assert.Equal(0.25, tl[1].StartSec, 6);
        Assert.True(tl[2].IsPause);
        Assert.Equal(0.32, tl[2].StartSec, 6);
        Assert.Equal(0.72, tl[3].StartSec, 6);
        Assert.Equal(0.87, tl[3].EndSec, 6);
    }

    [Fact]
    public void ParseTimeline_WithoutMoras_ReturnsNull() =>
        Assert.Null(VoiceVoxService.ParseTimeline("""{"accent_phrases":[],"prePhonemeLength":0.1}"""));
}
