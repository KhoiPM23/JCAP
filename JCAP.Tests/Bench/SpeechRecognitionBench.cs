using System.Diagnostics;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using JCAP.Tests.Services;
using Xunit.Abstractions;

namespace JCAP.Tests.Bench;

/// <summary>
/// Bộ kiểm thử nhận dạng bằng giọng VOICEVOX (giai đoạn 0 của kế hoạch phát âm).
/// Chỉ chạy khi đặt JCAP_BENCH=1 và VOICEVOX đang bật; audio được cache ở JCAP_BENCH_DIR (mặc định %TEMP%/jcap-bench).
///
/// Đo cho mỗi bộ nhận dạng:
///  1. Độ chính xác: tỷ lệ lỗi mora (MER) giữa cách đọc nhận được và cách đọc của câu thực sự được nói.
///  2. Độ trung thực: đọc SAI một âm thì bộ nhận dạng có nghe ra câu sai, hay "sửa" thành câu đúng?
///  3. Không bịa chữ: im lặng và tiếng ồn phải ra rỗng.
///  4. Thời gian xử lý.
/// So sánh bộ nhận dạng khác (ReazonSpeech…): đặt tệp {JCAP_BENCH_DIR}/results-&lt;tên&gt;.json dạng {"id": "chữ nhận được"}
/// (tạo từ manifest.json), lần chạy sau sẽ tính cùng các chỉ số cho bộ đó.
///
/// LƯU Ý: đây là giọng tổng hợp, KHÔNG phải giọng người học thật.
/// </summary>
public class SpeechRecognitionBench
{
    private readonly ITestOutputHelper _output;
    public SpeechRecognitionBench(ITestOutputHelper output) => _output = output;

    // Câu thường gặp N5–N3 (đọc đúng) để đo độ chính xác.
    private static readonly string[] Sentences =
    {
        "おはようございます", "はじめまして、どうぞよろしく", "これはわたしのかばんです", "きょうはいいてんきですね",
        "えきはどこですか", "コーヒーをひとつください", "なんじにおきますか", "しゅくだいをわすれました",
        "らいしゅうとうきょうへいきます", "でんしゃがおくれています", "すこしまってください", "もういちどいってください",
        "このりょうりはおいしいです", "きのうはともだちとえいがをみました", "にほんごのべんきょうはたのしいです", "びょういんへいかなければなりません",
        "かいぎはさんじからです", "しゃしんをとってもいいですか", "ちょっとさむいですね", "じゅっぷんぐらいかかります",
        "せんせいにしつもんがあります", "がっこうはなんじにおわりますか", "おちゃとおかしをどうぞ", "いっしょにひるごはんをたべませんか",
    };

    // Cặp tối thiểu: (loại lỗi, câu đúng, câu người học đọc sai)
    private static readonly (string kind, string correct, string wrong)[] Pairs =
    {
        ("trường âm", "おばあさんがいます", "おばさんがいます"),
        ("trường âm", "おじいさんはげんきです", "おじさんはげんきです"),
        ("trường âm", "ありがとうございます", "ありがとございます"),
        ("âm ngắt っ", "がっこうへいきます", "がこうへいきます"),
        ("âm ngắt っ", "きってをかいます", "きてをかいます"),
        ("ん", "こんにちは", "こにちは"),
        ("sh→s", "しんぶんをよみます", "すぃんぶんをよみます"),
        ("ts→ch", "つくえがあります", "ちゅくえがあります"),
        ("z→j", "ざっしをかいます", "じゃっしをかいます"),
        ("t→d", "たいわをします", "だいわをします"),
        ("k→g", "かばんがあります", "がばんがあります"),
        ("f→h", "ふじさんがみえます", "ひじさんがみえます"),
        ("r→d", "れんしゅうします", "でんしゅうします"),
    };

    private static readonly int[] Speakers = { 2, 3, 8, 11, 13, 14 };

    private sealed record Item(string Id, string Kind, string Spoken, string Target, string? Wrong, int Speaker, string WavPath);
    private sealed record Outcome(string Recognized, int Edits, int Expected, int DistToSpoken, int DistToCorrect, int DistToWrong, double ElapsedMs);

