using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// So khớp câu mẫu và transcript theo TỪ, dùng MORA (đơn vị nhịp tiếng Nhật) để biết sai chỗ nào trong từ.
    ///
    /// 1. Cả hai phía được chuyển sang chuỗi mora bằng CÙNG một nguồn cách đọc (G2P của VOICEVOX).
    ///    Nhờ đó 綺麗ですね = きれいですね, 一人 = ひとり = 1人, カウンター = かうんたー.
    ///    Nếu không đọc được (engine tắt, ký tự lạ) thì trả ReadingUnavailable: KHÔNG đoán cách đọc và KHÔNG cho điểm.
    /// 2. Căn chỉnh bằng khoảng cách chỉnh sửa trên mora (thay/thiếu/thừa) để biết mora nào đúng/sai.
    /// 3. Câu mẫu được chia thành TỪ (cụm trọng âm của G2P; trợ từ đơn sau chữ Hán/katakana tách riêng).
    ///    Một từ chỉ ĐÚNG khi mọi mora của nó đúng và không có âm thừa chen vào giữa; từ sai không được tính điểm
    ///    dù có vài mora trùng ngẫu nhiên.
    /// 4. Điểm = 100 × (số mora của các từ đúng − số mora thừa đứng riêng) / số mora câu mẫu, tối thiểu 0
    ///    (tối đa 99 nếu chưa hoàn hảo).
    ///
    /// Giới hạn: điểm chỉ phản ánh transcript. Nếu bộ nhận dạng "sửa" lỗi phát âm thành từ chuẩn
    /// (vd. nghe がこう nhưng trả 学校) thì lỗi không thể phát hiện. Đây là Content Match, không phải điểm âm học.
    /// </summary>
    public sealed class KanaMoraComparer : IJapaneseTextComparer
    {
        public const string Method = "kana-word-v1";
        public string MethodId => Method;

        private enum OpKind { Match, Substitute, Delete, Insert }

        private readonly record struct Op(OpKind Kind, Mora? Target, Mora? Spoken, string? ErrorType, int SpokenIndex = -1);

        private readonly IReadOnlyList<IKanaReader> _readers;

        public KanaMoraComparer(IEnumerable<IKanaReader> readers)
        {
            _readers = readers.ToList();
            if (_readers.Count == 0) throw new ArgumentException("Cần ít nhất một nguồn cách đọc.", nameof(readers));
        }

        public async Task WarmUpAsync(string target, CancellationToken cancellationToken = default)
        {
            try { await _readers[0].TryReadAsync(target ?? string.Empty, cancellationToken); }
            catch (OperationCanceledException) { }
            catch (Exception) { /* chỉ là bước làm nóng, lỗi sẽ được xử lý ở lượt so khớp thật */ }
        }

        public async Task<JapaneseTextComparison> CompareAsync(
            string target, string recognized, CancellationToken cancellationToken = default)
        {
            target ??= string.Empty;
            recognized ??= string.Empty;

            // Hai phía luôn dùng cùng một nguồn; nguồn nào không đọc được một phía thì chuyển cả hai sang nguồn kế tiếp
            // (nếu có). Hết nguồn thì báo chưa chấm được.
            KanaReading? t = null, r = null;
            foreach (var reader in _readers)
            {
                // Đọc hai phía song song để không cộng dồn thời gian chờ.
                var targetTask = reader.TryReadAsync(target, cancellationToken);
                var recognizedTask = reader.TryReadAsync(recognized, cancellationToken);
                await Task.WhenAll(targetTask, recognizedTask);
                t = targetTask.Result;
                r = recognizedTask.Result;
                if (t != null && r != null) break;
                t = r = null;
            }
            if (t == null || r == null || t.UnresolvedCount > 0 || r.UnresolvedCount > 0)
                return JapaneseTextComparison.Unavailable();

            return Align(target, recognized, t, r);
        }

        private sealed class Word
        {
            public string Text = string.Empty;
            public int Start;
            public int End;
        }

        private sealed class WordResult
        {
            public Word Word = null!;
            public string Status = "correct"; // correct | missing | mismatched
            public string? ErrorType;
            public string? Expected;
            public string? Spoken;
        }

        private static JapaneseTextComparison Align(string targetText, string recognizedText, KanaReading t, KanaReading r)
        {
            var tm = t.Moras;
            var sm = r.Moras;
            var m = tm.Count;
            var n = sm.Count;

            var words = BuildWords(targetText, t);
            var boundaries = words.Select(w => w.Start).ToHashSet();

            // 1. Căn chỉnh ở mức mora (chỉ để biết sai ở đâu; KHÔNG dùng để cho điểm từng mora).
            // Mỗi lỗi tốn Unit. Khi nhiều cách căn chỉnh cùng số lỗi, ưu tiên cách đặt âm THỪA ở ranh giới giữa các từ
            // (chi phí phụ 1 cho âm thừa chen vào GIỮA một từ) để không biến một từ đọc đúng thành từ sai chỉ vì khớp lặp.
            const int Unit = 1000;
            int InsertCost(int gap) => Unit + (gap == m || boundaries.Contains(gap) ? 0 : 1);

            var dp = new int[m + 1, n + 1];
            for (var i = 1; i <= m; i++) dp[i, 0] = i * Unit;
            for (var j = 1; j <= n; j++) dp[0, j] = dp[0, j - 1] + InsertCost(0);
            for (var i = 1; i <= m; i++)
            {
                for (var j = 1; j <= n; j++)
                {
                    var cost = tm[i - 1].Canon == sm[j - 1].Canon ? 0 : Unit;
                    dp[i, j] = Math.Min(dp[i - 1, j - 1] + cost, Math.Min(dp[i - 1, j] + Unit, dp[i, j - 1] + InsertCost(i)));
                }
            }

            // Truy vết (ưu tiên thay thế, rồi thiếu, rồi thừa)
            var ops = new List<Op>();
            int a = m, b = n;
            while (a > 0 || b > 0)
            {
                if (a > 0 && b > 0)
                {
                    var same = tm[a - 1].Canon == sm[b - 1].Canon;
                    if (dp[a, b] == dp[a - 1, b - 1] + (same ? 0 : Unit))
                    {
                        ops.Add(same
                            ? new Op(OpKind.Match, tm[a - 1], sm[b - 1], null, b - 1)
                            : new Op(OpKind.Substitute, tm[a - 1], sm[b - 1], ClassifySubstitution(tm[a - 1], sm[b - 1]), b - 1));
                        a--; b--;
                        continue;
                    }
                }
                if (a > 0 && dp[a, b] == dp[a - 1, b] + Unit)
                {
                    ops.Add(new Op(OpKind.Delete, tm[a - 1], null, ClassifyOmission(tm[a - 1])));
                    a--;
                    continue;
                }
                ops.Add(new Op(OpKind.Insert, null, sm[b - 1], ClassifyOmission(sm[b - 1], extra: true), b - 1));
                b--;
            }
            ops.Reverse();

            // Op theo chỉ số mora của câu mẫu; mora thừa theo vị trí khe (trước mora có chỉ số đó).
            var opAt = new Op[m];
            var extras = new List<(Mora Mora, int Index)>?[m + 1];
            var cursor = 0;
            foreach (var op in ops)
            {
                if (op.Kind == OpKind.Insert) (extras[cursor] ??= new List<(Mora, int)>()).Add((op.Spoken!.Value, op.SpokenIndex));
                else opAt[cursor++] = op;
            }

            // 2. Đánh giá từng từ: một từ chỉ đúng khi TẤT CẢ mora của nó đúng và không có âm thừa chen vào giữa.
            var results = new List<WordResult>();
            foreach (var word in words)
            {
                var slice = Enumerable.Range(word.Start, word.End - word.Start).Select(i => opAt[i]).ToList();
                var hasInsideExtra = Enumerable.Range(word.Start + 1, Math.Max(0, word.End - word.Start - 1)).Any(g => extras[g] != null);
                var wr = new WordResult { Word = word };

                var allMatch = slice.All(o => o.Kind == OpKind.Match);
                var allDelete = slice.All(o => o.Kind == OpKind.Delete);
                wr.Status = allMatch && !hasInsideExtra ? "correct"
                    : allDelete && !hasInsideExtra ? "missing"
                    : "mismatched";

                if (wr.Status != "correct")
                {
                    wr.ErrorType = slice.FirstOrDefault(o => o.Kind != OpKind.Match).ErrorType ?? (hasInsideExtra ? "extra" : null);
                    wr.Expected = JapaneseMora.Join(slice.Select(o => o.Target!.Value));

                    var spoken = new StringBuilder();
                    for (var k = word.Start; k < word.End; k++)
                    {
                        if (k > word.Start && extras[k] != null) spoken.Append(JapaneseMora.Join(extras[k]!.Select(x => x.Mora)));
                        if (opAt[k].Spoken.HasValue) spoken.Append(opAt[k].Spoken!.Value.Display);
                    }
                    wr.Spoken = spoken.Length > 0 ? spoken.ToString() : null;
                }
                results.Add(wr);
            }

            // 3. Điểm theo TỪ: số mora của các từ đọc đúng hoàn toàn, trừ các âm thừa đứng riêng giữa/ngoài các từ.
            //    Âm trùng ngẫu nhiên bên trong một từ sai KHÔNG được tính điểm.
            var correctMoras = results.Where(x => x.Status == "correct").Sum(x => x.Word.End - x.Word.Start);
            var standaloneExtras = Enumerable.Range(0, m + 1).Where(g => g == m || boundaries.Contains(g)).Sum(g => extras[g]?.Count ?? 0);
            var anyExtra = extras.Any(e => e != null);
            var perfect = m > 0 && results.All(x => x.Status == "correct") && !anyExtra;

            var score = perfect ? 100
                : m == 0 ? 0
                : Math.Min(99, Math.Max(0, (int)Math.Round(100.0 * (correctMoras - standaloneExtras) / m, MidpointRounding.AwayFromZero)));

            // 4. Hiển thị theo từ trên câu gốc
            var tokens = perfect
                ? new List<ShadowingDiffTokenDto> { new() { Text = targetText, Status = "correct" } }
                : BuildTokens(targetText, recognizedText, sm, results, extras);

            return new JapaneseTextComparison
            {
                ContentMatchScore = score,
                Tokens = tokens,
                TargetWords = words.Select(w => new TargetWordSpan(w.Text, w.Start, w.End)).ToList(),
                Feedback = BuildFeedback(score, results, extras, boundaries, m),
                ReadingSource = t.Source,
                TargetReading = JapaneseMora.Join(tm),
                RecognizedReading = JapaneseMora.Join(sm)
            };
        }

        // ---- Phân loại lỗi mora (để nói rõ sai kiểu gì trong một từ) ----

        private static string ClassifyOmission(Mora mora, bool extra = false)
        {
            if (mora.IsLong) return "chouon";
            if (mora.IsSokuon) return "sokuon";
            if (mora.IsHatsuon) return "hatsuon";
            return extra ? "extra" : "mora";
        }

        private static readonly HashSet<(string, string)> VoicingPairs = new()
        {
            ("k", "g"), ("g", "k"), ("s", "z"), ("z", "s"), ("t", "d"), ("d", "t"),
            ("h", "b"), ("b", "h"), ("h", "p"), ("p", "h"), ("b", "p"), ("p", "b"),
        };

        private static string ClassifySubstitution(Mora target, Mora spoken)
        {
            var tv = JapaneseMora.VowelOf(target);
            var sv = JapaneseMora.VowelOf(spoken);
            var tc = JapaneseMora.ConsonantOf(target);
            var sc = JapaneseMora.ConsonantOf(spoken);

            if (tv.HasValue && tv == sv && VoicingPairs.Contains((tc, sc))) return "voicing";
            if (target.IsLong || spoken.IsLong) return "chouon";
            if (target.IsSokuon || spoken.IsSokuon) return "sokuon";
            if (target.IsHatsuon || spoken.IsHatsuon) return "hatsuon";
            return "mora";
        }

        // ---- Tách câu mẫu thành TỪ ----

        private const string ParticleChars = "はがをにへでとものや";
        private const string TrailingPunctuation = "。、！？!?.,-_~—「」『』()（）・:：;；\"'`";

        private static bool IsKatakana(char c) => (c >= 'ァ' && c <= 'ヺ') || c == 'ー';

        /// <summary>
        /// Từ = cụm trọng âm (accent phrase) của G2P, tức một từ cùng các trợ từ/đuôi gắn liền (助かります, いつでも, 飲み物を).
        /// Trợ từ đơn đứng cuối sau chữ Hán hoặc katakana (を, に, は, へ…) được tách thành từ riêng để lỗi trợ từ không làm sai cả từ chính.
        /// Nguồn cách đọc không cung cấp ranh giới từ thì cả câu là một từ.
        /// </summary>
        private static List<Word> BuildWords(string targetText, KanaReading t)
        {
            var tm = t.Moras;
            var m = tm.Count;

            var starts = (t.WordStarts ?? Array.Empty<int>()).Where(s => s > 0 && s < m).Distinct().OrderBy(s => s).ToList();
            starts.Insert(0, 0);

            int PhraseOf(int moraIndex)
            {
                var p = 0;
                for (var i = 0; i < starts.Count; i++) if (starts[i] <= moraIndex) p = i;
                return p;
            }

            var items = JapaneseSurfaceAligner.Segment(targetText);
            var ranges = JapaneseSurfaceAligner.Align(items, tm);
            var words = new List<Word>();

            if (ranges == null)
            {
                // Không gióng được chữ viết với cách đọc: hiển thị từng từ theo kana.
                for (var i = 0; i < starts.Count; i++)
                {
                    var s = starts[i];
                    var e = i + 1 < starts.Count ? starts[i + 1] : m;
                    words.Add(new Word { Text = JapaneseMora.Join(tm.Skip(s).Take(e - s)), Start = s, End = e });
                }
                return words;
            }

            // Nhóm các đơn vị chữ viết theo cụm trọng âm; dấu câu bám vào từ đứng trước.
            var groups = new List<(int Phrase, List<int> Idx)>();
            var prefix = string.Empty;
            for (var i = 0; i < items.Count; i++)
            {
                if (items[i].IsZero)
                {
                    if (groups.Count == 0) prefix += items[i].Text; else groups[^1].Idx.Add(i);
                    continue;
                }
                var phrase = PhraseOf(ranges[i].Start);
                if (groups.Count > 0 && groups[^1].Phrase == phrase) groups[^1].Idx.Add(i);
                else groups.Add((phrase, new List<int> { i }));
            }

            Word MakeWord(IEnumerable<int> idx)
            {
                var list = idx.ToList();
                var nonZero = list.Where(i => !items[i].IsZero).ToList();
                return new Word
                {
                    Text = string.Concat(list.Select(i => items[i].Text)),
                    Start = ranges[nonZero[0]].Start,
                    End = ranges[nonZero[^1]].End,
                };
            }

            foreach (var (_, idx) in groups)
            {
                var nonZero = idx.Where(i => !items[i].IsZero).ToList();
                var splitAt = -1;
                if (nonZero.Count >= 2)
                {
                    var last = items[nonZero[^1]];
                    var prev = items[nonZero[^2]];
                    var lastIsParticle = !last.IsWildcard && last.Text.Length == 1 && ParticleChars.Contains(last.Text[0]);
                    var prevIsContentWord = prev.IsWildcard || IsKatakana(prev.Text[0]);
                    if (lastIsParticle && prevIsContentWord) splitAt = idx.IndexOf(nonZero[^1]);
                }

                if (splitAt < 0) words.Add(MakeWord(idx));
                else { words.Add(MakeWord(idx.Take(splitAt))); words.Add(MakeWord(idx.Skip(splitAt))); }
            }

            if (prefix.Length > 0 && words.Count > 0) words[0].Text = prefix + words[0].Text;
            return words;
        }

        // ---- Hiển thị: mỗi từ một token trên câu gốc ----

        private static List<ShadowingDiffTokenDto> BuildTokens(
            string targetText, string recognizedText, IReadOnlyList<Mora> sm,
            List<WordResult> results, List<(Mora Mora, int Index)>?[] extras)
        {
            // Chữ viết của transcript, để hiển thị âm thừa đúng như Gemini/Web Speech đã viết (không phải dạng chuẩn hóa).
            var spokenItems = JapaneseSurfaceAligner.Segment(recognizedText);
            var spokenRanges = JapaneseSurfaceAligner.Align(spokenItems, sm);

            string SpokenText(List<(Mora Mora, int Index)> list)
            {
                if (spokenRanges != null)
                {
                    var wanted = list.Select(x => x.Index).ToHashSet();
                    var parts = new StringBuilder();
                    for (var k = 0; k < spokenItems.Count; k++)
                    {
                        var (s, e) = spokenRanges[k];
                        if (spokenItems[k].IsZero) continue;
                        if (Enumerable.Range(s, e - s).Any(wanted.Contains)) parts.Append(spokenItems[k].Text);
                    }
                    if (parts.Length > 0) return parts.ToString();
                }
                return JapaneseMora.Join(list.Select(x => x.Mora));
            }

            var tokens = new List<ShadowingDiffTokenDto>();

            void Add(ShadowingDiffTokenDto token)
            {
                var last = tokens.Count > 0 ? tokens[^1] : null;
                if (last != null && last.Status == "correct" && token.Status == "correct")
                    last.Text += token.Text; // gộp các từ đúng liền kề
                else
                    tokens.Add(token);
            }

            void EmitExtras(int gap)
            {
                var list = extras[gap];
                if (list == null || list.Count == 0) return;
                var text = SpokenText(list);
                Add(new ShadowingDiffTokenDto { Text = text, Status = "mismatched", SpokenPart = text, ErrorType = "extra" });
            }

            foreach (var wr in results)
            {
                EmitExtras(wr.Word.Start); // âm thừa đứng riêng trước từ này
                var token = new ShadowingDiffTokenDto { Text = wr.Word.Text, Status = wr.Status };
                if (wr.Status != "correct")
                {
                    token.ErrorType = wr.ErrorType;
                    token.ExpectedReading = wr.Expected;
                    token.SpokenPart = wr.Spoken;
                }
                Add(token);
            }
            EmitExtras(extras.Length - 1);

            if (tokens.Count == 0) tokens.Add(new ShadowingDiffTokenDto { Text = targetText, Status = "missing" });
            return tokens;
        }

        // ---- Nhận xét (tiếng Việt, theo từ) ----

        private static string TypeHint(string? errorType) => errorType switch
        {
            "chouon" => " — trường âm",
            "sokuon" => " — âm ngắt っ",
            "hatsuon" => " — âm ん",
            "voicing" => " — âm đục/trong",
            "extra" => " — có âm thừa chen giữa",
            _ => "",
        };

        private static string BuildFeedback(
            int score, List<WordResult> results, List<(Mora Mora, int Index)>?[] extras, HashSet<int> boundaries, int moraCount)
        {
            var head = score switch
            {
                100 => "Hoàn hảo! Bạn đọc đúng tất cả các từ.",
                >= 80 => "Rất tốt! Hầu hết các từ đều đúng.",
                >= 60 => "Khá tốt! Còn một số từ chưa đúng.",
                _ => "Còn nhiều từ chưa đúng. Hãy nghe lại audio mẫu và đọc chậm từng cụm."
            };

            var hints = new List<string>();
            foreach (var wr in results.Where(x => x.Status != "correct"))
            {
                var text = wr.Word.Text.Trim(TrailingPunctuation.ToCharArray());
                if (text.Length == 0) text = wr.Expected ?? string.Empty;

                hints.Add(wr.Status == "missing"
                    ? $"chưa nói 「{text}」"
                    : $"「{text}」 đọc chuẩn là {wr.Expected}" + (wr.Spoken != null ? $", bạn nói {wr.Spoken}" : "") + TypeHint(wr.ErrorType));
                if (hints.Count == 3) break;
            }

            if (hints.Count < 3)
            {
                for (var g = 0; g <= moraCount && hints.Count < 3; g++)
                {
                    if (extras[g] == null || !(g == moraCount || boundaries.Contains(g))) continue;
                    hints.Add($"thừa 「{JapaneseMora.Join(extras[g]!.Select(x => x.Mora))}」");
                }
            }

            return hints.Count > 0 ? $"{head} Lưu ý: {string.Join("; ", hints)}." : head;
        }
    }
}
