using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Tổng kết buổi luyện, lịch sử chi tiết các lần gửi chấm và gợi ý luyện tập theo quy tắc (Shadowing V2 Milestone 6).
    /// Chỉ đọc kết quả backend đã lưu; không sinh số liệu, không dùng điểm chiều này giả lập chiều khác.
    /// </summary>
    public class ShadowingSessionInsightsService : IShadowingSessionInsightsService
    {
        /// <summary>Điểm cao nhất dưới mức này (ngưỡng "vàng" của ShadowingScoring) thì câu được gợi ý luyện lại.</summary>
        private const int RetryBelowScore = ShadowingScoring.YellowMinScore;

        /// <summary>Gợi ý chỉ khi lỗi lặp lại đủ nhiều: tối thiểu số lần và số câu khác nhau.</summary>
        private const int MinOccurrences = 3;
        private const int MinDistinctSentences = 2;
        private const int RecommendationWindowDays = 60;
        private const int MaxEvaluationsAnalyzed = 300;

        private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
        private static readonly string[] FocusTypes = { "chouon", "sokuon", "hatsuon", "voicing" };

        private readonly AppDbContext _context;
        public ShadowingSessionInsightsService(AppDbContext context) => _context = context;

        public async Task<ShadowingSessionSummaryDto?> BuildSummaryAsync(Guid sessionId, CancellationToken cancellationToken = default)
        {
            var session = await _context.ShadowingPracticeSessions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken);
            if (session == null) return null;
            var (summary, _) = await BuildAsync(session.Id, session.ShadowingDialogueId, session.LearnerRole, session.ContentMatchScore, cancellationToken);
            return summary;
        }

        public async Task<ShadowingSessionDetailDto?> GetSessionDetailAsync(
            string userId, Guid sessionId, ShadowingPracticeSessionDto sessionDto, CancellationToken cancellationToken = default)
        {
            var session = await _context.ShadowingPracticeSessions.AsNoTracking()
                .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId && s.IsActive, cancellationToken);
            if (session == null) return null;
            var (summary, submissions) = await BuildAsync(session.Id, session.ShadowingDialogueId, session.LearnerRole, session.ContentMatchScore, cancellationToken);
            return new ShadowingSessionDetailDto { Session = sessionDto, Summary = summary, Submissions = submissions };
        }

        public async Task<Dictionary<Guid, int>> CountSubmissionsAsync(IReadOnlyCollection<Guid> sessionIds, CancellationToken cancellationToken = default)
        {
            var ids = sessionIds.Distinct().ToList();
            var progressBySession = await _context.ShadowingPracticeProgresses.AsNoTracking()
                .Where(p => p.ShadowingPracticeSessionId != null && ids.Contains(p.ShadowingPracticeSessionId.Value))
                .Select(p => new { SessionId = p.ShadowingPracticeSessionId!.Value, p.Id })
                .ToListAsync(cancellationToken);
            var progressIds = progressBySession.Select(p => p.Id).ToList();
            var counts = await _context.ShadowingSentenceEvaluations.AsNoTracking()
                .Where(e => e.ShadowingPracticeProgressId != null && progressIds.Contains(e.ShadowingPracticeProgressId.Value))
                .GroupBy(e => e.ShadowingPracticeProgressId!.Value)
                .Select(g => new { ProgressId = g.Key, Count = g.Count() })
                .ToListAsync(cancellationToken);
            // Buổi trước Shadowing V2 (không có phiên server) không có trong kết quả: số lần gửi không biết, không phải 0.
            return progressBySession.ToDictionary(p => p.SessionId, p => counts.FirstOrDefault(c => c.ProgressId == p.Id)?.Count ?? 0);
        }

        private async Task<(ShadowingSessionSummaryDto Summary, List<ShadowingSubmissionDto> Submissions)> BuildAsync(
            Guid sessionId, int dialogueId, string role, int contentAccuracy, CancellationToken cancellationToken)
        {
            var sentences = await _context.ShadowingSentences.AsNoTracking()
                .Where(s => s.ShadowingDialogueId == dialogueId)
                .OrderBy(s => s.OrderIndex).ThenBy(s => s.Id)
                .Select(s => new { s.Id, s.SpeakerRole, s.JapaneseText, s.OrderIndex })
                .ToListAsync(cancellationToken);
            var learner = sentences.Where(s => string.Equals(s.SpeakerRole, role, StringComparison.OrdinalIgnoreCase)).ToList();

            var progressId = await _context.ShadowingPracticeProgresses.AsNoTracking()
                .Where(p => p.ShadowingPracticeSessionId == sessionId)
                .Select(p => (Guid?)p.Id)
                .FirstOrDefaultAsync(cancellationToken);
            // Có phiên server: mọi lần gửi chấm của phiên. Buổi cũ: chỉ các lần đã được tính vào buổi.
            var query = _context.ShadowingSentenceEvaluations.AsNoTracking();
            query = progressId != null
                ? query.Where(e => e.ShadowingPracticeProgressId == progressId)
                : query.Where(e => e.ShadowingPracticeSessionId == sessionId);
            var evaluations = await query.OrderBy(e => e.CreatedAt).ToListAsync(cancellationToken);

            var orderOf = sentences.ToDictionary(s => s.Id, s => s.OrderIndex);
            var submissions = evaluations.Select(e => new ShadowingSubmissionDto
            {
                EvaluationId = e.Id,
                SentenceId = e.ShadowingSentenceId,
                OrderIndex = orderOf.GetValueOrDefault(e.ShadowingSentenceId),
                SubmittedAt = DateTime.SpecifyKind(e.CreatedAt, DateTimeKind.Utc),
                EvaluationStatus = e.EvaluationStatus,
                ErrorCode = e.ErrorCode,
                ContentMatchScore = e.ContentMatchScore,
                Tier = e.Tier,
                RecognizedText = e.RecognizedText,
                RecognitionSource = e.RecognitionSource,
                AsrModel = e.AsrModel,
                ScoringVersion = e.ScoringVersion,
                CountedInSession = e.ShadowingPracticeSessionId == sessionId,
            }).ToList();

            var counted = evaluations.Where(e => e.ShadowingPracticeSessionId == sessionId && e.OverallScore.HasValue).ToList();
            var summary = new ShadowingSessionSummaryDto
            {
                TotalSentenceCount = sentences.Count,
                LearnerSentenceCount = learner.Count,
                EvaluatedSentenceCount = learner.Count(s => evaluations.Any(e => e.ShadowingSentenceId == s.Id && e.OverallScore.HasValue)),
                TotalSubmissions = evaluations.Count,
                UnscoredSubmissions = evaluations.Count(e => !e.OverallScore.HasValue),
                ContentAccuracy = contentAccuracy,
            };

            // Trạng thái các chiều: có điểm/đo được ở ít nhất một lần chấm được tính thì COMPLETED; không suy ra từ chiều khác.
            var dims = counted.Select(e => ShadowingService.ReadDimensions(e.DimensionsJson)).ToList();
            summary.PronunciationStatus = dims.Any(d => d.Pronunciation.Status == "COMPLETED") ? "COMPLETED" : "UNAVAILABLE";
            summary.FluencyStatus = dims.Any(d => d.Fluency.Status == "COMPLETED") ? "COMPLETED" : "UNAVAILABLE";
            summary.ProsodyStatus = dims.Any(d => d.Prosody.Status == "COMPLETED") ? "COMPLETED" : "UNAVAILABLE";

            foreach (var e in counted)
                foreach (var type in ErrorTypes(e.DiffTokensJson))
                    summary.ErrorTypeCounts[type] = summary.ErrorTypeCounts.GetValueOrDefault(type) + 1;

            foreach (var s in learner)
            {
                var best = evaluations.Where(e => e.ShadowingSentenceId == s.Id && e.OverallScore.HasValue)
                    .OrderByDescending(e => e.OverallScore).ThenByDescending(e => e.CreatedAt).FirstOrDefault();
                if (best != null && best.OverallScore >= RetryBelowScore) continue;
                summary.SentencesToRetry.Add(new ShadowingRetrySentenceDto
                {
                    SentenceId = s.Id,
                    OrderIndex = s.OrderIndex,
                    JapaneseText = s.JapaneseText,
                    BestScore = best?.OverallScore,
                    Reason = best == null ? "NOT_EVALUATED" : "LOW_SCORE",
                    MainErrorType = best == null ? null : ErrorTypes(best.DiffTokensJson).FirstOrDefault(),
                });
            }
            return (summary, submissions);
        }

        public async Task<ShadowingRecommendationDto> GetRecommendationsAsync(string userId, int? excludeDialogueId, CancellationToken cancellationToken = default)
        {
            var since = DateTime.UtcNow.AddDays(-RecommendationWindowDays);
            var recent = await _context.ShadowingSentenceEvaluations.AsNoTracking()
                .Where(e => e.UserId == userId && e.CreatedAt >= since && e.OverallScore != null)
                .OrderByDescending(e => e.CreatedAt)
                .Take(MaxEvaluationsAnalyzed)
                .Select(e => new { e.ShadowingSentenceId, e.DiffTokensJson })
                .ToListAsync(cancellationToken);

            var result = new ShadowingRecommendationDto { EvaluationsAnalyzed = recent.Count };
            var stats = FocusTypes.ToDictionary(t => t, _ => (Occurrences: 0, Sentences: new HashSet<int>()));
            foreach (var e in recent)
                foreach (var type in ErrorTypes(e.DiffTokensJson).Where(stats.ContainsKey))
                {
                    var s = stats[type];
                    s.Sentences.Add(e.ShadowingSentenceId);
                    stats[type] = (s.Occurrences + 1, s.Sentences);
                }

            result.Focus = stats
                .Where(kv => kv.Value.Occurrences >= MinOccurrences && kv.Value.Sentences.Count >= MinDistinctSentences)
                .OrderByDescending(kv => kv.Value.Occurrences)
                .Take(2)
                .Select(kv => new ShadowingFocusDto
                {
                    ErrorType = kv.Key,
                    Occurrences = kv.Value.Occurrences,
                    SentenceCount = kv.Value.Sentences.Count,
                    Message = FocusMessage(kv.Key, kv.Value.Occurrences, kv.Value.Sentences.Count),
                })
                .ToList();
            if (result.Focus.Count == 0) return result;

            // Bài có nhiều câu chứa âm cần luyện, theo cách đọc đã tính sẵn (không đoán)
            var readings = await _context.ShadowingSentenceAssets.AsNoTracking()
                .Where(a => a.VoiceId == null && a.IsActive && a.ShadowingSentence!.ShadowingDialogue.IsActive
                    && a.SourceText == a.ShadowingSentence.JapaneseText)
                .Select(a => new
                {
                    DialogueId = a.ShadowingSentence!.ShadowingDialogueId,
                    a.ShadowingSentence.ShadowingDialogue.Title,
                    a.ShadowingSentence.ShadowingDialogue.JLPTLevel,
                    a.MoraSequence,
                })
                .ToListAsync(cancellationToken);

            foreach (var focus in result.Focus)
            {
                var dialogues = readings
                    .Where(r => r.DialogueId != excludeDialogueId && HasFeature(r.MoraSequence, focus.ErrorType))
                    .GroupBy(r => new { r.DialogueId, r.Title, r.JLPTLevel })
                    .OrderByDescending(g => g.Count())
                    .Take(3)
                    .Select(g => new ShadowingRecommendedDialogueDto
                    {
                        DialogueId = g.Key.DialogueId,
                        Title = g.Key.Title,
                        JlptLevel = g.Key.JLPTLevel,
                        ErrorType = focus.ErrorType,
                        MatchingSentenceCount = g.Count(),
                    });
                result.Dialogues.AddRange(dialogues.Where(d => result.Dialogues.All(x => x.DialogueId != d.DialogueId)));
            }
            return result;
        }

        private static string FocusMessage(string type, int occurrences, int sentences)
        {
            var what = type switch
            {
                "chouon" => "trường âm (âm kéo dài ー)",
                "sokuon" => "âm ngắt っ",
                "hatsuon" => "âm ん",
                _ => "âm đục/trong (が/か, だ/た…)",
            };
            return $"Các lần chấm gần đây lệch ở {what} {occurrences} lần trên {sentences} câu. Hãy luyện thêm các câu có âm này.";
        }

        /// <summary>Loại lỗi của các từ chưa đúng (errorType, hoặc "missing" khi thiếu cả từ).</summary>
        internal static List<string> ErrorTypes(string diffTokensJson)
        {
            try
            {
                var tokens = JsonSerializer.Deserialize<List<ShadowingDiffTokenDto>>(diffTokensJson, Json) ?? new();
                return tokens.Where(t => t.Status != "correct")
                    .Select(t => t.ErrorType ?? (t.Status == "missing" ? "missing" : "mora"))
                    .ToList();
            }
            catch (JsonException)
            {
                return new List<string>();
            }
        }

        private const string VoicedKana = "がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ";

        internal static bool HasFeature(string moraSequenceJson, string errorType)
        {
            List<MoraJson>? moras;
            try
            {
                moras = JsonSerializer.Deserialize<List<MoraJson>>(moraSequenceJson, Json);
            }
            catch (JsonException)
            {
                return false;
            }
            if (moras == null) return false;
            return errorType switch
            {
                "chouon" => moras.Any(m => m.C == JapaneseMora.LongMark),
                "sokuon" => moras.Any(m => m.C == "っ"),
                "hatsuon" => moras.Any(m => m.C == "ん"),
                "voicing" => moras.Any(m => m.C.Length > 0 && VoicedKana.Contains(m.C[0])),
                _ => false,
            };
        }

        private sealed record MoraJson(string C, string D);
    }
}
