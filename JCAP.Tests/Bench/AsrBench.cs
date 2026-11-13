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

/// <summary>Chạy khi JCAP_BENCH=1 và có JCAP_ASR_URL (dịch vụ tools/shadowing-asr đang chạy). Cần VOICEVOX để lấy cách đọc.</summary>
public sealed class AsrBenchFactAttribute : FactAttribute
{
    public AsrBenchFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("JCAP_BENCH") != "1" || string.IsNullOrEmpty(Environment.GetEnvironmentVariable("JCAP_ASR_URL")))
            Skip = "Benchmark ASR: đặt JCAP_BENCH=1 và JCAP_ASR_URL (vd. http://127.0.0.1:50023), chạy dịch vụ Faster-Whisper và VOICEVOX.";
    }
}

/// <summary>
/// Benchmark ASR cho chiều Content (Shadowing V2, Milestone "Faster-Whisper Integration").
/// Đo trên: (1) giọng VOICEVOX của SpeechRecognitionBench (manifest.json) — câu đọc đúng và cặp tối thiểu đọc SAI một âm;
/// (2) bản ghi giọng thật trong JCAP_REAL_DIR (cặp .wav + .json tải từ trang luyện) nếu có.
/// Chỉ số: CER theo cách đọc (mora), tỷ lệ câu đúng hoàn toàn, FALSE ACCEPTANCE (đọc sai mà ASR "sửa" thành câu đúng —
/// lý do ASR không được dùng để chấm phát âm), độ trễ p50/p95, tỷ lệ lỗi dịch vụ. Báo cáo: asr-report-{model}.md.
/// VOICEVOX là giọng tổng hợp: KHÔNG kết luận chất lượng trên giọng người học từ phần (1).
/// </summary>
public class AsrBench
{
    private readonly ITestOutputHelper _output;
    public AsrBench(ITestOutputHelper output) => _output = output;

    private sealed record Item(string Id, string Kind, string Spoken, string Target, string? Wrong, string WavPath);

