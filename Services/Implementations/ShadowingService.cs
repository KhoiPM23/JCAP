using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations
{
    public class ShadowingService : IShadowingService
    {
        private readonly AppDbContext _context;

        public ShadowingService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<ApiResponse<List<ShadowingDialogueListDto>>> GetLearnerCatalogAsync(string? keyword, string? jlptLevel, int? scenarioId)
        {
            // Learner chỉ được xem nội dung đang hoạt động (IsActive == true)
            var query = _context.ShadowingDialogues
                .AsNoTracking()
                .Include(d => d.Scenario)
                .Include(d => d.Sentences)
                .Where(d => d.IsActive && d.Scenario.IsActive);

            if (!string.IsNullOrWhiteSpace(keyword))
            {
                var term = keyword.Trim().ToLower();
                query = query.Where(d => d.Title.ToLower().Contains(term)
                    || (d.SourceDescription != null && d.SourceDescription.ToLower().Contains(term))
                    || d.Scenario.Title.ToLower().Contains(term));
            }

            if (!string.IsNullOrWhiteSpace(jlptLevel) && jlptLevel != "ALL")
            {
                var level = jlptLevel.Trim().ToUpper();
                query = query.Where(d => d.JLPTLevel == level);
            }

            if (scenarioId.HasValue && scenarioId.Value > 0)
            {
                query = query.Where(d => d.ScenarioId == scenarioId.Value);
            }

            var items = await query
                .OrderByDescending(d => d.Id)
                .Select(d => new ShadowingDialogueListDto
                {
                    Id = d.Id,
                    ScenarioId = d.ScenarioId,
                    ScenarioTitle = d.Scenario.Title,
                    Title = d.Title,
                    JLPTLevel = d.JLPTLevel,
                    SourceDescription = d.SourceDescription,
                    SpeakerRoleA_Name = d.SpeakerRoleA_Name,
                    SpeakerRoleB_Name = d.SpeakerRoleB_Name,
                    TotalSentences = d.Sentences.Count,
                    IsActive = d.IsActive,
                    CreatedAt = d.CreatedAt
                })
                .ToListAsync();

            return ApiResponse<List<ShadowingDialogueListDto>>.Ok(items, "Lấy danh sách bài học Shadowing thành công.");
        }

        public async Task<ApiResponse<ShadowingDialogueDetailDto>> GetLearnerDetailAsync(int id)
        {
            var dialogue = await _context.ShadowingDialogues
                .AsNoTracking()
                .Include(d => d.Scenario)
                .Include(d => d.Sentences.OrderBy(s => s.OrderIndex))
                .Include(d => d.DialogueVocabularies).ThenInclude(dv => dv.Vocabulary)
                .Include(d => d.DialogueGrammars).ThenInclude(dg => dg.Grammar)
                .FirstOrDefaultAsync(d => d.Id == id && d.IsActive && d.Scenario.IsActive);

            if (dialogue == null)
            {
                return ApiResponse<ShadowingDialogueDetailDto>.Fail($"Không tìm thấy bài học Shadowing với Id = {id} hoặc bài học đã bị ẩn.");
            }

            // Lấy thông tin ngữ cảnh, từ vựng và ngữ pháp từ ScenarioLevelConfiguration tương ứng
            var levelConfig = await _context.ScenarioLevelConfigurations
                .AsNoTracking()
                .Include(c => c.TargetVocabularies)
                .Include(c => c.TargetGrammars)
                .FirstOrDefaultAsync(c => c.ScenarioId == dialogue.ScenarioId && c.JLPTLevel == dialogue.JLPTLevel);

            var roles = new List<string>();
            if (!string.IsNullOrWhiteSpace(dialogue.SpeakerRolesJson))
            {
                try
                {
                    roles = System.Text.Json.JsonSerializer.Deserialize<List<string>>(dialogue.SpeakerRolesJson) ?? new();
                }
                catch
                {
                    roles = new();
                }
            }
            if (roles.Count == 0)
            {
                if (!string.IsNullOrWhiteSpace(dialogue.SpeakerRoleA_Name)) roles.Add(dialogue.SpeakerRoleA_Name);
                if (!string.IsNullOrWhiteSpace(dialogue.SpeakerRoleB_Name)) roles.Add(dialogue.SpeakerRoleB_Name);
            }

            var vocabList = dialogue.DialogueVocabularies != null && dialogue.DialogueVocabularies.Any()
                ? dialogue.DialogueVocabularies
                    .Where(dv => dv.Vocabulary.IsActive)
                    .OrderBy(dv => dv.OrderIndex)
                    .Select(dv => new ShadowingVocabularyDto
                    {
                        Id = dv.Vocabulary.Id,
                        Word = dv.Vocabulary.Word,
                        Reading = dv.Vocabulary.Reading,
                        Meaning = dv.Vocabulary.Meaning
                    }).ToList()
                : levelConfig?.TargetVocabularies.Select(v => new ShadowingVocabularyDto
                {
                    Id = v.Id,
                    Word = v.Word,
                    Reading = v.Reading,
                    Meaning = v.Meaning
                }).ToList() ?? new List<ShadowingVocabularyDto>();

            var grammarList = dialogue.DialogueGrammars != null && dialogue.DialogueGrammars.Any()
                ? dialogue.DialogueGrammars
                    .Where(dg => dg.Grammar.IsActive)
                    .OrderBy(dg => dg.OrderIndex)
                    .Select(dg => new ShadowingGrammarDto
                    {
                        Id = dg.Grammar.Id,
                        Pattern = dg.Grammar.Pattern,
                        Meaning = dg.Grammar.Meaning,
                        ExampleSentence = dg.Grammar.ExampleSentence
                    }).ToList()
                : levelConfig?.TargetGrammars.Select(g => new ShadowingGrammarDto
                {
                    Id = g.Id,
                    Pattern = g.Pattern,
                    Meaning = g.Meaning,
                    ExampleSentence = g.ExampleSentence
                }).ToList() ?? new List<ShadowingGrammarDto>();

            var detail = new ShadowingDialogueDetailDto
            {
                Id = dialogue.Id,
                ScenarioId = dialogue.ScenarioId,
                ScenarioTitle = dialogue.Scenario.Title,
                ScenarioDescription = dialogue.Scenario.Description,
                ScenarioLevelDescription = levelConfig?.Description,
                Title = dialogue.Title,
                JLPTLevel = dialogue.JLPTLevel,
                SourceDescription = dialogue.SourceDescription,
                SpeakerRoleA_Name = dialogue.SpeakerRoleA_Name,
                SpeakerRoleB_Name = dialogue.SpeakerRoleB_Name,
                SpeakerRoles = roles,
                SpeakerRolesJson = dialogue.SpeakerRolesJson,
                IsActive = dialogue.IsActive,
                CreatedAt = dialogue.CreatedAt,
                Sentences = dialogue.Sentences
                    .OrderBy(s => s.OrderIndex)
                    .Select(s => new ShadowingSentenceDto
                    {
                        Id = s.Id,
                        OrderIndex = s.OrderIndex,
                        SpeakerRole = s.SpeakerRole,
                        JapaneseText = s.JapaneseText,
                        RomajiText = s.RomajiText,
                        VietnameseTranslation = s.VietnameseTranslation,
                        NativeAudioUrl = s.NativeAudioUrl,
                        AudioDurationMs = s.AudioDurationMs
                    })
                    .ToList(),
                TargetVocabularies = vocabList,
                TargetGrammars = grammarList
            };

            return ApiResponse<ShadowingDialogueDetailDto>.Ok(detail, "Lấy thông tin chi tiết bài học Shadowing thành công.");
        }

        private const int MaxEvaluationsPerSession = 200;
        private const int MaxHistoryItems = 100;
        private const int MaxSessionSeconds = 6 * 60 * 60;
        private const int MaxRecognizedTextLength = 1000;
        private const int MaxFeedbackLength = 2000;
        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

        public async Task<ShadowingSentence?> FindPracticeSentenceAsync(int sentenceId)
        {
            return await _context.ShadowingSentences
                .AsNoTracking()
                .Include(s => s.ShadowingDialogue)
                .FirstOrDefaultAsync(s => s.Id == sentenceId && s.ShadowingDialogue.IsActive);
        }

        public async Task<Guid?> RecordSentenceEvaluationAsync(string userId, int sentenceId, ShadowingAudioEvaluationResponseDto result)
        {
            // Chỉ lưu lượt có điểm. "Chưa chấm được" không phải điểm 0 nên không được đưa vào điểm tổng.
            var scored = (result.EvaluationStatus == "completed" || result.EvaluationStatus == "partial")
                && result.ContentMatchScore.HasValue
                && result.OverallScore.HasValue;
            if (!scored || string.IsNullOrEmpty(userId)) return null;

            var evaluation = new ShadowingSentenceEvaluation
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                ShadowingSentenceId = sentenceId,
                RecognizedText = Truncate(result.RecognizedText, MaxRecognizedTextLength),
                ContentMatchScore = result.ContentMatchScore!.Value,
                OverallScore = result.OverallScore!.Value,
                Tier = result.Tier,
                EvaluationStatus = result.EvaluationStatus,
                RecognitionSource = result.RecognitionSource,
                ScoringVersion = result.ScoringVersion,
                ComparisonMethod = result.ComparisonMethod,
                AudioQualityStatus = result.AudioQualityStatus,
                Feedback = Truncate(result.Feedback, MaxFeedbackLength),
                DiffTokensJson = JsonSerializer.Serialize(result.DiffTokens, JsonOptions),
                CreatedAt = DateTime.UtcNow,
            };

            _context.ShadowingSentenceEvaluations.Add(evaluation);
            await _context.SaveChangesAsync();
            return evaluation.Id;
        }

        public async Task<ApiResponse<ShadowingSessionCompleteResponseDto>> CompleteSessionAsync(string userId, ShadowingSessionCompleteDto dto)
        {
            var role = (dto.LearnerRole ?? string.Empty).Trim().ToUpperInvariant();
            if (role != "A" && role != "B")
            {
                return ApiResponse<ShadowingSessionCompleteResponseDto>.Fail("Vai luyện tập không hợp lệ.");
            }

            var ids = (dto.EvaluationIds ?? new List<Guid>()).Distinct().Take(MaxEvaluationsPerSession).ToList();
            if (ids.Count == 0)
            {
                return ApiResponse<ShadowingSessionCompleteResponseDto>.Fail("Chưa có câu nào được chấm trong buổi luyện này.");
            }

            var dialogue = await _context.ShadowingDialogues
                .AsNoTracking()
                .FirstOrDefaultAsync(d => d.Id == dto.DialogueId);
            if (dialogue == null)
            {
                return ApiResponse<ShadowingSessionCompleteResponseDto>.Fail("Không tìm thấy bài học Shadowing.");
            }

            // Điểm lấy từ kết quả chấm backend đã LƯU, không lấy từ client. Chỉ nhận kết quả của chính người dùng này,
            // đúng bài, đúng vai và chưa thuộc buổi luyện nào (gửi lại cùng Id không tạo được buổi thứ hai).
            var evaluations = await _context.ShadowingSentenceEvaluations
                .Where(e => ids.Contains(e.Id)
                    && e.UserId == userId
                    && e.ShadowingPracticeSessionId == null
                    && e.ShadowingSentence!.ShadowingDialogueId == dto.DialogueId
                    && e.ShadowingSentence.SpeakerRole == role)
                .ToListAsync();

            // Mỗi câu một kết quả: nhiều lượt của cùng một câu thì lấy lượt điểm cao nhất (mới nhất nếu bằng điểm).
            var chosen = evaluations
                .GroupBy(e => e.ShadowingSentenceId)
                .Select(g => g.OrderByDescending(e => e.OverallScore).ThenByDescending(e => e.CreatedAt).First())
                .ToList();
            if (chosen.Count == 0)
            {
                return ApiResponse<ShadowingSessionCompleteResponseDto>.Fail(
                    "Không có kết quả chấm hợp lệ để lưu (buổi luyện này có thể đã được lưu trước đó).");
            }

            var learnerSentenceCount = await _context.ShadowingSentences
                .AsNoTracking()
                .CountAsync(s => s.ShadowingDialogueId == dto.DialogueId && s.SpeakerRole == role);
            // Câu của vai người học chưa được chấm tính là 0 trong điểm tổng.
            var denominator = learnerSentenceCount > 0 ? learnerSentenceCount : chosen.Count;

            var contentMatch = Math.Clamp(
                (int)Math.Round(chosen.Sum(e => (double)e.ContentMatchScore) / denominator, MidpointRounding.AwayFromZero), 0, 100);
            int? fluency = null; // chưa đo ở phiên bản chấm hiện tại
            var overall = ShadowingScoring.ComputeOverall(contentMatch, fluency) ?? 0;

            var completedAt = DateTime.UtcNow;
            var duration = Math.Clamp(dto.DurationSeconds, 0, MaxSessionSeconds);
            var startedAt = dto.StartedAt?.ToUniversalTime() is { } started
                && started <= completedAt
                && started >= completedAt.AddSeconds(-MaxSessionSeconds)
                ? started
                : completedAt.AddSeconds(-duration);

            var session = new ShadowingPracticeSession
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                ShadowingDialogueId = dialogue.Id,
                LearnerRole = role,
                StartedAt = startedAt,
                CompletedAt = completedAt,
                DurationSeconds = duration,
                ContentMatchScore = contentMatch,
                FluencyScore = fluency,
                WeightedOverallScore = overall,
                ScoringVersion = ShadowingScoring.Version,
                AudioQualityStatus = AggregateAudioQuality(chosen.Select(e => e.AudioQualityStatus)),
                RankTitle = RankTitleFor(overall),
                LearnerSentenceCount = learnerSentenceCount,
                ScoredSentenceCount = chosen.Count,
                IsActive = true,
            };

            _context.ShadowingPracticeSessions.Add(session);
            foreach (var evaluation in chosen) evaluation.ShadowingPracticeSessionId = session.Id;
            await _context.SaveChangesAsync();

            var response = new ShadowingSessionCompleteResponseDto
            {
                SessionId = session.Id,
                DialogueId = dialogue.Id,
                DialogueTitle = dialogue.Title,
                OverallAccuracyScore = contentMatch,
                OverallFluencyScore = fluency,
                AudioQualityStatus = session.AudioQualityStatus,
                WeightedOverallScore = overall,
                ScoringVersion = session.ScoringVersion,
                RankTitle = session.RankTitle,
                SummaryFeedback = SummaryFeedbackFor(overall),
                LearnerSentenceCount = learnerSentenceCount,
                ScoredSentenceCount = chosen.Count,
            };

            return ApiResponse<ShadowingSessionCompleteResponseDto>.Ok(response, "Đã lưu buổi luyện Shadowing vào lịch sử.");
        }

        public async Task<ApiResponse<List<ShadowingPracticeSessionDto>>> GetHistoryAsync(string userId)
        {
            var sessions = await _context.ShadowingPracticeSessions
                .AsNoTracking()
                .Where(s => s.UserId == userId && s.IsActive)
                .OrderByDescending(s => s.CompletedAt)
                .Take(MaxHistoryItems)
                .Include(s => s.ShadowingDialogue!).ThenInclude(d => d.Scenario)
                .Include(s => s.SentenceEvaluations).ThenInclude(e => e.ShadowingSentence)
                .AsSplitQuery()
                .ToListAsync();

            var items = sessions.Select(s => new ShadowingPracticeSessionDto
            {
                Id = s.Id,
                DialogueId = s.ShadowingDialogueId,
                DialogueTitle = s.ShadowingDialogue?.Title ?? string.Empty,
                ScenarioTitle = s.ShadowingDialogue?.Scenario?.Title ?? string.Empty,
                JlptLevel = s.ShadowingDialogue?.JLPTLevel ?? string.Empty,
                LearnerRole = s.LearnerRole,
                StartedAt = AsUtc(s.StartedAt),
                CompletedAt = AsUtc(s.CompletedAt),
                DurationSeconds = s.DurationSeconds,
                ContentMatchScore = s.ContentMatchScore,
                FluencyScore = s.FluencyScore,
                WeightedOverallScore = s.WeightedOverallScore,
                ScoringVersion = s.ScoringVersion,
                AudioQualityStatus = s.AudioQualityStatus,
                RankTitle = s.RankTitle,
                LearnerSentenceCount = s.LearnerSentenceCount,
                ScoredSentenceCount = s.ScoredSentenceCount,
                Sentences = s.SentenceEvaluations
                    .OrderBy(e => e.ShadowingSentence?.OrderIndex ?? int.MaxValue)
                    .Select(e => new ShadowingSessionSentenceDto
                    {
                        EvaluationId = e.Id,
                        SentenceId = e.ShadowingSentenceId,
                        OrderIndex = e.ShadowingSentence?.OrderIndex ?? 0,
                        TargetText = e.ShadowingSentence?.JapaneseText ?? string.Empty,
                        RecognizedText = e.RecognizedText,
                        ContentMatchScore = e.ContentMatchScore,
                        OverallScore = e.OverallScore,
                        Tier = e.Tier,
                        Feedback = e.Feedback,
                        ScoringVersion = e.ScoringVersion,
                        DiffTokens = ReadDiffTokens(e.DiffTokensJson),
                        EvaluatedAt = AsUtc(e.CreatedAt),
                    })
                    .ToList(),
            }).ToList();

            return ApiResponse<List<ShadowingPracticeSessionDto>>.Ok(items, "Lấy lịch sử luyện Shadowing thành công.");
        }

        // Điểm hiện chỉ đo độ khớp nội dung, nên lời nhận xét không được nói về lưu loát hay phát âm.
        private static string RankTitleFor(int overall) =>
            overall >= 90 ? "Hạng S - Rất xuất sắc"
            : overall >= 80 ? "Hạng A - Rất tốt"
            : overall >= 65 ? "Hạng B - Đạt chuẩn"
            : "Hạng C - Cần rèn luyện thêm";

        private static string SummaryFeedbackFor(int overall) =>
            overall >= 85 ? "Xuất sắc! Bạn đọc khớp gần như toàn bộ câu chữ của bài mẫu."
            : overall >= 70 ? "Khá tốt! Bạn đọc đúng phần lớn câu chữ; hãy chú ý các từ còn sai hoặc bị thiếu."
            : "Cần luyện thêm! Hãy nghe lại câu mẫu theo từng cụm ngắn rồi đọc theo trước khi ghép cả câu.";

        /// <summary>good khi mọi câu đều good; acceptable khi chỉ gồm good/acceptable; còn lại unmeasured.</summary>
        private static string AggregateAudioQuality(IEnumerable<string> statuses)
        {
            var list = statuses.ToList();
            if (list.Count > 0 && list.All(s => s == "good")) return "good";
            if (list.Count > 0 && list.All(s => s == "good" || s == "acceptable")) return "acceptable";
            return "unmeasured";
        }

        private static List<ShadowingDiffTokenDto> ReadDiffTokens(string json)
        {
            try
            {
                return JsonSerializer.Deserialize<List<ShadowingDiffTokenDto>>(json, JsonOptions) ?? new List<ShadowingDiffTokenDto>();
            }
            catch (JsonException)
            {
                return new List<ShadowingDiffTokenDto>();
            }
        }

        private static DateTime AsUtc(DateTime value) =>
            value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);

        private static string Truncate(string? value, int max) =>
            string.IsNullOrEmpty(value) ? string.Empty : value.Length <= max ? value : value[..max];
    }
}
