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
    /// Nhận xét tổng hợp buổi Shadowing bằng AI. AI KHÔNG nghe audio và KHÔNG chấm điểm: chỉ diễn giải số liệu hệ thống đã đo và lưu
    /// (điểm nội dung từng câu, lỗi theo từ và từng âm, số liệu Lưu loát so với giọng mẫu), mỗi nhận xét phải kèm bằng chứng.
    /// Không lưu kết quả; miễn phí (không trừ Credit).
    /// </summary>
    public sealed class ShadowingSessionReviewService : IShadowingSessionReviewService
    {
        private const int MaxSentences = 20;
        private const int MaxPoints = 3;
        private const int MaxTextLength = 400;

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
            Bạn là giáo viên tiếng Nhật, nhận xét một buổi luyện Shadowing (nghe giọng mẫu rồi nói lại từng câu) của người học Việt Nam trình độ JLPT N5–N3.
            Bạn KHÔNG nghe được audio. Bạn chỉ được dùng dữ liệu JSON do hệ thống đo, gồm:
            - sentences[]: câu mẫu, điểm nội dung tốt nhất (0–100, tỷ lệ âm thuộc các từ đọc đúng), số lần thử, câu hệ thống nghe được,
              wordIssues (từ đọc sai/thiếu, cách đọc mẫu, người học nói gì, lỗi từng âm do hệ thống phát hiện),
              fluency (nếu có): rateRatio = tốc độ người học / tốc độ giọng mẫu (< 1 là chậm hơn), số chỗ ngừng của người học và của mẫu,
              extraPauses (ngừng ở chỗ mẫu không ngừng), hesitations (ngừng giữa một từ), meanRunMoras (số âm nói liền trung bình) và của mẫu.
            - errorTypeCounts: đếm lỗi theo loại trong buổi.
            Quy tắc bắt buộc:
            1. Mỗi nhận xét phải có bằng chứng lấy từ dữ liệu (trích câu, từ hoặc con số). Không bịa số, không suy ra điều dữ liệu không có.
            2. Không tự chấm điểm mới, không đưa ra điểm phát âm, điểm lưu loát hay điểm tổng.
            3. Không nhận xét giọng, chất giọng, ngữ điệu hay cao độ (hệ thống chưa đo). Về âm chỉ nói đến các lỗi trong wordIssues.
            4. Lưu loát chỉ là so với nhịp của giọng mẫu (giọng máy VOICEVOX đọc đều), mang tính tham khảo; người bản xứ thật thường nói nhanh hơn giọng mẫu,
               nên không coi nói nhanh hơn mẫu là lỗi. Không có dữ liệu fluency thì để mảng "fluency" rỗng.
            5. Viết tiếng Việt, xưng "bạn", giọng khích lệ nhưng thẳng thắn, câu ngắn. Từ/câu tiếng Nhật đặt trong 「」.
            6. Lời khuyên phải làm được ngay khi luyện Shadowing (nghe lại câu nào, chú ý âm nào, đọc chậm cụm nào).
            Trả về đúng một JSON object:
            {"overview": "2–3 câu tổng quan",
             "strengths": ["tối đa 3 điểm làm tốt, có bằng chứng"],
             "content": [{"point": "vấn đề về từ/âm", "evidence": "bằng chứng", "advice": "cách luyện"}],
             "fluency": [{"point": "...", "evidence": "...", "advice": "..."}],
             "nextSteps": ["tối đa 3 việc nên làm tiếp"]}
            Mỗi mảng content/fluency tối đa 3 mục, ưu tiên vấn đề lặp lại nhiều nhất.
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
            review.HasFluencyData = payload.Sentences.Any(s => s.Fluency != null);
            if (!review.HasFluencyData) review.Fluency.Clear();
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
            public Dictionary<string, int> ErrorTypeCounts { get; set; } = new();
            public List<SentencePayload> Sentences { get; set; } = new();
        }

        internal sealed class SentencePayload
        {
            public string Text { get; set; } = string.Empty;
            public int BestScore { get; set; }
            public int Attempts { get; set; }
            public string Heard { get; set; } = string.Empty;
            public List<WordIssuePayload> WordIssues { get; set; } = new();
            public ShadowingFluencySnapshotDto? Fluency { get; set; }
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

            var sentences = evaluations
                .GroupBy(e => e.ShadowingSentenceId)
                .Select(g =>
                {
                    var best = g.OrderByDescending(e => e.OverallScore).ThenByDescending(e => e.CreatedAt).First();
                    return (Order: best.ShadowingSentence?.OrderIndex ?? 0, Best: best, Attempts: g.Count());
                })
                .OrderBy(x => x.Order)
                .Take(MaxSentences)
                .Select(x => new SentencePayload
                {
                    Text = x.Best.ShadowingSentence?.JapaneseText ?? string.Empty,
                    BestScore = x.Best.OverallScore ?? 0,
                    Attempts = x.Attempts,
                    Heard = x.Best.RecognizedText,
                    WordIssues = ReadWordIssues(x.Best.DiffTokensJson),
                    Fluency = ReadFluency(x.Best.FluencyJson),
                })
                .ToList();

            return new Payload
            {
                Dialogue = session.ShadowingDialogue?.Title ?? string.Empty,
                Level = session.ShadowingDialogue?.JLPTLevel ?? string.Empty,
                LearnerSentenceCount = summary?.LearnerSentenceCount ?? session.LearnerSentenceCount,
                EvaluatedSentenceCount = summary?.EvaluatedSentenceCount ?? sentences.Count,
                ContentAccuracy = summary?.ContentAccuracy ?? session.ContentMatchScore,
                ErrorTypeCounts = summary?.ErrorTypeCounts ?? new(),
                Sentences = sentences,
            };
        }

        private static List<WordIssuePayload> ReadWordIssues(string? json)
        {
            List<ShadowingDiffTokenDto>? tokens;
            try { tokens = JsonSerializer.Deserialize<List<ShadowingDiffTokenDto>>(json ?? "[]", Json); }
            catch (JsonException) { return new(); }
            return (tokens ?? new())
                .Where(t => t.Status != "correct")
                .Select(t => new WordIssuePayload
                {
                    Word = t.Text,
                    Status = t.ErrorType == "extra" ? "extra" : t.Status,
                    Expected = t.ExpectedReading,
                    Spoken = t.SpokenPart,
                    Issues = (t.Issues ?? new()).Select(i => string.IsNullOrEmpty(i.Hint) ? i.Message : $"{i.Message} ({i.Hint})").ToList(),
                })
                .Take(8)
                .ToList();
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
            public string? Overview { get; set; }
            public List<string>? Strengths { get; set; }
            public List<RawPoint>? Content { get; set; }
            public List<RawPoint>? Fluency { get; set; }
            public List<string>? NextSteps { get; set; }
        }

        private sealed class RawPoint
        {
            public string? Point { get; set; }
            public string? Evidence { get; set; }
            public string? Advice { get; set; }
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
            if (raw == null || string.IsNullOrWhiteSpace(raw.Overview)) return null;

            static string Clip(string? s)
            {
                var t = (s ?? string.Empty).Trim();
                return t.Length > MaxTextLength ? t[..MaxTextLength] + "…" : t;
            }
            static List<string> Items(List<string>? items) =>
                (items ?? new()).Select(Clip).Where(s => s.Length > 0).Take(MaxPoints).ToList();
            static List<ShadowingAiReviewPointDto> Points(List<RawPoint>? points) =>
                (points ?? new())
                    .Select(p => new ShadowingAiReviewPointDto { Point = Clip(p.Point), Evidence = Clip(p.Evidence), Advice = Clip(p.Advice) })
                    .Where(p => p.Point.Length > 0)
                    .Take(MaxPoints)
                    .ToList();

            return new ShadowingSessionAiReviewDto
            {
                Overview = Clip(raw.Overview),
                Strengths = Items(raw.Strengths),
                Content = Points(raw.Content),
                Fluency = Points(raw.Fluency),
                NextSteps = Items(raw.NextSteps),
                GeneratedAt = DateTime.UtcNow,
            };
        }
    }
}
