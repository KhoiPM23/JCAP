using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using JCAP.Services.Implementations;
using JCAP.Tests.Services;
using Xunit.Abstractions;

namespace JCAP.Tests.Bench;

/// <summary>
/// Độ bền của nhận dạng âm vị khi bản ghi giống micro thật: nói nhỏ, ồn, phòng vọng, khoảng lặng dài kèm tiếng ù.
/// So các cấu hình xử lý trước khi nhận dạng (PhonemePreprocessing) để chọn mặc định bằng số liệu.
/// Cần chạy SpeechRecognitionBench trước (dùng lại audio và manifest.json đã cache). Chỉ chạy khi JCAP_BENCH=1.
/// Giọng tổng hợp + nhiễu giả lập: KHÔNG thay được thử với micro và giọng người thật.
/// </summary>
public class RecognitionRobustnessBench
{
    private readonly ITestOutputHelper _output;
    public RecognitionRobustnessBench(ITestOutputHelper output) => _output = output;

    private const int Sr = 16000;

    private static readonly (string Name, PhonemePreprocessing Config)[] Configs =
    {
        ("không xử lý", PhonemePreprocessing.None),
        ("lọc ù", new PhonemePreprocessing(true, false, false)),
        ("cắt lặng", new PhonemePreprocessing(false, true, false)),
        ("chuẩn hoá mức", new PhonemePreprocessing(false, false, true)),
        ("cả ba", new PhonemePreprocessing(true, true, true)),
        ("đệm lặng", new PhonemePreprocessing(false, false, false, PadEdges: true)),
        ("lọc ù + đệm lặng", new PhonemePreprocessing(true, false, false, PadEdges: true)),
        ("chuẩn hoá + đệm lặng", new PhonemePreprocessing(false, false, true, PadEdges: true)),
    };

    [BenchFact]
    public async Task Run()
    {
        var dir = Environment.GetEnvironmentVariable("JCAP_BENCH_DIR") is { Length: > 0 } d ? d : Path.Combine(Path.GetTempPath(), "jcap-bench");
        var manifestPath = Path.Combine(dir, "manifest.json");
        Assert.True(File.Exists(manifestPath), "Chạy SpeechRecognitionBench trước để có audio và manifest.json.");

        using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(manifestPath));
        var sentences = doc.RootElement.EnumerateArray()
            .Where(e => e.GetProperty("Kind").GetString() == "câu thường")
            .Select(e => (Id: e.GetProperty("Id").GetString()!, Spoken: e.GetProperty("Spoken").GetString()!, Wav: e.GetProperty("WavPath").GetString()!))
            .ToList();

        using var http = new HttpClient { BaseAddress = new Uri("http://127.0.0.1:50021"), Timeout = TimeSpan.FromSeconds(60) };
        var readings = new Dictionary<string, List<string>>();
        foreach (var s in sentences.Select(x => x.Spoken).Distinct()) readings[s] = Moras(await G2P(http, s));

        using var recognizer = ModelFactAttribute.CreateRecognizer();
        var rng = new Random(5);

        var conditions = new (string Name, Func<float[], float[]> Degrade)[]
        {
            ("sạch", x => x),
            ("nói nhỏ (−30 dB)", x => Scale(x, 0.03f)),
            ("ồn vừa (SNR 15 dB)", x => AddNoise(x, 15, rng)),
            ("ồn nặng (SNR 5 dB)", x => AddNoise(x, 5, rng)),
            ("phòng vọng", x => Reverb(x, rng)),
            ("lặng dài + ù điện", x => PadWithHum(x, rng)),
        };

        var sb = new StringBuilder();
        sb.AppendLine("# Độ bền nhận dạng âm vị (giọng VOICEVOX + nhiễu giả lập)");
        sb.AppendLine();
        sb.AppendLine($"Tỷ lệ lỗi mora trên {sentences.Count} câu thường (thấp hơn là tốt hơn). Dòng cuối mỗi điều kiện: số câu đúng hoàn toàn.");
        sb.AppendLine();
        sb.AppendLine("| Điều kiện | " + string.Join(" | ", Configs.Select(c => c.Name)) + " |");
        sb.AppendLine("|---|" + string.Concat(Configs.Select(_ => "---|")));

        var totals = new double[Configs.Length];
        foreach (var (name, degrade) in conditions)
        {
            var row = new List<string>();
            for (int c = 0; c < Configs.Length; c++)
            {
                int edits = 0, total = 0, exact = 0;
                foreach (var s in sentences)
                {
                    var clean = WavPcmReader.ResampleTo16k(WavPcmReader.ReadMonoAnyRate(await File.ReadAllBytesAsync(s.Wav), out var rate), rate);
                    var audio = degrade(clean);
                    var kana = recognizer.Recognize(audio, Configs[c].Config)?.Kana ?? string.Empty;
                    var e = Distance(Moras(kana), readings[s.Spoken]);
                    edits += e; total += readings[s.Spoken].Count; if (e == 0) exact++;
                }
                var mer = 100.0 * edits / Math.Max(1, total);
                totals[c] += mer;
                row.Add($"{mer:0.0}% ({exact})");
            }
            sb.AppendLine($"| {name} | " + string.Join(" | ", row) + " |");
        }
        sb.AppendLine($"| **trung bình** | " + string.Join(" | ", totals.Select(t => $"**{t / conditions.Length:0.0}%**")) + " |");

