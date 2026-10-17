using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Một mora (拍): đơn vị nhịp của tiếng Nhật.
    /// Canon là dạng so sánh (hiragana, trường âm luôn là "ー"); Display là dạng hiển thị cho người học.
    /// </summary>
    public readonly record struct Mora(string Canon, string Display)
    {
        public bool IsLong => Canon == JapaneseMora.LongMark;
        public bool IsSokuon => Canon == "っ";
        public bool IsHatsuon => Canon == "ん";
        public bool IsUnresolved => Canon.Length > 0 && Canon[0] == '?';
    }

    /// <summary>
    /// Chuẩn hóa văn bản và tách kana thành mora (thuần túy, không phụ thuộc dịch vụ ngoài).
    ///
    /// Quy ước mora:
    ///  - Mỗi kana là một mora; ゃゅょ và ぁぃぅぇぉ nhỏ ghép với kana trước (しゃ = 1 mora).
    ///  - っ (âm ngắt) và ん (âm mũi) mỗi cái là một mora riêng.
    ///  - Trường âm là một mora riêng, luôn chuẩn hóa về "ー", dù được viết bằng ー, nguyên âm lặp lại
    ///    (おかあさん, ええ), お段+う (おとうさん) hay え段+い (せんせい). Nhờ đó おばあさん/おばさん khác nhau đúng 1 mora.
    ///  - を→お, ぢ→じ, づ→ず để so khớp theo cách PHÁT ÂM.
    /// </summary>
    public static class JapaneseMora
    {
        public const string LongMark = "ー";

        private static readonly Regex PunctuationAndSpace =
            new(@"[\s　。、！？!?.,\-_~—「」『』()（）・:：;；""'`]", RegexOptions.Compiled);

        // kana cơ bản -> (phụ âm, nguyên âm). Phụ âm chỉ dùng để phân loại lỗi (đục/trong, sai nguyên âm).
        private static readonly Dictionary<char, (string Consonant, char Vowel)> Base = BuildBase();

        private static Dictionary<char, (string, char)> BuildBase()
        {
            var map = new Dictionary<char, (string, char)>();
            void Row(string chars, string consonant, string vowels = "aiueo")
            {
                for (var i = 0; i < chars.Length; i++) map[chars[i]] = (consonant, vowels[i]);
            }
            Row("あいうえお", "");
            Row("かきくけこ", "k"); Row("がぎぐげご", "g");
            Row("さしすせそ", "s"); Row("ざじずぜぞ", "z");
            Row("たちつてと", "t"); Row("だぢづでど", "d");
            Row("なにぬねの", "n");
            Row("はひふへほ", "h"); Row("ばびぶべぼ", "b"); Row("ぱぴぷぺぽ", "p");
            Row("まみむめも", "m");
            Row("らりるれろ", "r");
            Row("やゆよ", "y", "auo");
            map['わ'] = ("w", 'a'); map['を'] = ("", 'o'); map['ゔ'] = ("v", 'u');
            return map;
        }

        private const string SmallYa = "ゃゅょ";
        private const string SmallVowels = "ぁぃぅぇぉ";

        /// <summary>NFKC, bỏ khoảng trắng và dấu câu (giữ nguyên ー).</summary>
        public static string Normalize(string? text)
        {
            if (string.IsNullOrEmpty(text)) return string.Empty;
            return PunctuationAndSpace.Replace(text.Normalize(NormalizationForm.FormKC), string.Empty);
        }

        public static string KatakanaToHiragana(string text)
        {
            var sb = new StringBuilder(text.Length);
            foreach (var ch in text)
                sb.Append(ch >= 'ァ' && ch <= 'ヶ' ? (char)(ch - 0x60) : ch);
            return sb.ToString();
        }

        /// <summary>
        /// Tách chuỗi kana (hiragana/katakana, có thể có ー) thành mora đã chuẩn hóa trường âm.
        /// Ký tự không phải kana (kanji, chữ Latin, số) trở thành mora "chưa phân giải" (Canon bắt đầu bằng '?').
        /// </summary>
        /// <param name="preserveLongVowelSpelling">
        /// true: trường âm hiển thị đúng chữ kana gốc (おばあさん → "あ") — dùng khi kana là chữ viết thật.
        /// false: kana là phiên âm của G2P (VOICEVOX ghi きれえ, がっこお, を thành オ): trường âm hiển thị bằng kana thông dụng
        /// theo nguyên âm đứng trước (a→あ, i→い, u→う, e→い, o→う) thay vì chính tả sai hay dấu "ー".
        /// Đây chỉ là cách hiển thị; so sánh luôn dùng dạng chuẩn hóa "ー".
        /// </param>
        public static List<Mora> FromKana(string kana, bool preserveLongVowelSpelling = true)
        {
            var s = KatakanaToHiragana(Normalize(kana));
            var raw = new List<Mora>();

            for (var i = 0; i < s.Length; i++)
            {
                var ch = s[i];

                if (ch == 'っ') { raw.Add(new Mora("っ", "っ")); continue; }
                if (ch == 'ん') { raw.Add(new Mora("ん", "ん")); continue; }
                if (ch == 'ー') { raw.Add(new Mora(LongMark, "ー")); continue; }

                if (Base.ContainsKey(ch))
                {
                    var display = ch.ToString();
                    if (i + 1 < s.Length && (SmallYa.Contains(s[i + 1]) || SmallVowels.Contains(s[i + 1])))
                    {
                        display += s[i + 1];
                        i++;
                    }
                    raw.Add(new Mora(CanonicalKana(display), display));
                    continue;
                }

                raw.Add(new Mora("?" + ch, ch.ToString())); // chưa phân giải (vd. kanji không có trong từ điển)
            }

            return NormalizeLongVowels(raw, preserveLongVowelSpelling);
        }

        internal static string CanonicalKana(string display) => display
            .Replace('を', 'お').Replace('ぢ', 'じ').Replace('づ', 'ず');

        /// <summary>Nguyên âm của mora (a/i/u/e/o) hoặc null nếu không có (っ, ん, ー, chưa phân giải).</summary>
        public static char? VowelOf(Mora mora)
        {
            if (mora.IsLong || mora.IsSokuon || mora.IsHatsuon || mora.IsUnresolved || mora.Canon.Length == 0) return null;
            var last = mora.Canon[^1];
            if (SmallYa.Contains(last)) return last == 'ゃ' ? 'a' : last == 'ゅ' ? 'u' : 'o';
            var smallIndex = SmallVowels.IndexOf(last);
            if (smallIndex >= 0) return "aiueo"[smallIndex];
            return Base.TryGetValue(last, out var info) ? info.Vowel : null;
        }

        public static string ConsonantOf(Mora mora)
        {
            if (mora.Canon.Length == 0 || mora.IsLong || mora.IsSokuon || mora.IsHatsuon || mora.IsUnresolved) return string.Empty;
            return Base.TryGetValue(mora.Canon[0], out var info) ? info.Consonant : string.Empty;
        }

        private static bool IsVowelOnly(string canon) => canon.Length == 1 && "あいうえお".Contains(canon[0]);

        /// <summary>
        /// Chuẩn hóa trường âm: nguyên âm đơn lặp lại nguyên âm trước, お段+う, え段+い, và ー đều thành mora "ー".
        /// </summary>
        private static List<Mora> NormalizeLongVowels(List<Mora> raw, bool preserveSpelling)
        {
            var result = new List<Mora>(raw.Count);
            char? prevVowel = null; // nguyên âm của mora trước (ー kế thừa nguyên âm đứng trước nó)

            foreach (var mora in raw)
            {
                if (mora.IsLong)
                {
                    result.Add(new Mora(LongMark, mora.Display));
                    continue; // prevVowel giữ nguyên
                }

                if (IsVowelOnly(mora.Canon) && prevVowel.HasValue)
                {
                    var v = mora.Canon[0] switch { 'あ' => 'a', 'い' => 'i', 'う' => 'u', 'え' => 'e', _ => 'o' };
                    var isLong = v == prevVowel.Value
                                 || (v == 'u' && prevVowel.Value == 'o')   // おとうさん, がっこう
                                 || (v == 'i' && prevVowel.Value == 'e');  // せんせい, きれい
                    if (isLong)
                    {
                        result.Add(new Mora(LongMark, preserveSpelling ? mora.Display : DisplayForLongVowel(prevVowel.Value)));
                        continue; // nguyên âm trước không đổi
                    }
                }

                result.Add(mora);
                prevVowel = VowelOf(mora); // っ/ん/chưa phân giải → null: nguyên âm sau đó không bị coi là trường âm
            }

            return result;
        }

        private static string DisplayForLongVowel(char previousVowel) => previousVowel switch
        {
            'a' => "あ",
            'i' => "い",
            'e' => "い",
            _ => "う", // u, o
        };

        /// <summary>
        /// Tách nhiều từ (cụm trọng âm), chuẩn hóa trường âm TRONG TỪNG TỪ (ranh giới từ làm mới ngữ cảnh), rồi nối lại.
        /// Nhờ đó một từ đọc đúng luôn có cùng chuỗi mora bất kể từ đứng trước nó
        /// (vd. 「どうぞ」+「おねがい」: お đầu từ không bị coi là trường âm của ぞ).
        /// </summary>
        /// <param name="starts">Chỉ số mora bắt đầu của từng từ không rỗng.</param>
        public static List<Mora> FromKanaPhrases(IEnumerable<string> phraseKanas, bool preserveLongVowelSpelling, out List<int> starts)
        {
            var all = new List<Mora>();
            starts = new List<int>();
            foreach (var phrase in phraseKanas)
            {
                var moras = FromKana(phrase, preserveLongVowelSpelling);
                if (moras.Count == 0) continue;
                starts.Add(all.Count);
                all.AddRange(moras);
            }
            return all;
        }

        public static string Join(IEnumerable<Mora> moras) => string.Concat(moras.Select(m => m.Display));
    }
}
