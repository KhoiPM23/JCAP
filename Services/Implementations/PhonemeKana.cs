using System.Collections.Generic;
using System.Text;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Đổi chuỗi âm vị kiểu OpenJTalk/VOICEVOX (k a, sh i, cl, N, I, U…) sang hiragana.
    /// Dùng cho kết quả của bộ nhận dạng âm vị: so khớp nội dung theo cách đọc và hiển thị "Bạn đã nói" bằng kana.
    /// Phụ âm đứng một mình (không có nguyên âm theo sau) bị bỏ qua vì không thành một mora.
    /// </summary>
    public static class PhonemeKana
    {
        // Thứ tự nguyên âm trong mỗi hàng: a i u e o
        private const string Vowels = "aiueo";

        private static readonly Dictionary<string, string[]> Rows = new()
        {
            [""] = new[] { "あ", "い", "う", "え", "お" },
            ["k"] = new[] { "か", "き", "く", "け", "こ" },
            ["g"] = new[] { "が", "ぎ", "ぐ", "げ", "ご" },
            ["s"] = new[] { "さ", "すぃ", "す", "せ", "そ" },
            ["sh"] = new[] { "しゃ", "し", "しゅ", "しぇ", "しょ" },
            ["z"] = new[] { "ざ", "ずぃ", "ず", "ぜ", "ぞ" },
            ["j"] = new[] { "じゃ", "じ", "じゅ", "じぇ", "じょ" },
            ["t"] = new[] { "た", "てぃ", "とぅ", "て", "と" },
            ["ts"] = new[] { "つぁ", "つぃ", "つ", "つぇ", "つぉ" },
            ["ch"] = new[] { "ちゃ", "ち", "ちゅ", "ちぇ", "ちょ" },
            ["d"] = new[] { "だ", "でぃ", "どぅ", "で", "ど" },
            ["n"] = new[] { "な", "に", "ぬ", "ね", "の" },
            ["h"] = new[] { "は", "ひ", "ふ", "へ", "ほ" },
            ["f"] = new[] { "ふぁ", "ふぃ", "ふ", "ふぇ", "ふぉ" },
            ["b"] = new[] { "ば", "び", "ぶ", "べ", "ぼ" },
            ["p"] = new[] { "ぱ", "ぴ", "ぷ", "ぺ", "ぽ" },
            ["m"] = new[] { "ま", "み", "む", "め", "も" },
            ["y"] = new[] { "や", "い", "ゆ", "いぇ", "よ" },
            ["r"] = new[] { "ら", "り", "る", "れ", "ろ" },
            ["w"] = new[] { "わ", "うぃ", "う", "うぇ", "を" },
            ["v"] = new[] { "ゔぁ", "ゔぃ", "ゔ", "ゔぇ", "ゔぉ" },
            ["ky"] = new[] { "きゃ", "き", "きゅ", "きぇ", "きょ" },
            ["gy"] = new[] { "ぎゃ", "ぎ", "ぎゅ", "ぎぇ", "ぎょ" },
            ["ny"] = new[] { "にゃ", "に", "にゅ", "にぇ", "にょ" },
            ["hy"] = new[] { "ひゃ", "ひ", "ひゅ", "ひぇ", "ひょ" },
            ["by"] = new[] { "びゃ", "び", "びゅ", "びぇ", "びょ" },
            ["py"] = new[] { "ぴゃ", "ぴ", "ぴゅ", "ぴぇ", "ぴょ" },
            ["my"] = new[] { "みゃ", "み", "みゅ", "みぇ", "みょ" },
            ["ry"] = new[] { "りゃ", "り", "りゅ", "りぇ", "りょ" },
            ["dy"] = new[] { "ぢゃ", "でぃ", "でゅ", "ぢぇ", "ぢょ" },
            ["fy"] = new[] { "ふゃ", "ふぃ", "ふゅ", "ふぃぇ", "ふょ" },
            ["kw"] = new[] { "くゎ", "くぃ", "く", "くぇ", "くぉ" },
            ["gw"] = new[] { "ぐゎ", "ぐぃ", "ぐ", "ぐぇ", "ぐぉ" },
        };

        // Thứ tự ưu tiên khi một kana có nhiều cách ghi âm vị: lấy hàng đứng trước (い là "i" chứ không phải "y i").
        private static readonly string[] RowPriority =
        {
            "", "k", "g", "s", "sh", "z", "j", "t", "ts", "ch", "d", "n", "f", "h", "b", "p", "m", "y", "r", "w", "v",
            "ky", "gy", "ny", "hy", "by", "py", "my", "ry", "dy", "fy", "kw", "gw",
        };

        private static readonly Dictionary<string, (string Consonant, char Vowel)> Inverse = BuildInverse();

        private static Dictionary<string, (string, char)> BuildInverse()
        {
            var map = new Dictionary<string, (string, char)>();
            foreach (var consonant in RowPriority)
            {
                var row = Rows[consonant];
                for (var v = 0; v < Vowels.Length; v++) map.TryAdd(row[v], (consonant, Vowels[v]));
            }
            // OpenJTalk ghi ふ là "f u" (hàng f đứng trước h nên đã đúng); を/ぢ/づ đọc như お/じ/ず
            map["を"] = ("", 'o');
            map["ぢ"] = ("j", 'i');
            map["づ"] = ("z", 'u');
            return map;
        }

        /// <summary>Âm vị (phụ âm, nguyên âm) của một mora kana thường (không gồm っ, ん, ー). false nếu không biết.</summary>
        public static bool TryGetPhonemes(string kana, out string consonant, out char vowel)
        {
            if (Inverse.TryGetValue(kana, out var p))
            {
                consonant = p.Consonant;
                vowel = p.Vowel;
                return true;
            }
            consonant = string.Empty;
            vowel = '\0';
            return false;
        }

        /// <summary>Kana của một mora (phụ âm có thể rỗng + nguyên âm).</summary>
        public static string MoraKana(string consonant, char vowel)
        {
            var index = Vowels.IndexOf(vowel);
            if (index < 0) return string.Empty;
            return Rows.TryGetValue(consonant, out var row) ? row[index] : Rows[""][index];
        }

        /// <summary>Nhãn không phải âm (khoảng lặng, ngắt, nhãn đặc biệt của mô hình).</summary>
        public static bool IsNonSpeech(string phoneme) =>
            phoneme is "sil" or "pau" or "PAD" or "SOS" or "EOS" or "UNK" || phoneme.Length == 0;

        public static string ToKana(IEnumerable<string> phonemes)
        {
            var sb = new StringBuilder();
            string? pendingConsonant = null;

            foreach (var raw in phonemes)
            {
                if (IsNonSpeech(raw))
                {
                    pendingConsonant = null; // phụ âm bị ngắt bởi khoảng lặng: không thành mora
                    continue;
                }

                // Nguyên âm vô thanh (I, U trong です, します) vẫn là một mora
                var p = raw is "I" or "U" or "A" or "E" or "O" ? raw.ToLowerInvariant() : raw;

                if (p == "N") { sb.Append('ん'); pendingConsonant = null; continue; }
                if (p == "cl") { sb.Append('っ'); pendingConsonant = null; continue; }

                var vowelIndex = p.Length == 1 ? Vowels.IndexOf(p[0]) : -1;
                if (vowelIndex >= 0)
                {
                    var row = pendingConsonant != null && Rows.TryGetValue(pendingConsonant, out var r) ? r : Rows[""];
                    sb.Append(row[vowelIndex]);
                    pendingConsonant = null;
                    continue;
                }

                // Phụ âm: chờ nguyên âm. Hai phụ âm liền nhau thì phụ âm trước không thành mora.
                pendingConsonant = Rows.ContainsKey(p) ? p : null;
            }

            return sb.ToString();
        }
    }
}
