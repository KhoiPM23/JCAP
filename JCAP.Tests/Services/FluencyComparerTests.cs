using JCAP.DTOs.Shadowing;
using Microsoft.Extensions.Configuration;
using JCAP.Services.Implementations;
using Xunit;
using Xunit.Abstractions;
using static JCAP.Tests.Services.TestAudio;

namespace JCAP.Tests.Services;

public class FluencyComparerTests
{
    private readonly ITestOutputHelper _output;
    public FluencyComparerTests(ITestOutputHelper output) => _output = output;

    private static readonly FluencyAnalyzer Analyzer = new();
    private static readonly FluencyComparisonOptions Options = new();

    private const int TargetMoras = 20;

    private static FluencyComparisonContext Good(int content = 100, int recognizedMoras = TargetMoras, bool reliable = true) => new()
    {
        TranscriptReliable = reliable,
        ContentMatchScore = content,
        TargetMoraCount = TargetMoras,
        RecognizedMoraCount = recognizedMoras,
    };

    // Giọng mẫu 24 kHz (như VOICEVOX) để kiểm tra luôn đường hạ tần số.
    private static FluencyMetricsDto Reference() =>
        Analyzer.AnalyzeAnyRate(Wav(Utterance(sr: 24000), 24000), TargetMoras);

    private static FluencyMetricsDto Learner(float[] samples) => Analyzer.Analyze(Wav(samples), TargetMoras);

    private static (FluencyComparisonDto c, List<FluencyObservationDto> o) Run(
        FluencyMetricsDto learner, FluencyMetricsDto? reference = null, FluencyComparisonContext? ctx = null) =>
        FluencyComparer.Compare(learner, reference, ctx ?? Good(), Options);

    private static string[] Codes(IEnumerable<FluencyObservationDto> o) => o.Select(x => x.Code).OrderBy(x => x).ToArray();

    // ---- điều kiện cho phép so sánh ----

    [Fact]
    public void ReferenceAt24k_IsAnalyzedWithTheSameVad()
    {
        var reference = Reference();
        Assert.Equal("available", reference.Status);
        Assert.Equal(1, reference.PauseCount);
        Assert.InRange(reference.SpeechSpanMs!.Value, 2400, 2600); // 1000 + 300 + 1200 (đầu/cuối bị loại)
    }

    [Fact]
    public void LowContentMatch_DoesNotCompare()
    {
        var (c, o) = Run(Learner(Utterance()), Reference(), Good(content: 15));
        Assert.Equal("unavailable", c.Status);
        Assert.Equal("CONTENT_BELOW_THRESHOLD", c.ReasonCode);
        Assert.Empty(o);
    }

    [Fact]
    public void HighContentButTranscriptMoraCountFarOff_DoesNotCompare()
    {
        // Điểm cao nhưng transcript chỉ có một nửa số mora của câu mẫu: không tin cậy để so tốc độ.
        var (c, o) = Run(Learner(Utterance()), Reference(), Good(content: 95, recognizedMoras: 10));
        Assert.Equal("TRANSCRIPT_MORA_MISMATCH", c.ReasonCode);
        Assert.Empty(o);
    }

    [Fact]
    public void UnreliableTranscript_DoesNotCompare()
    {
        var (c, o) = Run(Learner(Utterance()), Reference(), Good(reliable: false));
        Assert.Equal("TRANSCRIPT_NOT_RELIABLE", c.ReasonCode);
        Assert.Empty(o);
    }

    [Fact]
    public void MissingReference_DoesNotCompare()
    {
        var (c, o) = Run(Learner(Utterance()), reference: null);
        Assert.Equal("REFERENCE_UNAVAILABLE", c.ReasonCode);
        Assert.Empty(o);
    }

    [Fact]
    public void UnavailableReference_DoesNotCompare()
    {
        var bad = Analyzer.AnalyzeAnyRate(new byte[100], TargetMoras);
        var (c, _) = Run(Learner(Utterance()), bad);
        Assert.Equal("REFERENCE_UNAVAILABLE", c.ReasonCode);
    }

    [Theory]
    [InlineData("silence")]
    [InlineData("noise")]
    [InlineData("garbage")]
    public void UnusableLearnerAudio_DoesNotCompare(string kind)
    {
        var learner = kind switch
        {
            "silence" => Learner(Zeros(2500)),
            "noise" => Learner(Noise(3000, 0.05)),
            _ => Analyzer.Analyze(new byte[500], TargetMoras),
        };
        var (c, o) = Run(learner, Reference());
        Assert.Equal("unavailable", learner.Status);
        Assert.Equal("LEARNER_UNAVAILABLE", c.ReasonCode);
        Assert.Empty(o);
    }