    [BenchFact]
    public async Task RunBench()
    {
        var dir = Environment.GetEnvironmentVariable("JCAP_BENCH_DIR") is { Length: > 0 } d ? d : Path.Combine(Path.GetTempPath(), "jcap-bench");
        Directory.CreateDirectory(Path.Combine(dir, "audio"));
        using var http = new HttpClient { BaseAddress = new Uri("http://127.0.0.1:50021"), Timeout = TimeSpan.FromSeconds(60) };
        var readingCache = new Dictionary<string, string>();

        // 1. Chuẩn bị audio (có cache) và cách đọc kỳ vọng.
        var items = new List<Item>();
        foreach (var sp in Speakers)
        {
            for (int i = 0; i < Sentences.Length; i++)
                items.Add(await Synthesize(http, dir, $"s{i}-v{sp}", "câu thường", Sentences[i], Sentences[i], null, sp));
            for (int i = 0; i < Pairs.Length; i++)
            {
                var (kind, correct, wrong) = Pairs[i];
                items.Add(await Synthesize(http, dir, $"p{i}c-v{sp}", kind, correct, correct, wrong, sp));
                items.Add(await Synthesize(http, dir, $"p{i}w-v{sp}", kind, wrong, correct, wrong, sp));
            }
        }
        items.AddRange(WriteNonSpeech(dir));
        await File.WriteAllTextAsync(Path.Combine(dir, "manifest.json"),
            JsonSerializer.Serialize(items, new JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));

        async Task<string> ReadingOf(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return string.Empty;
            if (readingCache.TryGetValue(text, out var cached)) return cached;
            var reading = await G2P(http, text);
            readingCache[text] = reading;
            return reading;
        }

        // 2. Bộ nhận dạng âm vị của JCAP.
        using var recognizer = ModelFactAttribute.CreateRecognizer();
        var phoneme = new Dictionary<string, Outcome>();
        foreach (var item in items)
        {
            var samples = WavPcmReader.ResampleTo16k(WavPcmReader.ReadMonoAnyRate(await File.ReadAllBytesAsync(item.WavPath), out var rate), rate);
            var r = recognizer.Recognize(samples)!;
            phoneme[item.Id] = await Score(item, r.Kana, r.ElapsedMs, ReadingOf);
        }

        var report = new StringBuilder();
        report.AppendLine("# Kiểm thử nhận dạng bằng giọng VOICEVOX");
        report.AppendLine();
        report.AppendLine($"Giọng tổng hợp, KHÔNG phải người học thật. {Speakers.Length} nhân vật × {Sentences.Length} câu thường + {Pairs.Length} cặp tối thiểu (đúng/sai) + {items.Count(i => i.Kind is "im lặng" or "tiếng ồn")} mẫu im lặng/ồn.");
        report.AppendLine();
        Summarize(report, "Âm vị (HuBERT phoneme-CTC, chạy trong backend)", items, phoneme);
        await ScoreEndToEnd(report, items, phoneme);

        // 3. Bộ nhận dạng khác (nếu đã có kết quả chạy ngoài).
        foreach (var file in Directory.GetFiles(dir, "results-*.json"))
        {
            var name = Path.GetFileNameWithoutExtension(file)["results-".Length..];
            var texts = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(await File.ReadAllTextAsync(file)) ?? new();
            var other = new Dictionary<string, Outcome>();
            foreach (var item in items)
            {
                if (!texts.TryGetValue(item.Id, out var v)) continue;
                var text = v.ValueKind == JsonValueKind.Object ? v.GetProperty("text").GetString() ?? "" : v.GetString() ?? "";
                var ms = v.ValueKind == JsonValueKind.Object && v.TryGetProperty("ms", out var t) ? t.GetDouble() : 0;
                other[item.Id] = await Score(item, await ReadingOf(text), ms, ReadingOf, recognizedText: text);
            }
            Summarize(report, name, items, other);
        }

        var path = Path.Combine(dir, "bench-report.md");
        await File.WriteAllTextAsync(path, report.ToString());
        _output.WriteLine(report.ToString());
        _output.WriteLine($"Báo cáo: {path}");
    }

    private static async Task<Outcome> Score(Item item, string recognizedKana, double ms, Func<string, Task<string>> readingOf, string? recognizedText = null)
    {
        var rec = Moras(recognizedKana);
        var spoken = Moras(await readingOf(item.Spoken));
        var correct = Moras(await readingOf(item.Target));
        var wrong = item.Wrong == null ? null : Moras(await readingOf(item.Wrong));
        var edits = Distance(rec, spoken);
        return new Outcome(recognizedText ?? recognizedKana, edits, spoken.Count, edits, Distance(rec, correct), wrong == null ? -1 : Distance(rec, wrong), ms);
    }

