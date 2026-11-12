using System.Globalization;
using System.Text;
using System.Text.Json;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Implementations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit.Abstractions;

namespace JCAP.Tests.Bench;

/// <summary>
/// Mức nhịp nói "bình thường" để đặt ngưỡng nhận xét Lưu loát: đo các chỉ số nhịp trên bản ghi trong JCAP_REAL_DIR
/// (cặp .wav + .json có targetText; vd. giọng người Nhật FLEURS, hoặc bản ghi người học) và so với giọng mẫu VOICEVOX đọc cùng câu.
/// In phân bố (phân vị) từng chỉ số. Cần JCAP_BENCH=1, JCAP_REAL_DIR, VOICEVOX. Báo cáo: fluency-baseline.md trong JCAP_REAL_DIR.
/// Bản ghi đi qua ShadowingAudioValidator như sản phẩm (bản ghi nhỏ được khuếch đại trước khi đo).
/// </summary>
public class FluencyBaselineBench
{
    private readonly ITestOutputHelper _output;
    public FluencyBaselineBench(ITestOutputHelper output) => _output = output;

    private static readonly HttpClient Http = new() { BaseAddress = new Uri("http://127.0.0.1:50021"), Timeout = TimeSpan.FromSeconds(120) };

    [BenchFact]
    public async Task Run()
    {
        var dir = Environment.GetEnvironmentVariable("JCAP_REAL_DIR");
        Assert.False(string.IsNullOrWhiteSpace(dir) || !Directory.Exists(dir), "Đặt JCAP_REAL_DIR là thư mục chứa các cặp .wav + .json.");

        VoiceVoxKanaReader.ResetStateForTests();
        var reader = new VoiceVoxKanaReader(new HttpClient { Timeout = TimeSpan.FromSeconds(60) }, new ConfigurationBuilder().Build(),
            NullLogger<VoiceVoxKanaReader>.Instance);
        var analyzer = new FluencyAnalyzer();
        var options = new FluencyComparisonOptions();

        var rows = new List<(string Name, FluencyMetricsDto L, FluencyMetricsDto R, FluencyComparisonDto C, List<int> ExtraMs)>();
        var skipped = new Dictionary<string, int>();
        void Skip(string why) => skipped[why] = skipped.GetValueOrDefault(why) + 1;

        foreach (var json in Directory.GetFiles(dir!, "*.json").OrderBy(f => f))
        {
            var wavPath = Path.ChangeExtension(json, ".wav");
            if (!File.Exists(wavPath)) continue;
            using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(json));
            if (!doc.RootElement.TryGetProperty("targetText", out var t) || t.GetString() is not { Length: > 0 } target) continue;

            var reading = await reader.TryReadAsync(target);
            if (reading == null || reading.UnresolvedCount > 0) { Skip("READING"); continue; }
            var moras = reading.Moras.Count;

            var raw = await File.ReadAllBytesAsync(wavPath);
            var audio = ShadowingAudioValidator.Validate(raw, null);
            if (!audio.IsValid) { Skip(audio.ErrorCode!); continue; }
            var learner = analyzer.Analyze(audio.NormalizedWav ?? raw, moras);
            if (learner.Status != "available") { Skip("LEARNER_" + learner.ReasonCode); continue; }

            var refWav = await Synthesize(target);
            var reference = analyzer.AnalyzeAnyRate(refWav, moras);
            if (reference.Status != "available") { Skip("REF_" + reference.ReasonCode); continue; }

            var ctx = new FluencyComparisonContext { TranscriptReliable = true, ContentMatchScore = 100, TargetMoraCount = moras, RecognizedMoraCount = moras };
            var (c, obs) = FluencyComparer.Compare(learner, reference, ctx, options);
            if (c.Status != "available") { Skip("CMP_" + c.ReasonCode); continue; }
            var extra = obs.FirstOrDefault(o => o.Code == "extra_pause")?.Data.GetValueOrDefault("pauseDurationsMs") as List<int> ?? new();
            rows.Add((Path.GetFileNameWithoutExtension(json), learner, reference, c, extra));
        }

        Assert.True(rows.Count > 0, "Không đo được bản ghi nào: " + string.Join(", ", skipped.Select(kv => $"{kv.Key}={kv.Value}")));

        string P(IEnumerable<double> values)
        {
            var v = values.OrderBy(x => x).ToArray();
            if (v.Length == 0) return "—";
            double Q(double q) => v[(int)Math.Round(q * (v.Length - 1))];
            return string.Join(" · ", new[] { 0.05, 0.25, 0.5, 0.75, 0.95 }.Select(q => Q(q).ToString("0.##", CultureInfo.InvariantCulture)));
        }

