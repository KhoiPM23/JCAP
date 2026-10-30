using System;
using System.Collections.Generic;
using System.Linq;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;

namespace JCAP.Services.Implementations
{
    /// <summary>Ngưỡng đo thời lượng mora. THỬ NGHIỆM, chưa hiệu chuẩn trên giọng người học thật; chỉnh qua `Shadowing:Duration:*`.</summary>
    public sealed class MoraDurationOptions
    {
        /// <summary>Công tắc tính năng thử nghiệm. false: không đo và không tạo nhận xét trường âm.</summary>
        public bool Enabled { get; init; } = true;

        /// <summary>Tỷ lệ thời lượng tương đối (so với mẫu, đã chuẩn hóa theo tốc độ chung) từ mức này trở xuống thì coi là trường âm ngắn.</summary>
        public double ShortRatio { get; init; } = 0.55;

        /// <summary>Khoảng cách MFCC trung bình trên đường căn chỉnh vượt mức này thì căn chỉnh không đáng tin.</summary>
        public double MaxAlignmentCost { get; init; } = 5.5;

        /// <summary>Độ phân tán (MAD/trung vị) của tỷ lệ thời lượng các mora thường vượt mức này thì căn chỉnh không đáng tin.</summary>
        public double MaxTempoSpread { get; init; } = 0.4;

        /// <summary>Đoạn trường âm của giọng mẫu ngắn hơn mức này thì quá ngắn để đo ổn định.</summary>
        public int MinReferenceUnitMs { get; init; } = 100;

        /// <summary>Mốc mora của engine được co giãn khớp với khoảng nói thật của giọng mẫu; lệch hơn mức này thì bỏ.</summary>
        public double TimelineTolerance { get; init; } = 0.15;

        /// <summary>Số mora thường tối thiểu để ước lượng tốc độ chung.</summary>
        public int MinRegularMoras { get; init; } = 4;

        public int RegularMoraMinMs { get; init; } = 50;

        /// <summary>Bán kính (khoảng cách MFCC chuẩn hóa) để coi một khung vẫn thuộc cùng một nguyên âm ổn định. 0 = đo theo ranh giới DTW.</summary>
        public double SteadyRadius { get; init; } = 0;

        public static MoraDurationOptions FromConfiguration(IConfiguration configuration)
        {
            var d = new MoraDurationOptions();
            const string p = "Shadowing:Duration:";
            return new MoraDurationOptions
            {
                Enabled = configuration.GetValue<bool?>(p + "Enabled") ?? d.Enabled,
                ShortRatio = configuration.GetValue<double?>(p + "ShortRatio") ?? d.ShortRatio,
                MaxAlignmentCost = configuration.GetValue<double?>(p + "MaxAlignmentCost") ?? d.MaxAlignmentCost,
                MaxTempoSpread = configuration.GetValue<double?>(p + "MaxTempoSpread") ?? d.MaxTempoSpread,
                MinReferenceUnitMs = configuration.GetValue<int?>(p + "MinReferenceUnitMs") ?? d.MinReferenceUnitMs,
                TimelineTolerance = configuration.GetValue<double?>(p + "TimelineTolerance") ?? d.TimelineTolerance,
                MinRegularMoras = configuration.GetValue<int?>(p + "MinRegularMoras") ?? d.MinRegularMoras,
                RegularMoraMinMs = configuration.GetValue<int?>(p + "RegularMoraMinMs") ?? d.RegularMoraMinMs,
                SteadyRadius = configuration.GetValue<double?>(p + "SteadyRadius") ?? d.SteadyRadius,
            };
        }
    }

    /// <summary>
    /// Đo thời lượng đoạn trường âm của người học so với giọng mẫu VOICEVOX (THỬ NGHIỆM).
    ///
    /// Cách làm: (1) lấy mốc từng mora của giọng mẫu từ audio_query, co giãn khớp với khoảng nói thật của audio mẫu;
    /// (2) căn chỉnh DTW trên MFCC giữa giọng mẫu và giọng người học (cùng câu, đã cắt khoảng lặng đầu/cuối);
    /// (3) chiếu mốc mora của mẫu sang bản ghi người học để có thời lượng từng mora của người học;
    /// (4) với mỗi đoạn trường âm (nguyên âm của mora mang nó + mora trường âm), so tỷ lệ thời lượng với tốc độ chung (trung vị các mora thường).
    ///
    /// Điều nó KHÔNG làm: không kết luận phát âm đúng/sai nói chung, không nhận ra âm nào, không đo っ.
    /// Chỉ báo "trường âm có vẻ ngắn" khi căn chỉnh đủ tin cậy; nếu không thì trả unavailable.
    /// </summary>
    public static class MoraDurationAnalyzer
    {
        public const string Version = "mora-duration/v0-experimental";

