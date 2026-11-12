using System.Text;
using System.Text.Json;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit.Abstractions;

namespace JCAP.Tests.Bench;

/// <summary>
/// Chấm lại các bản ghi giọng thật (JCAP_REAL_DIR: cặp .wav + .json tải từ trang luyện) bằng ĐÚNG pipeline sản phẩm
/// (Faster-Whisper → KanaMoraComparer, cách đọc câu mẫu từ VOICEVOX), so với điểm lúc thu (trường result.score trong .json).
/// Dùng để thấy ảnh hưởng của một thay đổi chấm điểm lên dữ liệu thật. Nhãn (trường "label") nếu có được in kèm.
/// Cần JCAP_BENCH=1, JCAP_ASR_URL, JCAP_REAL_DIR và VOICEVOX. Báo cáo: real-scoring-{model}.md trong JCAP_REAL_DIR.
/// </summary>
public class RealScoringBench
{
    private readonly ITestOutputHelper _output;
    public RealScoringBench(ITestOutputHelper output) => _output = output;

    [AsrBenchFact]
    public async Task Run()
    {
        var dir = Environment.GetEnvironmentVariable("JCAP_REAL_DIR");
        Assert.False(string.IsNullOrWhiteSpace(dir) || !Directory.Exists(dir), "Đặt JCAP_REAL_DIR là thư mục chứa các cặp .wav + .json.");

        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Shadowing:Asr:BaseUrl"] = Environment.GetEnvironmentVariable("JCAP_ASR_URL"),
            ["Shadowing:Asr:Token"] = Environment.GetEnvironmentVariable("JCAP_ASR_TOKEN"),
            ["Shadowing:Asr:TimeoutMs"] = "120000",
        }).Build();
        VoiceVoxKanaReader.ResetStateForTests();
        var reader = new VoiceVoxKanaReader(new HttpClient { Timeout = TimeSpan.FromSeconds(60) }, config, NullLogger<VoiceVoxKanaReader>.Instance);
        var asr = new FasterWhisperSpeechRecognitionService(new HttpClient(), config, NullLogger<FasterWhisperSpeechRecognitionService>.Instance);
        var service = new ShadowingEvaluationService(new KanaMoraComparer(new IKanaReader[] { reader }), config,
            NullLogger<ShadowingEvaluationService>.Instance, new FluencyAnalyzer(), null, null, null, asr);

        var sb = new StringBuilder();
        sb.AppendLine("# Chấm lại bản ghi giọng thật");
        sb.AppendLine();
        sb.AppendLine("| Bản ghi | Nhãn | Câu mẫu | Điểm lúc thu | Điểm hiện tại | Transcript | Từ sai |");
        sb.AppendLine("|---|---|---|---|---|---|---|");
        string? model = null;
        int changed = 0, total = 0;
        foreach (var json in Directory.GetFiles(dir!, "*.json").OrderBy(f => f))
        {
            var wavPath = Path.ChangeExtension(json, ".wav");
            if (!File.Exists(wavPath)) continue;
            using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(json));
            var root = doc.RootElement;
            if (!root.TryGetProperty("targetText", out var t) || t.GetString() is not { Length: > 0 } target) continue;
            var label = root.TryGetProperty("label", out var lb) ? lb.GetString() : null;
            int? before = root.TryGetProperty("result", out var res) && res.TryGetProperty("score", out var sc) && sc.ValueKind == JsonValueKind.Number
                ? sc.GetInt32() : null;

            var r = await service.EvaluateAsync(new ShadowingAudioEvaluationInput
            {
                TargetText = target,
                AnalysisWav = await File.ReadAllBytesAsync(wavPath),
            });
            model ??= r.AsrModel;
            total++;
            if (r.OverallScore != before) changed++;
            var wrong = string.Join(", ", r.DiffTokens.Where(x => x.Status != "correct").Select(x => $"{x.Text}→{x.SpokenPart ?? "∅"}"));
            var now = r.OverallScore?.ToString() ?? $"— ({r.ErrorCode})";
            sb.AppendLine($"| {Path.GetFileNameWithoutExtension(json)} | {label} | {target} | {before?.ToString() ?? "—"} | {now} | {r.RecognizedText} | {wrong} |");
        }
        sb.AppendLine();
        sb.AppendLine($"{total} bản ghi, {changed} bản đổi điểm so với lúc thu. Mô hình: {model}.");

        var path = Path.Combine(dir!, $"real-scoring-{(model ?? "asr").Replace(':', '_').Replace('/', '_')}.md");
        await File.WriteAllTextAsync(path, sb.ToString());
        _output.WriteLine(sb.ToString());
    }
}