    [Fact]
    public void ShortSpeech_IsTooUnstableToCompare()
    {
        var learner = Learner(Cat(Noise(400), Sine(500), Noise(400)));
        var (c, o) = Run(learner, Reference());
        Assert.Equal("SPEECH_TOO_SHORT_FOR_COMPARISON", c.ReasonCode);
        Assert.Empty(o);
    }

    // ---- nhận xét ----

    [Fact]
    public void SameRhythm_ProducesNoObservations()
    {
        var (c, o) = Run(Learner(Utterance()), Reference());
        Assert.Equal("available", c.Status);
        Assert.InRange(c.ArticulationRateRatio!.Value, 0.95, 1.05);
        Assert.Empty(o);
    }

    [Fact]
    public void SmallDifference_ProducesNoObservations()
    {
        var (_, o) = Run(Learner(Utterance(speed: 1.2)), Reference()); // chậm hơn ~17%: dưới ngưỡng
        Assert.Empty(o);
    }

    [Fact]
    public void SlowReading_ProducesSlowObservationWithEvidence()
    {
        var (c, o) = Run(Learner(Utterance(speed: 1.8)), Reference());
        var slow = Assert.Single(o, x => x.Code == "slow_vs_reference");
        Assert.True(slow.MeasuredValue <= slow.Threshold);
        Assert.Equal(Options.SlowRatio, slow.Threshold);
        Assert.Contains("chậm hơn", slow.Message);
        Assert.True(slow.Data.ContainsKey("learnerActiveMs"));
        Assert.True(c.ArticulationRateRatio < 0.7);
    }

    [Fact]
    public void FastReading_ProducesFastObservation()
    {
        var (_, o) = Run(Learner(Utterance(speed: 0.55)), Reference());
        var fast = Assert.Single(o, x => x.Code == "fast_vs_reference");
        Assert.True(fast.MeasuredValue >= fast.Threshold);
        Assert.Contains("nhanh hơn", fast.Message);
    }

    [Fact]
    public void LongPauseInTheMiddle_IsReportedWithRelativePosition()
    {
        // Dừng tự nhiên 300 ms ở vị trí dấu "。" (khớp giọng mẫu) rồi dừng thừa 900 ms ở ~63% câu.
        var learner = Learner(Cat(Noise(300), Sine(1000), Noise(300), Sine(200), Noise(900), Sine(700), Noise(300)));
        var (c, o) = Run(learner, Reference());
        var pause = Assert.Single(o, x => x.Code == "extra_pause");
        Assert.InRange(pause.MeasuredValue, 800, 1000);
        Assert.Equal(1, c.ExtraPauseCount); // chỉ khoảng dừng thừa, không tính dừng tự nhiên
        Assert.Equal(2, c.LearnerPauseCount);
        Assert.Equal(true, pause.Data["positionReliable"]);
        Assert.Contains("giữa câu", pause.Message);
        Assert.Contains("giọng mẫu không dừng", pause.Message);
    }

    [Fact]
    public void TwoExtraPausesInTheMiddle_AreBothKeptInOneObservation()
    {
        // Hai khoảng dừng 450 ms ở ~41% và ~63% đoạn nói, đều ở giữa câu và đều không có ở giọng mẫu.
        var learner = Learner(Cat(Noise(300), Sine(1600), Noise(450), Sine(500), Noise(450), Sine(1400), Noise(300)));
        // Giọng mẫu đọc liền (không dừng) để không có khoảng dừng nào của người học bị coi là "khớp mẫu".
        var continuous = Analyzer.AnalyzeAnyRate(Wav(Cat(Noise(300, sr: 24000), Sine(2500, sr: 24000), Noise(300, sr: 24000)), 24000), TargetMoras);
        var (c, o) = Run(learner, continuous);
        var pause = Assert.Single(o, x => x.Code == "extra_pause");
        Assert.Equal(2, c.ExtraPauseCount);
        var pauses = Assert.IsType<List<ExtraPauseInfo>>(pause.Data["pauses"]);
        Assert.Equal(2, pauses.Count);
        Assert.True(pauses[0].StartMs < pauses[1].StartMs, "theo thứ tự thời gian");
        Assert.Contains("2 lần", pause.Message);
    }

    [Fact]
    public void DescribePauses_OnePause_UsesTheSingularSentence()
    {
        Assert.Equal(
            "Bạn dừng 2.7 giây sau 「棚に」, trước 「入れても」 mà giọng mẫu không dừng ở đó. Hãy thử đọc liền hơn.",
            FluencyComparer.DescribePauses(new[] { (2700, (string?)"sau 「棚に」, trước 「入れても」") }));
    }