        private const int HopMs = SpeechFeatures.HopMs;

        public static MoraDurationDto Analyze(
            float[] learner16k,
            float[] reference16k,
            IReadOnlyList<MoraTiming> timeline,
            MoraDurationOptions o)
        {
            // 1. Mốc mora của engine phải khớp 1:1 với cách tách mora của hệ thống chấm.
            var timed = timeline.Where(t => !t.IsPause).ToList();
            var moras = JapaneseMora.FromKana(string.Concat(timed.Select(t => t.Text)), preserveLongVowelSpelling: false);
            if (moras.Count != timed.Count || moras.Any(m => m.IsUnresolved)) return Unavailable("TIMELINE_MISMATCH");
            if (!moras.Any(m => m.IsLong)) return Unavailable("NO_LONG_VOWEL");

            // 2. Khoảng nói của hai bản ghi (cùng VAD với phần nhịp nói).
            var learnerSegs = FluencyAnalyzer.DetectSegments(learner16k, out _);
            if (learnerSegs == null) return Unavailable("LEARNER_UNAVAILABLE");
            var referenceSegs = FluencyAnalyzer.DetectSegments(reference16k, out _);
            if (referenceSegs == null) return Unavailable("REFERENCE_UNAVAILABLE");

            int learnerStart = learnerSegs[0].start, learnerEnd = learnerSegs[^1].end;
            int referenceStart = referenceSegs[0].start, referenceEnd = referenceSegs[^1].end;

            // 3. Co giãn mốc mora của engine cho khớp khoảng nói thật của giọng mẫu.
            var timelineStartSec = timed[0].StartSec;
            var timelineSpanMs = (timed[^1].EndSec - timelineStartSec) * 1000.0;
            var referenceSpanMs = (double)(referenceEnd - referenceStart);
            if (timelineSpanMs <= 0 || referenceSpanMs <= 0) return Unavailable("TIMELINE_MISMATCH");
            var scale = referenceSpanMs / timelineSpanMs;
            if (Math.Abs(scale - 1.0) > o.TimelineTolerance) return Unavailable("TIMELINE_MISMATCH");

            double RefMs(double sec) => (sec - timelineStartSec) * 1000.0 * scale; // tương đối so với đầu khoảng nói

            // 4. MFCC + DTW trên phần đã cắt khoảng lặng.
            var learnerFeatures = SpeechFeatures.Compute(Slice(learner16k, learnerStart, learnerEnd));
            var referenceFeatures = SpeechFeatures.Compute(Slice(reference16k, referenceStart, referenceEnd));
            if (learnerFeatures.Length < 20 || referenceFeatures.Length < 20) return Unavailable("ALIGNMENT_FAILED");

            var dtw = Dtw.Align(referenceFeatures, learnerFeatures);
            if (dtw == null) return Unavailable("ALIGNMENT_FAILED");

            double LearnerMs(double refMs)
            {
                var frame = Math.Clamp(refMs / HopMs, 0, dtw.MapXToY.Length - 1);
                int lo = (int)Math.Floor(frame), hi = Math.Min(lo + 1, dtw.MapXToY.Length - 1);
                var y = dtw.MapXToY[lo] + (dtw.MapXToY[hi] - dtw.MapXToY[lo]) * (frame - lo);
                return y * HopMs;
            }

            // 5. Thời lượng từng mora của người học (chiếu qua đường căn chỉnh) và tốc độ chung từ các mora thường.
            var raw = new double[moras.Count];
            var regular = new List<double>();
            for (int k = 0; k < moras.Count; k++)
            {
                double rs = RefMs(timed[k].StartSec), re = RefMs(timed[k].EndSec);
                double refDur = re - rs;
                double learnerDur = LearnerMs(re) - LearnerMs(rs);
                raw[k] = refDur > 0 ? learnerDur / refDur : 0;
                var m = moras[k];
                if (!m.IsLong && !m.IsSokuon && !m.IsHatsuon && refDur >= o.RegularMoraMinMs) regular.Add(raw[k]);
            }

            var result = new MoraDurationDto { Version = Version, AlignmentCost = Math.Round(dtw.AverageCost, 3) };
            if (regular.Count < o.MinRegularMoras) { result.ReasonCode = "ALIGNMENT_UNRELIABLE"; return result; }

            var tempo = Median(regular);
            if (tempo <= 0) { result.ReasonCode = "ALIGNMENT_UNRELIABLE"; return result; }
            var spread = Median(regular.Select(r => Math.Abs(r - tempo))) / tempo;
            result.TempoRatio = Math.Round(tempo, 2);
            result.TempoSpread = Math.Round(spread, 2);

            // 6. Các đoạn trường âm: nguyên âm của mora mang nó + (các) mora trường âm liền sau.
            var units = new List<MoraDurationUnitDto>();
            for (int k = 1; k < moras.Count; k++)
            {
                if (!moras[k].IsLong || moras[k - 1].IsLong) continue; // chỉ bắt đầu ở mora trường âm đầu tiên của một đoạn
                var carrier = moras[k - 1];
                if (carrier.IsSokuon || carrier.IsHatsuon || carrier.IsUnresolved) continue;

                int last = k;
                while (last + 1 < moras.Count && moras[last + 1].IsLong) last++;

                double unitStart = RefMs(timed[k - 1].VowelStartSec), unitEnd = RefMs(timed[last].EndSec);
                double refDur = unitEnd - unitStart;
                if (refDur < o.MinReferenceUnitMs) continue;

                double learnerDur = LearnerMs(unitEnd) - LearnerMs(unitStart);

                double relative = (learnerDur / refDur) / tempo;

                // Cách đo thứ hai (ít phụ thuộc ranh giới do DTW chiếu): độ dài đoạn nguyên âm ỔN ĐỊNH trong từng bản ghi,
                // so với tâm phổ của chính bản ghi đó, rồi so tỷ lệ (có chuẩn hóa tốc độ chung).
                if (o.SteadyRadius > 0)
                {
                    var steady = SteadyRatio(referenceFeatures, learnerFeatures, dtw, unitStart, unitEnd, o.SteadyRadius);
                    if (steady != null) relative = steady.Value / tempo;
                }

                units.Add(new MoraDurationUnitDto
                {
                    Kind = "chouon",
                    Text = string.Concat(moras.Skip(k - 1).Take(last - k + 2).Select(m => m.Display)),
                    MoraIndex = k,
                    ReferenceMs = (int)Math.Round(refDur),
                    LearnerMs = (int)Math.Round(learnerDur),
                    RelativeRatio = Math.Round(relative, 2),
                });
            }

            result.Units = units;
            if (units.Count == 0) { result.ReasonCode = "NO_LONG_VOWEL"; return result; }

            if (dtw.AverageCost > o.MaxAlignmentCost || spread > o.MaxTempoSpread)
            {
                result.ReasonCode = "ALIGNMENT_UNRELIABLE";
                return result; // vẫn trả số đo để chẩn đoán nhưng KHÔNG gắn cờ lỗi
            }

            foreach (var u in units) u.Flagged = u.RelativeRatio <= o.ShortRatio;
            result.Status = "available";
            return result;
        }

