using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using JCAP.Tests.Services;
using Xunit.Abstractions;

namespace JCAP.Tests.Bench;

/// <summary>
/// Đo nhận dạng âm vị trên bản ghi giọng thật tải từ trang luyện Shadowing (nút "Tải bản ghi" ở chế độ phát triển):
/// mỗi lượt là một cặp jcap-s{id}-{thời gian}.wav + .json (câu mẫu, cấu hình micro, kết quả lúc chấm).
/// Đặt JCAP_BENCH=1, JCAP_REAL_DIR=&lt;thư mục chứa các cặp file&gt;, bật VOICEVOX (để lấy cách đọc câu mẫu).
/// Kết quả ghi ra real-report.md trong cùng thư mục. Bản ghi chỉ đọc tại chỗ, không chép đi đâu.
/// </summary>
public class RealRecordingBench
{
    private readonly ITestOutputHelper _output;
    public RealRecordingBench(ITestOutputHelper output) => _output = output;

    private static readonly (string Name, PhonemePreprocessing Config)[] Configs =
    {
        ("không xử lý", PhonemePreprocessing.None),
        ("mặc định (lọc ù + đệm)", PhonemePreprocessing.Default),
        ("chuẩn hoá + đệm", new PhonemePreprocessing(false, false, true, PadEdges: true)),
        ("lọc ù + chuẩn hoá + đệm", new PhonemePreprocessing(true, false, true, PadEdges: true)),
    };

    [BenchFact]
    public async Task Run()
    {
        var dir = Environment.GetEnvironmentVariable("JCAP_REAL_DIR");
        Assert.False(string.IsNullOrWhiteSpace(dir), "Đặt JCAP_REAL_DIR là thư mục chứa các cặp .wav + .json tải từ trang luyện.");
        Assert.True(Directory.Exists(dir), $"Không thấy thư mục {dir}.");

        var takes = new List<(string Name, string Target, float[] Audio, JsonElement Meta)>();
        foreach (var json in Directory.GetFiles(dir!, "*.json").OrderBy(f => f))
        {
            var wav = Path.ChangeExtension(json, ".wav");
            if (!File.Exists(wav)) continue;
            using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(json));
            if (!doc.RootElement.TryGetProperty("targetText", out var t) || t.GetString() is not { Length: > 0 } target) continue;
            var audio = WavPcmReader.ResampleTo16k(WavPcmReader.ReadMonoAnyRate(await File.ReadAllBytesAsync(wav), out var rate), rate);
            takes.Add((Path.GetFileNameWithoutExtension(json), target, audio, doc.RootElement.Clone()));
        }
        Assert.True(takes.Count > 0, "Không có cặp .wav + .json hợp lệ nào.");

        using var http = new HttpClient { BaseAddress = new Uri("http://127.0.0.1:50021"), Timeout = TimeSpan.FromSeconds(60) };
        var readings = new Dictionary<string, List<string>>();
        foreach (var s in takes.Select(x => x.Target).Distinct())
            readings[s] = Moras(await G2P(http, VoiceVoxKanaReader.ForEngine(s)));

        using var recognizer = ModelFactAttribute.CreateRecognizer();

        var sb = new StringBuilder();
        sb.AppendLine("# Nhận dạng âm vị trên bản ghi giọng thật");
        sb.AppendLine();
        sb.AppendLine($"{takes.Count} lượt. Tỷ lệ lỗi mora so với cách đọc VOICEVOX của câu mẫu (thấp hơn là tốt hơn).");
        sb.AppendLine("Bản ghi cố ý nói sai thì lỗi cao là ĐÚNG; xem cột nhận được để biết mô hình nghe ra gì.");
        sb.AppendLine();
        sb.AppendLine("| Lượt | Câu mẫu (đọc) | Micro | Thu trước | " + string.Join(" | ", Configs.Select(c => c.Name)) + " | Nhận được (mặc định) | Web Speech |");
        sb.AppendLine("|---|---|---|---|" + string.Concat(Configs.Select(_ => "---|")) + "---|---|");

