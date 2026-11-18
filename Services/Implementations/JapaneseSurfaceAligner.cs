using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Gióng chữ viết của câu mẫu (kanji/kana) với chuỗi mora của cách đọc, để hiển thị lỗi trên CÂU GỐC
    /// (助 / かります / 飲み物 / を…) thay vì trên chuỗi kana.
    ///
    /// Quy tắc gióng:
    ///  - Mỗi kana là một "đơn vị kana" và phải khớp đúng một mora (ghép ゃゅょ, っ, ん, ー).
    ///  - Một cụm chữ Hán (hoặc ký tự khác) là "đơn vị tự do", nhận một hoặc nhiều mora; okurigana đứng sau là mỏ neo.
    ///  - Dấu câu không chiếm mora.
    ///  - Nguyên âm đơn đứng sau mora cùng nguyên âm (を sau の, い sau い, う sau お, い sau え) khớp với trường âm "ー" của cách đọc,
    ///    vì cách đọc G2P ghi を là オ và いい là イイ.
    /// Không gióng được thì trả null và người gọi dùng hiển thị theo kana.
    /// </summary>
    internal static class JapaneseSurfaceAligner
    {
        internal sealed record Item(string Text, bool IsWildcard, bool IsZero, string Hira);

        private const string SmallKana = "ゃゅょぁぃぅぇぉャュョァィゥェォ";
        private static readonly Regex Whitespace = new(@"[\s　]", RegexOptions.Compiled);
        private const string Punctuation = "。、！？!?.,-_~—「」『』()（）・:：;；\"'`";

        internal static List<Item> Segment(string text)
        {
            var s = Whitespace.Replace((text ?? string.Empty).Normalize(NormalizationForm.FormKC), string.Empty);
            var items = new List<Item>();

            for (var i = 0; i < s.Length; i++)
            {
                var ch = s[i];

                if (Punctuation.Contains(ch))
                {
                    items.Add(new Item(ch.ToString(), false, true, string.Empty));
                }
                else if (IsKana(ch))
                {
                    var unit = ch.ToString();
                    if (ch != 'っ' && ch != 'ッ' && ch != 'ん' && ch != 'ン' && ch != 'ー'
                        && i + 1 < s.Length && SmallKana.Contains(s[i + 1]))
                    {
                        unit += s[i + 1];
                        i++;
                    }
                    items.Add(new Item(unit, false, false, JapaneseMora.KatakanaToHiragana(unit)));
                }
                else if (IsHan(ch))
                {
                    var start = i;
                    while (i + 1 < s.Length && IsHan(s[i + 1])) i++;
                    items.Add(new Item(s.Substring(start, i - start + 1), true, false, string.Empty));
                }
                else
                {
                    items.Add(new Item(ch.ToString(), true, false, string.Empty));
                }
            }

            return items;
        }

        private static bool IsKana(char c) => (c >= 'ぁ' && c <= 'ゖ') || (c >= 'ァ' && c <= 'ヺ') || c == 'ー';
        private static bool IsHan(char c) =>
            (c >= '㐀' && c <= '䶿') || (c >= '一' && c <= '鿿') || (c >= '豈' && c <= '﫿') || c == '々' || c == '〆';

        /// <summary>Với mỗi đơn vị trả về khoảng mora [Start, End). Null nếu không có cách gióng hợp lệ.</summary>
        /// <param name="phraseStarts">
        /// Ranh giới cụm trọng âm của cách đọc (nếu có). G2P luôn ngắt cụm ở dấu câu, nên dấu câu giữa câu phải rơi vào một ranh giới:
        /// nhờ đó hai cụm chữ Hán cách nhau bởi dấu câu (十時四十分発、七号車) không bị chia mora sai. Không gióng được theo ranh giới
        /// (nguồn cách đọc gộp hai bên dấu câu vào một cụm) thì gióng lại không có ràng buộc này.
        /// </param>
        internal static (int Start, int End)[]? Align(IReadOnlyList<Item> items, IReadOnlyList<Mora> moras, IReadOnlyCollection<int>? phraseStarts = null)
        {
            if (phraseStarts is { Count: > 0 })
            {
                var boundaries = new HashSet<int>(phraseStarts) { 0, moras.Count };
                var constrained = AlignCore(items, moras, boundaries);
                if (constrained != null) return constrained;
            }
            return AlignCore(items, moras, null);
        }

        private static (int Start, int End)[]? AlignCore(IReadOnlyList<Item> items, IReadOnlyList<Mora> moras, HashSet<int>? boundaries)
        {
            var n = items.Count;
            var m = moras.Count;

            // nguyên âm hiệu dụng của từng mora (ー kế thừa nguyên âm đứng trước)
            var effective = new char?[m];
            for (var j = 0; j < m; j++)
                effective[j] = moras[j].IsLong ? (j > 0 ? effective[j - 1] : null) : JapaneseMora.VowelOf(moras[j]);

            // Quy hoạch động: trong các cách gióng hợp lệ, chọn cách mà số mora của mỗi đơn vị tự do gần với ~2 mora/ký tự nhất
            // (chữ Hán thường đọc 1–3 mora). Tránh chia lệch kiểu 十時四十分発 = "じゅ", 七号車 = phần còn lại khi hai cụm đứng sát nhau.
            // Cùng chi phí thì ưu tiên ít mora hơn cho đơn vị đứng trước (như trước đây: mỏ neo kana phía sau khớp sớm nhất).
            const int Infinite = int.MaxValue / 2;
            var best = new int[n + 1, m + 1];
            var choice = new int[n + 1, m + 1];
            for (var i = 0; i <= n; i++)
                for (var j = 0; j <= m; j++) best[i, j] = -1; // chưa tính

            int Solve(int i, int j)
            {
                if (i == n) return j == m ? 0 : Infinite;
                if (best[i, j] >= 0) return best[i, j];
                var item = items[i];
                var result = Infinite;
                var pick = 0;

                if (item.IsZero)
                {
                    if (boundaries == null || boundaries.Contains(j)) result = Solve(i + 1, j);
                }
                else if (!item.IsWildcard)
                {
                    if (j < m && KanaMatches(item.Hira, moras[j], j > 0 ? effective[j - 1] : null))
                    {
                        result = Solve(i + 1, j + 1);
                        pick = 1;
                    }
                }
                else
                {
                    var maxK = Math.Min(m - j, Math.Max(2, item.Text.Length * 5));
                    var expected = 2 * item.Text.Length;
                    for (var k = 1; k <= maxK; k++)
                    {
                        var rest = Solve(i + 1, j + k);
                        if (rest >= Infinite) continue;
                        var cost = rest + Math.Abs(k - expected);
                        if (cost < result) { result = cost; pick = k; }
                    }
                }

                choice[i, j] = pick;
                return best[i, j] = result;
            }

            if (Solve(0, 0) >= Infinite) return null;
            var ranges = new (int, int)[n];
            for (int i = 0, j = 0; i < n; i++)
            {
                var k = choice[i, j];
                ranges[i] = (j, j + k);
                j += k;
            }
            return ranges;
        }

        private static bool KanaMatches(string hira, Mora mora, char? previousVowel)
        {
            if (hira == "ー") return mora.IsLong;

            if (mora.IsLong)
            {
                if (hira.Length != 1 || previousVowel is null) return false;
                var pv = previousVowel.Value;
                return hira[0] switch
                {
                    'あ' => pv == 'a',
                    'い' => pv == 'i' || pv == 'e',
                    'う' => pv == 'u' || pv == 'o',
                    'え' => pv == 'e',
                    'お' or 'を' => pv == 'o',
                    _ => false
                };
            }

            if (mora.Canon == JapaneseMora.CanonicalKana(hira)) return true;
            // trợ từ: は đọc わ, へ đọc え
            return (hira == "は" && mora.Canon == "わ") || (hira == "へ" && mora.Canon == "え");
        }
    }
}
