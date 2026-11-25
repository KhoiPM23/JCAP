using System;
using System.Collections.Generic;
using System.Linq;

namespace JCAP.Services.Implementations
{
    /// <summary>Ngưỡng của việc chấm theo câu mẫu (chỉnh bằng JCAP.Tests/Bench/AlignmentBench, xem docs/shadowing-audio-status.md).</summary>
    public sealed record AlignmentOptions
    {
        /// <summary>
        /// Một biến thể lỗi phải giải thích bản ghi tốt hơn câu mẫu ít nhất chừng này (log-xác suất, nat) mới bị coi là lỗi.
        /// Lớn hơn: ít báo nhầm hơn nhưng bỏ sót nhiều lỗi hơn.
        /// </summary>
        public double Margin { get; init; } = 4.0;

        /// <summary>
        /// Cộng thêm vào Margin cho lỗi đổi nguyên âm: mô hình hay lẫn nguyên âm ở âm cuối/âm nhẹ (へ→い, ご→ぐ) dù đọc đúng.
        /// </summary>
        public double VowelExtraMargin { get; init; } = 2.0;

        /// <summary>
        /// Mức lệch trung bình mỗi khung có tiếng giữa "nghe tự do" và "ép theo câu mẫu" (nat/khung). Lớn hơn mức này thì
        /// coi như người học KHÔNG đọc câu này (nói câu khác), không chấm theo câu mẫu.
        /// </summary>
        public double MaxMismatchPerFrame { get; init; } = 2.5;

        /// <summary>Có xét lỗi kéo dài thừa (thêm trường âm) không.</summary>
        public bool JudgeExtraLength { get; init; } = true;
    }

    /// <summary>Kết luận cho một mora của câu mẫu.</summary>
    public sealed record MoraJudgement(int Index, string Target, string Kind, string? Heard, double Gain);

    public sealed class AlignedRecognition
    {
        /// <summary>Chuỗi mora "đã nghe": câu mẫu với các lỗi đã phát hiện (dùng cho so khớp/điểm/hiển thị như trước).</summary>
        public IReadOnlyList<Mora> Heard { get; init; } = new List<Mora>();
        public IReadOnlyList<MoraJudgement> Moras { get; init; } = new List<MoraJudgement>();
        public double MismatchPerFrame { get; init; }
        /// <summary>true: bản ghi không giống câu mẫu (đọc câu khác/không đọc) — không nên chấm theo câu mẫu.</summary>
        public bool IsMismatch { get; init; }
        public int SpeechFrames { get; init; }
    }

    /// <summary>
    /// Chấm phát âm THEO CÂU MẪU thay vì nhận dạng tự do.
    ///
    /// Nhận dạng tự do bắt mô hình đoán 1 trong 47 âm ở mỗi chỗ nên với giọng người học (khác giọng bản xứ mô hình đã học)
    /// dễ ra chuỗi kana lộn xộn. Ở đây câu mẫu đã biết trước: với TỪNG mora, so "bản ghi là câu mẫu" với "bản ghi là câu mẫu
    /// nhưng mora này bị đọc sai theo kiểu X" (mất âm, mất phụ âm, đổi phụ âm hay nhầm, đổi nguyên âm, thiếu/thừa trường âm,
    /// thiếu っ). Biến thể nào giải thích bản ghi tốt hơn câu mẫu một khoảng đủ lớn (Margin) thì mora đó bị coi là đọc sai
    /// theo đúng kiểu đó; còn lại coi là đạt. Mỗi biến thể chỉ đổi MỘT mora so với câu mẫu.
    ///
    /// Không xét: ん (mô hình không phân biệt được, xem docs) và phụ âm r (hay nhầm với d ở giọng mẫu).
    /// </summary>
    public static class PronunciationAligner
    {
        private static readonly Dictionary<string, string[]> ConsonantConfusions = new()
        {
            ["k"] = new[] { "g" }, ["g"] = new[] { "k" },
            ["t"] = new[] { "d" }, ["d"] = new[] { "t" },
            ["p"] = new[] { "b" }, ["b"] = new[] { "p" },
            ["s"] = new[] { "z", "sh", "ts" }, ["z"] = new[] { "s", "j" },
            ["sh"] = new[] { "s", "ch", "j" }, ["j"] = new[] { "z", "sh" },
            ["ts"] = new[] { "s", "ch" }, ["ch"] = new[] { "ts", "sh" },
            ["h"] = new[] { "f" }, ["f"] = new[] { "h" },
            ["ky"] = new[] { "gy" }, ["gy"] = new[] { "ky" },
        };

