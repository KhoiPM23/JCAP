using System.Text.Json;
using JCAP.Data;
using JCAP.DTOs.Shadowing;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Tests.Services;

/// <summary>Tổng kết buổi luyện, lịch sử các lần gửi chấm và gợi ý luyện tập: chỉ từ kết quả đã lưu, không sinh số liệu.</summary>
public class ShadowingSessionInsightsServiceTests
{
    private const string User = "user-1";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static async Task<AppDbContext> SeedAsync()
    {
        var c = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase("JCAP_Insights_" + Guid.NewGuid()).Options);
        c.ShadowingDialogues.AddRange(
            new ShadowingDialogue { Id = 1, Title = "Trường học", JLPTLevel = "N5", IsActive = true },
            new ShadowingDialogue { Id = 2, Title = "Bưu điện", JLPTLevel = "N5", IsActive = true },
            new ShadowingDialogue { Id = 3, Title = "Nhà ga", JLPTLevel = "N4", IsActive = true });
        c.ShadowingSentences.AddRange(
            new ShadowingSentence { Id = 1, ShadowingDialogueId = 1, OrderIndex = 0, SpeakerRole = "A", JapaneseText = "学校に行きます" },
            new ShadowingSentence { Id = 2, ShadowingDialogueId = 1, OrderIndex = 1, SpeakerRole = "B", JapaneseText = "はい" },
            new ShadowingSentence { Id = 3, ShadowingDialogueId = 1, OrderIndex = 2, SpeakerRole = "A", JapaneseText = "切手を買います" },
            new ShadowingSentence { Id = 4, ShadowingDialogueId = 1, OrderIndex = 3, SpeakerRole = "A", JapaneseText = "おばあさん" },
            new ShadowingSentence { Id = 20, ShadowingDialogueId = 2, OrderIndex = 0, SpeakerRole = "A", JapaneseText = "切手" },
            new ShadowingSentence { Id = 21, ShadowingDialogueId = 2, OrderIndex = 1, SpeakerRole = "A", JapaneseText = "ちょっと" },
            new ShadowingSentence { Id = 30, ShadowingDialogueId = 3, OrderIndex = 0, SpeakerRole = "A", JapaneseText = "駅" });
        await c.SaveChangesAsync();
        return c;
    }

    private static string Tokens(params (string Status, string? Type)[] tokens) =>
        JsonSerializer.Serialize(tokens.Select(t => new ShadowingDiffTokenDto { Text = "x", Status = t.Status, ErrorType = t.Type }), Json);

    private static ShadowingSentenceEvaluation Eval(int sentenceId, int? score, Guid? progress = null, Guid? session = null, string? tokens = null, int minutesAgo = 0) => new()
    {
        Id = Guid.NewGuid(),
        UserId = User,
        ShadowingSentenceId = sentenceId,
        ShadowingPracticeProgressId = progress,
        ShadowingPracticeSessionId = session,
        ContentMatchScore = score,
        OverallScore = score,
        EvaluationStatus = score.HasValue ? "completed" : "unavailable",
        ErrorCode = score.HasValue ? null : "AUDIO_TOO_QUIET",
        Tier = score.HasValue ? ShadowingScoring.TierFor(score) : string.Empty,
        RecognitionSource = "faster-whisper",
        ScoringVersion = ShadowingScoring.Version,
        ComparisonMethod = KanaMoraComparer.Method,
        DiffTokensJson = tokens ?? Tokens(("correct", null)),
        DimensionsJson = JsonSerializer.Serialize(new EvaluationDimensionsDto
        {
            Content = new() { Status = score.HasValue ? "COMPLETED" : "UNAVAILABLE", Score = score },
            Pronunciation = new() { Status = "UNAVAILABLE", Reason = "INSUFFICIENT_ACOUSTIC_EVIDENCE" },
            Fluency = new() { Status = "COMPLETED", Reason = "SCORE_NOT_VALIDATED" },
            Prosody = new() { Status = "UNAVAILABLE" },
        }, Json),
        CreatedAt = DateTime.UtcNow.AddMinutes(-minutesAgo),
    };

    [Fact]
    public async Task Summary_CountsEverySubmission_ListsSentencesToRetry_AndKeepsUnmeasuredDimensionsUnavailable()
    {
        using var c = await SeedAsync();
        var progress = (await new ShadowingPracticeProgressService(c).StartAsync(User, new StartShadowingProgressDto { DialogueId = 1, LearnerRole = "A" })).Data!.Id;
        var shadowing = new ShadowingService(c);
        c.ShadowingSentenceEvaluations.AddRange(
            Eval(1, null, progress, minutesAgo: 5),             // lần 1: chưa chấm được
            Eval(1, 95, progress, minutesAgo: 4),               // lần 2: tốt
            Eval(3, 40, progress, tokens: Tokens(("mismatched", "sokuon")), minutesAgo: 3)); // điểm thấp
        await c.SaveChangesAsync();
        var done = await shadowing.CompleteSessionAsync(User, new ShadowingSessionCompleteDto { DialogueId = 1, LearnerRole = "A", ProgressId = progress });

        var summary = await new ShadowingSessionInsightsService(c).BuildSummaryAsync(done.Data!.SessionId);

        Assert.NotNull(summary);
        Assert.Equal(4, summary!.TotalSentenceCount);
        Assert.Equal(3, summary.LearnerSentenceCount);
        Assert.Equal(2, summary.EvaluatedSentenceCount);
        Assert.Equal(3, summary.TotalSubmissions);
        Assert.Equal(1, summary.UnscoredSubmissions);
        Assert.Equal(done.Data.OverallAccuracyScore, summary.ContentAccuracy);
        Assert.Equal("UNAVAILABLE", summary.PronunciationStatus); // không suy ra từ điểm nội dung
        Assert.Equal("COMPLETED", summary.FluencyStatus);
        Assert.Equal("UNAVAILABLE", summary.ProsodyStatus);

        Assert.Equal(new[] { 3, 4 }, summary.SentencesToRetry.Select(s => s.SentenceId));
        var low = summary.SentencesToRetry.Single(s => s.SentenceId == 3);
        Assert.Equal(("LOW_SCORE", 40, "sokuon"), (low.Reason, low.BestScore, low.MainErrorType));
        var never = summary.SentencesToRetry.Single(s => s.SentenceId == 4);
        Assert.Equal(("NOT_EVALUATED", (int?)null), (never.Reason, never.BestScore));
        Assert.Equal(1, summary.ErrorTypeCounts["sokuon"]);
    }

    [Fact]
    public async Task Detail_ListsAllSubmissions_MarksWhichCounted_AndOnlyForTheOwner()
    {
        using var c = await SeedAsync();
        var progress = (await new ShadowingPracticeProgressService(c).StartAsync(User, new StartShadowingProgressDto { DialogueId = 1, LearnerRole = "A" })).Data!.Id;
        c.ShadowingSentenceEvaluations.AddRange(Eval(1, 60, progress, minutesAgo: 3), Eval(1, 90, progress, minutesAgo: 2), Eval(1, null, progress, minutesAgo: 1));
        await c.SaveChangesAsync();
        var shadowing = new ShadowingService(c);
        var sessionId = (await shadowing.CompleteSessionAsync(User, new ShadowingSessionCompleteDto { DialogueId = 1, LearnerRole = "A", ProgressId = progress })).Data!.SessionId;
        var insights = new ShadowingSessionInsightsService(c);
        var dto = (await shadowing.GetHistoryAsync(User)).Data!.Single();

        var detail = await insights.GetSessionDetailAsync(User, sessionId, dto);

        Assert.Equal(3, detail!.Submissions.Count);
        Assert.Single(detail.Submissions, s => s.CountedInSession);
        Assert.Equal(90, detail.Submissions.Single(s => s.CountedInSession).ContentMatchScore);
        Assert.Contains(detail.Submissions, s => s.ContentMatchScore == null && s.ErrorCode == "AUDIO_TOO_QUIET");
        Assert.Null(await insights.GetSessionDetailAsync("someone-else", sessionId, dto));
        Assert.Equal(3, (await insights.CountSubmissionsAsync(new[] { sessionId }))[sessionId]);
    }

    [Fact]
    public async Task OldSessionWithoutServerProgress_HasNoSubmissionCount_NotZero()
    {
        using var c = await SeedAsync();
        var shadowing = new ShadowingService(c);
        var e = Eval(1, 80);
        c.ShadowingSentenceEvaluations.Add(e);
        await c.SaveChangesAsync();
        var sessionId = (await shadowing.CompleteSessionAsync(User, new ShadowingSessionCompleteDto { DialogueId = 1, LearnerRole = "A", EvaluationIds = { e.Id } })).Data!.SessionId;

        var counts = await new ShadowingSessionInsightsService(c).CountSubmissionsAsync(new[] { sessionId });

        Assert.False(counts.ContainsKey(sessionId));
    }

    private static void AddReading(AppDbContext c, int sentenceId, string text, params string[] canon) =>
        c.ShadowingSentenceAssets.Add(new ShadowingSentenceAsset
        {
            ShadowingSentenceId = sentenceId,
            SourceText = text,
            NormalizedText = text,
            KanaReading = string.Concat(canon),
            MoraSequence = JsonSerializer.Serialize(canon.Select(x => new { c = x, d = x })),
            WordStartsJson = "[0]",
            AudioVersion = ShadowingSentenceAssetService.Version,
        });

    [Fact]
    public async Task Recommendations_OnlyFromRepeatedErrors_AndPointToDialoguesWithThatSound()
    {
        using var c = await SeedAsync();
        AddReading(c, 20, "切手", "き", "っ", "て");
        AddReading(c, 21, "ちょっと", "ちょ", "っ", "と");
        AddReading(c, 30, "駅", "え", "き");
        AddReading(c, 3, "切手を買います", "き", "っ", "て", "お", "か", "い", "ま", "す");
        var sokuon = Tokens(("mismatched", "sokuon"));
        c.ShadowingSentenceEvaluations.AddRange(
            Eval(1, 60, tokens: sokuon), Eval(3, 50, tokens: sokuon), Eval(3, 55, tokens: sokuon),   // っ: 3 lần, 2 câu → đủ
            Eval(4, 70, tokens: Tokens(("mismatched", "chouon"))),                                     // trường âm: 1 lần → chưa đủ
            Eval(1, null, tokens: sokuon));                                                             // chưa chấm được: không tính
        await c.SaveChangesAsync();

        var rec = await new ShadowingSessionInsightsService(c).GetRecommendationsAsync(User, excludeDialogueId: 1);

        var focus = Assert.Single(rec.Focus);
        Assert.Equal(("sokuon", 3, 2), (focus.ErrorType, focus.Occurrences, focus.SentenceCount));
        Assert.Contains("っ", focus.Message);
        var dialogue = Assert.Single(rec.Dialogues);
        Assert.Equal((2, 2), (dialogue.DialogueId, dialogue.MatchingSentenceCount)); // bài 2 có 2 câu chứa っ; bài 1 bị loại, bài 3 không có っ
        Assert.Equal(4, rec.EvaluationsAnalyzed);
    }

    [Fact]
    public async Task Recommendations_NoEvidence_NoSuggestions()
    {
        using var c = await SeedAsync();
        c.ShadowingSentenceEvaluations.Add(Eval(1, 100));
        await c.SaveChangesAsync();

        var rec = await new ShadowingSessionInsightsService(c).GetRecommendationsAsync(User, null);

        Assert.Empty(rec.Focus);
        Assert.Empty(rec.Dialogues);
    }
}