    [Fact]
    public void DescribePauses_SeveralPauses_AreListedInTimeOrderWithTheirOwnPlaces()
    {
        var text = FluencyComparer.DescribePauses(new (int, string?)[]
        {
            (1100, "sau 「荷物を」, trước 「上の棚」"),
            (2700, "sau 「棚に」, trước 「入れても」"),
            (900, null), // chưa định vị được: chỉ nêu độ dài
        });
        Assert.Equal(
            "Bạn dừng thừa 3 lần mà giọng mẫu không dừng ở đó: 1.1 giây sau 「荷物を」, trước 「上の棚」; 2.7 giây sau 「棚に」, trước 「入れても」; 0.9 giây. Hãy thử đọc liền hơn.",
            text);
    }

    [Fact]
    public void DescribePauses_TooMany_KeepsTheLongestAndCountsTheRest()
    {
        var text = FluencyComparer.DescribePauses(new (int, string?)[]
        {
            (500, "A"), (2000, "B"), (600, "C"), (1500, "D"), (700, "E"),
        });
        // 3 khoảng dài nhất (B, D, E) theo thứ tự thời gian; A và C gộp vào "2 chỗ khác".
        Assert.Equal(
            "Bạn dừng thừa 5 lần mà giọng mẫu không dừng ở đó: 2.0 giây B; 1.5 giây D; 0.7 giây E (và 2 chỗ khác). Hãy thử đọc liền hơn.",
            text);
    }

    [Fact]
    public void LongPauseNearSentenceStart_IsNotReported_BecauseLearnersNeedTimeToPrepare()
    {
        // Dừng 900 ms ở ~28% câu (khoảng đầu câu): người học cần chuẩn bị nên không báo.
        var learner = Learner(Cat(Noise(300), Sine(500), Noise(900), Sine(500), Noise(300), Sine(1200), Noise(300)));
        var (c, o) = Run(learner, Reference());
        Assert.Equal(0, c.ExtraPauseCount);
        Assert.DoesNotContain(o, x => x.Code == "extra_pause");
    }

    [Fact]
    public void LongPauseNearSentenceEnd_IsNotReported()
    {
        // Dừng 900 ms ở ~80% câu (khoảng cuối câu) là bình thường: không báo "dừng thừa".
        var learner = Learner(Cat(Noise(300), Sine(1000), Noise(300), Sine(600), Noise(900), Sine(300), Noise(300)));
        var (c, o) = Run(learner, Reference());
        Assert.Equal(0, c.ExtraPauseCount);
        Assert.DoesNotContain(o, x => x.Code == "extra_pause");
    }

    [Fact]
    public void PauseWhereTheReferencePauses_IsNotExtra_EvenWhenLonger()
    {
        // Cùng vị trí dấu "。" với giọng mẫu nhưng dừng lâu hơn: không báo "dừng thừa".
        var (c, o) = Run(Learner(Utterance(pauseMs: 700)), Reference());
        Assert.Equal(0, c.ExtraPauseCount);
        Assert.DoesNotContain(o, x => x.Code == "extra_pause");
    }

    [Fact]
    public void ShortPause_BelowExtraThreshold_IsIgnored()
    {
        var learner = Learner(Cat(Noise(300), Sine(1000), Noise(300), Sine(200), Noise(300), Sine(700), Noise(300)));
        var (c, o) = Run(learner, Reference());
        Assert.Equal(0, c.ExtraPauseCount);
        Assert.Empty(o);
    }

    [Fact]
    public void ExtraPause_WhenTimelineDiffersALot_DoesNotClaimPosition()
    {
        // Người học nói chậm gấp đôi: trục thời gian không còn tương ứng nên không nêu vị trí (và không lọc theo vị trí).
        var learner = Learner(Cat(Noise(300), Sine(1000), Noise(1000), Sine(1000), Noise(300), Sine(2400), Noise(300)));
        var (_, o) = Run(learner, Reference());
        var pause = Assert.Single(o, x => x.Code == "extra_pause");
        Assert.Equal(false, pause.Data["positionReliable"]);
        Assert.DoesNotContain("khoảng", pause.Message);
    }

    [Fact]
    public void Observations_AreCappedAtConfiguredMaximum()
    {
        var cap1 = new FluencyComparisonOptions { MaxObservations = 1 };
        // Vừa chậm vừa dừng thừa: có hai nhận xét nhưng chỉ giữ một.
        var learner = Learner(Cat(Noise(300), Sine(1100), Noise(800), Sine(1100), Noise(300), Sine(2400), Noise(300)));
        var (_, o) = FluencyComparer.Compare(learner, Reference(), Good(), cap1);
        Assert.Single(o);
    }

    [Fact]
    public void Comparison_NeverProducesAScore()
    {
        var dto = Run(Learner(Utterance(speed: 1.8)), Reference()).c;
        Assert.Null(typeof(FluencyComparisonDto).GetProperty("Score"));
        Assert.Equal("available", dto.Status);
    }