        /// <summary>Cặp mora hay nhầm mà đổi cả phụ âm lẫn nguyên âm (không sinh được từ đổi một âm vị).</summary>
        private static readonly Dictionary<string, string[]> MoraConfusions = new()
        {
            ["ふ"] = new[] { "ひ", "ほ" }, ["ひ"] = new[] { "ふ" },
            ["し"] = new[] { "す" }, ["す"] = new[] { "し" },
            ["つ"] = new[] { "ちゅ" }, ["ちゅ"] = new[] { "つ" },
            ["じゃ"] = new[] { "ざ" }, ["ざ"] = new[] { "じゃ" },
            ["じゅ"] = new[] { "ず" }, ["ず"] = new[] { "じゅ" },
            ["じょ"] = new[] { "ぞ" }, ["ぞ"] = new[] { "じょ" },
            ["しゃ"] = new[] { "さ" }, ["さ"] = new[] { "しゃ" },
            ["しゅ"] = new[] { "す" },
            ["しょ"] = new[] { "そ" }, ["そ"] = new[] { "しょ" },
        };

        private const string Vowels = "aiueo";

        private sealed record Variant(string Kind, List<string> Phonemes, List<Mora> Moras);

        /// <summary>
        /// Null nếu không chấm theo câu mẫu được (câu có mora không đổi được sang âm vị, thiếu nhãn trong mô hình…);
        /// khi đó dùng nhận dạng tự do như trước.
        /// </summary>
        public static AlignedRecognition? Align(
            IReadOnlyList<Mora> target, float[][] logProbs, IReadOnlyList<string> labels, AlignmentOptions? options = null)
        {
            options ??= new AlignmentOptions();
            if (target.Count == 0 || logProbs.Length == 0) return null;

            var ids = new Dictionary<string, int>();
            for (var i = 0; i < labels.Count; i++) if (!string.IsNullOrEmpty(labels[i])) ids[labels[i]] = i;
            var blankIds = new[] { "PAD", "pau", "sil" }.Where(ids.ContainsKey).Select(l => ids[l]).ToArray();
            if (blankIds.Length == 0) return null;

            // Âm vị của từng mora câu mẫu
            var targetPhonemes = new List<List<string>>();
            char? prevVowel = null;
            foreach (var mora in target)
            {
                var ph = PhonemesOf(mora, prevVowel);
                if (ph == null) return null;
                targetPhonemes.Add(ph);
                var v = ph.LastOrDefault(p => p.Length == 1 && Vowels.Contains(p[0]));
                if (mora.IsLong) { /* giữ nguyên âm trước */ }
                else prevVowel = v != null ? v[0] : null;
            }

            int[]? TokenOf(string phoneme)
            {
                // Nguyên âm vô thanh (I, U trong です, します) là cùng một âm với nguyên âm thường.
                var set = phoneme switch
                {
                    "i" => new[] { "i", "I" },
                    "u" => new[] { "u", "U" },
                    _ => new[] { phoneme },
                };
                var found = set.Where(ids.ContainsKey).Select(l => ids[l]).ToArray();
                return found.Length == 0 ? null : found;
            }

            List<int[]>? Tokens(IEnumerable<List<string>> moras)
            {
                var list = new List<int[]>();
                foreach (var p in moras.SelectMany(x => x))
                {
                    var tok = TokenOf(p);
                    if (tok == null) return null;
                    list.Add(tok);
                }
                return list;
            }

            var targetTokens = Tokens(targetPhonemes);
            if (targetTokens == null) return null;

            var scorer = new CtcScorer(logProbs, blankIds);
            var baseLl = scorer.LogLikelihood(targetTokens);
            if (double.IsNegativeInfinity(baseLl)) return null;

            // Bản ghi có giống câu mẫu không: so cách gióng tốt nhất theo câu mẫu với đường tốt nhất tự do,
            // chia cho số khung có tiếng (khung mà nhãn mạnh nhất không phải trống).
            var speechFrames = CountSpeechFrames(logProbs, blankIds);
            var forced = scorer.BestAlignmentLogLikelihood(targetTokens);
            var free = scorer.UnconstrainedBestPath();
            var mismatch = speechFrames == 0 ? double.PositiveInfinity : Math.Max(0, free - forced) / speechFrames;

            var judgements = new List<MoraJudgement>();
            var heard = new List<Mora>();
            for (var i = 0; i < target.Count; i++)
            {
                // Chọn biến thể vượt ngưỡng (của loại lỗi đó) nhiều nhất
                Variant? best = null;
                double bestGain = double.NegativeInfinity, bestExcess = double.NegativeInfinity;
                foreach (var variant in VariantsFor(target, targetPhonemes, i, options))
                {
                    var seq = targetPhonemes.Take(i).Append(variant.Phonemes).Concat(targetPhonemes.Skip(i + 1));
                    var tokens = Tokens(seq);
                    if (tokens == null) continue;
                    var gain = scorer.LogLikelihood(tokens) - baseLl;
                    var excess = gain - (options.Margin + (variant.Kind == "vowel" ? options.VowelExtraMargin : 0));
                    if (excess > bestExcess) { bestExcess = excess; bestGain = gain; best = variant; }
                }

                if (best != null && bestExcess > 0)
                {
                    heard.AddRange(best.Moras);
                    judgements.Add(new MoraJudgement(i, target[i].Canon, best.Kind, JapaneseMora.Join(best.Moras), Math.Round(bestGain, 2)));
                }
                else
                {
                    heard.Add(target[i]);
                    var kind = target[i].IsHatsuon ? "unjudged" : "ok";
                    judgements.Add(new MoraJudgement(i, target[i].Canon, kind, null, best == null ? 0 : Math.Round(bestGain, 2)));
                }
            }

            return new AlignedRecognition
            {
                Heard = heard,
                Moras = judgements,
                MismatchPerFrame = double.IsInfinity(mismatch) ? 999 : Math.Round(mismatch, 3),
                IsMismatch = mismatch > options.MaxMismatchPerFrame,
                SpeechFrames = speechFrames,
            };
        }

