using JCAP.Data;
using JCAP.DTOs.Shadowing;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace JCAP.Tests.Services;

/// <summary>
/// Hoàn thành buổi luyện và lịch sử: điểm chỉ lấy từ kết quả chấm backend đã lưu (ShadowingSentenceEvaluation),
/// buổi luyện được lưu thật vào CSDL (ShadowingPracticeSession).
/// </summary>
public class ShadowingServiceCompleteSessionTests
{
    private const string User = "user-1";

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"JCAP_ShadowingComplete_{Guid.NewGuid()}")
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new AppDbContext(options);
    }

    private static async Task<AppDbContext> SeedAsync()
    {
        var context = CreateContext();
        context.Scenarios.Add(new Scenario { Id = 1, Title = "Sân bay" });
        context.ShadowingDialogues.AddRange(
            new ShadowingDialogue { Id = 1, ScenarioId = 1, Title = "Lesson", JLPTLevel = "N5", IsActive = true },
            new ShadowingDialogue { Id = 2, ScenarioId = 1, Title = "Other", JLPTLevel = "N5", IsActive = false });
        context.ShadowingSentences.AddRange(
            new ShadowingSentence { Id = 1, ShadowingDialogueId = 1, OrderIndex = 0, SpeakerRole = "A", JapaneseText = "A1" },
            new ShadowingSentence { Id = 2, ShadowingDialogueId = 1, OrderIndex = 1, SpeakerRole = "B", JapaneseText = "B1" },
            new ShadowingSentence { Id = 3, ShadowingDialogueId = 1, OrderIndex = 2, SpeakerRole = "A", JapaneseText = "A2" },
            new ShadowingSentence { Id = 9, ShadowingDialogueId = 2, OrderIndex = 0, SpeakerRole = "A", JapaneseText = "X" });
        await context.SaveChangesAsync();
        return context;
    }

    private static ShadowingAudioEvaluationResponseDto Scored(int score, string audio = "good") => new()
    {
        EvaluationStatus = "completed",
        RecognitionSource = "web_speech",
        RecognizedText = "あいう",
        ContentMatchScore = score,
        OverallScore = score,
        Tier = ShadowingScoring.TierFor(score),
        ScoringVersion = ShadowingScoring.Version,
        ComparisonMethod = KanaMoraComparer.Method,
        AudioQualityStatus = audio,
        Feedback = "ok",
        DiffTokens = { new ShadowingDiffTokenDto { Text = "A1", Status = "correct" } },
    };

    private static async Task<Guid> RecordAsync(ShadowingService service, int sentenceId, int score, string user = User, string audio = "good") =>
        (await service.RecordSentenceEvaluationAsync(user, sentenceId, Scored(score, audio)))!.Value;

    private static ShadowingSessionCompleteDto Complete(params Guid[] ids) =>
        new() { DialogueId = 1, LearnerRole = "A", DurationSeconds = 90, EvaluationIds = ids.ToList() };

    // ---- lưu kết quả chấm từng câu ----

    [Fact]
    public async Task UnscoredEvaluations_AreNotRecorded()
    {
        using var context = await SeedAsync();
        var service = new ShadowingService(context);

        var id = await service.RecordSentenceEvaluationAsync(User, 1, new ShadowingAudioEvaluationResponseDto
        {
            EvaluationStatus = "unavailable",
            ErrorCode = "NO_SPEECH_DETECTED",
        });

        Assert.Null(id);
        Assert.Empty(context.ShadowingSentenceEvaluations);
    }

    [Fact]
    public async Task FindPracticeSentence_OnlyReturnsSentencesOfActiveDialogues()
    {
        using var context = await SeedAsync();
        var service = new ShadowingService(context);

        Assert.Equal("A1", (await service.FindPracticeSentenceAsync(1))!.JapaneseText);
        Assert.Null(await service.FindPracticeSentenceAsync(9));   // bài đã ẩn
        Assert.Null(await service.FindPracticeSentenceAsync(404));
    }

    // ---- hoàn thành buổi luyện ----

    [Fact]
    public async Task Completion_UsesRecordedScores_AndPersistsTheSession()
    {
        using var context = await SeedAsync();
        var service = new ShadowingService(context);
        var e1 = await RecordAsync(service, 1, 80);
        var e3 = await RecordAsync(service, 3, 60);

        var response = await service.CompleteSessionAsync(User, Complete(e1, e3));

        Assert.True(response.Success);
        var data = response.Data!;
        Assert.Equal(70, data.OverallAccuracyScore);   // (80 + 60) / 2 câu của vai A
        Assert.Equal(70, data.WeightedOverallScore);   // Overall = Content khi chưa đo Fluency
        Assert.Null(data.OverallFluencyScore);
        Assert.Equal(ShadowingScoring.Version, data.ScoringVersion);
        Assert.Equal(2, data.ScoredSentenceCount);

        var saved = Assert.Single(context.ShadowingPracticeSessions);
        Assert.Equal(data.SessionId, saved.Id);
        Assert.Equal(User, saved.UserId);
        Assert.Equal(90, saved.DurationSeconds);
        Assert.Equal("good", saved.AudioQualityStatus);
        Assert.All(context.ShadowingSentenceEvaluations, e => Assert.Equal(saved.Id, e.ShadowingPracticeSessionId));
    }

    [Fact]
    public async Task UnpracticedLearnerSentences_CountAsZero_InTheAverage()
    {
        using var context = await SeedAsync();
        var service = new ShadowingService(context);
        var e1 = await RecordAsync(service, 1, 100);

        var response = await service.CompleteSessionAsync(User, Complete(e1));

        Assert.Equal(50, response.Data!.WeightedOverallScore); // 100 / 2 câu vai A
    }

    [Fact]
    public async Task SeveralAttemptsOfOneSentence_KeepsTheBestOne()
    {
        using var context = await SeedAsync();
        var service = new ShadowingService(context);
        var low = await RecordAsync(service, 1, 40);
        var high = await RecordAsync(service, 1, 90);

        var response = await service.CompleteSessionAsync(User, Complete(low, high));

        Assert.Equal(45, response.Data!.OverallAccuracyScore); // 90 / 2 câu vai A
        Assert.Equal(1, response.Data.ScoredSentenceCount);
    }

    [Fact]
    public async Task EvaluationsOfAnotherUserRoleOrDialogue_AreIgnored()
    {
        using var context = await SeedAsync();
        var service = new ShadowingService(context);
        var other = await RecordAsync(service, 1, 100, user: "user-2"); // người khác
        var roleB = await RecordAsync(service, 2, 100);                  // câu của vai B
        var mine = await RecordAsync(service, 3, 60);

        var response = await service.CompleteSessionAsync(User, Complete(other, roleB, mine, Guid.NewGuid()));

        Assert.Equal(30, response.Data!.OverallAccuracyScore); // chỉ tính 60 của chính người học, vai A
        Assert.Null(context.ShadowingSentenceEvaluations.Single(e => e.Id == other).ShadowingPracticeSessionId);
    }

    [Fact]
    public async Task SubmittingTheSameEvaluationsTwice_DoesNotCreateASecondSession()
    {
        using var context = await SeedAsync();
        var service = new ShadowingService(context);
        var e1 = await RecordAsync(service, 1, 80);

        Assert.True((await service.CompleteSessionAsync(User, Complete(e1))).Success);
        var again = await service.CompleteSessionAsync(User, Complete(e1));

        Assert.False(again.Success);
        Assert.Single(context.ShadowingPracticeSessions);
    }

    [Fact]
    public async Task NoEvaluations_OrInvalidRole_IsRejected()
    {
        using var context = await SeedAsync();
        var service = new ShadowingService(context);
        var e1 = await RecordAsync(service, 1, 80);

        Assert.False((await service.CompleteSessionAsync(User, Complete())).Success);
        Assert.False((await service.CompleteSessionAsync(User, new ShadowingSessionCompleteDto { DialogueId = 1, LearnerRole = "C", EvaluationIds = { e1 } })).Success);
        Assert.Empty(context.ShadowingPracticeSessions);
    }

    [Fact]
    public async Task MixedAudioQuality_IsNotReportedAsGood()
    {
        using var context = await SeedAsync();
        var service = new ShadowingService(context);
        var e1 = await RecordAsync(service, 1, 80, audio: "good");
        var e3 = await RecordAsync(service, 3, 80, audio: "acceptable");

        var response = await service.CompleteSessionAsync(User, Complete(e1, e3));

        Assert.Equal("acceptable", response.Data!.AudioQualityStatus);
    }

    // ---- lịch sử ----

    [Fact]
    public async Task History_ReturnsOnlyOwnSessions_NewestFirst_WithSentenceDetails()
    {
        using var context = await SeedAsync();
        var service = new ShadowingService(context);
        var first = await service.CompleteSessionAsync(User, Complete(await RecordAsync(service, 1, 50)));
        var second = await service.CompleteSessionAsync(User, Complete(await RecordAsync(service, 3, 70), await RecordAsync(service, 1, 90)));
        await service.CompleteSessionAsync("user-2", Complete(await RecordAsync(service, 1, 100, user: "user-2")));

        var history = (await service.GetHistoryAsync(User)).Data!;

        Assert.Equal(2, history.Count);
        Assert.Equal(second.Data!.SessionId, history[0].Id);
        Assert.Equal(first.Data!.SessionId, history[1].Id);

        var latest = history[0];
        Assert.Equal("Lesson", latest.DialogueTitle);
        Assert.Equal("Sân bay", latest.ScenarioTitle);
        Assert.Equal(new[] { 1, 3 }, latest.Sentences.Select(s => s.SentenceId)); // theo thứ tự câu trong bài
        Assert.Equal("A1", latest.Sentences[0].TargetText);
        Assert.Equal("correct", Assert.Single(latest.Sentences[0].DiffTokens).Status);
        Assert.Equal(DateTimeKind.Utc, latest.CompletedAt.Kind);
    }

    [Fact]
    public async Task History_HidesDeactivatedSessions()
    {
        using var context = await SeedAsync();
        var service = new ShadowingService(context);
        await service.CompleteSessionAsync(User, Complete(await RecordAsync(service, 1, 50)));
        context.ShadowingPracticeSessions.Single().IsActive = false;
        await context.SaveChangesAsync();

        Assert.Empty((await service.GetHistoryAsync(User)).Data!);
    }
}
