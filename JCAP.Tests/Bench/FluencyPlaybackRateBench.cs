using System.Globalization;
using System.Text;
using System.Text.Json;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Implementations;
using Xunit.Abstractions;

namespace JCAP.Tests.Bench;

/// <summary>
/// Kiểm chứng quy đổi số đo giọng mẫu theo tốc độ phát (FluencyComparer.ScaleForPlayback): cho VOICEVOX đọc cùng câu ở tốc độ gốc và
/// ở tốc độ chậm (speedScale), đo cả hai bằng cùng bộ VAD, rồi so số đo THỰC của bản chậm với số đo QUY ĐỔI từ bản gốc.
/// Câu lấy từ JCAP_REAL_DIR (.json có targetText) nếu có, không thì danh sách câu ngắn. Cần JCAP_BENCH=1 và VOICEVOX.
/// </summary>
public class FluencyPlaybackRateBench
{
    private readonly ITestOutputHelper _output;
    public FluencyPlaybackRateBench(ITestOutputHelper output) => _output = output;

    private static readonly HttpClient Http = new() { BaseAddress = new Uri("http://127.0.0.1:50021"), Timeout = TimeSpan.FromSeconds(120) };

    private static readonly string[] Fallback =
    {
        "こんにちは。入国の目的は何ですか。", "パスポートを見せてください。", "東京駅まで、切符を一枚ください。",
        "成田エクスプレスですね。何時の電車にしますか。", "地下一階の一番線ですね。ありがとうございます。",
    };

    [BenchFact]
    public async Task Run()
    {
        var dir = Environment.GetEnvironmentVariable("JCAP_REAL_DIR");
        var targets = new List<string>();
        if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir))
            foreach (var json in Directory.GetFiles(dir, "*.json"))
            {
                using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(json));
                if (doc.RootElement.TryGetProperty("targetText", out var t) && t.GetString() is { Length: > 0 } s) targets.Add(s);
            }
        targets = targets.Distinct().ToList();
        if (targets.Count == 0) targets.AddRange(Fallback);

        var analyzer = new FluencyAnalyzer();
        var sb = new StringBuilder();
        sb.AppendLine("# Kiểm chứng quy đổi theo tốc độ phát giọng mẫu");
        sb.AppendLine();
        sb.AppendLine("| Tốc độ | Câu | Tốc độ phát âm thực / quy đổi (mora/s) | Khoảng nói thực / quy đổi (ms) | Số dừng thực / gốc | Sai số tốc độ |");
        sb.AppendLine("|---|---|---|---|---|---|");
        var errors = new Dictionary<double, List<double>>();
        foreach (var rate in new[] { 0.75, 0.5 })
            foreach (var text in targets)
            {
                const int moras = 20; // cùng số mora hai phía: tỷ lệ không phụ thuộc giá trị cụ thể
                var baseM = analyzer.AnalyzeAnyRate(await Synthesize(text, 1.0), moras);
                var slowM = analyzer.AnalyzeAnyRate(await Synthesize(text, rate), moras);
                if (baseM.Status != "available" || slowM.Status != "available") continue;
                var scaled = FluencyComparer.ScaleForPlayback(baseM, rate);
                var err = (scaled.ArticulationRateMoraPerSec!.Value - slowM.ArticulationRateMoraPerSec!.Value) / slowM.ArticulationRateMoraPerSec!.Value;
                (errors.TryGetValue(rate, out var l) ? l : errors[rate] = new()).Add(err);
                sb.AppendLine($"| {rate} | {text} | {slowM.ArticulationRateMoraPerSec} / {scaled.ArticulationRateMoraPerSec} | {slowM.SpeechSpanMs} / {scaled.SpeechSpanMs} | {slowM.PauseCount} / {baseM.PauseCount} | {err * 100:+0.0;-0.0}% |");
            }
        sb.AppendLine();
        foreach (var (rate, e) in errors)
            sb.AppendLine($"- Tốc độ {rate}: sai số tốc độ phát âm trung bình {e.Average() * 100:+0.0;-0.0}%, lớn nhất {e.Max(Math.Abs) * 100:0.0}% ({e.Count} câu).");

        _output.WriteLine(sb.ToString());
        if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir)) await File.WriteAllTextAsync(Path.Combine(dir, "playback-rate-check.md"), sb.ToString());
        Assert.True(errors.Values.SelectMany(x => x).All(x => Math.Abs(x) < 0.15), "Quy đổi lệch hơn 15% so với đo thực.");
    }

    private static async Task<byte[]> Synthesize(string text, double speed)
    {
        var query = await (await Http.PostAsync($"/audio_query?speaker=3&text={Uri.EscapeDataString(text)}", null)).Content.ReadAsStringAsync();
        var node = System.Text.Json.Nodes.JsonNode.Parse(query)!;
        node["speedScale"] = speed;
        return await (await Http.PostAsync("/synthesis?speaker=3", new StringContent(node.ToJsonString(), Encoding.UTF8, "application/json"))).Content.ReadAsByteArrayAsync();
    }
}
