using System.Diagnostics;
using System.Text;
using System.Text.Json;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using JCAP.Tests.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit.Abstractions;

namespace JCAP.Tests.Bench;

/// <summary>
/// Chỉnh ngưỡng cho việc chấm THEO CÂU MẪU (PronunciationAligner) bằng giọng VOICEVOX, so với nhận dạng tự do.
/// Dùng lại audio + manifest.json của SpeechRecognitionBench (chạy nó trước). Cần VOICEVOX để lấy cách đọc câu mẫu.
/// Chạy: JCAP_BENCH=1 [JCAP_BENCH_DIR=...] dotnet test JCAP.Tests --filter "FullyQualifiedName~AlignmentBench"
///
/// Đo cho mỗi ngưỡng Margin:
///  - Đọc đúng (câu thường + bản đúng của cặp tối thiểu, có và không có tiếng ồn): bao nhiêu mora bị báo nhầm, điểm trung bình.
///  - Cố ý đọc sai một âm: có phát hiện không (điểm &lt; 100) và có nghe ra đúng kiểu sai không.
///  - Đọc câu khác: chỉ số "lệch câu mẫu" có tách được với đọc đúng/đọc sai một âm không.
/// </summary>
public class AlignmentBench
{
    private readonly ITestOutputHelper _output;
    public AlignmentBench(ITestOutputHelper output) => _output = output;

    private static readonly (double Margin, double Vowel)[] Settings = { (2, 2), (3, 2), (3, 3), (4, 0), (4, 2), (4, 3), (5, 2), (6, 2) };

    private sealed record Item(string Id, string Kind, string Spoken, string Target, string? Wrong, string WavPath);