        /// <summary>Nhận xét tiếng Việt cho các đoạn trường âm bị gắn cờ (tối đa <paramref name="max"/>).</summary>
        public static List<FluencyObservationDto> ToObservations(MoraDurationDto duration, MoraDurationOptions o, int max)
        {
            if (duration.Status != "available") return new();

            return duration.Units
                .Where(u => u.Flagged)
                .OrderBy(u => u.RelativeRatio)
                .Take(max)
                .Select(u => new FluencyObservationDto
                {
                    Code = "chouon_short",
                    Message = $"Trường âm 「{u.Text}」 có vẻ ngắn hơn giọng mẫu (khoảng {(int)Math.Round(u.RelativeRatio * 100)}% độ dài mẫu). Hãy kéo dài nguyên âm thêm một nhịp. (Thử nghiệm)",
                    MeasuredValue = u.RelativeRatio,
                    Threshold = o.ShortRatio,
                    Data = new()
                    {
                        ["experimental"] = true,
                        ["kind"] = "chouon",
                        ["text"] = u.Text,
                        ["moraIndex"] = u.MoraIndex,
                        ["referenceMs"] = u.ReferenceMs,
                        ["learnerMs"] = u.LearnerMs,
                        ["tempoRatio"] = duration.TempoRatio,
                        ["alignmentCost"] = duration.AlignmentCost,
                    },
                })
                .ToList();
        }

