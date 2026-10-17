using System;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Đặc trưng MFCC để căn chỉnh hai bản ghi cùng một câu (giọng người học và giọng mẫu), 16 kHz mono.
    /// Mục đích là căn chỉnh thô theo thời gian, KHÔNG dùng để phán đoán âm nào đúng/sai.
    /// Mỗi khung: log-năng lượng + 12 hệ số MFCC (c1..c12), chuẩn hóa trung bình/phương sai theo từng bản ghi
    /// (CMVN) để giảm khác biệt kênh thu/âm lượng giữa hai giọng.
    /// </summary>
    public static class SpeechFeatures
    {
        public const int SampleRate = 16000;
        public const int HopMs = 10;
        public const int Dimensions = 26; // 13 tĩnh + 13 delta
        private const int StaticDims = 13;

        private const int FrameLen = 400;   // 25 ms
        private const int Hop = SampleRate * HopMs / 1000;
        private const int FftSize = 512;
        private const int MelBands = 26;
        private const double LowHz = 100, HighHz = 7600;
        private const double PreEmphasis = 0.97;

        private static readonly double[] Window = BuildWindow();
        private static readonly double[][] MelFilters = BuildMelFilters();
        private static readonly double[][] Dct = BuildDct();

        public static float[][] Compute(float[] samples)
        {
            if (samples.Length < FrameLen) return Array.Empty<float[]>();

            var frames = 1 + (samples.Length - FrameLen) / Hop;
            var features = new float[frames][];
            var re = new double[FftSize];
            var im = new double[FftSize];
            var mel = new double[MelBands];

            for (int f = 0; f < frames; f++)
            {
                int offset = f * Hop;
                Array.Clear(re); Array.Clear(im);
                double energy = 0;
                for (int i = 0; i < FrameLen; i++)
                {
                    double prev = (offset + i) > 0 ? samples[offset + i - 1] : 0;
                    double x = (samples[offset + i] - PreEmphasis * prev) * Window[i];
                    re[i] = x;
                    energy += x * x;
                }

                Fft(re, im);

                for (int b = 0; b < MelBands; b++)
                {
                    double sum = 0;
                    var filter = MelFilters[b];
                    for (int k = 0; k <= FftSize / 2; k++)
                    {
                        if (filter[k] == 0) continue;
                        sum += filter[k] * (re[k] * re[k] + im[k] * im[k]);
                    }
                    mel[b] = Math.Log(Math.Max(sum, 1e-10));
                }

                var vec = new float[Dimensions];
                vec[0] = (float)Math.Log(Math.Max(energy, 1e-10));
                for (int c = 1; c < StaticDims; c++)
                {
                    double acc = 0;
                    var basis = Dct[c];
                    for (int b = 0; b < MelBands; b++) acc += basis[b] * mel[b];
                    vec[c] = (float)acc;
                }
                features[f] = vec;
            }

            NormalizeStatic(features);
            AddDeltas(features);
            Normalize(features);
            return features;
        }

        private static readonly double[] BandEdgesHz = { 100, 500, 1500, 3500, 7600 };

        /// <summary>
        /// Đặc trưng THÔ theo dải tần: log-năng lượng 4 dải (100-500, 500-1500, 1500-3500, 3500-7600 Hz) + delta, chuẩn hóa theo bản ghi.
        /// Chỉ phản ánh LOẠI âm (nguyên âm / âm xát / khoảng lặng...) chứ không phản ánh âm sắc riêng của người nói,
        /// nên ít phụ thuộc giới tính/giọng hơn MFCC khi căn chỉnh hai người nói khác nhau.
        /// </summary>
        public static float[][] ComputeBands(float[] samples)
        {
            if (samples.Length < FrameLen) return Array.Empty<float[]>();
            const int bands = 4;
            var frames = 1 + (samples.Length - FrameLen) / Hop;
            var features = new float[frames][];
            var re = new double[FftSize];
            var im = new double[FftSize];
            var edgeBins = new int[BandEdgesHz.Length];
            for (int i = 0; i < edgeBins.Length; i++) edgeBins[i] = (int)Math.Round(BandEdgesHz[i] * FftSize / SampleRate);

            for (int f = 0; f < frames; f++)
            {
                int offset = f * Hop;
                Array.Clear(re); Array.Clear(im);
                for (int i = 0; i < FrameLen; i++)
                {
                    double prev = (offset + i) > 0 ? samples[offset + i - 1] : 0;
                    re[i] = (samples[offset + i] - PreEmphasis * prev) * Window[i];
                }
                Fft(re, im);

                var vec = new float[bands * 2];
                for (int b = 0; b < bands; b++)
                {
                    double sum = 0;
                    for (int k = edgeBins[b]; k < edgeBins[b + 1]; k++) sum += re[k] * re[k] + im[k] * im[k];
                    vec[b] = (float)Math.Log(Math.Max(sum, 1e-10));
                }
                features[f] = vec;
            }

            NormalizeRange(features, 0, bands);
            for (int f = 0; f < frames; f++)
            {
                for (int d = 0; d < bands; d++)
                {
                    double num = 0;
                    for (int t = 1; t <= 2; t++)
                        num += t * (features[Math.Min(frames - 1, f + t)][d] - features[Math.Max(0, f - t)][d]);
                    features[f][bands + d] = (float)(num / 10.0);
                }
            }
            NormalizeRange(features, 0, bands * 2);
            return features;
        }

        private static void NormalizeStatic(float[][] features) => NormalizeRange(features, 0, StaticDims);

        /// <summary>Delta = độ dốc hồi quy trên ±2 khung của các hệ số tĩnh đã chuẩn hóa.</summary>
        private static void AddDeltas(float[][] features)
        {
            int n = features.Length;
            for (int f = 0; f < n; f++)
            {
                for (int d = 0; d < StaticDims; d++)
                {
                    double num = 0;
                    for (int t = 1; t <= 2; t++)
                    {
                        var ahead = features[Math.Min(n - 1, f + t)][d];
                        var behind = features[Math.Max(0, f - t)][d];
                        num += t * (ahead - behind);
                    }
                    features[f][StaticDims + d] = (float)(num / 10.0);
                }
            }
        }

        /// <summary>Chuẩn hóa từng chiều về trung bình 0, độ lệch chuẩn 1 trên toàn bản ghi.</summary>
        private static void Normalize(float[][] features) => NormalizeRange(features, 0, Dimensions);

        private static void NormalizeRange(float[][] features, int from, int to)
        {
            for (int d = from; d < to; d++)
            {
                double mean = 0;
                foreach (var v in features) mean += v[d];
                mean /= features.Length;
                double variance = 0;
                foreach (var v in features) variance += (v[d] - mean) * (v[d] - mean);
                var std = Math.Sqrt(variance / features.Length);
                if (std < 1e-6) std = 1;
                foreach (var v in features) v[d] = (float)((v[d] - mean) / std);
            }
        }

        public static double Distance(float[] a, float[] b)
        {
            double sum = 0;
            for (int i = 0; i < a.Length; i++)
            {
                var d = a[i] - b[i];
                sum += d * d;
            }
            return Math.Sqrt(sum);
        }

        private static double[] BuildWindow()
        {
            var w = new double[FrameLen];
            for (int i = 0; i < FrameLen; i++) w[i] = 0.54 - 0.46 * Math.Cos(2 * Math.PI * i / (FrameLen - 1));
            return w;
        }

        private static double HzToMel(double hz) => 2595 * Math.Log10(1 + hz / 700);
        private static double MelToHz(double mel) => 700 * (Math.Pow(10, mel / 2595) - 1);

        private static double[][] BuildMelFilters()
        {
            var bins = new double[MelBands + 2];
            var lowMel = HzToMel(LowHz);
            var highMel = HzToMel(HighHz);
            for (int i = 0; i < bins.Length; i++)
                bins[i] = MelToHz(lowMel + (highMel - lowMel) * i / (MelBands + 1)) * FftSize / SampleRate;

            var filters = new double[MelBands][];
            for (int b = 0; b < MelBands; b++)
            {
                filters[b] = new double[FftSize / 2 + 1];
                double l = bins[b], c = bins[b + 1], r = bins[b + 2];
                for (int k = 0; k <= FftSize / 2; k++)
                {
                    if (k > l && k < c) filters[b][k] = (k - l) / (c - l);
                    else if (k >= c && k < r) filters[b][k] = (r - k) / (r - c);
                }
            }
            return filters;
        }

        private static double[][] BuildDct()
        {
            var m = new double[Dimensions][];
            for (int c = 0; c < Dimensions; c++)
            {
                m[c] = new double[MelBands];
                for (int b = 0; b < MelBands; b++) m[c][b] = Math.Cos(Math.PI * c * (b + 0.5) / MelBands);
            }
            return m;
        }

        /// <summary>FFT cơ số 2 tại chỗ (độ dài là lũy thừa của 2).</summary>
        private static void Fft(double[] re, double[] im)
        {
            int n = re.Length;
            for (int i = 1, j = 0; i < n; i++)
            {
                int bit = n >> 1;
                for (; (j & bit) != 0; bit >>= 1) j ^= bit;
                j ^= bit;
                if (i < j)
                {
                    (re[i], re[j]) = (re[j], re[i]);
                    (im[i], im[j]) = (im[j], im[i]);
                }
            }

            for (int len = 2; len <= n; len <<= 1)
            {
                double angle = -2 * Math.PI / len;
                double wRe = Math.Cos(angle), wIm = Math.Sin(angle);
                for (int i = 0; i < n; i += len)
                {
                    double curRe = 1, curIm = 0;
                    for (int k = 0; k < len / 2; k++)
                    {
                        int a = i + k, b = i + k + len / 2;
                        double tRe = re[b] * curRe - im[b] * curIm;
                        double tIm = re[b] * curIm + im[b] * curRe;
                        re[b] = re[a] - tRe; im[b] = im[a] - tIm;
                        re[a] += tRe; im[a] += tIm;
                        double nRe = curRe * wRe - curIm * wIm;
                        curIm = curRe * wIm + curIm * wRe;
                        curRe = nRe;
                    }
                }
            }
        }
    }
}