        var edits = new int[Configs.Length];
        var total = 0;
        foreach (var take in takes)
        {
            var target = readings[take.Target];
            total += target.Count;
            var cells = new List<string>();
            string defaultKana = "";
            for (int c = 0; c < Configs.Length; c++)
            {
                var kana = recognizer.Recognize(take.Audio, Configs[c].Config)?.Kana ?? string.Empty;
                if (Configs[c].Config == PhonemePreprocessing.Default) defaultKana = kana;
                var e = Distance(Moras(kana), target);
                edits[c] += e;
                cells.Add($"{100.0 * e / Math.Max(1, target.Count):0}%");
            }
            var processing = take.Meta.TryGetProperty("voiceProcessing", out var vp) && vp.ValueKind == JsonValueKind.False ? "thô" : "khử nhiễu";
            var preroll = take.Meta.TryGetProperty("prerollMs", out var pr) && pr.TryGetInt32(out var ms) ? $"{ms} ms" : "?";
            var webSpeech = take.Meta.TryGetProperty("webSpeech", out var ws) && ws.TryGetProperty("transcript", out var tr) ? tr.GetString() ?? "" : "";
            sb.AppendLine($"| {take.Name} | {take.Target} ({string.Concat(target)}) | {processing} | {preroll} | {string.Join(" | ", cells)} | {defaultKana} | {webSpeech} |");
        }
        sb.AppendLine($"| **tổng** | | | | " + string.Join(" | ", edits.Select(e => $"**{100.0 * e / Math.Max(1, total):0.0}%**")) + " | | |");

        // Cách chấm trong ứng dụng: nhận dạng tự do so với chấm theo câu mẫu (cùng bản ghi, xử lý trước mặc định).
        VoiceVoxKanaReader.ResetStateForTests();
        var comparer = new KanaMoraComparer(new IKanaReader[]
        {
            new VoiceVoxKanaReader(new HttpClient(), new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build(),
                Microsoft.Extensions.Logging.Abstractions.NullLogger<VoiceVoxKanaReader>.Instance),
        });
        sb.AppendLine();
        sb.AppendLine("## Điểm trong ứng dụng: tự do so với theo câu mẫu");
        sb.AppendLine();
        sb.AppendLine("| Lượt | Tự do: nghe ra | Điểm | Theo câu mẫu: đã nghe | Điểm | Lệch câu mẫu | Lỗi phát hiện |");
        sb.AppendLine("|---|---|---|---|---|---|---|");
        foreach (var take in takes)
        {
            var r = recognizer.Recognize(take.Audio)!;
            var free = await comparer.CompareWithReadingAsync(take.Target, r.Kana);
            var reading = await comparer.ReadTargetAsync(take.Target);
            var aligned = reading == null ? null : PronunciationAligner.Align(reading.Moras, r.LogProbabilities, r.Labels);
            if (aligned == null || reading == null)
            {
                sb.AppendLine($"| {take.Name} | {r.Kana} | {free.ContentMatchScore} | (không chấm được) | | | |");
                continue;
            }
            var c = comparer.CompareHeard(take.Target, reading, aligned.Heard);
            var issues = string.Join(", ", aligned.Moras.Where(m => m.Kind is not ("ok" or "unjudged")).Select(m => $"{m.Target}→{m.Heard ?? "∅"} ({m.Kind}, {m.Gain})"));
            sb.AppendLine($"| {take.Name} | {r.Kana} | {free.ContentMatchScore} | {c.RecognizedDisplay} | {(aligned.IsMismatch ? "— (đọc câu khác)" : c.ContentMatchScore)} | {aligned.MismatchPerFrame} | {issues} |");
        }

        await File.WriteAllTextAsync(Path.Combine(dir!, "real-report.md"), sb.ToString());
        _output.WriteLine(sb.ToString());
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
        res.EnsureSuccessStatusCode();
        var node = JsonNode.Parse(await res.Content.ReadAsStringAsync())!;
        var sb = new StringBuilder();
        foreach (var ap in node["accent_phrases"]!.AsArray())
            foreach (var m in ap!["moras"]!.AsArray()) sb.Append(m!["text"]!.GetValue<string>());
        return sb.ToString();
    }
}