        public static MoraDurationDto Unavailable(string reason) =>
            new() { Status = "unavailable", ReasonCode = reason, Version = Version };

        private static float[] Slice(float[] samples, int startMs, int endMs)
        {
            int s = Math.Clamp(startMs * SpeechFeatures.SampleRate / 1000, 0, samples.Length);
            int e = Math.Clamp(endMs * SpeechFeatures.SampleRate / 1000, s, samples.Length);
            var result = new float[e - s];
            Array.Copy(samples, s, result, 0, result.Length);
            return result;
        }

        /// <summary>
        /// Tỷ lệ (độ dài nguyên âm ổn định của người học) / (của giọng mẫu). Ổn định = các khung liền nhau quanh tâm đoạn
        /// có khoảng cách tới tâm phổ của đoạn nhỏ hơn bán kính. Trả về null nếu không xác định được.
        /// </summary>
        private static double? SteadyRatio(float[][] referenceFeatures, float[][] learnerFeatures, DtwResult dtw,
            double unitStartMs, double unitEndMs, double radius)
        {
            int fs = (int)Math.Clamp(Math.Round(unitStartMs / HopMs), 0, referenceFeatures.Length - 1);
            int fe = (int)Math.Clamp(Math.Round(unitEndMs / HopMs), fs, referenceFeatures.Length - 1);
            int len = fe - fs + 1;
            if (len < 6) return null;

            int coreStart = fs + (int)(0.2 * len), coreEnd = fe - (int)(0.2 * len);
            if (coreEnd < coreStart) return null;

            var refRun = Run(referenceFeatures, Centroid(referenceFeatures, coreStart, coreEnd), (fs + fe) / 2, radius);

            // Vùng tương ứng trong bản ghi người học theo đường căn chỉnh.
            int ls = (int)Math.Clamp(Math.Round(dtw.MapXToY[coreStart]), 0, learnerFeatures.Length - 1);
            int le = (int)Math.Clamp(Math.Round(dtw.MapXToY[coreEnd]), ls, learnerFeatures.Length - 1);
            var learnerCentroid = Centroid(learnerFeatures, ls, le);
            int seed = (ls + le) / 2;
            // Nếu khung giữa lệch xa tâm thì lấy khung gần tâm nhất trong vùng tương ứng.
            double best = double.MaxValue;
            for (int f = ls; f <= le; f++)
            {
                var d = SpeechFeatures.Distance(learnerFeatures[f], learnerCentroid);
                if (d < best) { best = d; seed = f; }
            }
            var learnerRun = Run(learnerFeatures, learnerCentroid, seed, radius);
            if (refRun <= 0 || learnerRun <= 0) return null;
            return (double)learnerRun / refRun;
        }

        private static int Run(float[][] features, float[] centroid, int seed, double radius)
        {
            if (SpeechFeatures.Distance(features[seed], centroid) > radius) return 0;
            int lo = seed, hi = seed;
            while (lo - 1 >= 0 && SpeechFeatures.Distance(features[lo - 1], centroid) <= radius) lo--;
            while (hi + 1 < features.Length && SpeechFeatures.Distance(features[hi + 1], centroid) <= radius) hi++;
            return hi - lo + 1;
        }

        private static float[] Centroid(float[][] features, int from, int to)
        {
            var c = new float[SpeechFeatures.Dimensions];
            for (int f = from; f <= to; f++)
                for (int d = 0; d < c.Length; d++) c[d] += features[f][d];
            for (int d = 0; d < c.Length; d++) c[d] /= (to - from + 1);
            return c;
        }

        private static double Median(IEnumerable<double> values)
        {
            var sorted = values.OrderBy(v => v).ToArray();
            if (sorted.Length == 0) return 0;
            int mid = sorted.Length / 2;
            return sorted.Length % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        }
    }
}