    [BenchFact]
    public async Task Run()
    {
        var dir = Environment.GetEnvironmentVariable("JCAP_BENCH_DIR") is { Length: > 0 } d ? d : Path.Combine(Path.GetTempPath(), "jcap-bench");
        var manifestPath = Path.Combine(dir, "manifest.json");
        Assert.True(File.Exists(manifestPath), "Chạy SpeechRecognitionBench trước để có audio và manifest.json.");
        var items = JsonSerializer.Deserialize<List<Item>>(await File.ReadAllTextAsync(manifestPath))!
            .Where(i => i.Kind is not ("im lặng" or "tiếng ồn")).ToList();

        var config = new ConfigurationBuilder().Build();
        VoiceVoxKanaReader.ResetStateForTests();
        var reader = new VoiceVoxKanaReader(new HttpClient(), config, NullLogger<VoiceVoxKanaReader>.Instance);
        var comparer = new KanaMoraComparer(new IKanaReader[] { reader });
        using var recognizer = ModelFactAttribute.CreateRecognizer();

        var readings = new Dictionary<string, KanaReading>();
        async Task<KanaReading> ReadingOf(string text)
        {
            if (readings.TryGetValue(text, out var r)) return r;
            r = await comparer.ReadTargetAsync(text) ?? throw new InvalidOperationException($"Không đọc được {text} (VOICEVOX có bật không?)");
            readings[text] = r;
            return r;
        }

        var rng = new Random(11);
        var recog = new Dictionary<string, PhonemeRecognitionResult>();
        var noisy = new Dictionary<string, PhonemeRecognitionResult>();
        foreach (var item in items)
        {
            var audio = WavPcmReader.ResampleTo16k(WavPcmReader.ReadMonoAnyRate(await File.ReadAllBytesAsync(item.WavPath), out var rate), rate);
            recog[item.Id] = recognizer.Recognize(audio)!;
            if (item.Kind == "câu thường") noisy[item.Id] = recognizer.Recognize(AddNoise(audio, 10, rng))!;
            await ReadingOf(item.Target);
            if (item.Wrong != null) await ReadingOf(item.Wrong);
        }

        var regular = items.Where(i => i.Kind == "câu thường").ToList();
        var pairCorrect = items.Where(i => i.Wrong != null && i.Spoken == i.Target).ToList();
        var pairWrong = items.Where(i => i.Wrong != null && i.Spoken == i.Wrong).ToList();
        var sentences = regular.Select(i => i.Target).Distinct().ToList();

        var sb = new StringBuilder();
        sb.AppendLine("# Chấm theo câu mẫu (giọng VOICEVOX)");
        sb.AppendLine();
        sb.AppendLine($"Câu thường đọc đúng n={regular.Count} (và cùng các câu đó thêm ồn SNR 10 dB), cặp tối thiểu đọc đúng n={pairCorrect.Count}, đọc sai một âm n={pairWrong.Count}.");
        sb.AppendLine("Báo nhầm = % mora bị đánh lỗi khi đọc đúng. Phát hiện = % bản đọc sai bị trừ điểm. Đúng kiểu = chuỗi đã nghe trùng đúng câu sai.");
        sb.AppendLine();

        // Nhận dạng tự do (cách đang dùng) để so
        var freeRegular = await Avg(regular, i => comparer.CompareWithReadingAsync(i.Target, recog[i.Id].Kana));
        var freeNoisy = await Avg(regular, i => comparer.CompareWithReadingAsync(i.Target, noisy[i.Id].Kana));
        var freeWrongScores = new List<int>();
        foreach (var i in pairWrong) freeWrongScores.Add((await comparer.CompareWithReadingAsync(i.Target, recog[i.Id].Kana)).ContentMatchScore);
        sb.AppendLine($"Nhận dạng tự do (đang dùng): đọc đúng điểm TB {freeRegular.avg:0} ({freeRegular.perfect}/{regular.Count} đạt 100), có ồn {freeNoisy.avg:0} ({freeNoisy.perfect}/{regular.Count}), đọc sai một âm phát hiện {freeWrongScores.Count(s => s < 100)}/{pairWrong.Count}.");
        sb.AppendLine();

        sb.AppendLine("| Margin (+nguyên âm) | Báo nhầm (sạch) | Câu đúng đạt 100 | Báo nhầm (ồn) | Câu ồn đạt 100 | Cặp đúng đạt 100 | Phát hiện lỗi | Đúng kiểu | ms/câu |");
        sb.AppendLine("|---|---|---|---|---|---|---|---|---|");
        foreach (var (margin, vowel) in Settings)
        {
            var o = new AlignmentOptions { Margin = margin, VowelExtraMargin = vowel, MaxMismatchPerFrame = double.MaxValue };
            var watch = Stopwatch.StartNew();
            var clean = Judge(regular, recog, o, readings, comparer);
            watch.Stop();
            var noise = Judge(regular, noisy, o, readings, comparer);
            var pc = Judge(pairCorrect, recog, o, readings, comparer);
            var pw = Judge(pairWrong, recog, o, readings, comparer);
            var faithful = pairWrong.Count(i => Canon(pw.heard[i.Id]) == Canon(readings[i.Wrong!].Moras));
            sb.AppendLine($"| {margin} (+{vowel}) | {clean.falseRate:0.0}% | {clean.perfect}/{regular.Count} | {noise.falseRate:0.0}% | {noise.perfect}/{regular.Count} | {pc.perfect}/{pairCorrect.Count} | {pw.detected}/{pairWrong.Count} | {faithful}/{pairWrong.Count} | {watch.Elapsed.TotalMilliseconds / regular.Count:0} |");
        }

        // Chi tiết theo loại lỗi ở Margin mặc định
        var def = new AlignmentOptions { MaxMismatchPerFrame = double.MaxValue };
        var pwDef = Judge(pairWrong, recog, def, readings, comparer);
        var pcDef = Judge(pairCorrect, recog, def, readings, comparer);
        sb.AppendLine();
        sb.AppendLine($"Theo loại lỗi (Margin {def.Margin}): phát hiện khi đọc sai / báo nhầm khi đọc đúng; ví dụ chuỗi đã nghe.");
        sb.AppendLine();
        sb.AppendLine("| Loại | Phát hiện | Đúng kiểu | Đọc đúng bị trừ | Ví dụ (sai → đã nghe) |");
        sb.AppendLine("|---|---|---|---|---|");
        foreach (var g in pairWrong.GroupBy(i => i.Kind))
        {
            var list = g.ToList();
            var correctOnes = pairCorrect.Where(i => i.Kind == g.Key).ToList();
            var det = list.Count(i => pwDef.scores[i.Id] < 100);
            var fai = list.Count(i => Canon(pwDef.heard[i.Id]) == Canon(readings[i.Wrong!].Moras));
            var fa = correctOnes.Count(i => pcDef.scores[i.Id] < 100);
            var ex = list[0];
            sb.AppendLine($"| {g.Key} | {det}/{list.Count} | {fai}/{list.Count} | {fa}/{correctOnes.Count} | {ex.Wrong} → {JapaneseMora.Join(pwDef.heard[ex.Id])} |");
        }

        // Câu đọc đúng bị trừ: liệt kê vài ví dụ để biết báo nhầm kiểu gì
        var regDef = Judge(regular, recog, def, readings, comparer);
        sb.AppendLine();
        sb.AppendLine("Ví dụ đọc ĐÚNG mà vẫn bị đánh lỗi (Margin mặc định):");
        foreach (var i in regular.Where(i => regDef.scores[i.Id] < 100).Take(10))
            sb.AppendLine($"- {i.Id}: {i.Target} → {JapaneseMora.Join(regDef.heard[i.Id])} ({string.Join(", ", regDef.judgements[i.Id].Where(j => j.Kind is not ("ok" or "unjudged")).Select(j => $"{j.Target}:{j.Kind}:{j.Heard}:{j.Gain}"))})");

        // Lệch câu mẫu: đọc đúng / đọc sai một âm / đọc câu khác
        var mm = def with { MaxMismatchPerFrame = double.MaxValue };
        var mCorrect = regular.Select(i => Align(i.Target, recog[i.Id], mm, readings)!.MismatchPerFrame).ToList();
        var mNoisy = regular.Select(i => Align(i.Target, noisy[i.Id], mm, readings)!.MismatchPerFrame).ToList();
        var mWrong = pairWrong.Select(i => Align(i.Target, recog[i.Id], mm, readings)!.MismatchPerFrame).ToList();
        var mOther = regular.Select(i => Align(sentences[(sentences.IndexOf(i.Target) + 7) % sentences.Count], recog[i.Id], mm, readings)!.MismatchPerFrame).ToList();
        sb.AppendLine();
        sb.AppendLine("Chỉ số lệch câu mẫu (nat/khung có tiếng): trung vị / p95 / lớn nhất, và nhỏ nhất / p5 cho câu khác.");
        sb.AppendLine($"- đọc đúng: {Q(mCorrect, 0.5):0.00} / {Q(mCorrect, 0.95):0.00} / {mCorrect.Max():0.00}");
        sb.AppendLine($"- đọc đúng + ồn: {Q(mNoisy, 0.5):0.00} / {Q(mNoisy, 0.95):0.00} / {mNoisy.Max():0.00}");
        sb.AppendLine($"- đọc sai một âm: {Q(mWrong, 0.5):0.00} / {Q(mWrong, 0.95):0.00} / {mWrong.Max():0.00}");
        sb.AppendLine($"- đọc CÂU KHÁC: nhỏ nhất {mOther.Min():0.00}, p5 {Q(mOther, 0.05):0.00}, trung vị {Q(mOther, 0.5):0.00}");

        await File.WriteAllTextAsync(Path.Combine(dir, "alignment-report.md"), sb.ToString());
        _output.WriteLine(sb.ToString());
    }