    [Fact]
    public void Thresholds_CanBeOverriddenFromConfiguration()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Shadowing:Fluency:Comparison:SlowRatio"] = "0.9",
                ["Shadowing:Fluency:Comparison:MinContentMatch"] = "50",
            }).Build();
        var o = FluencyComparisonOptions.FromConfiguration(config);
        Assert.Equal(0.9, o.SlowRatio);
        Assert.Equal(50, o.MinContentMatch);
        Assert.Equal(new FluencyComparisonOptions().FastRatio, o.FastRatio); // không cấu hình thì giữ mặc định

        var (_, obs) = FluencyComparer.Compare(Learner(Utterance(speed: 1.2)), Reference(), Good(), o);
        Assert.Contains(obs, x => x.Code == "slow_vs_reference");
    }

    // ---- báo cáo: đếm nhận xét đúng / báo nhầm / bỏ sót / không đủ điều kiện (TÍN HIỆU TỔNG HỢP, không phải giọng người thật) ----

    [Fact]
    public void ScenarioReport_NoFalseAlarmsAndNoMisses_OnSyntheticSignals()
    {
        var reference = Reference();
        var scenarios = new (string name, FluencyMetricsDto learner, FluencyComparisonContext ctx, string[] expected, bool eligible)[]
        {
            ("đọc đúng nhịp",            Learner(Utterance()),                                     Good(), Array.Empty<string>(), true),
            ("lệch nhẹ (chậm 17%)",       Learner(Utterance(speed: 1.2)),                           Good(), Array.Empty<string>(), true),
            ("lệch nhẹ (nhanh 17%)",      Learner(Utterance(speed: 0.85)),                          Good(), Array.Empty<string>(), true),
            ("dừng đúng chỗ, lâu hơn",   Learner(Utterance(pauseMs: 700)),                         Good(), Array.Empty<string>(), true),
            ("đọc chậm",                  Learner(Utterance(speed: 1.8)),                           Good(), new[] { "slow_vs_reference" }, true),
            ("đọc rất chậm",              Learner(Utterance(speed: 2.5)),                           Good(), new[] { "slow_vs_reference" }, true),
            ("đọc nhanh",                 Learner(Utterance(speed: 0.55)),                          Good(), new[] { "fast_vs_reference" }, true),
            ("dừng dài đầu câu (chuẩn bị)", Learner(Cat(Noise(300), Sine(500), Noise(900), Sine(500), Noise(300), Sine(1200), Noise(300))), Good(), Array.Empty<string>(), true),
            ("dừng dài giữa câu",         Learner(Cat(Noise(300), Sine(1000), Noise(300), Sine(200), Noise(900), Sine(700), Noise(300))), Good(), new[] { "extra_pause" }, true),
            ("chậm + dừng thừa",          Learner(Cat(Noise(300), Sine(1100), Noise(800), Sine(1100), Noise(300), Sine(2400), Noise(300))), Good(), new[] { "extra_pause", "slow_vs_reference" }, true),
            ("im lặng",                   Learner(Zeros(2500)),                                     Good(), Array.Empty<string>(), false),
            ("chỉ có tiếng ồn",           Learner(Noise(3000, 0.05)),                               Good(), Array.Empty<string>(), false),
            ("audio lỗi",                 Analyzer.Analyze(new byte[400], TargetMoras),             Good(), Array.Empty<string>(), false),
            ("nói sai câu (nội dung thấp)", Learner(Utterance(speed: 1.8)),                         Good(content: 15), Array.Empty<string>(), false),
            ("transcript lệch số mora",   Learner(Utterance(speed: 1.8)),                           Good(content: 90, recognizedMoras: 9), Array.Empty<string>(), false),
        };

        int correct = 0, falseAlarms = 0, misses = 0, notEligible = 0;
        foreach (var (name, learner, ctx, expected, eligible) in scenarios)
        {
            var (c, o) = FluencyComparer.Compare(learner, reference, ctx, Options);
            if (!eligible)
            {
                notEligible++;
                Assert.Equal("unavailable", c.Status);
                Assert.Empty(o);
                continue;
            }

            var actual = Codes(o);
            var exp = expected.OrderBy(x => x).ToArray();
            falseAlarms += actual.Except(exp).Count();
            misses += exp.Except(actual).Count();
            correct += actual.Intersect(exp).Count();
            _output.WriteLine($"{name,-30} mong đợi=[{string.Join(",", exp)}] thực tế=[{string.Join(",", actual)}]");
        }

        _output.WriteLine($"Nhận xét đúng={correct}, báo nhầm={falseAlarms}, bỏ sót={misses}, không đủ điều kiện (đúng)={notEligible}");
        Assert.Equal(0, falseAlarms);
        Assert.Equal(0, misses);
        Assert.Equal(6, correct);
        Assert.Equal(5, notEligible);
    }
}
