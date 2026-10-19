using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using JCAP.DTOs.Shadowing;
using Microsoft.Extensions.Configuration;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Ngưỡng so sánh nhịp nói với giọng mẫu. Tất cả là heuristic CHƯA hiệu chuẩn trên giọng người học thật;
    /// có thể chỉnh trong cấu hình `Shadowing:Fluency:Comparison:*`.
    /// </summary>
    /// <summary>Một khoảng dừng thừa của người học (mili-giây từ đầu bản ghi) và vị trí tương đối trong đoạn nói (0..1).</summary>
    public sealed record ExtraPauseInfo(int StartMs, int EndMs, int DurationMs, double Position);

    public sealed class FluencyComparisonOptions
    {
        /// <summary>Chỉ so sánh khi điểm Content Match từ mức này trở lên (người học thực sự đọc câu mẫu).</summary>
        public int MinContentMatch { get; init; } = 70;

        /// <summary>Số mora của transcript / số mora câu mẫu phải nằm trong [Min, Max], nếu không thì transcript không tương ứng câu mẫu.</summary>
        public double MinMoraConsistency { get; init; } = 0.8;
        public double MaxMoraConsistency { get; init; } = 1.25;

        /// <summary>Tốc độ (không tính khoảng dừng) của người học / giọng mẫu: ≤ SlowRatio là chậm rõ, ≥ FastRatio là nhanh rõ.</summary>
        public double SlowRatio { get; init; } = 0.70;
        public double FastRatio { get; init; } = 1.40;

        /// <summary>Khoảng dừng của người học ngắn hơn mức này thì không bị coi là "dừng thừa".</summary>
        public int ExtraPauseMinMs { get; init; } = 400;

        /// <summary>Hai khoảng dừng được coi là cùng vị trí nếu lệch nhau không quá phần này của độ dài đoạn nói (0..1).</summary>
        public double PauseMatchTolerance { get; init; } = 0.12;

        /// <summary>Chỉ nêu vị trí tương đối của khoảng dừng khi tỷ lệ tốc độ nằm trong [Min, Max] (trục thời gian còn tương đồng với mẫu).</summary>
        public double PositionMinRatio { get; init; } = 0.6;
        public double PositionMaxRatio { get; init; } = 1.6;

        /// <summary>Đoạn nói ngắn hơn mức này (ở người học hoặc giọng mẫu) thì không đủ ổn định để so sánh.</summary>
        public int MinSpanMs { get; init; } = 800;

        public int MaxObservations { get; init; } = 3;

        public static FluencyComparisonOptions FromConfiguration(IConfiguration configuration)
        {
            var d = new FluencyComparisonOptions();
            const string p = "Shadowing:Fluency:Comparison:";
            return new FluencyComparisonOptions
            {
                MinContentMatch = configuration.GetValue<int?>(p + "MinContentMatch") ?? d.MinContentMatch,
                MinMoraConsistency = configuration.GetValue<double?>(p + "MinMoraConsistency") ?? d.MinMoraConsistency,
                MaxMoraConsistency = configuration.GetValue<double?>(p + "MaxMoraConsistency") ?? d.MaxMoraConsistency,
                SlowRatio = configuration.GetValue<double?>(p + "SlowRatio") ?? d.SlowRatio,
                FastRatio = configuration.GetValue<double?>(p + "FastRatio") ?? d.FastRatio,
                ExtraPauseMinMs = configuration.GetValue<int?>(p + "ExtraPauseMinMs") ?? d.ExtraPauseMinMs,
                PauseMatchTolerance = configuration.GetValue<double?>(p + "PauseMatchTolerance") ?? d.PauseMatchTolerance,
                PositionMinRatio = configuration.GetValue<double?>(p + "PositionMinRatio") ?? d.PositionMinRatio,
                PositionMaxRatio = configuration.GetValue<double?>(p + "PositionMaxRatio") ?? d.PositionMaxRatio,
                MinSpanMs = configuration.GetValue<int?>(p + "MinSpanMs") ?? d.MinSpanMs,
                MaxObservations = configuration.GetValue<int?>(p + "MaxObservations") ?? d.MaxObservations,
            };
        }
    }

    /// <summary>Bối cảnh chấm nội dung dùng để quyết định có đủ điều kiện so sánh nhịp nói hay không.</summary>
    public sealed class FluencyComparisonContext
    {
        /// <summary>Kết quả đánh giá nội dung là completed (đã chấm bằng transcript được chấp nhận).</summary>
        public bool TranscriptReliable { get; init; }
        public int ContentMatchScore { get; init; }
        public int TargetMoraCount { get; init; }
        public int RecognizedMoraCount { get; init; }
    }

    /// <summary>
    /// So nhịp nói của người học với giọng mẫu. Chỉ tạo nhận xét khi đủ điều kiện và chênh lệch rõ; không tạo điểm.
    ///
    /// Định nghĩa:
    ///  - Khoảng dừng: khoảng lặng ≥ 250 ms nằm GIỮA hai đoạn tiếng nói (cùng VAD cho cả hai phía); im lặng đầu/cuối bị loại.
    ///  - Tốc độ trong thời gian có tiếng nói (articulation) = chia cho (khoảng nói − tổng khoảng dừng); tốc độ toàn câu (speaking) chia cho cả khoảng nói.
    ///  - Số mora luôn đếm từ câu mẫu (nguồn tin cậy), transcript chỉ dùng để kiểm tra tương ứng chứ không dùng để đếm.
    ///  - Hai phía đọc cùng một câu nên tỷ lệ tốc độ = tỷ lệ nghịch của thời lượng nói tương ứng.
    /// </summary>
    public static class FluencyComparer
    {
        /// <summary>Kiểm tra điều kiện trước khi đo/so sánh. Trả về mã lý do nếu KHÔNG đủ điều kiện, null nếu đủ.</summary>
        public static string? CheckEligibility(FluencyComparisonContext ctx, FluencyComparisonOptions o)
        {
            if (!ctx.TranscriptReliable) return "TRANSCRIPT_NOT_RELIABLE";
            if (ctx.ContentMatchScore < o.MinContentMatch) return "CONTENT_BELOW_THRESHOLD";
            if (ctx.TargetMoraCount <= 0 || ctx.RecognizedMoraCount <= 0) return "TRANSCRIPT_NOT_RELIABLE";

            var consistency = (double)ctx.RecognizedMoraCount / ctx.TargetMoraCount;
            if (consistency < o.MinMoraConsistency || consistency > o.MaxMoraConsistency) return "TRANSCRIPT_MORA_MISMATCH";
            return null;
        }

        public static FluencyComparisonDto Unavailable(string reason) => new() { Status = "unavailable", ReasonCode = reason };

        public static (FluencyComparisonDto comparison, List<FluencyObservationDto> observations) Compare(
            FluencyMetricsDto learner,
            FluencyMetricsDto? reference,
            FluencyComparisonContext ctx,
            FluencyComparisonOptions o)
        {
            var none = new List<FluencyObservationDto>();

            var gate = CheckEligibility(ctx, o);
            if (gate != null) return (Unavailable(gate), none);
            if (learner.Status != "available") return (Unavailable("LEARNER_UNAVAILABLE"), none);
            if (reference == null || reference.Status != "available") return (Unavailable("REFERENCE_UNAVAILABLE"), none);
            if (learner.SpeechSpanMs < o.MinSpanMs || reference.SpeechSpanMs < o.MinSpanMs)
                return (Unavailable("SPEECH_TOO_SHORT_FOR_COMPARISON"), none);

            var learnerActive = learner.SpeechSpanMs!.Value - learner.TotalPauseMs!.Value;
            var referenceActive = reference.SpeechSpanMs!.Value - reference.TotalPauseMs!.Value;
            if (learnerActive <= 0 || referenceActive <= 0) return (Unavailable("SPEECH_TOO_SHORT_FOR_COMPARISON"), none);

            var articulationRatio = (double)referenceActive / learnerActive;
            var speakingRatio = (double)reference.SpeechSpanMs!.Value / learner.SpeechSpanMs!.Value;

            var positionReliable = articulationRatio >= o.PositionMinRatio && articulationRatio <= o.PositionMaxRatio;
            var extraPauses = FindExtraPauses(learner, reference, o, ignoreSentenceEdges: positionReliable);

            var comparison = new FluencyComparisonDto
            {
                Status = "available",
                ArticulationRateRatio = Math.Round(articulationRatio, 2),
                SpeakingRateRatio = Math.Round(speakingRatio, 2),
                LearnerPauseCount = learner.PauseCount,
                ReferencePauseCount = reference.PauseCount,
                ExtraPauseCount = extraPauses.Count,
                MoraCountConsistency = Math.Round((double)ctx.RecognizedMoraCount / ctx.TargetMoraCount, 2),
            };

            var observations = new List<FluencyObservationDto>();
            if (articulationRatio <= o.SlowRatio)
            {
                var slower = (int)Math.Round((1 - articulationRatio) * 100);
                observations.Add(new FluencyObservationDto
                {
                    Code = "slow_vs_reference",
                    Message = $"Bạn nói chậm hơn giọng mẫu khoảng {slower}% (không tính khoảng dừng). Hãy nghe mẫu rồi đọc theo nhịp đó.",
                    MeasuredValue = Math.Round(articulationRatio, 2),
                    Threshold = o.SlowRatio,
                    Data = new()
                    {
                        ["learnerActiveMs"] = learnerActive,
                        ["referenceActiveMs"] = referenceActive,
                    },
                });
            }
            else if (articulationRatio >= o.FastRatio)
            {
                var faster = (int)Math.Round((articulationRatio - 1) * 100);
                observations.Add(new FluencyObservationDto
                {
                    Code = "fast_vs_reference",
                    Message = $"Bạn nói nhanh hơn giọng mẫu khoảng {faster}%. Hãy thử đọc chậm lại để phát âm đủ từng âm.",
                    MeasuredValue = Math.Round(articulationRatio, 2),
                    Threshold = o.FastRatio,
                    Data = new()
                    {
                        ["learnerActiveMs"] = learnerActive,
                        ["referenceActiveMs"] = referenceActive,
                    },
                });
            }

            if (extraPauses.Count > 0)
            {
                var ordered = extraPauses.OrderBy(p => p.pause.StartMs).ToList();
                var longest = ordered.Max(p => p.pause.DurationMs);
                var data = new Dictionary<string, object?>
                {
                    ["extraPauseCount"] = ordered.Count,
                    ["learnerPauseCount"] = learner.PauseCount,
                    ["referencePauseCount"] = reference.PauseCount,
                    ["pauseDurationsMs"] = ordered.Select(p => p.pause.DurationMs).ToList(),
                    ["positionReliable"] = positionReliable,
                    // Toàn bộ khoảng dừng thừa theo thứ tự thời gian (để định vị theo từ ở bước sau).
                    ["pauses"] = ordered.Select(p => new ExtraPauseInfo(p.pause.StartMs, p.pause.EndMs, p.pause.DurationMs, Math.Round(p.position, 2))).ToList(),
                };

                // Khi trục thời gian đáng tin thì chỉ còn khoảng dừng ở giữa câu (đầu/cuối câu đã được bỏ qua).
                string? where = null;
                if (positionReliable)
                {
                    data["relativePositions"] = ordered.Select(p => Math.Round(p.position, 2)).ToList();
                    where = "ở khoảng giữa câu";
                }

                observations.Add(new FluencyObservationDto
                {
                    Code = "extra_pause",
                    Message = DescribePauses(ordered.Select(p => (p.pause.DurationMs, where)).ToList()),
                    MeasuredValue = longest,
                    Threshold = o.ExtraPauseMinMs,
                    Data = data,
                });
            }

            return (comparison, observations.Take(o.MaxObservations).ToList());
        }

        /// <summary>Số khoảng dừng tối đa được nêu chi tiết trong một nhận xét; còn lại gộp thành "và N chỗ khác".</summary>
        public const int MaxPausesListed = 3;

        /// <summary>
        /// Câu nhận xét cho các khoảng dừng thừa (theo thứ tự thời gian). <c>Where</c> là cụm nêu vị trí ("sau 「X」, trước 「Y」",
        /// "ở khoảng giữa câu"…) hoặc null/rỗng nếu chưa biết. Quá <see cref="MaxPausesListed"/> khoảng thì nêu các khoảng dài nhất.
        /// </summary>
        public static string DescribePauses(IReadOnlyList<(int DurationMs, string? Where)> pauses)
        {
            string Item((int DurationMs, string? Where) p)
            {
                var seconds = (p.DurationMs / 1000.0).ToString("0.0", CultureInfo.InvariantCulture);
                return string.IsNullOrWhiteSpace(p.Where) ? $"{seconds} giây" : $"{seconds} giây {p.Where}";
            }

            if (pauses.Count == 1)
                return $"Bạn dừng {Item(pauses[0])} mà giọng mẫu không dừng ở đó. Hãy thử đọc liền hơn.";

            var indexed = pauses.Select((p, i) => (p, i)).ToList();
            var shown = indexed.OrderByDescending(x => x.p.DurationMs).ThenBy(x => x.i).Take(MaxPausesListed).OrderBy(x => x.i).Select(x => Item(x.p));
            var more = pauses.Count - Math.Min(pauses.Count, MaxPausesListed);
            var tail = more > 0 ? $" (và {more} chỗ khác)" : string.Empty;
            return $"Bạn dừng thừa {pauses.Count} lần mà giọng mẫu không dừng ở đó: {string.Join("; ", shown)}{tail}. Hãy thử đọc liền hơn.";
        }

        private const double SentenceStartUntil = 1.0 / 3;
        private const double SentenceEndFrom = 2.0 / 3;

        /// <summary>
        /// Khoảng dừng của người học (≥ ngưỡng) không có khoảng dừng tương ứng ở giọng mẫu.
        /// Vị trí được chuẩn hóa theo độ dài đoạn nói của từng bên (0 = đầu, 1 = cuối).
        /// Dừng ở đầu câu (người học cần chuẩn bị) và cuối câu là bình thường nên bỏ qua, khi trục thời gian đủ tin cậy để xác định vị trí.
        /// </summary>
        private static List<(FluencyPauseDto pause, double position)> FindExtraPauses(
            FluencyMetricsDto learner, FluencyMetricsDto reference, FluencyComparisonOptions o, bool ignoreSentenceEdges)
        {
            double Position(FluencyPauseDto p, FluencyMetricsDto m)
            {
                var span = m.SpeechSpanMs!.Value;
                var start = m.LeadingSilenceMs!.Value;
                return Math.Clamp(((p.StartMs + p.EndMs) / 2.0 - start) / span, 0, 1);
            }

            var referencePositions = reference.Pauses.Select(p => Position(p, reference)).ToList();
            var result = new List<(FluencyPauseDto, double)>();
            foreach (var pause in learner.Pauses.Where(p => p.DurationMs >= o.ExtraPauseMinMs))
            {
                var pos = Position(pause, learner);
                if (ignoreSentenceEdges && (pos < SentenceStartUntil || pos >= SentenceEndFrom)) continue;
                var matched = referencePositions.Any(rp => Math.Abs(rp - pos) <= o.PauseMatchTolerance);
                if (!matched) result.Add((pause, pos));
            }
            return result;
        }
    }
}