    [AsrBenchFact]
    public async Task Run()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Shadowing:Asr:BaseUrl"] = Environment.GetEnvironmentVariable("JCAP_ASR_URL"),
            ["Shadowing:Asr:Token"] = Environment.GetEnvironmentVariable("JCAP_ASR_TOKEN"),
            ["Shadowing:Asr:TimeoutMs"] = "60000",
        }).Build();
        var asr = new FasterWhisperSpeechRecognitionService(new HttpClient(), config, NullLogger<FasterWhisperSpeechRecognitionService>.Instance);
        var health = await asr.CheckHealthAsync();
        Assert.True(health.Available, $"Dịch vụ ASR không sẵn sàng: {health.Error}");

        VoiceVoxKanaReader.ResetStateForTests();
        var reader = new VoiceVoxKanaReader(new HttpClient(), new ConfigurationBuilder().Build(), NullLogger<VoiceVoxKanaReader>.Instance);
        async Task<List<string>> ReadingOf(string text, string? kana = null)
        {
            if (kana != null) return Moras(kana);
            var r = await reader.ReadForGenerationAsync(text);
            return r == null ? new List<string>() : r.Moras.Select(m => m.Canon).ToList();
        }

        var dir = Environment.GetEnvironmentVariable("JCAP_BENCH_DIR") is { Length: > 0 } d ? d : Path.Combine(Path.GetTempPath(), "jcap-bench");
        var manifest = Path.Combine(dir, "manifest.json");
        var items = File.Exists(manifest)
            ? JsonSerializer.Deserialize<List<Item>>(await File.ReadAllTextAsync(manifest))!.Where(i => i.Kind is not ("im lặng" or "tiếng ồn")).ToList()
            : new List<Item>();
        var limit = int.TryParse(Environment.GetEnvironmentVariable("JCAP_ASR_BENCH_LIMIT"), out var l) ? l : int.MaxValue;

        var latencies = new List<int>();
        int failures = 0;
        var sb = new StringBuilder();
        var model = health.Model ?? "?";
        sb.AppendLine($"# Benchmark ASR — {asr.Provider} `{model}`");
        sb.AppendLine();
        sb.AppendLine($"Dịch vụ: {Environment.GetEnvironmentVariable("JCAP_ASR_URL")}; cách đọc transcript từ dịch vụ: {(health.ReadingAvailable ? "có (OpenJTalk)" : "không (dùng VOICEVOX G2P)")}.");
        sb.AppendLine();

        async Task<(string text, List<string> reading)?> Recognize(byte[] wav16k)
        {
            var watch = Stopwatch.StartNew();
            var r = await asr.RecognizeAsync(new SpeechRecognitionRequest { Wav = wav16k });
            watch.Stop();
            if (!r.IsCompleted) { failures++; return null; }
            latencies.Add(r.ProcessingMs > 0 ? r.ProcessingMs : (int)watch.ElapsedMilliseconds);
            return (r.Text, await ReadingOf(r.Text, r.Reading));
        }

        // (1) VOICEVOX
        if (items.Count > 0)
        {
            var regular = items.Where(i => i.Kind == "câu thường").Take(limit).ToList();
            var wrong = items.Where(i => i.Wrong != null && i.Spoken == i.Wrong).Take(limit).ToList();
            int edits = 0, total = 0, exact = 0;
            foreach (var i in regular)
            {
                var r = await Recognize(To16kWav(i.WavPath));
                var target = await ReadingOf(i.Target);
                total += target.Count;
                if (r == null) { edits += target.Count; continue; }
                var e = Distance(r.Value.reading, target);
                edits += e;
                if (e == 0) exact++;
            }
            int falseAccept = 0, faithful = 0;
            var examples = new List<string>();
            foreach (var i in wrong)
            {
                var r = await Recognize(To16kWav(i.WavPath));
                if (r == null) continue;
                var correct = await ReadingOf(i.Target);
                var wrongReading = await ReadingOf(i.Wrong!);
                if (Distance(r.Value.reading, correct) == 0) { falseAccept++; if (examples.Count < 8) examples.Add($"{i.Kind}: đọc 「{i.Wrong}」 → ASR 「{r.Value.text}」"); }
                if (Distance(r.Value.reading, wrongReading) == 0) faithful++;
            }
            sb.AppendLine("## Giọng VOICEVOX (tổng hợp — chỉ để so sánh model, không đại diện người học)");
            sb.AppendLine();
            sb.AppendLine($"- Câu đọc đúng (n={regular.Count}): CER theo mora **{100.0 * edits / Math.Max(1, total):0.0}%**, đúng hoàn toàn {exact}/{regular.Count}");
            sb.AppendLine($"- Đọc SAI một âm (n={wrong.Count}): ASR nghe ra đúng câu sai {faithful}/{wrong.Count}; **false acceptance** (\"sửa\" thành câu đúng) {falseAccept}/{wrong.Count}");
            foreach (var e in examples) sb.AppendLine($"  - {e}");
            sb.AppendLine();
        }

        // (2) Giọng thật (nếu có)
        var realDir = Environment.GetEnvironmentVariable("JCAP_REAL_DIR");
        if (!string.IsNullOrEmpty(realDir) && Directory.Exists(realDir))
        {
            sb.AppendLine("## Giọng thật (bản ghi tải từ trang luyện)");
            sb.AppendLine();
            sb.AppendLine("| Lượt | Câu mẫu | ASR | Lỗi mora | Nhãn (nếu có) |");
            sb.AppendLine("|---|---|---|---|---|");
            int edits = 0, total = 0;
            foreach (var json in Directory.GetFiles(realDir, "*.json").OrderBy(f => f))
            {
                var wavPath = Path.ChangeExtension(json, ".wav");
                if (!File.Exists(wavPath)) continue;
                using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(json));
                if (!doc.RootElement.TryGetProperty("targetText", out var t) || t.GetString() is not { Length: > 0 } target) continue;
                var label = doc.RootElement.TryGetProperty("label", out var lb) ? lb.GetString() : null;
                var r = await Recognize(To16kWav(wavPath));
                var reading = await ReadingOf(target);
                total += reading.Count;
                var e = r == null ? reading.Count : Distance(r.Value.reading, reading);
                edits += e;
                sb.AppendLine($"| {Path.GetFileNameWithoutExtension(json)} | {target} | {r?.text ?? "(lỗi)"} | {e} | {label} |");
            }
            sb.AppendLine($"| **tổng** | | | **{100.0 * edits / Math.Max(1, total):0.0}%** | |");
            sb.AppendLine();
        }

        latencies.Sort();
        sb.AppendLine($"Độ trễ xử lý (dịch vụ): p50 {Q(latencies, 0.5)} ms, p95 {Q(latencies, 0.95)} ms; lỗi dịch vụ {failures}.");
        sb.AppendLine("RAM/VRAM/CPU: đo bằng công cụ hệ điều hành trong lúc chạy (dịch vụ không tự báo).");

        var path = Path.Combine(dir, $"asr-report-{model.Replace('/', '_')}.md");
        Directory.CreateDirectory(dir);
        await File.WriteAllTextAsync(path, sb.ToString());
        _output.WriteLine(sb.ToString());
    }

    private static byte[] To16kWav(string path)
    {
        var samples = WavPcmReader.ResampleTo16k(WavPcmReader.ReadMonoAnyRate(File.ReadAllBytes(path), out var rate), rate);
        return TestAudio.Wav(samples);
    }

    private static int Q(List<int> sorted, double q) =>
        sorted.Count == 0 ? 0 : sorted[(int)Math.Clamp(Math.Round(q * (sorted.Count - 1)), 0, sorted.Count - 1)];

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
}
