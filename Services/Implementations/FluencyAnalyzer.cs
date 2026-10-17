using System;
using System.Collections.Generic;
using System.Linq;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Đo nhịp nói bằng VAD theo năng lượng (RMS từng khung 20 ms, ngưỡng thích nghi + hysteresis).
    /// Mọi ngưỡng là heuristic CHƯA hiệu chuẩn trên giọng người học thật; kết quả chỉ là số liệu thô, không phải điểm.
    /// </summary>
    public sealed class FluencyAnalyzer : IFluencyAnalyzer
    {
        public const string Version = "fluency-metrics/v1";

        private const int SampleRate = WavPcmReader.ExpectedSampleRate;
        private const int FrameMs = 20;
        private const int FrameLen = SampleRate * FrameMs / 1000;

        private const double MinPeakDb = -50.0;          // đỉnh thấp hơn mức này: bản thu quá nhỏ
        private const double MinDynamicRangeDb = 12.0;   // chênh lệch tiếng nói/nền tối thiểu, thấp hơn nghĩa là chỉ có nền đều
        private const double NoiseFloorMinDb = -70.0;
        private const double HysteresisDb = 4.0;         // ngưỡng thoát thấp hơn ngưỡng vào, tránh ngắt đoạn tiếng nói ở biên
        private const int MinSpeechMs = 60;
        private const int FillGapMs = 120;               // khoảng lặng ngắn hơn mức này (khoảng đóng âm tắc, っ) không phải khoảng dừng
        private const int PauseMinMs = 250;
        private const int MinAudioMs = 300;
        private const int MinSpanMs = 300;

        public FluencyMetricsDto Analyze(byte[] wav, int? moraCount)
        {
            float[] samples;
            try
            {
                samples = WavPcmReader.ReadMono16k(wav);
            }
            catch (WavFormatException ex)
            {
                return Unavailable(ex.Code);
            }

            return AnalyzeSamples(samples, moraCount);
        }

        public FluencyMetricsDto AnalyzeAnyRate(byte[] wav, int? moraCount)
        {
            float[] samples;
            try
            {
                samples = WavPcmReader.ReadMonoAnyRate(wav, out var rate);
                samples = WavPcmReader.ResampleTo16k(samples, rate);
            }
            catch (WavFormatException ex)
            {
                return Unavailable(ex.Code);
            }

            return AnalyzeSamples(samples, moraCount);
        }

        private FluencyMetricsDto AnalyzeSamples(float[] samples, int? moraCount)
        {
            var durationMs = (int)(samples.Length * 1000L / SampleRate);
            if (durationMs < MinAudioMs) return Unavailable("AUDIO_TOO_SHORT", durationMs);

            var db = FrameEnergyDb(samples);
            var vad = DetectSpeech(db, out var failure);
            if (vad == null) return Unavailable(failure!, durationMs);

            var segments = vad;
            var spanStart = segments[0].start;
            var spanEnd = segments[^1].end;
            var span = spanEnd - spanStart;
            if (span < MinSpanMs) return Unavailable("SPEECH_TOO_SHORT", durationMs);

            var pauses = new List<FluencyPauseDto>();
            for (int i = 1; i < segments.Count; i++)
            {
                var gap = segments[i].start - segments[i - 1].end;
                if (gap >= PauseMinMs)
                {
                    pauses.Add(new FluencyPauseDto { StartMs = segments[i - 1].end, EndMs = segments[i].start, DurationMs = gap });
                }
            }

            var speechMs = segments.Sum(s => s.end - s.start);
            var totalPause = pauses.Sum(p => p.DurationMs);

            var result = new FluencyMetricsDto
            {
                Status = "available",
                Version = Version,
                DurationMs = durationMs,
                LeadingSilenceMs = spanStart,
                TrailingSilenceMs = Math.Max(0, durationMs - spanEnd),
                SpeechSpanMs = span,
                SpeechMs = speechMs,
                SpeechRatio = Math.Round((double)speechMs / span, 3),
                PauseCount = pauses.Count,
                TotalPauseMs = totalPause,
                LongestPauseMs = pauses.Count == 0 ? 0 : pauses.Max(p => p.DurationMs),
                PauseRatio = Math.Round((double)totalPause / span, 3),
                Pauses = pauses,
            };

            if (moraCount is > 0)
            {
                result.MoraCount = moraCount;
                result.SpeakingRateMoraPerSec = Math.Round(moraCount.Value / (span / 1000.0), 2);
                var active = span - totalPause;
                if (active > 0) result.ArticulationRateMoraPerSec = Math.Round(moraCount.Value / (active / 1000.0), 2);
            }

            return result;
        }

        /// <summary>Các đoạn tiếng nói (mili-giây) theo cùng bộ VAD dùng cho nhịp nói, để các bộ phân tích khác dùng chung.</summary>
        internal static List<(int start, int end)>? DetectSegments(float[] samples, out string? failure)
        {
            var db = FrameEnergyDb(samples);
            return DetectSpeech(db, out failure);
        }

        private static FluencyMetricsDto Unavailable(string code, int? durationMs = null) => new()
        {
            Status = "unavailable",
            ReasonCode = code,
            Version = Version,
            DurationMs = durationMs,
        };

        private static double[] FrameEnergyDb(float[] samples)
        {
            var frames = samples.Length / FrameLen;
            var db = new double[frames];
            for (int f = 0; f < frames; f++)
            {
                double sum = 0;
                int offset = f * FrameLen;
                for (int i = 0; i < FrameLen; i++)
                {
                    double s = samples[offset + i];
                    sum += s * s;
                }
                var rms = Math.Sqrt(sum / FrameLen);
                db[f] = 20.0 * Math.Log10(Math.Max(rms, 1e-5));
            }
            return db;
        }

        private static double Percentile(double[] values, double p)
        {
            var sorted = (double[])values.Clone();
            Array.Sort(sorted);
            var rank = p / 100.0 * (sorted.Length - 1);
            var lo = (int)Math.Floor(rank);
            var hi = (int)Math.Ceiling(rank);
            return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
        }

        /// <summary>Trả về các đoạn tiếng nói (mili-giây) hoặc null kèm mã lý do.</summary>
        private static List<(int start, int end)>? DetectSpeech(double[] db, out string? failure)
        {
            failure = null;
            if (db.Length == 0) { failure = "NO_SIGNAL"; return null; }

            var peak = Percentile(db, 95);
            var floor = Math.Max(Percentile(db, 10), NoiseFloorMinDb);

            if (peak <= -80.0) { failure = "NO_SIGNAL"; return null; }
            if (peak < MinPeakDb) { failure = "LOW_LEVEL"; return null; }
            if (peak - floor < MinDynamicRangeDb) { failure = "NOISE_ONLY"; return null; }

            var enter = floor + Math.Max(8.0, 0.35 * (peak - floor));
            var exit = enter - HysteresisDb;

            var voiced = new bool[db.Length];
            var inSpeech = false;
            for (int i = 0; i < db.Length; i++)
            {
                inSpeech = inSpeech ? db[i] > exit : db[i] > enter;
                voiced[i] = inSpeech;
            }

            // Lấp khoảng lặng ngắn nằm giữa hai đoạn có tiếng.
            var fillFrames = FillGapMs / FrameMs;
            foreach (var (s, e) in Runs(voiced, value: false).ToList())
            {
                if (s > 0 && e < voiced.Length && (e - s) <= fillFrames)
                {
                    for (int i = s; i < e; i++) voiced[i] = true;
                }
            }

            var minFrames = MinSpeechMs / FrameMs;
            var segments = Runs(voiced, value: true)
                .Where(r => (r.end - r.start) >= minFrames)
                .Select(r => (r.start * FrameMs, r.end * FrameMs))
                .ToList();

            if (segments.Count == 0) { failure = "NOISE_ONLY"; return null; }
            return segments;
        }

        private static IEnumerable<(int start, int end)> Runs(bool[] flags, bool value)
        {
            int i = 0;
            while (i < flags.Length)
            {
                if (flags[i] != value) { i++; continue; }
                int start = i;
                while (i < flags.Length && flags[i] == value) i++;
                yield return (start, i);
            }
        }
    }
}
