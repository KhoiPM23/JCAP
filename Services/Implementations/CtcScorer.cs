using System;
using System.Collections.Generic;
using System.Linq;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Chấm một chuỗi âm vị CHO TRƯỚC trên đầu ra của mô hình CTC (log-xác suất từng khung 20 ms).
    /// Khác nhận dạng tự do (chọn nhãn mạnh nhất mỗi khung): ở đây hỏi "bản ghi khớp với chuỗi này đến mức nào",
    /// để so câu mẫu với các biến thể lỗi của nó.
    ///
    /// Mỗi phần tử của chuỗi là một TẬP nhãn tương đương (vd. i và I vô thanh); xác suất của tập = tổng xác suất các nhãn.
    /// Nhãn trống của CTC gộp PAD với khoảng lặng (pau, sil) vì người học có thể ngắt ở bất cứ đâu.
    /// </summary>
    public sealed class CtcScorer
    {
        private readonly float[][] _logProbs;
        private readonly double[] _blank;
        private readonly Dictionary<string, double[]> _tokenCache = new();
        private readonly object _cacheLock = new();

        public int Frames => _logProbs.Length;

        /// <param name="logProbs">[khung][nhãn] log-softmax.</param>
        /// <param name="blankIds">Các nhãn được coi là "trống" (PAD, pau, sil).</param>
        public CtcScorer(float[][] logProbs, IEnumerable<int> blankIds)
        {
            _logProbs = logProbs;
            _blank = Merge(blankIds.ToArray());
        }

        /// <summary>Log-xác suất từng khung của một tập nhãn tương đương (có cache).</summary>
        public double[] TokenLogProbs(int[] ids)
        {
            var key = string.Join(",", ids.OrderBy(i => i));
            lock (_cacheLock)
            {
                if (_tokenCache.TryGetValue(key, out var cached)) return cached;
            }
            var merged = Merge(ids);
            lock (_cacheLock) _tokenCache[key] = merged;
            return merged;
        }

        private double[] Merge(int[] ids)
        {
            var result = new double[_logProbs.Length];
            for (var t = 0; t < _logProbs.Length; t++)
            {
                var row = _logProbs[t];
                var acc = double.NegativeInfinity;
                foreach (var id in ids)
                    if (id >= 0 && id < row.Length) acc = LogAdd(acc, row[id]);
                result[t] = acc;
            }
            return result;
        }

        /// <summary>
        /// Log-xác suất (tổng mọi cách gióng) để bản ghi là đúng chuỗi <paramref name="tokens"/>. −∞ nếu không thể
        /// (bản ghi quá ngắn so với chuỗi).
        /// </summary>
        public double LogLikelihood(IReadOnlyList<int[]> tokens) => Run(tokens, viterbi: false);

        /// <summary>Như LogLikelihood nhưng chỉ lấy cách gióng tốt nhất (Viterbi).</summary>
        public double BestAlignmentLogLikelihood(IReadOnlyList<int[]> tokens) => Run(tokens, viterbi: true);

        /// <summary>Đường tốt nhất KHÔNG ràng buộc: mỗi khung lấy nhãn (hoặc trống) mạnh nhất. Là chặn trên của Viterbi.</summary>
        public double UnconstrainedBestPath()
        {
            double sum = 0;
            for (var t = 0; t < _logProbs.Length; t++)
            {
                var best = _blank[t];
                var row = _logProbs[t];
                for (var c = 0; c < row.Length; c++) if (row[c] > best) best = row[c];
                sum += best;
            }
            return sum;
        }

        private double Run(IReadOnlyList<int[]> tokens, bool viterbi)
        {
            var T = _logProbs.Length;
            if (T == 0) return tokens.Count == 0 ? 0 : double.NegativeInfinity;

            var L = tokens.Count;
            if (L == 0) return _blank.Sum();

            var probs = new double[L][];
            var keys = new string[L];
            for (var i = 0; i < L; i++)
            {
                probs[i] = TokenLogProbs(tokens[i]);
                keys[i] = string.Join(",", tokens[i].OrderBy(x => x));
            }

            // Chuỗi mở rộng: trống, t0, trống, t1, …, trống (độ dài 2L+1)
            var S = 2 * L + 1;
            var prev = new double[S];
            var cur = new double[S];
            Array.Fill(prev, double.NegativeInfinity);
            prev[0] = _blank[0];
            prev[1] = probs[0][0];

            for (var t = 1; t < T; t++)
            {
                for (var s = 0; s < S; s++)
                {
                    var acc = prev[s];
                    if (s >= 1) acc = Combine(acc, prev[s - 1], viterbi);
                    if (s >= 2 && (s & 1) == 1 && keys[(s - 1) / 2] != keys[(s - 3) / 2]) acc = Combine(acc, prev[s - 2], viterbi);
                    if (double.IsNegativeInfinity(acc)) { cur[s] = acc; continue; }
                    cur[s] = acc + ((s & 1) == 0 ? _blank[t] : probs[(s - 1) / 2][t]);
                }
                (prev, cur) = (cur, prev);
            }
            return Combine(prev[S - 1], prev[S - 2], viterbi);
        }

        private static double Combine(double a, double b, bool viterbi) => viterbi ? Math.Max(a, b) : LogAdd(a, b);

        internal static double LogAdd(double a, double b)
        {
            if (double.IsNegativeInfinity(a)) return b;
            if (double.IsNegativeInfinity(b)) return a;
            return a > b ? a + Math.Log(1 + Math.Exp(b - a)) : b + Math.Log(1 + Math.Exp(a - b));
        }
    }
}