    private static AlignedRecognition? Align(string target, PhonemeRecognitionResult r, AlignmentOptions o, Dictionary<string, KanaReading> readings) =>
        PronunciationAligner.Align(readings[target].Moras, r.LogProbabilities, r.Labels, o);

    private static (double falseRate, int perfect, int detected, Dictionary<string, int> scores, Dictionary<string, IReadOnlyList<Mora>> heard, Dictionary<string, IReadOnlyList<MoraJudgement>> judgements)
        Judge(List<Item> items, Dictionary<string, PhonemeRecognitionResult> recog, AlignmentOptions o, Dictionary<string, KanaReading> readings, KanaMoraComparer comparer)
    {
        int flagged = 0, total = 0, perfect = 0, detected = 0;
        var scores = new Dictionary<string, int>();
        var heard = new Dictionary<string, IReadOnlyList<Mora>>();
        var judgements = new Dictionary<string, IReadOnlyList<MoraJudgement>>();
        foreach (var i in items)
        {
            var a = Align(i.Target, recog[i.Id], o, readings) ?? throw new InvalidOperationException($"Không chấm được {i.Id}");
            var c = comparer.CompareHeard(i.Target, readings[i.Target], a.Heard);
            flagged += a.Moras.Count(m => m.Kind is not ("ok" or "unjudged"));
            total += a.Moras.Count;
            if (c.ContentMatchScore == 100) perfect++; else detected++;
            scores[i.Id] = c.ContentMatchScore;
            heard[i.Id] = a.Heard;
            judgements[i.Id] = a.Moras;
        }
        return (100.0 * flagged / Math.Max(1, total), perfect, detected, scores, heard, judgements);
    }

    private static async Task<(double avg, int perfect)> Avg(List<Item> items, Func<Item, Task<JapaneseTextComparison>> compare)
    {
        var s = new List<int>();
        foreach (var i in items) s.Add((await compare(i)).ContentMatchScore);
        return (s.Average(), s.Count(x => x == 100));
    }

    private static string Canon(IEnumerable<Mora> moras) => string.Concat(moras.Select(m => m.Canon));

    private static double Q(List<double> values, double q)
    {
        var sorted = values.OrderBy(v => v).ToList();
        return sorted[(int)Math.Clamp(Math.Round(q * (sorted.Count - 1)), 0, sorted.Count - 1)];
    }

    private static float[] AddNoise(float[] x, double snrDb, Random rng)
    {
        var loud = x.Select(v => (double)v * v).OrderByDescending(v => v).Take(Math.Max(1, x.Length / 2)).Average();
        var amp = Math.Sqrt(loud) / Math.Pow(10, snrDb / 20) * Math.Sqrt(3);
        return x.Select(v => (float)(v + (rng.NextDouble() * 2 - 1) * amp)).ToArray();
    }
}
