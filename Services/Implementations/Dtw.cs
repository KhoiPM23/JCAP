using System;
using System.Collections.Generic;

namespace JCAP.Services.Implementations
{
    public sealed class DtwResult
    {
        /// <summary>Đường căn chỉnh (chỉ số khung của X, chỉ số khung của Y), từ đầu đến cuối.</summary>
        public List<(int x, int y)> Path { get; init; } = new();

        /// <summary>Khoảng cách trung bình trên mỗi bước của đường căn chỉnh (thấp = hai chuỗi giống nhau).</summary>
        public double AverageCost { get; init; }

        /// <summary>Với mỗi khung của X: chỉ số khung Y tương ứng (trung bình các khung Y cùng được gán).</summary>
        public double[] MapXToY { get; init; } = Array.Empty<double>();
    }

    /// <summary>
    /// Dynamic Time Warping có ràng buộc độ dốc: mỗi bước chỉ được tiến (1,1), (1,2), (2,1), (1,k) hoặc (k,1) với k ≤ MaxSlope,
    /// nên một đoạn không thể bị nén thành một khung hay giãn vô hạn. Có thêm dải Sakoe-Chiba.
    /// Hai đầu chuỗi bị buộc khớp với nhau (đã cắt khoảng lặng đầu/cuối trước khi gọi).
    /// </summary>
    public static class Dtw
    {
        public static DtwResult? Align(float[][] x, float[][] y, double bandFraction = 0.35, int maxSlope = 3)
        {
            int n = x.Length, m = y.Length;
            if (n == 0 || m == 0) return null;

            // Tập bước (di, dj): đi chéo, và các bước lệch tới maxSlope.
            var steps = new List<(int di, int dj)> { (1, 1) };
            for (int k = 2; k <= maxSlope; k++) { steps.Add((1, k)); steps.Add((k, 1)); }

            int band = Math.Max(20, (int)(bandFraction * Math.Max(n, m)));
            var cost = new float[n + 1][];
            var back = new sbyte[n + 1][];
            for (int i = 0; i <= n; i++)
            {
                cost[i] = new float[m + 1];
                back[i] = new sbyte[m + 1];
                Array.Fill(cost[i], float.PositiveInfinity);
                Array.Fill(back[i], (sbyte)-1);
            }
            cost[0][0] = 0;

            for (int i = 1; i <= n; i++)
            {
                int center = (int)((long)i * m / n);
                int lo = Math.Max(1, center - band), hi = Math.Min(m, center + band);
                for (int j = lo; j <= hi; j++)
                {
                    var d = (float)SpeechFeatures.Distance(x[i - 1], y[j - 1]);
                    float best = float.PositiveInfinity;
                    sbyte bestStep = -1;
                    for (int s = 0; s < steps.Count; s++)
                    {
                        int pi = i - steps[s].di, pj = j - steps[s].dj;
                        if (pi < 0 || pj < 0) continue;
                        var prev = cost[pi][pj];
                        if (float.IsInfinity(prev)) continue;
                        var c = prev + (steps[s].di + steps[s].dj) * d; // bước dài tốn nhiều hơn tỷ lệ với độ dài
                        if (c < best) { best = c; bestStep = (sbyte)s; }
                    }
                    cost[i][j] = best;
                    back[i][j] = bestStep;
                }
            }

            if (float.IsInfinity(cost[n][m])) return null;

            // Truy vết ngược, nội suy các khung bị bỏ qua trong các bước dài.
            var path = new List<(int x, int y)>();
            int ci = n, cj = m;
            while (ci > 0 && cj > 0)
            {
                path.Add((ci - 1, cj - 1));
                var s = back[ci][cj];
                if (s < 0) break;
                var (di, dj) = steps[s];
                int span = Math.Max(di, dj);
                for (int t = 1; t < span; t++)
                {
                    int ix = ci - (int)Math.Round((double)di * t / span);
                    int iy = cj - (int)Math.Round((double)dj * t / span);
                    if (ix > 0 && iy > 0) path.Add((ix - 1, iy - 1));
                }
                ci -= di; cj -= dj;
            }
            path.Reverse();

            var sum = new double[n];
            var count = new int[n];
            double pathCost = 0;
            foreach (var (px, py) in path)
            {
                sum[px] += py;
                count[px]++;
                pathCost += SpeechFeatures.Distance(x[px], y[py]);
            }

            var map = new double[n];
            for (int i = 0; i < n; i++) map[i] = count[i] == 0 ? (i == 0 ? 0 : map[i - 1]) : sum[i] / count[i];

            return new DtwResult { Path = path, AverageCost = pathCost / path.Count, MapXToY = map };
        }
    }
}