        private static int CountSpeechFrames(float[][] logProbs, int[] blankIds)
        {
            var count = 0;
            foreach (var row in logProbs)
            {
                var best = 0;
                for (var c = 1; c < row.Length; c++) if (row[c] > row[best]) best = c;
                if (Array.IndexOf(blankIds, best) < 0) count++;
            }
            return count;
        }

        /// <summary>Âm vị của một mora; trường âm lặp lại nguyên âm trước. Null nếu không biết.</summary>
        internal static List<string>? PhonemesOf(Mora mora, char? previousVowel)
        {
            if (mora.IsLong) return previousVowel.HasValue ? new List<string> { previousVowel.Value.ToString() } : null;
            if (mora.IsSokuon) return new List<string> { "cl" };
            if (mora.IsHatsuon) return new List<string> { "N" };
            if (!PhonemeKana.TryGetPhonemes(mora.Canon, out var consonant, out var vowel)) return null;
            return consonant.Length == 0
                ? new List<string> { vowel.ToString() }
                : new List<string> { consonant, vowel.ToString() };
        }

        private static Mora MakeMora(string consonant, char vowel)
        {
            var kana = PhonemeKana.MoraKana(consonant, vowel);
            return new Mora(JapaneseMora.CanonicalKana(kana), kana);
        }

        /// <summary>Các kiểu đọc sai thường gặp của mora thứ i (mỗi biến thể chỉ đổi mora này; bỏ biến thể trùng cách viết với câu mẫu).</summary>
        private static IEnumerable<Variant> VariantsFor(IReadOnlyList<Mora> target, List<List<string>> phonemes, int i, AlignmentOptions options)
        {
            var seen = new HashSet<string>();
            foreach (var v in RawVariantsFor(target, phonemes, i, options))
            {
                var key = string.Join(" ", v.Phonemes);
                if (!seen.Add(key)) continue;
                // Đổi âm mà vẫn ra cùng chữ (vd. "h u" và "f u" đều là ふ) thì người học không thấy khác gì: bỏ
                if (v.Moras.Count == 1 && v.Moras[0].Canon == target[i].Canon) continue;
                yield return v;
            }
        }

        private static IEnumerable<Variant> RawVariantsFor(IReadOnlyList<Mora> target, List<List<string>> phonemes, int i, AlignmentOptions options)
        {
            var mora = target[i];
            var ph = phonemes[i];

            if (mora.IsHatsuon) yield break; // ん: mô hình không phân biệt được, không nhận xét

            if (mora.IsLong)
            {
                yield return new Variant("short", new List<string>(), new List<Mora>()); // thiếu trường âm
                yield break;
            }
            if (mora.IsSokuon)
            {
                yield return new Variant("sokuon", new List<string>(), new List<Mora>()); // thiếu っ
                yield break;
            }

            var consonant = ph.Count == 2 ? ph[0] : string.Empty;
            var vowel = ph[^1][0];

            yield return new Variant("missing", new List<string>(), new List<Mora>());

            if (consonant.Length > 0 && consonant != "r")
            {
                // Mất phụ âm đầu (パ → ア)
                yield return new Variant("consonant", new List<string> { vowel.ToString() }, new List<Mora> { MakeMora("", vowel) });
                if (ConsonantConfusions.TryGetValue(consonant, out var subs))
                    foreach (var c in subs)
                        yield return new Variant("consonant", new List<string> { c, vowel.ToString() }, new List<Mora> { MakeMora(c, vowel) });
            }

            if (MoraConfusions.TryGetValue(mora.Canon, out var moraSubs))
            {
                foreach (var kana in moraSubs)
                {
                    var sub = new Mora(JapaneseMora.CanonicalKana(kana), kana);
                    var subPh = PhonemesOf(sub, null);
                    if (subPh != null) yield return new Variant("consonant", subPh, new List<Mora> { sub });
                }
            }

            foreach (var v in Vowels)
            {
                if (v == vowel) continue;
                var list = consonant.Length > 0 ? new List<string> { consonant, v.ToString() } : new List<string> { v.ToString() };
                yield return new Variant("vowel", list, new List<Mora> { MakeMora(consonant, v) });
            }

            // Kéo dài thừa (おばさん đọc thành おばあさん): chỉ khi mora sau không phải trường âm sẵn
            if (options.JudgeExtraLength && (i + 1 >= target.Count || !target[i + 1].IsLong))
            {
                var longer = new List<string>(ph) { vowel.ToString() };
                yield return new Variant("extra_long", longer, new List<Mora> { mora, new(JapaneseMora.LongMark, "ー") });
            }
        }
    }
}
