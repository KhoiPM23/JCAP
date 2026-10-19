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
        internal static (int Start, int End)[]? Align(IReadOnlyList<Item> items, IReadOnlyList<Mora> moras)
        {
            var n = items.Count;
            var m = moras.Count;

            // nguyên âm hiệu dụng của từng mora (ー kế thừa nguyên âm đứng trước)
            var effective = new char?[m];
            for (var j = 0; j < m; j++)
                effective[j] = moras[j].IsLong ? (j > 0 ? effective[j - 1] : null) : JapaneseMora.VowelOf(moras[j]);

            var ranges = new (int, int)[n];
            var failed = new bool[n + 1, m + 1];

            bool Dfs(int i, int j)
            {
                if (i == n) return j == m;
                if (failed[i, j]) return false;
                var item = items[i];

                if (item.IsZero)
                {
                    ranges[i] = (j, j);
                    if (Dfs(i + 1, j)) return true;
                }
                else if (!item.IsWildcard)
                {
                    if (j < m && KanaMatches(item.Hira, moras[j], j > 0 ? effective[j - 1] : null))
                    {
                        ranges[i] = (j, j + 1);
                        if (Dfs(i + 1, j + 1)) return true;
                    }
                }
                else
                {
                    // đơn vị tự do: thử số mora ít nhất trước để mỏ neo kana phía sau khớp sớm nhất
                    var maxK = Math.Min(m - j, Math.Max(2, item.Text.Length * 5));
                    for (var k = 1; k <= maxK; k++)
                    {
                        ranges[i] = (j, j + k);
                        if (Dfs(i + 1, j + k)) return true;
                    }
                }

                failed[i, j] = true;
                return false;
            }

            return Dfs(0, 0) ? ranges : null;
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
