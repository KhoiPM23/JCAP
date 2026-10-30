using System;
using System.Collections.Generic;
using System.Linq;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Vị trí của một khoảng dừng so với các TỪ của câu mẫu. Đúng một trong hai dạng:
    /// nằm ở ranh giới giữa hai từ (PreviousWord và/hoặc NextWord có giá trị), hoặc nằm giữa một từ (InsideWord).
    /// </summary>
    public sealed record PausePlacement(int MoraIndex, string? PreviousWord, string? NextWord, string? InsideWord)
    {
        internal static readonly char[] TrimChars = "。、！？!?.,…・「」『』()（）:：;；\"'` 　".ToCharArray();

        private static string Clean(string text) => text.Trim(TrimChars);

        /// <summary>Cụm tiếng Việt nêu vị trí, vd. "sau 「おばあさん」 (trước 「が」)"; rỗng nếu không có từ nào để nêu.</summary>
        public string Describe()
        {
            string? Quote(string? w) => string.IsNullOrWhiteSpace(w) || Clean(w).Length == 0 ? null : $"「{Clean(w)}」";

            var inside = Quote(InsideWord);
            if (inside != null) return $"ngay giữa từ {inside}";

            var prev = Quote(PreviousWord);
            var next = Quote(NextWord);
            if (prev != null && next != null) return $"sau {prev}, trước {next}";
            if (prev != null) return $"sau {prev}";
            if (next != null) return $"trước {next}";
            return string.Empty;
        }
    }

    /// <summary>
    /// Xác định khoảng dừng của người học rơi vào đâu trong câu mẫu theo TỪ (sau từ nào, trước từ nào).
    ///
    /// Cách làm: cắt bản ghi người học đến lúc bắt đầu khoảng dừng, căn chỉnh phần đó với phần ĐẦU của giọng mẫu VOICEVOX
    /// bằng DTW đầu-mở (cuối phía mẫu tự do), lấy điểm kết thúc tốt nhất trên giọng mẫu, rồi tra mốc mora của engine
    /// để biết người học đã đọc xong bao nhiêu mora. Số mora đó được gióng với ranh giới từ của câu mẫu.
    /// Cắt trước khoảng dừng (thay vì căn chỉnh cả câu) để đoạn im lặng dài không bị DTW dàn trải lên các mora kế tiếp.
    ///
    /// Đây là ước lượng: không đạt độ tin cậy thì trả null và nơi gọi dùng cách nói chung ("giữa câu"), KHÔNG đoán từ.
    /// </summary>
    public static class PausePositionLocator
    {
        private const int HopMs = SpeechFeatures.HopMs;
        private const int MinPrefixFrames = 20;

        /// <summary>
        /// Chi phí căn chỉnh trung bình tối đa chấp nhận (thang riêng của đặc trưng theo dải tần; đo thật: 1.2–1.9 với giọng nam/nữ/có ồn).
        /// Vượt mức này thì không nêu từ. Chỉnh qua <c>Shadowing:Pause:MaxAlignmentCost</c>.
        /// </summary>
        public const double DefaultMaxAlignmentCost = 2.5;

        /// <summary>Cách ranh giới từ không quá số mora này thì coi khoảng dừng nằm đúng ở ranh giới (sai số căn chỉnh).</summary>
        public const int SnapMoras = 1;

        /// <summary>Gióng số mora đã đọc xong trước khoảng dừng với ranh giới từ của câu mẫu.</summary>
        public static PausePlacement? Place(int moraIndex, IReadOnlyList<TargetWordSpan> words)
        {
            if (words.Count == 0) return null;

            var boundaries = words.Select(w => w.Start).Append(words[^1].End).Distinct().OrderBy(b => b).ToList();
            var nearest = boundaries.OrderBy(b => Math.Abs(b - moraIndex)).ThenBy(b => b).First();

            if (Math.Abs(nearest - moraIndex) <= SnapMoras)
            {
                var previousIndex = words.ToList().FindLastIndex(w => w.End == nearest);
                var next = words.FirstOrDefault(w => w.Start == nearest);
                return new PausePlacement(nearest, previousIndex < 0 ? null : WithParticleHost(words, previousIndex), next?.Text, null);
            }

            var inside = words.FirstOrDefault(w => w.Start < moraIndex && moraIndex < w.End);
            return inside == null ? null : new PausePlacement(moraIndex, null, null, inside.Text);
        }

        private const string ParticleChars = "はがをにへでとものや";

        /// <summary>Trợ từ đơn (に, を…) đứng một mình khó hiểu khi nêu vị trí, nên ghép với từ đứng trước (棚 + に → 棚に).</summary>
        private static string WithParticleHost(IReadOnlyList<TargetWordSpan> words, int index)
        {
            var word = words[index];
            var bare = word.Text.Trim(PausePlacement.TrimChars);
            if (index > 0 && bare.Length == 1 && ParticleChars.Contains(bare[0]))
                return words[index - 1].Text.Trim(PausePlacement.TrimChars) + word.Text;
            return word.Text;
        }

        /// <summary>Kết quả định vị: CompletedMoras = null thì Failure nói lý do (để chẩn đoán), Cost là chi phí căn chỉnh trung bình nếu đã tính.</summary>
        public sealed record Alignment(int? CompletedMoras, string? Failure, double? Cost);

        /// <summary>
        /// Số mora người học đã đọc xong khi bắt đầu khoảng dừng (CompletedMoras = null nếu không xác định đủ tin cậy).
        /// <paramref name="pauseStartMs"/> tính từ đầu bản ghi người học (cùng hệ với FluencyPauseDto).
        /// </summary>
        public static Alignment Locate(
            float[] learner16k, float[] reference16k, IReadOnlyList<MoraTiming> timeline,
            int expectedMoraCount, int pauseStartMs, MoraDurationOptions o, double maxAlignmentCost = DefaultMaxAlignmentCost)
        {
            var timed = timeline.Where(t => !t.IsPause).ToList();
            if (timed.Count == 0) return new(null, "TIMELINE_EMPTY", null);
            if (timed.Count != expectedMoraCount) return new(null, $"MORA_COUNT_MISMATCH(timeline={timed.Count},target={expectedMoraCount})", null);

            var learnerSegs = FluencyAnalyzer.DetectSegments(learner16k, out _);
            var referenceSegs = FluencyAnalyzer.DetectSegments(reference16k, out _);
            if (learnerSegs == null || referenceSegs == null) return new(null, "NO_SPEECH_SEGMENTS", null);

            int learnerStart = learnerSegs[0].start;
            int referenceStart = referenceSegs[0].start, referenceEnd = referenceSegs[^1].end;
            if (pauseStartMs <= learnerStart) return new(0, null, null);

            // Mốc mora của engine co giãn khớp khoảng nói thật của giọng mẫu (giống MoraDurationAnalyzer).
            var timelineStartSec = timed[0].StartSec;
            var timelineSpanMs = (timed[^1].EndSec - timelineStartSec) * 1000.0;
            var referenceSpanMs = (double)(referenceEnd - referenceStart);
            if (timelineSpanMs <= 0 || referenceSpanMs <= 0) return new(null, "TIMELINE_SPAN_INVALID", null);
            var scale = referenceSpanMs / timelineSpanMs;
            if (Math.Abs(scale - 1.0) > o.TimelineTolerance) return new(null, $"TIMELINE_MISMATCH(scale={scale:0.00})", null);
            double RefMs(double sec) => (sec - timelineStartSec) * 1000.0 * scale;

            var learnerPrefix = Slice(learner16k, learnerStart, pauseStartMs);
            var referenceFeatures = SpeechFeatures.ComputeBands(Slice(reference16k, referenceStart, referenceEnd));
            if (learnerPrefix.Length / (SpeechFeatures.SampleRate / 1000) / HopMs < MinPrefixFrames || referenceFeatures.Length < MinPrefixFrames)
                return new(null, "PREFIX_TOO_SHORT", null);

            // Dùng đặc trưng theo dải tần (loại âm) thay vì MFCC: MFCC phụ thuộc âm sắc người nói nên với giọng nam căn chỉnh
            // lệch 2-4 mora (đo thật), còn đặc trưng dải tần chỉ lệch tối đa ±1 mora ở đa số ca.
            var learnerFeatures = SpeechFeatures.ComputeBands(learnerPrefix);
            if (learnerFeatures.Length < MinPrefixFrames) return new(null, "PREFIX_TOO_SHORT", null);
            var (endFrame, cost) = OpenEndMatch(referenceFeatures, learnerFeatures);
            if (endFrame == null) return new(null, "ALIGNMENT_FAILED", null);
            if (cost > maxAlignmentCost) return new(null, "ALIGNMENT_UNRELIABLE", cost);

            var boundaryMs = (endFrame.Value + 1) * (double)HopMs;
            return new(timed.Count(t => RefMs((t.StartSec + t.EndSec) / 2) < boundaryMs), null, cost);
        }

        /// <summary>
        /// DTW có ràng buộc độ dốc, đầu mở phía <paramref name="reference"/>: căn chỉnh TOÀN BỘ <paramref name="prefix"/> với một
        /// đoạn đầu của reference. Trả về khung cuối của reference cho chi phí trung bình thấp nhất, kèm chi phí đó.
        /// </summary>
        internal static (int? EndFrame, double Cost) OpenEndMatch(float[][] reference, float[][] prefix)
        {
            int n = reference.Length, m = prefix.Length;
            var cost = new float[n + 1][];
            var length = new int[n + 1][];
            for (int i = 0; i <= n; i++)
            {
                cost[i] = new float[m + 1];
                length[i] = new int[m + 1];
                Array.Fill(cost[i], float.PositiveInfinity);
            }
            cost[0][0] = 0;

            (int di, int dj)[] steps = { (1, 1), (1, 2), (2, 1) };
            for (int i = 1; i <= n; i++)
            {
                for (int j = 1; j <= m; j++)
                {
                    float best = float.PositiveInfinity;
                    int bestLen = 0;
                    foreach (var (di, dj) in steps)
                    {
                        int pi = i - di, pj = j - dj;
                        if (pi < 0 || pj < 0) continue;
                        var prev = cost[pi][pj];
                        if (float.IsInfinity(prev)) continue;
                        if (prev < best) { best = prev; bestLen = length[pi][pj]; }
                    }
                    if (float.IsInfinity(best)) continue;
                    cost[i][j] = best + (float)SpeechFeatures.Distance(reference[i - 1], prefix[j - 1]);
                    length[i][j] = bestLen + 1;
                }
            }

            int? result = null;
            double bestAverage = double.MaxValue;
            for (int i = 1; i <= n; i++)
            {
                if (float.IsInfinity(cost[i][m])) continue;
                var average = cost[i][m] / length[i][m];
                if (average < bestAverage) { bestAverage = average; result = i - 1; }
            }
            return (result, bestAverage);
        }

        private static float[] Slice(float[] samples, int startMs, int endMs)
        {
            int s = Math.Clamp(startMs * SpeechFeatures.SampleRate / 1000, 0, samples.Length);
            int e = Math.Clamp(endMs * SpeechFeatures.SampleRate / 1000, s, samples.Length);
            var result = new float[e - s];
            Array.Copy(samples, s, result, 0, result.Length);
            return result;
        }
    }
}
