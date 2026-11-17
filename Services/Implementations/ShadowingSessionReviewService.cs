using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Shadowing;
using JCAP.Models;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Nhận xét buổi Shadowing bằng AI, tập trung vào Phát âm và Lưu loát. AI KHÔNG nghe audio và KHÔNG chấm điểm: chỉ diễn giải số liệu
    /// hệ thống đã đo và lưu. Backend tính sẵn các tổng hợp (kiểu lỗi âm lặp lại, nhịp nói cả buổi) để AI không phải tự cộng trừ và
    /// nhận xét đi vào thói quen thay vì liệt kê từng câu. Không lưu kết quả; miễn phí (không trừ Credit).
    /// </summary>
    public sealed class ShadowingSessionReviewService : IShadowingSessionReviewService
    {
        private const int MaxSentences = 20;
        private const int MaxIssues = 3;
        private const int MaxPatterns = 8;
        private const int MaxTextLength = 220;

        private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

        /// <summary>Dữ liệu gửi AI giữ nguyên chữ Nhật/Việt (không mã hoá thành mã Unicode): ít token hơn, AI đọc chính xác hơn. Không dùng cho HTML.</summary>
        private static readonly JsonSerializerOptions PromptJson = new(JsonSerializerDefaults.Web)
        {
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        };

        private readonly AppDbContext _context;
        private readonly IAiClient _ai;
        private readonly IShadowingSessionInsightsService _insights;
        private readonly ILogger<ShadowingSessionReviewService> _logger;

        public ShadowingSessionReviewService(AppDbContext context, IAiClient ai, IShadowingSessionInsightsService insights,
            ILogger<ShadowingSessionReviewService> logger)
        {
            _context = context;
            _ai = ai;
            _insights = insights;
            _logger = logger;
        }

        internal const string SystemInstruction = """
            Bạn là giáo viên phát âm tiếng Nhật, nhận xét một buổi luyện Shadowing (nghe giọng mẫu rồi nói lại từng câu) của người Việt trình độ N5–N3.
            Bạn KHÔNG nghe được audio; chỉ dùng dữ liệu JSON do hệ thống đo:
            - pronunciationPatterns: các kiểu lỗi âm hệ thống phát hiện, đã gom và đếm trên mọi lần chấm của buổi (vd. 「く」 đọc thành 「ぐ」 ×3), kèm từ ví dụ.
              Lỗi âm được suy ra từ chữ bộ nhận dạng viết ra nên có thể bỏ sót; KHÔNG kết luận "phát âm hoàn hảo".
            - fluencySummary: nhịp nói cả buổi so với giọng mẫu, đã viết sẵn bằng lời (speedInWords, continuityInWords, pausesInWords)
              cùng vài số đếm (số câu đo được, số câu chậm hơn mẫu, số lần dừng thừa, số lần ngập ngừng giữa từ).
              Mỗi câu có "rhythm" mô tả nhịp nói của câu đó bằng lời.
            - sentences[]: từng câu (lần tốt nhất): câu mẫu, điểm nội dung, số lần thử, câu nghe được, wordIssues, rhythm nếu có.
            Nhiệm vụ: chỉ ra ĐÚNG những vấn đề quan trọng nhất về Phát âm và Lưu loát, đi vào thói quen gây ra lỗi.
            Quy tắc:
            1. Gom theo kiểu lỗi lặp lại, không liệt kê từng câu. Nhiều lỗi cùng gốc thì gộp và nêu gốc
               (vd. く→ぐ, ぱ→ば, ち→じ ở đầu từ cùng do thiếu bật hơi khi đọc âm trong).
            2. Mỗi vấn đề có bằng chứng lấy từ dữ liệu (số lần, từ, câu, con số). Không bịa số, không suy ra điều dữ liệu không có.
            3. Cách sửa phải cụ thể, làm được ngay khi Shadowing (động tác miệng/hơi, cụm nào đọc chậm, câu nào nghe lại).
            4. Không chấm điểm, không nhận xét giọng, ngữ điệu hay cao độ. Không nhận xét điểm nội dung chung chung.
            5. Lưu loát là so với nhịp giọng máy VOICEVOX đọc đều, chỉ để tham khảo; nói nhanh hơn mẫu KHÔNG phải lỗi.
               Không nhận xét thời gian chờ trước khi bắt đầu nói (do thao tác bấm ghi âm).
               fluencySummary vắng mặt thì "fluency": null.
            6. Ngắn gọn: summary và priority mỗi cái 1 câu; verdict 1 câu; title ≤ 10 từ; evidence và fix mỗi cái 1 câu ≤ 30 từ.
               Không chào hỏi, không khen chung chung, không lặp ý giữa các mục.
            7. Tiếng Việt, xưng "bạn". Chữ tiếng Nhật đặt trong 「」.
            8. Viết bằng lời thường cho người học đọc. TUYỆT ĐỐI không đưa vào câu chữ: tên trường dữ liệu (vd. medianRateRatio, extraPauses),
               tỷ lệ, số thập phân, phần trăm, mili giây, giây, "mora". Về nhịp nói dùng các câu mô tả có sẵn trong fluencySummary
               (speedInWords, continuityInWords, pausesInWords). Bằng chứng là câu hoặc từ cụ thể, có thể kèm số lần đếm được
               (vd. "dừng giữa từ 「成田」 2 lần", "「く」 bị đọc thành 「ぐ」 ở 「エクスプレス」 và 「くつ」").
            Trả về đúng một JSON object:
            {"summary": "kết luận chính",
             "priority": "một việc nên luyện ngay",
             "pronunciation": {"verdict": "...", "issues": [{"title": "...", "evidence": "...", "fix": "..."}]},
             "fluency": {"verdict": "...", "issues": [{"title": "...", "evidence": "...", "fix": "..."}]}}
            Mỗi "issues" tối đa 3 mục, vấn đề ảnh hưởng nhiều nhất trước; không có vấn đề rõ thì để mảng rỗng.
            """;

        public async Task<ShadowingSessionReviewResult> GenerateAsync(string userId, Guid sessionId, CancellationToken cancellationToken = default)
        {
            var session = await _context.ShadowingPracticeSessions.AsNoTracking()
                .Include(s => s.ShadowingDialogue)
                .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId && s.IsActive, cancellationToken);
            if (session == null) return new ShadowingSessionReviewResult(null, true, null);

            var payload = await BuildPayloadAsync(session, cancellationToken);
            if (payload.Sentences.Count == 0)
                return new ShadowingSessionReviewResult(null, false, "Buổi luyện chưa có câu nào được chấm, chưa có gì để nhận xét.");

            var request = AiRequest.CreateJson(SystemInstruction, JsonSerializer.Serialize(payload, PromptJson), temperature: 0.3);
            AiResponse response;
            try
            {
                response = await _ai.GenerateAsync(request, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Gọi AI nhận xét buổi Shadowing lỗi.");
                return Failed();
            }
            if (!response.IsSuccess || string.IsNullOrWhiteSpace(response.Content))
            {
                _logger.LogWarning("AI nhận xét buổi Shadowing không trả kết quả: {Error}", response.ErrorMessage);
                return Failed();
            }

            var review = Parse(response.Content);
            if (review == null) return Failed();
            review.HasFluencyData = payload.FluencySummary != null;
            if (!review.HasFluencyData) review.Fluency = null;
            return new ShadowingSessionReviewResult(review, false, null);
        }

        private static ShadowingSessionReviewResult Failed() =>
            new(null, false, "Chưa tạo được nhận xét lúc này. Hãy thử lại sau ít phút.");

        // ---- Dữ liệu gửi AI (chỉ số liệu đã lưu, không có thông tin cá nhân) ----

        internal sealed class Payload
        {
            public string Dialogue { get; set; } = string.Empty;
            public string Level { get; set; } = string.Empty;
            public int LearnerSentenceCount { get; set; }
            public int EvaluatedSentenceCount { get; set; }
            public int ContentAccuracy { get; set; }
            public List<PronunciationPattern> PronunciationPatterns { get; set; } = new();
            public FluencySummary? FluencySummary { get; set; }
            public List<SentencePayload> Sentences { get; set; } = new();
        }

        /// <summary>Một kiểu lỗi âm lặp lại trong buổi (gom trên mọi lần chấm có điểm).</summary>
        internal sealed class PronunciationPattern
        {
            public string Pattern { get; set; } = string.Empty;
            public string? Type { get; set; }
            public int Count { get; set; }
            public List<string> Examples { get; set; } = new();
        }

        /// <summary>Nhịp nói cả buổi (các câu so được với giọng mẫu).</summary>
        internal sealed class FluencySummary
        {
            // Số đếm dễ hiểu (gửi AI)
            public int SentencesMeasured { get; set; }
            public int SlowerThanReferenceSentences { get; set; }
            public int ExtraPauses { get; set; }
            public int Hesitations { get; set; }
            // Số liệu gốc: chỉ để tính câu mô tả, KHÔNG gửi AI (AI từng trích nguyên số ra cho người học)
            [System.Text.Json.Serialization.JsonIgnore] public double? MedianRateRatio { get; set; }
            [System.Text.Json.Serialization.JsonIgnore] public double? AverageMeanRunMoras { get; set; }
            [System.Text.Json.Serialization.JsonIgnore] public double? AverageReferenceMeanRunMoras { get; set; }
            [System.Text.Json.Serialization.JsonIgnore] public int? LongestPauseMs { get; set; }
            /// <summary>Thời gian chờ trước khi nói: do thao tác bấm ghi âm và phần thu trước, KHÔNG phải lưu loát; không gửi AI.</summary>
            [System.Text.Json.Serialization.JsonIgnore] public int? MedianLeadingSilenceMs { get; set; }
            /// <summary>Mô tả bằng lời (backend tính từ số liệu) để AI dùng thay cho con số.</summary>
            public string SpeedInWords { get; set; } = string.Empty;
            public string? ContinuityInWords { get; set; }
            public string PausesInWords { get; set; } = string.Empty;
        }

        internal sealed class SentencePayload
        {
            public string Text { get; set; } = string.Empty;
            public int BestScore { get; set; }
            public int Attempts { get; set; }
            public string Heard { get; set; } = string.Empty;
            public List<WordIssuePayload> WordIssues { get; set; } = new();
            /// <summary>Số liệu gốc của câu: chỉ dùng nội bộ để tổng hợp, KHÔNG gửi AI.</summary>
            [System.Text.Json.Serialization.JsonIgnore] public ShadowingFluencySnapshotDto? Fluency { get; set; }
            /// <summary>Nhịp nói của câu bằng lời (gửi AI thay cho số liệu).</summary>
            public SentenceFluencyWords? Rhythm => Fluency == null ? null : new SentenceFluencyWords
            {
                Speed = SpeedInWords(Fluency.RateRatio),
                Pauses = PausesInWords(Fluency.ExtraPauseCount ?? 0, Fluency.HesitationCount ?? 0),
                Continuity = ContinuityInWords(Fluency.MeanRunMoras, Fluency.ReferenceMeanRunMoras),
            };
        }

        internal sealed class SentenceFluencyWords
        {
            public string Speed { get; set; } = string.Empty;
            public string Pauses { get; set; } = string.Empty;
            public string? Continuity { get; set; }
        }

        internal sealed class WordIssuePayload
        {
            public string Word { get; set; } = string.Empty;
            public string Status { get; set; } = string.Empty;
            public string? Expected { get; set; }
            public string? Spoken { get; set; }
            public List<string> Issues { get; set; } = new();
        }

        internal async Task<Payload> BuildPayloadAsync(ShadowingPracticeSession session, CancellationToken cancellationToken)
        {
            var evaluations = await _context.ShadowingSentenceEvaluations.AsNoTracking()
                .Include(e => e.ShadowingSentence)
                .Where(e => e.ShadowingPracticeSessionId == session.Id && e.UserId == session.UserId && e.OverallScore != null)
                .ToListAsync(cancellationToken);
            var summary = await _insights.BuildSummaryAsync(session.Id, cancellationToken);

            var best = evaluations
                .GroupBy(e => e.ShadowingSentenceId)
                .Select(g => (Best: g.OrderByDescending(e => e.OverallScore).ThenByDescending(e => e.CreatedAt).First(), Attempts: g.Count()))
                .OrderBy(x => x.Best.ShadowingSentence?.OrderIndex ?? 0)
                .Take(MaxSentences)
                .ToList();

            var sentences = best.Select(x => new SentencePayload
            {
                Text = x.Best.ShadowingSentence?.JapaneseText ?? string.Empty,
                BestScore = x.Best.OverallScore ?? 0,
                Attempts = x.Attempts,
                Heard = x.Best.RecognizedText,
                WordIssues = ReadTokens(x.Best.DiffTokensJson)
                    .Where(t => t.Status != "correct")
                    .Select(t => new WordIssuePayload
                    {
                        Word = t.Text,
                        Status = t.ErrorType == "extra" ? "extra" : t.Status,
                        Expected = t.ExpectedReading,
                        Spoken = t.SpokenPart,
                        Issues = (t.Issues ?? new()).Select(i => i.Message).ToList(),
                    })
                    .Take(8)
                    .ToList(),
                Fluency = ReadFluency(x.Best.FluencyJson),
            }).ToList();

            return new Payload
            {
                Dialogue = session.ShadowingDialogue?.Title ?? string.Empty,
                Level = session.ShadowingDialogue?.JLPTLevel ?? string.Empty,
                LearnerSentenceCount = summary?.LearnerSentenceCount ?? session.LearnerSentenceCount,
                EvaluatedSentenceCount = summary?.EvaluatedSentenceCount ?? sentences.Count,
                ContentAccuracy = summary?.ContentAccuracy ?? session.ContentMatchScore,
                PronunciationPatterns = BuildPatterns(evaluations),
                FluencySummary = BuildFluencySummary(sentences.Select(s => s.Fluency).OfType<ShadowingFluencySnapshotDto>().ToList()),
                Sentences = sentences,
            };
        }

        /// <summary>
        /// Gom lỗi từng âm trên mọi lần chấm có điểm thành kiểu lỗi (bỏ vị trí "sau 「X」" để các lần cùng kiểu gộp lại), đếm và lấy từ ví dụ.
        /// </summary>
        internal static List<PronunciationPattern> BuildPatterns(IEnumerable<ShadowingSentenceEvaluation> evaluations)
        {
            var map = new Dictionary<string, PronunciationPattern>();
            foreach (var e in evaluations)
                foreach (var token in ReadTokens(e.DiffTokensJson).Where(t => t.Issues is { Count: > 0 }))
                    foreach (var issue in token.Issues!)
                    {
                        var key = issue.Kind switch
                        {
                            "substitute" => $"「{issue.Expected}」 đọc thành 「{issue.Spoken}」",
                            "missing" => $"thiếu 「{issue.Expected}」",
                            _ => $"thừa 「{issue.Spoken}」",
                        };
                        if (!map.TryGetValue(key, out var p))
                            map[key] = p = new PronunciationPattern { Pattern = key, Type = issue.ErrorType };
                        p.Count++;
                        var word = token.Text.Trim("。、！？!?「」 ".ToCharArray());
                        if (word.Length > 0 && !p.Examples.Contains(word) && p.Examples.Count < 3) p.Examples.Add(word);
                    }
            return map.Values.OrderByDescending(p => p.Count).ThenBy(p => p.Pattern).Take(MaxPatterns).ToList();
        }

        internal static FluencySummary? BuildFluencySummary(List<ShadowingFluencySnapshotDto> items)
        {
            if (items.Count == 0) return null;
            static double? Median(IEnumerable<double> values)
            {
                var v = values.OrderBy(x => x).ToList();
                return v.Count == 0 ? null : Math.Round(v.Count % 2 == 1 ? v[v.Count / 2] : (v[v.Count / 2 - 1] + v[v.Count / 2]) / 2, 2);
            }
            static double? Average(IEnumerable<double> values)
            {
                var v = values.ToList();
                return v.Count == 0 ? null : Math.Round(v.Average(), 1);
            }
            var summary = new FluencySummary
            {
                SentencesMeasured = items.Count,
                MedianRateRatio = Median(items.Where(i => i.RateRatio.HasValue).Select(i => i.RateRatio!.Value)),
                SlowerThanReferenceSentences = items.Count(i => i.RateRatio is <= 0.7),
                ExtraPauses = items.Sum(i => i.ExtraPauseCount ?? 0),
                Hesitations = items.Sum(i => i.HesitationCount ?? 0),
                AverageMeanRunMoras = Average(items.Where(i => i.MeanRunMoras.HasValue).Select(i => i.MeanRunMoras!.Value)),
                AverageReferenceMeanRunMoras = Average(items.Where(i => i.ReferenceMeanRunMoras.HasValue).Select(i => i.ReferenceMeanRunMoras!.Value)),
                LongestPauseMs = items.Max(i => i.LongestPauseMs),
                MedianLeadingSilenceMs = Median(items.Where(i => i.LeadingSilenceMs.HasValue).Select(i => (double)i.LeadingSilenceMs!.Value)) is { } m
                    ? (int)Math.Round(m) : null,
            };
            summary.SpeedInWords = SpeedInWords(summary.MedianRateRatio);
            summary.ContinuityInWords = ContinuityInWords(summary.AverageMeanRunMoras, summary.AverageReferenceMeanRunMoras);
            summary.PausesInWords = PausesInWords(summary.ExtraPauses, summary.Hesitations);
            return summary;
        }

        /// <summary>Tốc độ so với giọng mẫu bằng lời (người bản xứ thường nói nhanh hơn giọng mẫu nên nhanh hơn không phải lỗi).</summary>
        internal static string SpeedInWords(double? ratio) => ratio switch
        {
            null => "chưa đo được tốc độ",
            < 0.55 => "chậm hơn giọng mẫu rất nhiều",
            < 0.75 => "chậm hơn giọng mẫu khá nhiều",
            < 0.9 => "hơi chậm hơn giọng mẫu",
            <= 1.15 => "gần bằng giọng mẫu",
            _ => "nhanh hơn giọng mẫu (không phải lỗi)",
        };

        internal static string? ContinuityInWords(double? learner, double? reference)
        {
            if (learner is not { } l || reference is not { } r || r <= 0) return null;
            var share = l / r;
            return share >= 0.8 ? "nói liền mạch gần như giọng mẫu"
                : share >= 0.5 ? "hay ngắt câu thành các đoạn ngắn hơn giọng mẫu"
                : "thường ngắt quãng sau vài âm, trong khi giọng mẫu đọc liền cả cụm";
        }

        internal static string PausesInWords(int extraPauses, int hesitations) =>
            extraPauses == 0 ? "không dừng ở chỗ giọng mẫu không dừng"
            : hesitations > 0 ? $"dừng {extraPauses} lần ở chỗ giọng mẫu không dừng, trong đó {hesitations} lần dừng ngay giữa một từ"
            : $"dừng {extraPauses} lần ở chỗ giọng mẫu không dừng (giữa các cụm từ)";

        private static List<ShadowingDiffTokenDto> ReadTokens(string? json)
        {
            try { return JsonSerializer.Deserialize<List<ShadowingDiffTokenDto>>(json ?? "[]", Json) ?? new(); }
            catch (JsonException) { return new(); }
        }

        private static ShadowingFluencySnapshotDto? ReadFluency(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            try { return JsonSerializer.Deserialize<ShadowingFluencySnapshotDto>(json, Json); }
            catch (JsonException) { return null; }
        }

        // ---- Đọc kết quả AI: chỉ nhận đúng cấu trúc, cắt độ dài/số mục ----

        private sealed class RawReview
        {
            public string? Summary { get; set; }
            public string? Priority { get; set; }
            public RawSection? Pronunciation { get; set; }
            public RawSection? Fluency { get; set; }
        }

        private sealed class RawSection
        {
            public string? Verdict { get; set; }
            public List<RawPoint>? Issues { get; set; }
        }

        private sealed class RawPoint
        {
            public string? Title { get; set; }
            public string? Evidence { get; set; }
            public string? Fix { get; set; }
        }

        private static readonly System.Text.RegularExpressions.Regex TechnicalInParens =
            new(@"\s*\(\s*[a-z]+[A-Z][A-Za-z]*\s*\)", System.Text.RegularExpressions.RegexOptions.Compiled);
        private static readonly System.Text.RegularExpressions.Regex TechnicalWord =
            new(@"\b[a-z]+[A-Z][A-Za-z]*\b", System.Text.RegularExpressions.RegexOptions.Compiled);
        /// <summary>Thuật ngữ tiếng Anh trong ngoặc, vd. "(leading silence)".</summary>
        private static readonly System.Text.RegularExpressions.Regex EnglishInParens =
            new(@"\s*\(\s*[A-Za-z][A-Za-z ]*\)", System.Text.RegularExpressions.RegexOptions.Compiled);
        /// <summary>Số đo kèm đơn vị hoặc số thập phân, vd. "lên tới 1060ms", "0,7 giây", "48%", "0.59" (kể cả nằm trong ngoặc).</summary>
        private static readonly System.Text.RegularExpressions.Regex Measurement = new(
            @"\s*\(?\s*(?:lên tới|chỉ đạt|khoảng|là)?\s*\d+(?:[.,]\d+)?\s*(?:ms|mili\s*giây|giây|%|mora|lần mẫu)(?![\p{L}])\)?|\s*\(?\b\d+[.,]\d+\b\)?",
            System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        /// <summary>
        /// Lưới an toàn: bỏ tên trường dữ liệu (vd. "(medianRateRatio)"), thuật ngữ tiếng Anh trong ngoặc và số đo kỹ thuật nếu AI lỡ viết
        /// vào câu cho người học. Số đếm thường ("2 lần") được giữ.
        /// </summary>
        internal static string StripTechnicalTerms(string text)
        {
            var t = TechnicalInParens.Replace(text, string.Empty);
            t = TechnicalWord.Replace(t, string.Empty);
            t = EnglishInParens.Replace(t, string.Empty);
            t = Measurement.Replace(t, string.Empty);
            return System.Text.RegularExpressions.Regex.Replace(t, @"\s{2,}", " ").Replace(" .", ".").Replace(" ,", ",").Trim();
        }

        internal static ShadowingSessionAiReviewDto? Parse(string content)
        {
            var text = content.Trim();
            // Một số mô hình bọc JSON trong khối mã
            if (text.StartsWith("```"))
            {
                var start = text.IndexOf('{');
                var end = text.LastIndexOf('}');
                if (start < 0 || end <= start) return null;
                text = text[start..(end + 1)];
            }

            RawReview? raw;
            try { raw = JsonSerializer.Deserialize<RawReview>(text, Json); }
            catch (JsonException) { return null; }
            if (raw == null || string.IsNullOrWhiteSpace(raw.Summary) || raw.Pronunciation == null) return null;

            static string Clip(string? s)
            {
                var t = StripTechnicalTerms((s ?? string.Empty).Trim());
                return t.Length > MaxTextLength ? t[..MaxTextLength] + "…" : t;
            }
            static ShadowingAiReviewSectionDto Section(RawSection s) => new()
            {
                Verdict = Clip(s.Verdict),
                Issues = (s.Issues ?? new())
                    .Select(p => new ShadowingAiReviewPointDto { Title = Clip(p.Title), Evidence = Clip(p.Evidence), Fix = Clip(p.Fix) })
                    .Where(p => p.Title.Length > 0)
                    .Take(MaxIssues)
                    .ToList(),
            };

            return new ShadowingSessionAiReviewDto
            {
                Summary = Clip(raw.Summary),
                Priority = Clip(raw.Priority),
                Pronunciation = Section(raw.Pronunciation),
                Fluency = raw.Fluency == null ? null : Section(raw.Fluency),
                GeneratedAt = DateTime.UtcNow,
            };
        }
    }
}
