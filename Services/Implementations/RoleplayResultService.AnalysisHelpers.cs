using System.Text.Json;

using JCAP.Data;

using JCAP.DTOs.Common;

using JCAP.DTOs.Roleplay;

using JCAP.DTOs.Scenario;

using JCAP.Models;

using JCAP.Services.Interfaces;

using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations

{

    public partial class RoleplayResultService : IRoleplayResultService

    {
        private static DateTime AsUtc(DateTime value)

        {

            // SQL Server datetime2 does not preserve DateTime.Kind. Roleplay timestamps are

            // stored in UTC, so restore the kind before JSON serialization to emit the "Z"

            // suffix and prevent browsers from interpreting UTC values as local time.

            return value.Kind == DateTimeKind.Utc

                ? value

                : DateTime.SpecifyKind(value, DateTimeKind.Utc);

        }

        private static string ExtractMissionTarget(string? criteriaJson)

        {

            if (string.IsNullOrWhiteSpace(criteriaJson)) return string.Empty;

            try

            {

                using var doc = JsonDocument.Parse(criteriaJson);

                if (doc.RootElement.TryGetProperty("target", out var targetProp))

                {

                    return targetProp.GetString() ?? string.Empty;

                }

            }

            catch

            {

                // Safe fallback

            }

            return string.Empty;

        }

        private static ApiResponse<CompleteRoleplaySessionResponseDto> BuildCompleteResponse(

            int resultId,

            bool isExistingResult,

            bool isMockEvaluation)

        {

            var message = isExistingResult

                ? "Phiên luyện tập đã được hoàn tất trước đó."

                : "Hoàn tất và lưu kết quả luyện tập thành công.";

            return ApiResponse<CompleteRoleplaySessionResponseDto>.Ok(new CompleteRoleplaySessionResponseDto

            {

                ResultId = resultId,

                IsExistingResult = isExistingResult,

                IsMockEvaluation = isMockEvaluation

            }, message);

        }

        private static bool IsLegacyMockResult(RoleplayResult result)

        {

            return result.OverallScore == 80

                && result.GrammarScore == 80

                && result.VocabularyScore == 80

                && result.ImpressionScore == 80

                && string.Equals(

                    result.GeneralFeedbackText,

                    LegacyMockFeedback,

                    StringComparison.Ordinal);

        }

        private static string NormalizeGrammarPattern(string? pattern)
        {
            if (string.IsNullOrWhiteSpace(pattern)) return string.Empty;
            var cleaned = pattern;
            cleaned = cleaned.Replace("～", "").Replace("~", "").Replace("〜", "");
            cleaned = System.Text.RegularExpressions.Regex.Replace(cleaned, @"\[.*?\]|［.*?］|\(.*?\)|（.*?）", "");
            cleaned = cleaned.Replace("+", "").Replace("＋", "");
            cleaned = cleaned.Trim(' ', '\t', '　', '。', '、', '?', '？', '.', ',');
            return string.IsNullOrWhiteSpace(cleaned) ? pattern.Trim() : cleaned;
        }

        private static int GetJlptNumericRank(string? level)
        {
            if (string.IsNullOrWhiteSpace(level)) return 5;
            var upper = level.Trim().ToUpperInvariant();
            if (upper.Contains("N1")) return 1;
            if (upper.Contains("N2")) return 2;
            if (upper.Contains("N3")) return 3;
            if (upper.Contains("N4")) return 4;
            return 5;
        }

        private static List<WeakVocabularyDto> DetectWeakVocabularies(
            IReadOnlyList<TargetVocabularyDto> targetVocabularies,
            IReadOnlyList<RoleplayMessageDto> messages,
            IReadOnlyList<LearnerBehaviorSignal> signals,
            IReadOnlyList<LearnerSkillMastery>? masteries = null)
        {
            if (targetVocabularies == null || targetVocabularies.Count == 0)
            {
                return [];
            }

            var userMessages = (messages ?? Array.Empty<RoleplayMessageDto>())
                .Where(m => string.Equals(m.Sender, "User", StringComparison.OrdinalIgnoreCase))
                .ToList();

            var pairedSignals = new Dictionary<RoleplayMessageDto, LearnerBehaviorSignal>();
            if (signals != null && signals.Count > 0)
            {
                for (int i = 0; i < userMessages.Count; i++)
                {
                    var sig = signals.FirstOrDefault(s => s.TurnIndex == i + 1) ?? (i < signals.Count ? signals[i] : null);
                    if (sig != null)
                    {
                        pairedSignals[userMessages[i]] = sig;
                    }
                }
            }

            var weakEntries = new List<(WeakVocabularyDto Item, int Priority)>();

            foreach (var vocab in targetVocabularies)
            {
                if (string.IsNullOrWhiteSpace(vocab.Word))
                {
                    continue;
                }

                var chronicMastery = masteries?.FirstOrDefault(m =>
                    (!string.IsNullOrWhiteSpace(m.SkillName) && m.SkillName.Contains(vocab.Word, StringComparison.OrdinalIgnoreCase)) ||
                    (!string.IsNullOrWhiteSpace(m.SkillCode) && m.SkillCode.Contains(vocab.Word, StringComparison.OrdinalIgnoreCase)));
                bool hasHistoricalLapse = chronicMastery != null && (chronicMastery.Lapses > 0 || chronicMastery.Stability < 2.0);
                string historySuffix = hasHistoricalLapse ? " (Hồ sơ ghi nhận từng nhầm hoặc cần ôn lại)" : string.Empty;

                var cleanWord = System.Text.RegularExpressions.Regex.Replace(vocab.Word, @"[\(（].*?[\)）]", "").Trim();
                static string ToHira(string s)
                {
                    if (string.IsNullOrEmpty(s)) return string.Empty;
                    var sb = new System.Text.StringBuilder(s.Length);
                    foreach (var c in s)
                    {
                        sb.Append(c >= '\u30A1' && c <= '\u30F6' ? (char)(c - 0x60) : c);
                    }
                    return sb.ToString();
                }
                var hiraWord = ToHira(cleanWord);
                var hiraReading = ToHira(vocab.Reading ?? string.Empty);

                var matchedMessages = userMessages.Where(m =>
                {
                    var msgText = m.JapaneseText ?? string.Empty;
                    var msgHira = ToHira(msgText);
                    return (!string.IsNullOrWhiteSpace(vocab.Word) && msgText.Contains(vocab.Word, StringComparison.OrdinalIgnoreCase)) ||
                           (!string.IsNullOrWhiteSpace(cleanWord) && msgText.Contains(cleanWord, StringComparison.OrdinalIgnoreCase)) ||
                           (!string.IsNullOrWhiteSpace(vocab.Reading) && msgText.Contains(vocab.Reading, StringComparison.OrdinalIgnoreCase)) ||
                           (!string.IsNullOrWhiteSpace(hiraWord) && hiraWord.Length >= 2 && msgHira.Contains(hiraWord, StringComparison.Ordinal)) ||
                           (!string.IsNullOrWhiteSpace(hiraReading) && hiraReading.Length >= 2 && msgHira.Contains(hiraReading, StringComparison.Ordinal));
                }).ToList();

                if (matchedMessages.Count == 0)
                {
                    weakEntries.Add((new WeakVocabularyDto
                    {
                        Id = vocab.Id,
                        Word = vocab.Word,
                        Reading = vocab.Reading,
                        Meaning = vocab.Meaning,
                        MasteryScore = 30,
                        Status = "NotAttempted",
                        Reason = "Chưa chủ động vận dụng từ vựng này trong tình huống hội thoại." + historySuffix
                    }, hasHistoricalLapse ? 2 : 1));
                }
                else
                {
                    bool hasFeedbackIssue = matchedMessages.Any(m =>
                    {
                        if (m.LinguisticFeedback == null) return false;
                        if (string.Equals(m.LinguisticFeedback.Status, "Error", StringComparison.OrdinalIgnoreCase))
                            return true;

                        var details = m.LinguisticFeedback.Details;
                        bool hasLexicalDetail = details != null && details.Any(d =>
                            (string.Equals(d.Type, "error", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(d.Type, "warning", StringComparison.OrdinalIgnoreCase)) &&
                            (d.Aspect.Contains("từ", StringComparison.OrdinalIgnoreCase) ||
                             d.Aspect.Contains("Từ", StringComparison.OrdinalIgnoreCase) ||
                             d.Aspect.Contains("ngữ cảnh", StringComparison.OrdinalIgnoreCase) ||
                             d.Comment.Contains("từ vựng", StringComparison.OrdinalIgnoreCase) ||
                             d.Comment.Contains("cách dùng", StringComparison.OrdinalIgnoreCase) ||
                             (!string.IsNullOrWhiteSpace(cleanWord) && d.Comment.Contains(cleanWord, StringComparison.OrdinalIgnoreCase)))
                        );
                        if (hasLexicalDetail) return true;

                        // Chỉ coi Warning chung là lỗi từ vựng nếu không có chi tiết phân rã nào khác
                        return string.Equals(m.LinguisticFeedback.Status, "Warning", StringComparison.OrdinalIgnoreCase) &&
                               (details == null || details.Count == 0);
                    });

                    bool hasHintDependency = matchedMessages.Any(m =>
                        (m.LinguisticFeedback?.SpeechDelivery?.HintLevelUsed >= 2) ||
                        (m.LinguisticFeedback?.SpeechDelivery?.TurnAutonomyScore != null &&
                         m.LinguisticFeedback.SpeechDelivery.TurnAutonomyScore < 70) ||
                        (pairedSignals.TryGetValue(m, out var sig) && sig.HintLevelUsed >= 2));

                    if (hasFeedbackIssue || hasHintDependency)
                    {
                        weakEntries.Add((new WeakVocabularyDto
                        {
                            Id = vocab.Id,
                            Word = vocab.Word,
                            Reading = vocab.Reading,
                            Meaning = vocab.Meaning,
                            MasteryScore = 50,
                            Status = "NeedsPractice",
                            Reason = "Đã sử dụng nhưng còn gặp lỗi dùng từ/ngữ cảnh hoặc phụ thuộc gợi ý." + historySuffix
                        }, hasHistoricalLapse ? 3 : 2));
                    }
                }
            }

            return weakEntries
                .OrderByDescending(x => x.Priority)
                .Select(x => x.Item)
                .ToList();
        }

        private static List<WeakGrammarDto> DetectWeakGrammars(
            IReadOnlyList<TargetGrammarDto> targetGrammars,
            IReadOnlyList<RoleplayMessageDto> messages,
            IReadOnlyList<LearnerBehaviorSignal> signals,
            IReadOnlyList<LearnerSkillMastery>? masteries = null)
        {
            if (targetGrammars == null || targetGrammars.Count == 0)
            {
                return [];
            }

            var userMessages = (messages ?? Array.Empty<RoleplayMessageDto>())
                .Where(m => string.Equals(m.Sender, "User", StringComparison.OrdinalIgnoreCase))
                .ToList();

            var pairedSignals = new Dictionary<RoleplayMessageDto, LearnerBehaviorSignal>();
            if (signals != null && signals.Count > 0)
            {
                for (int i = 0; i < userMessages.Count; i++)
                {
                    var sig = signals.FirstOrDefault(s => s.TurnIndex == i + 1) ?? (i < signals.Count ? signals[i] : null);
                    if (sig != null)
                    {
                        pairedSignals[userMessages[i]] = sig;
                    }
                }
            }

            var weakEntries = new List<(WeakGrammarDto Item, int Priority)>();

            foreach (var grammar in targetGrammars)
            {
                if (string.IsNullOrWhiteSpace(grammar.Pattern))
                {
                    continue;
                }

                var corePattern = NormalizeGrammarPattern(grammar.Pattern);
                var chronicMastery = masteries?.FirstOrDefault(m =>
                    (!string.IsNullOrWhiteSpace(m.SkillName) &&
                        (m.SkillName.Contains(grammar.Pattern, StringComparison.OrdinalIgnoreCase) ||
                         (!string.IsNullOrWhiteSpace(corePattern) && m.SkillName.Contains(corePattern, StringComparison.OrdinalIgnoreCase)))) ||
                    (!string.IsNullOrWhiteSpace(m.SkillCode) && m.SkillCode.Contains(grammar.Pattern, StringComparison.OrdinalIgnoreCase)));
                bool hasHistoricalLapse = chronicMastery != null && (chronicMastery.Lapses > 0 || chronicMastery.Stability < 2.0);
                string historySuffix = hasHistoricalLapse ? " (Hồ sơ ghi nhận từng nhầm hoặc cần ôn lại)" : string.Empty;

                var matchedMessages = userMessages.Where(m =>
                {
                    var msgText = m.JapaneseText ?? string.Empty;
                    if ((!string.IsNullOrWhiteSpace(corePattern) && msgText.Contains(corePattern, StringComparison.OrdinalIgnoreCase)) ||
                        (!string.IsNullOrWhiteSpace(grammar.Pattern) && msgText.Contains(grammar.Pattern, StringComparison.OrdinalIgnoreCase)))
                    {
                        return true;
                    }
                    // Hỗ trợ tương đương ngữ dụng lịch sự: 〜をください <-> 〜をお願いします / 〜ていただけますか
                    if (corePattern == "をください" && (msgText.Contains("をお願いします") || msgText.Contains("をひとつお願いします") || msgText.Contains("を一つお願いします") || msgText.Contains("おねがいします") || msgText.Contains("ていただけますか") || msgText.Contains("てもらえますか")))
                    {
                        return true;
                    }
                    if (corePattern == "をお願いします" && (msgText.Contains("をください") || msgText.Contains("おねがいします") || msgText.Contains("ていただけますか")))
                    {
                        return true;
                    }
                    return false;
                }).ToList();

                if (matchedMessages.Count == 0)
                {
                    weakEntries.Add((new WeakGrammarDto
                    {
                        Id = grammar.Id,
                        Pattern = grammar.Pattern,
                        Meaning = grammar.Meaning,
                        ExampleSentence = grammar.ExampleSentence,
                        MasteryScore = 30,
                        Status = "NotAttempted",
                        Reason = "Chưa vận dụng mẫu câu ngữ pháp này trong phiên đối thoại." + historySuffix
                    }, hasHistoricalLapse ? 2 : 1));
                }
                else
                {
                    bool hasGrammarIssue = matchedMessages.Any(m =>
                        m.LinguisticFeedback != null && (
                            string.Equals(m.LinguisticFeedback.Status, "Error", StringComparison.OrdinalIgnoreCase) ||
                            (m.LinguisticFeedback.Details != null && m.LinguisticFeedback.Details.Any(d =>
                                string.Equals(d.Type, "error", StringComparison.OrdinalIgnoreCase) ||
                                (string.Equals(d.Type, "warning", StringComparison.OrdinalIgnoreCase) &&
                                 (d.Aspect.Contains("ngữ pháp", StringComparison.OrdinalIgnoreCase) ||
                                  d.Aspect.Contains("Ngữ pháp", StringComparison.OrdinalIgnoreCase) ||
                                  d.Aspect.Contains("trợ từ", StringComparison.OrdinalIgnoreCase) ||
                                  d.Aspect.Contains("cấu trúc", StringComparison.OrdinalIgnoreCase)))
                            ))
                        )
                    );

                    bool hasRuleError = matchedMessages.Any(m =>
                        pairedSignals.TryGetValue(m, out var sig) && !string.IsNullOrWhiteSpace(sig.DetectedRuleErrorCodes));
                    bool hasHintDependency = matchedMessages.Any(m =>
                        (m.LinguisticFeedback?.SpeechDelivery?.HintLevelUsed >= 2) ||
                        (m.LinguisticFeedback?.SpeechDelivery?.TurnAutonomyScore != null &&
                         m.LinguisticFeedback.SpeechDelivery.TurnAutonomyScore < 70) ||
                        (pairedSignals.TryGetValue(m, out var sig) && sig.HintLevelUsed >= 2));

                    if (hasGrammarIssue || hasRuleError || hasHintDependency)
                    {
                        weakEntries.Add((new WeakGrammarDto
                        {
                            Id = grammar.Id,
                            Pattern = grammar.Pattern,
                            Meaning = grammar.Meaning,
                            ExampleSentence = grammar.ExampleSentence,
                            MasteryScore = 50,
                            Status = "NeedsPractice",
                            Reason = "Đã vận dụng nhưng còn sai sót về trợ từ/chia thể hoặc phụ thuộc gợi ý." + historySuffix
                        }, hasHistoricalLapse ? 3 : 2));
                    }
                }
            }

            return weakEntries
                .OrderByDescending(x => x.Priority)
                .Select(x => x.Item)
                .ToList();
        }

        private async Task<List<RecommendedShadowingDialogueDto>> RecommendShadowingDialoguesAsync(
            int scenarioId,
            string scenarioTitle,
            string jlptLevel,
            IReadOnlyList<WeakVocabularyDto> weakVocabs,
            IReadOnlyList<WeakGrammarDto> weakGrammars,
            IReadOnlyList<LearnerSkillMastery>? masteries = null)
        {
            var activeDialogues = await _dbContext.ShadowingDialogues
                .AsNoTracking()
                .Include(d => d.Sentences)
                .Where(d => d.IsActive)
                .ToListAsync();

            var cleanDialogues = activeDialogues
                .Where(d => d.Title == null ||
                            (!d.Title.Contains("Master Data", StringComparison.OrdinalIgnoreCase) &&
                             !d.Title.Contains("Shared Test", StringComparison.OrdinalIgnoreCase)))
                .ToList();
            if (cleanDialogues.Count > 0)
            {
                activeDialogues = cleanDialogues;
            }

            if (activeDialogues.Count == 0)
            {
                return [];
            }

            var scoredList = new List<(ShadowingDialogue Dialogue, int Score, string MatchReason)>();
            var targetTitle = !string.IsNullOrWhiteSpace(scenarioTitle) ? scenarioTitle : "tình huống hiện tại";

            foreach (var dialogue in activeDialogues)
            {
                int scenarioScore = 0;
                if (scenarioId > 0 && dialogue.ScenarioId.HasValue && dialogue.ScenarioId.Value == scenarioId)
                {
                    scenarioScore = 40;
                }

                int levelScore = 0;
                if (string.Equals(dialogue.JLPTLevel, jlptLevel, StringComparison.OrdinalIgnoreCase))
                {
                    levelScore = 30;
                }
                else if (Math.Abs(GetJlptNumericRank(dialogue.JLPTLevel) - GetJlptNumericRank(jlptLevel)) == 1)
                {
                    levelScore = 10;
                }

                var sentencesText = dialogue.Sentences != null
                    ? string.Join(" ", dialogue.Sentences.Select(s => s.JapaneseText ?? string.Empty))
                    : string.Empty;
                var corpus = (dialogue.Title ?? string.Empty) + " " + sentencesText;

                var matchedItems = new List<string>();
                int vocabPoints = 0;
                foreach (var v in weakVocabs)
                {
                    if (!string.IsNullOrWhiteSpace(v.Word) && corpus.Contains(v.Word, StringComparison.OrdinalIgnoreCase))
                    {
                        if (vocabPoints < 20)
                        {
                            vocabPoints += 10;
                        }
                        if (!matchedItems.Contains(v.Word))
                        {
                            matchedItems.Add(v.Word);
                        }
                    }
                }

                int grammarPoints = 0;
                foreach (var g in weakGrammars)
                {
                    var core = NormalizeGrammarPattern(g.Pattern);
                    if (!string.IsNullOrWhiteSpace(core) && corpus.Contains(core, StringComparison.OrdinalIgnoreCase))
                    {
                        if (grammarPoints < 20)
                        {
                            grammarPoints += 10;
                        }
                        var label = !string.IsNullOrWhiteSpace(g.Pattern) ? g.Pattern : core;
                        if (!matchedItems.Contains(label))
                        {
                            matchedItems.Add(label);
                        }
                    }
                }

                int historyPoints = 0;
                if (masteries != null && masteries.Count > 0)
                {
                    foreach (var m in masteries.Where(m => m.Lapses > 0 || m.Stability < 2.0))
                    {
                        var skillCore = NormalizeGrammarPattern(m.SkillName ?? string.Empty);
                        var candidate = !string.IsNullOrWhiteSpace(skillCore) ? skillCore : (m.SkillName ?? string.Empty);
                        if (!string.IsNullOrWhiteSpace(candidate) && candidate.Length >= 2 && corpus.Contains(candidate, StringComparison.OrdinalIgnoreCase))
                        {
                            historyPoints = 5;
                            if (!matchedItems.Contains(m.SkillName ?? candidate))
                            {
                                matchedItems.Add(m.SkillName ?? candidate);
                            }
                            break;
                        }
                    }
                }

                int weakScore = Math.Min(vocabPoints + grammarPoints, 30);
                int totalScore = Math.Min(scenarioScore + levelScore + weakScore + historyPoints, 100);

                string matchReason;
                var itemsText = matchedItems.Count > 0 ? string.Join(", ", matchedItems) : string.Empty;

                if (scenarioScore > 0 && matchedItems.Count > 0)
                {
                    matchReason = $"Bài Shadowing cùng tình huống '{targetTitle}' ({dialogue.JLPTLevel}), giúp củng cố trực tiếp các từ/mẫu câu cần lưu ý: {itemsText}.";
                }
                else if (scenarioScore > 0)
                {
                    matchReason = $"Bài Shadowing trực tiếp cho tình huống '{targetTitle}' ({dialogue.JLPTLevel}) giúp bạn hoàn thiện ngữ điệu tự nhiên và phản xạ phát âm chuẩn.";
                }
                else if (levelScore >= 30 && matchedItems.Count > 0)
                {
                    matchReason = $"Bài Shadowing cùng cấp độ {dialogue.JLPTLevel} chứa từ vựng/mẫu câu bạn cần rèn luyện thêm ({itemsText}).";
                }
                else
                {
                    matchReason = $"Bài Shadowing chuẩn cấp độ {dialogue.JLPTLevel} giúp bạn cải thiện nhịp điệu Mora và sự tự tin khi nói.";
                }

                scoredList.Add((dialogue, totalScore, matchReason));
            }

            return scoredList
                .OrderByDescending(x => x.Score)
                .ThenBy(x => x.Dialogue.Id)
                .Take(2)
                .Select(x => new RecommendedShadowingDialogueDto
                {
                    Id = x.Dialogue.Id,
                    Title = x.Dialogue.Title,
                    JLPTLevel = x.Dialogue.JLPTLevel,
                    ScenarioId = x.Dialogue.ScenarioId,
                    MatchReason = x.MatchReason,
                    Score = x.Score,
                    SentencesCount = x.Dialogue.Sentences?.Count ?? 0
                })
                .ToList();
        }
    }

}