    private static void Summarize(StringBuilder sb, string name, List<Item> items, Dictionary<string, Outcome> results)
    {
        sb.AppendLine($"## {name}");
        sb.AppendLine();

        var sentences = items.Where(i => i.Kind == "câu thường" && results.ContainsKey(i.Id)).ToList();
        if (sentences.Count > 0)
        {
            var edits = sentences.Sum(i => results[i.Id].Edits);
            var total = sentences.Sum(i => results[i.Id].Expected);
            var exact = sentences.Count(i => results[i.Id].Edits == 0);
            sb.AppendLine($"- **Độ chính xác (câu thường, n={sentences.Count})**: lỗi mora {100.0 * edits / Math.Max(1, total):0.0}% ; đúng hoàn toàn {exact}/{sentences.Count} câu");
        }

        sb.AppendLine();
        sb.AppendLine("| Loại lỗi | Đọc đúng → nghe ra câu đúng | Đọc sai → nghe ra câu SAI (trung thực) | Đọc sai → \"sửa\" thành câu đúng |");
        sb.AppendLine("|---|---|---|---|");
        foreach (var group in items.Where(i => i.Wrong != null && results.ContainsKey(i.Id)).GroupBy(i => i.Kind))
        {
            var correctReads = group.Where(i => i.Spoken == i.Target).ToList();
            var wrongReads = group.Where(i => i.Spoken != i.Target).ToList();
            int okCorrect = correctReads.Count(i => results[i.Id].DistToCorrect < results[i.Id].DistToWrong);
            int faithful = wrongReads.Count(i => results[i.Id].DistToWrong < results[i.Id].DistToCorrect);
            int corrected = wrongReads.Count(i => results[i.Id].DistToCorrect < results[i.Id].DistToWrong);
            sb.AppendLine($"| {group.Key} | {okCorrect}/{correctReads.Count} | {faithful}/{wrongReads.Count} | {corrected}/{wrongReads.Count} |");
        }

        var nonSpeech = items.Where(i => i.Kind is "im lặng" or "tiếng ồn" && results.ContainsKey(i.Id)).ToList();
        if (nonSpeech.Count > 0)
        {
            var hallucinated = nonSpeech.Where(i => Moras(results[i.Id].Recognized).Count > 0).ToList();
            sb.AppendLine();
            sb.AppendLine($"- **Bịa chữ với im lặng/tiếng ồn**: {hallucinated.Count}/{nonSpeech.Count} mẫu" +
                (hallucinated.Count > 0 ? $" ({string.Join(", ", hallucinated.Select(i => $"{i.Id}: \"{results[i.Id].Recognized}\""))})" : ""));
        }

        var times = results.Values.Select(o => o.ElapsedMs).Where(ms => ms > 0).OrderBy(x => x).ToList();
        if (times.Count > 0)
            sb.AppendLine($"- **Thời gian xử lý**: trung vị {times[times.Count / 2]:0} ms, p95 {times[(int)(0.95 * (times.Count - 1))]:0} ms");

        // Ví dụ để đối chiếu bằng mắt
        sb.AppendLine();
        sb.AppendLine("<details><summary>Một số ví dụ</summary>");
        sb.AppendLine();
        foreach (var i in items.Where(i => results.ContainsKey(i.Id) && i.Id.EndsWith("-v3")).Take(16))
            sb.AppendLine($"- `{i.Id}` nói 「{i.Spoken}」 → nhận 「{results[i.Id].Recognized}」 (lệch {results[i.Id].Edits} mora)");
        sb.AppendLine();
        sb.AppendLine("</details>");
        sb.AppendLine();
    }

    /// <summary>
    /// Chấm điểm đầu-cuối như sản phẩm: kana từ mô hình âm vị → KanaMoraComparer.CompareWithReadingAsync với cách đọc câu mẫu
    /// lấy từ VOICEVOX thật (VoiceVoxKanaReader). Cho biết điểm nội dung người học nhận được trong từng tình huống.
    /// </summary>
    private static async Task ScoreEndToEnd(StringBuilder sb, List<Item> items, Dictionary<string, Outcome> phoneme)
    {
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build();
        var reader = new VoiceVoxKanaReader(new HttpClient(), config, Microsoft.Extensions.Logging.Abstractions.NullLogger<VoiceVoxKanaReader>.Instance);
        var comparer = new KanaMoraComparer(new IKanaReader[] { reader });

        async Task<List<int>> Scores(IEnumerable<Item> group)
        {
            var scores = new List<int>();
            foreach (var i in group)
            {
                var c = await comparer.CompareWithReadingAsync(i.Target, phoneme[i.Id].Recognized);
                if (!c.ReadingUnavailable) scores.Add(c.ContentMatchScore);
                if (!c.ReadingUnavailable && c.ContentMatchScore < 100 && phoneme[i.Id].Edits == 0 && i.Spoken == i.Target)
                    sb.AppendLine($"  - [nghe đúng nhưng bị trừ] {i.Id}: mẫu 「{c.TargetReading}」, nghe 「{c.RecognizedReading}」 → {c.ContentMatchScore}");
            }
            return scores;
        }

        string Describe(List<int> s) => s.Count == 0 ? "—" :
            $"trung bình {s.Average():0}, trung vị {s.OrderBy(x => x).ElementAt(s.Count / 2)}, đạt 100: {s.Count(x => x == 100)}/{s.Count}";

        var sentences = await Scores(items.Where(i => i.Kind == "câu thường"));
        var pairCorrect = await Scores(items.Where(i => i.Wrong != null && i.Spoken == i.Target));
        var pairWrong = await Scores(items.Where(i => i.Wrong != null && i.Spoken != i.Target));

        sb.AppendLine("### Điểm nội dung đầu-cuối (như sản phẩm: âm vị → so với cách đọc câu mẫu của VOICEVOX)");
        sb.AppendLine();
        sb.AppendLine($"- Câu thường đọc đúng: {Describe(sentences)}");
        sb.AppendLine($"- Cặp tối thiểu, đọc đúng: {Describe(pairCorrect)}");
        sb.AppendLine($"- Cặp tối thiểu, cố ý đọc sai một âm: {Describe(pairWrong)}");
        sb.AppendLine();
    }

    private static List<string> Moras(string kana) =>
        JapaneseMora.FromKana(kana, preserveLongVowelSpelling: false).Select(m => m.Canon).ToList();

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

    /// <summary>Cách đọc (katakana) theo VOICEVOX audio_query, giống VoiceVoxKanaReader.</summary>
    private static async Task<string> G2P(HttpClient http, string text)
    {
        var res = await http.PostAsync($"/audio_query?text={Uri.EscapeDataString(text)}&speaker=3", null);
        var node = JsonNode.Parse(await res.Content.ReadAsStringAsync())!;
        var sb = new StringBuilder();
        foreach (var ap in node["accent_phrases"]!.AsArray())
            foreach (var m in ap!["moras"]!.AsArray()) sb.Append(m!["text"]!.GetValue<string>());
        return sb.ToString();
    }

    private static async Task<Item> Synthesize(HttpClient http, string dir, string id, string kind, string spoken, string target, string? wrong, int speaker)
    {
        var path = Path.Combine(dir, "audio", $"{id}-{Hash(spoken)}.wav");
        if (!File.Exists(path))
        {
            var query = await (await http.PostAsync($"/audio_query?text={Uri.EscapeDataString(spoken)}&speaker={speaker}", null)).Content.ReadAsStringAsync();
            var wav = await (await http.PostAsync($"/synthesis?speaker={speaker}", new StringContent(query, Encoding.UTF8, "application/json"))).Content.ReadAsByteArrayAsync();
            await File.WriteAllBytesAsync(path, wav);
        }
        return new Item(id, kind, spoken, target, wrong, speaker, path);
    }

    private static IEnumerable<Item> WriteNonSpeech(string dir)
    {
        var rng = new Random(11);
        var specs = new (string id, string kind, Func<int, float> gen)[]
        {
            ("x-silence", "im lặng", _ => 0f),
            ("x-room", "im lặng", _ => (float)((rng.NextDouble() * 2 - 1) * 0.002)),
            ("x-noise-low", "tiếng ồn", _ => (float)((rng.NextDouble() * 2 - 1) * 0.02)),
            ("x-noise-high", "tiếng ồn", _ => (float)((rng.NextDouble() * 2 - 1) * 0.1)),
            ("x-hum", "tiếng ồn", i => (float)(0.05 * Math.Sin(2 * Math.PI * 50 * i / 16000.0))),
        };
        foreach (var (id, kind, gen) in specs)
        {
            var path = Path.Combine(dir, "audio", $"{id}.wav");
            if (!File.Exists(path)) File.WriteAllBytes(path, TestAudio.Wav(Enumerable.Range(0, 16000 * 2).Select(gen).ToArray()));
            yield return new Item(id, kind, string.Empty, string.Empty, null, 0, path);
        }
    }

    private static string Hash(string s) => Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(s)))[..8];
}

/// <summary>Chỉ chạy khi JCAP_BENCH=1 (cần VOICEVOX đang bật và mô hình âm vị đã tải).</summary>
public sealed class BenchFactAttribute : FactAttribute
{
    public BenchFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("JCAP_BENCH") != "1")
            Skip = "Bộ kiểm thử VOICEVOX: đặt JCAP_BENCH=1, bật VOICEVOX và tải mô hình âm vị để chạy.";
        else if (ModelFactAttribute.ModelDirectory() == null)
            Skip = "Chưa có mô hình âm vị (chạy scripts/download-speech-models.ps1).";
    }
}