        // Không được biến im lặng/nền ồn thành chữ khi có xử lý trước (chuẩn hoá mức không được khuếch đại nền ồn).
        sb.AppendLine();
        sb.AppendLine("Im lặng / nền ồn (mora nhận được, nên là 0):");
        var nonSpeech = new (string Name, float[] Audio)[]
        {
            ("im lặng", new float[Sr * 2]),
            ("nền phòng", Enumerable.Range(0, Sr * 2).Select(_ => (float)((rng.NextDouble() * 2 - 1) * 0.002)).ToArray()),
            ("ồn trắng", Enumerable.Range(0, Sr * 2).Select(_ => (float)((rng.NextDouble() * 2 - 1) * 0.05)).ToArray()),
            ("ù 50 Hz", Enumerable.Range(0, Sr * 2).Select(i => (float)(0.05 * Math.Sin(2 * Math.PI * 50 * i / Sr))).ToArray()),
        };
        foreach (var (cname, config) in Configs)
            sb.AppendLine($"- {cname}: " + string.Join(", ", nonSpeech.Select(n => $"{n.Name} {Moras(recognizer.Recognize(n.Audio, config)?.Kana ?? "").Count}")));

        var path = Path.Combine(dir, "robustness-report.md");
        await File.WriteAllTextAsync(path, sb.ToString());
        _output.WriteLine(sb.ToString());
    }

    private static float[] Scale(float[] x, float g) => x.Select(v => v * g).ToArray();

    private static double SpeechRms(float[] x)
    {
        var loud = x.Select(v => (double)v * v).OrderByDescending(v => v).Take(Math.Max(1, x.Length / 2)).ToList();
        return Math.Sqrt(loud.Average());
    }

    private static float[] AddNoise(float[] x, double snrDb, Random rng)
    {
        var noiseRms = SpeechRms(x) / Math.Pow(10, snrDb / 20);
        var amp = noiseRms * Math.Sqrt(3); // nhiễu đều trong [-a, a] có RMS = a/√3
        return x.Select(v => (float)(v + (rng.NextDouble() * 2 - 1) * amp)).ToArray();
    }

    /// <summary>Phòng vọng giả lập: tích chập với đáp ứng xung là nhiễu tắt dần (~0.4 s), trộn 50% tiếng vọng.</summary>
    private static float[] Reverb(float[] x, Random rng)
    {
        int len = (int)(0.4 * Sr);
        var ir = new float[len];
        for (int i = 0; i < len; i++) ir[i] = (float)((rng.NextDouble() * 2 - 1) * Math.Exp(-6.9 * i / len));
        // Tích chập thưa (mỗi 8 mẫu một tap) để chạy nhanh; đủ cho mục đích thử độ bền.
        var y = new float[x.Length + len];
        for (int k = 0; k < len; k += 8)
        {
            var g = ir[k] * 0.15f;
            if (g == 0) continue;
            for (int i = 0; i < x.Length; i++) y[i + k] += x[i] * g;
        }
        var outp = new float[x.Length + len];
        for (int i = 0; i < outp.Length; i++) outp[i] = (i < x.Length ? x[i] : 0) + y[i];
        var peak = outp.Max(v => Math.Abs(v));
        return peak > 0.99f ? outp.Select(v => v * 0.99f / peak).ToArray() : outp;
    }

    private static float[] PadWithHum(float[] x, Random rng)
    {
        int pad = (int)(1.5 * Sr);
        var total = new float[x.Length + 2 * pad];
        for (int i = 0; i < total.Length; i++)
        {
            var hum = 0.02 * Math.Sin(2 * Math.PI * 50 * i / Sr);
            var room = (rng.NextDouble() * 2 - 1) * 0.002;
            total[i] = (float)(hum + room + (i >= pad && i < pad + x.Length ? x[i - pad] : 0));
        }
        return total;
    }

    private static List<string> Moras(string kana) => JapaneseMora.FromKana(kana, preserveLongVowelSpelling: false).Select(m => m.Canon).ToList();

    private static int Distance(List<string> a, List<string> b)
    {
        var d = new int[a.Count + 1, b.Count + 1];
        for (int i = 0; i <= a.Count; i++) d[i, 0] = i;
        for (int j = 0; j <= b.Count; j++) d[0, j] = j;
        for (int i = 1; i <= a.Count; i++)
            for (int j = 1; j <= b.Count; j++)
                d[i, j] = Math.Min(Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1), d[i - 1, j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1));
        return d[a.Count, b.Count];
    }

    private static async Task<string> G2P(HttpClient http, string text)
    {
        var res = await http.PostAsync($"/audio_query?text={Uri.EscapeDataString(text)}&speaker=3", null);
        var node = JsonNode.Parse(await res.Content.ReadAsStringAsync())!;
        var sb = new StringBuilder();
        foreach (var ap in node["accent_phrases"]!.AsArray())
            foreach (var m in ap!["moras"]!.AsArray()) sb.Append(m!["text"]!.GetValue<string>());
        return sb.ToString();
    }
}
