using System.Threading;
using System.Threading.Tasks;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;

namespace JCAP.Tests.Services;

/// <summary>
/// Nguồn cách đọc CHỈ DÙNG TRONG TEST: bảng nhỏ cố định thay cho engine VOICEVOX để test chạy offline và xác định.
/// Không thuộc production: production chỉ dùng VoiceVoxKanaReader và không bao giờ đoán cách đọc.
/// Chữ Hán không có trong bảng (vd. 東京) được cố ý để "chưa phân giải" nhằm kiểm tra việc không chấm khi không đọc được.
/// </summary>
public sealed class TestKanaReader : IKanaReader
{
    public string SourceId => "test";

    private static readonly Dictionary<string, string> Words = new()
    {
        ["一人"] = "ひとり", ["1人"] = "ひとり", ["席"] = "せき", ["学校"] = "がっこう", ["行きます"] = "いきます",
        ["何時"] = "なんじ", ["今"] = "いま", ["綺麗"] = "きれい", ["お願いします"] = "おねがいします",
        ["写真"] = "しゃしん", ["撮って"] = "とって",
    };

    private static readonly string[] KeysLongestFirst = Words.Keys.OrderByDescending(k => k.Length).ToArray();

    /// <summary>Một số câu dùng trong test dịch vụ, có ranh giới TỪ ("/") như VOICEVOX trả về (mỗi từ = một cụm trọng âm).</summary>
    private static readonly Dictionary<string, string> Phrased = new()
    {
        [JapaneseMora.Normalize("一人です。カウンター席でお願いします。")] = "ひとりです/かうんたーせきで/おねがい/します",
        [JapaneseMora.Normalize("ひとりです。テーブル席でおねがいします。")] = "ひとりです/てーぶるせきで/おねがい/します",
    };

    public Task<KanaReading?> TryReadAsync(string text, CancellationToken cancellationToken = default)
    {
        var normalized = JapaneseMora.Normalize(text);

        if (Phrased.TryGetValue(normalized, out var phrased))
        {
            var withWords = JapaneseMora.FromKanaPhrases(phrased.Split('/'), preserveLongVowelSpelling: true, out var starts);
            return Task.FromResult<KanaReading?>(new KanaReading { Moras = withWords, WordStarts = starts, Source = SourceId });
        }

        var kana = new System.Text.StringBuilder();
        for (var i = 0; i < normalized.Length;)
        {
            var key = KeysLongestFirst.FirstOrDefault(k => string.CompareOrdinal(normalized, i, k, 0, k.Length) == 0);
            if (key != null) { kana.Append(Words[key]); i += key.Length; }
            else { kana.Append(normalized[i]); i++; }
        }

        var moras = JapaneseMora.FromKana(kana.ToString());
        return Task.FromResult<KanaReading?>(new KanaReading
        {
            Moras = moras,
            UnresolvedCount = moras.Count(m => m.IsUnresolved),
            Source = SourceId
        });
    }
}

/// <summary>Nguồn cách đọc luôn không dùng được (mô phỏng engine VOICEVOX tắt).</summary>
public sealed class UnavailableKanaReader : IKanaReader
{
    public string SourceId => "unavailable";
    public Task<KanaReading?> TryReadAsync(string text, CancellationToken cancellationToken = default)
        => Task.FromResult<KanaReading?>(null);
}

/// <summary>
/// Nguồn cách đọc CHỈ DÙNG TRONG TEST với ranh giới TỪ do test chỉ định: văn bản (đã chuẩn hóa) → "từ/từ/từ".
/// Văn bản không có trong bảng thì "không đọc được" (null).
/// g2pStyle: chuỗi là katakana kiểu VOICEVOX (を→オ, trường âm bằng nguyên âm lặp) và trường âm hiển thị bằng kana thông dụng.
/// </summary>
public sealed class PhraseReader : IKanaReader
{
    private readonly Dictionary<string, string> _map;
    private readonly bool _g2pStyle;

    public PhraseReader(IEnumerable<(string Text, string Phrased)> entries, bool g2pStyle = false)
    {
        _map = entries.ToDictionary(e => JapaneseMora.Normalize(e.Text), e => e.Phrased);
        _g2pStyle = g2pStyle;
    }

    public string SourceId => "phrase";

    public Task<KanaReading?> TryReadAsync(string text, CancellationToken cancellationToken = default)
    {
        if (!_map.TryGetValue(JapaneseMora.Normalize(text), out var phrased)) return Task.FromResult<KanaReading?>(null);

        var moras = JapaneseMora.FromKanaPhrases(phrased.Split('/'), preserveLongVowelSpelling: !_g2pStyle, out var starts);
        return Task.FromResult<KanaReading?>(new KanaReading
        {
            Moras = moras,
            WordStarts = starts,
            UnresolvedCount = moras.Count(m => m.IsUnresolved),
            Source = SourceId
        });
    }
}