        var sb = new StringBuilder();
        sb.AppendLine("# Mức nhịp nói (phân vị 5 · 25 · 50 · 75 · 95)");
        sb.AppendLine();
        sb.AppendLine($"Thư mục: {Path.GetFileName(dir!.TrimEnd('/', '\\'))}. Đo được {rows.Count} bản ghi; bỏ qua: " +
                      (skipped.Count == 0 ? "không" : string.Join(", ", skipped.Select(kv => $"{kv.Key}={kv.Value}"))) + ".");
        sb.AppendLine();
        sb.AppendLine("| Chỉ số | Bản ghi | Giọng mẫu VOICEVOX |");
        sb.AppendLine("|---|---|---|");
        sb.AppendLine($"| Tốc độ phát âm (mora/giây, không tính dừng) | {P(rows.Select(r => r.L.ArticulationRateMoraPerSec ?? 0))} | {P(rows.Select(r => r.R.ArticulationRateMoraPerSec ?? 0))} |");
        sb.AppendLine($"| Tốc độ nói (mora/giây, tính cả dừng) | {P(rows.Select(r => r.L.SpeakingRateMoraPerSec ?? 0))} | {P(rows.Select(r => r.R.SpeakingRateMoraPerSec ?? 0))} |");
        sb.AppendLine($"| Tỷ lệ thời gian dừng | {P(rows.Select(r => r.L.PauseRatio ?? 0))} | {P(rows.Select(r => r.R.PauseRatio ?? 0))} |");
        sb.AppendLine($"| Số khoảng dừng / 10 mora | {P(rows.Select(r => 10.0 * (r.L.PauseCount ?? 0) / r.L.MoraCount!.Value))} | {P(rows.Select(r => 10.0 * (r.R.PauseCount ?? 0) / r.R.MoraCount!.Value))} |");
        sb.AppendLine($"| Khoảng dừng dài nhất (ms) | {P(rows.Select(r => (double)(r.L.LongestPauseMs ?? 0)))} | {P(rows.Select(r => (double)(r.R.LongestPauseMs ?? 0)))} |");
        sb.AppendLine($"| Nói liền trung bình (mora/đoạn) | {P(rows.Select(r => r.L.MeanRunMoras ?? 0))} | {P(rows.Select(r => r.R.MeanRunMoras ?? 0))} |");
        sb.AppendLine();
        sb.AppendLine("So với giọng mẫu:");
        sb.AppendLine();
        sb.AppendLine($"- Tỷ lệ tốc độ phát âm (mẫu / bản ghi; < 1 là chậm hơn mẫu): {P(rows.Select(r => r.C.ArticulationRateRatio ?? 0))}");
        sb.AppendLine($"- Số khoảng dừng thừa (mẫu không dừng ở đó, ≥ {options.ExtraPauseMinMs} ms, giữa câu): {P(rows.Select(r => (double)(r.C.ExtraPauseCount ?? 0)))}");
        sb.AppendLine($"- Bản ghi có ≥ 1 khoảng dừng thừa: {rows.Count(r => r.C.ExtraPauseCount > 0)}/{rows.Count}");
        sb.AppendLine($"- Độ dài khoảng dừng thừa (ms): {P(rows.SelectMany(r => r.ExtraMs.Select(x => (double)x)))}");
        sb.AppendLine($"- Bị nhận xét \"chậm hơn mẫu\" (tỷ lệ ≤ {options.SlowRatio}): {rows.Count(r => r.C.ArticulationRateRatio <= options.SlowRatio)}/{rows.Count}; " +
                      $"\"nhanh hơn mẫu\" (≥ {options.FastRatio}): {rows.Count(r => r.C.ArticulationRateRatio >= options.FastRatio)}/{rows.Count}");

        var path = Path.Combine(dir!, "fluency-baseline.md");
        await File.WriteAllTextAsync(path, sb.ToString());
        _output.WriteLine(sb.ToString());
    }

    private static async Task<byte[]> Synthesize(string text)
    {
        var query = await (await Http.PostAsync($"/audio_query?speaker=3&text={Uri.EscapeDataString(text)}", null)).Content.ReadAsStringAsync();
        return await (await Http.PostAsync("/synthesis?speaker=3", new StringContent(query, Encoding.UTF8, "application/json"))).Content.ReadAsByteArrayAsync();
    }
}
