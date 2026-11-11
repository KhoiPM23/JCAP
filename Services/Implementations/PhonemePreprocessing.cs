using System;
using System.Linq;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Xử lý âm thanh trước khi đưa vào mô hình âm vị, để bản ghi từ micro thật (nhỏ tiếng, ù điện, khoảng lặng dài)
    /// gần với dữ liệu mô hình đã học hơn. Mỗi bước bật/tắt riêng được, và chỉ những bước có số liệu tốt hơn
    /// trên bộ kiểm thử (JCAP.Tests/Bench/SpeechRecognitionBench) mới được bật mặc định.
    /// </summary>
    public sealed record PhonemePreprocessing(bool HighPass, bool TrimSilence, bool NormalizeLevel, bool PadEdges = false)
    {
        private const int SampleRate = OnnxPhonemeRecognizer.SampleRate;
        private const double HighPassHz = 80;
        private const int TrimPaddingMs = 250;
        private const double TargetRmsDb = -20;
        private const double MaxGainDb = 30;

        public static PhonemePreprocessing None { get; } = new(false, false, false);

        /// <summary>
        /// Cấu hình mặc định của sản phẩm, chọn theo RecognitionRobustnessBench (144 câu VOICEVOX × 6 điều kiện micro):
        /// lọc ù + đệm lặng cho lỗi mora trung bình 1.9% (không xử lý: 5.0%) và không bịa chữ với im lặng/nền ồn.
        /// Cắt lặng và chuẩn hoá mức KHÔNG giúp (cắt lặng còn làm tệ hơn) nên tắt. Xem docs/shadowing-audio-status.md.
        /// </summary>
        public static PhonemePreprocessing Default { get; } = new(HighPass: true, TrimSilence: false, NormalizeLevel: false, PadEdges: true);

        public float[] Apply(float[] input)
        {
            var x = input;
            if (HighPass) x = ApplyHighPass(x);
            if (TrimSilence) x = Trim(x);
            if (NormalizeLevel) x = Normalize(x);
            if (PadEdges) x = Pad(x);
            return x;
        }

        /// <summary>
        /// Đệm 500 ms im lặng ở hai đầu: mô hình hay bỏ mất âm đầu/cuối khi bản ghi bắt đầu hoặc dừng ngay sát tiếng nói.
        /// </summary>
        internal static float[] Pad(float[] x)
        {
            var pad = SampleRate / 2;
            var y = new float[x.Length + 2 * pad];
            Array.Copy(x, 0, y, pad, x.Length);
            return y;
        }

        /// <summary>Lọc thông cao bậc 1 (~80 Hz): bỏ tiếng ù điện và rung bàn, không ảnh hưởng dải tiếng nói.</summary>
        internal static float[] ApplyHighPass(float[] x)
        {
            if (x.Length == 0) return x;
            var rc = 1.0 / (2 * Math.PI * HighPassHz);
            var dt = 1.0 / SampleRate;
            var a = rc / (rc + dt);
            var y = new float[x.Length];
            double prevX = x[0], prevY = 0;
            for (int i = 0; i < x.Length; i++)
            {
                var v = a * (prevY + x[i] - prevX);
                y[i] = (float)v;
                prevY = v;
                prevX = x[i];
            }
            return y;
        }

        /// <summary>Cắt khoảng lặng đầu/cuối theo cùng bộ VAD với phần nhịp nói (giữ đệm 250 ms hai đầu).</summary>
        internal static float[] Trim(float[] x)
        {
            var segments = FluencyAnalyzer.DetectSegments(x, out _);
            if (segments == null || segments.Count == 0) return x;
            var start = Math.Max(0, (segments[0].start - TrimPaddingMs) * SampleRate / 1000);
            var end = Math.Min(x.Length, (segments[^1].end + TrimPaddingMs) * SampleRate / 1000);
            return end > start ? x[start..end] : x;
        }

        /// <summary>
        /// Đưa mức giọng (RMS của các khung đang có tiếng) về khoảng -20 dBFS, tăng tối đa 30 dB và không để vỡ tiếng.
        /// Bản ghi không có tiếng nói thì giữ nguyên (không khuếch đại nền ồn thành "tiếng nói").
        /// </summary>
        internal static float[] Normalize(float[] x)
        {
            var segments = FluencyAnalyzer.DetectSegments(x, out _);
            if (segments == null || segments.Count == 0) return x;

            double sum = 0;
            long count = 0;
            foreach (var (s, e) in segments)
            {
                var from = Math.Clamp(s * SampleRate / 1000, 0, x.Length);
                var to = Math.Clamp(e * SampleRate / 1000, from, x.Length);
                for (int i = from; i < to; i++) { sum += x[i] * (double)x[i]; count++; }
            }
            if (count == 0) return x;
            var rmsDb = 10 * Math.Log10(Math.Max(sum / count, 1e-12));
            var gainDb = Math.Min(MaxGainDb, TargetRmsDb - rmsDb);
            var gain = Math.Pow(10, gainDb / 20);
            var peak = x.Max(v => Math.Abs(v));
            if (peak * gain > 0.99) gain = 0.99 / Math.Max(peak, 1e-9);
            return x.Select(v => (float)(v * gain)).ToArray();
        }
    }
}
