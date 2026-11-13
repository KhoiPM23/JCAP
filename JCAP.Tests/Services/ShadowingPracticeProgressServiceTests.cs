using JCAP.Data;
using JCAP.DTOs.Shadowing;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Tests.Services;

/// <summary>
/// Phiên luyện ở server (ShadowingPracticeProgress): bắt đầu, tiếp tục (kể cả trên thiết bị khác), làm lại, cập nhật vị trí,
/// trạng thái từng câu và hoàn thành theo phiên. EF InMemory không kiểm tra index duy nhất có lọc: phần đó được kiểm ở
/// ShadowingProgressSqlServerTests (SQL Server thật, chạy khi JCAP_SQLSERVER_TEST=1).
/// </summary>
public class ShadowingPracticeProgressServiceTests
{
    private const string User = "user-1";

    private static AppDbContext CreateContext(string? name = null)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(name ?? $"JCAP_ShadowingProgress_{Guid.NewGuid()}")
            .Options;
        return new AppDbContext(options);
    }

    private static async Task<AppDbContext> SeedAsync(string? name = null)
    {
        var context = CreateContext(name);
        context.ShadowingDialogues.AddRange(
            new ShadowingDialogue { Id = 1, Title = "Sân bay", JLPTLevel = "N5", IsActive = true },
            new ShadowingDialogue { Id = 2, Title = "Ẩn", JLPTLevel = "N5", IsActive = false });
        context.ShadowingSentences.AddRange(
            new ShadowingSentence { Id = 1, ShadowingDialogueId = 1, OrderIndex = 0, SpeakerRole = "A", JapaneseText = "A1" },
            new ShadowingSentence { Id = 2, ShadowingDialogueId = 1, OrderIndex = 1, SpeakerRole = "B", JapaneseText = "B1" },
            new ShadowingSentence { Id = 3, ShadowingDialogueId = 1, OrderIndex = 2, SpeakerRole = "A", JapaneseText = "A2" },
            new ShadowingSentence { Id = 9, ShadowingDialogueId = 2, OrderIndex = 0, SpeakerRole = "A", JapaneseText = "X" });
        await context.SaveChangesAsync();
        return context;
    }

    private static StartShadowingProgressDto Start(string role = "A", bool restart = false, Guid? expected = null, int? suggested = null) =>
        new() { DialogueId = 1, LearnerRole = role, Restart = restart, ExpectedProgressId = expected, SuggestedSentenceIndex = suggested };

    private static ShadowingAudioEvaluationResponseDto Result(int? score, string? error = null) => new()
    {
        EvaluationStatus = score.HasValue ? "completed" : "unavailable",
        RecognitionSource = "phoneme",
        RecognitionMode = "aligned",
        ContentMatchScore = score,
        OverallScore = score,
        Tier = score.HasValue ? ShadowingScoring.TierFor(score) : string.Empty,
        ScoringVersion = ShadowingScoring.Version,
        ComparisonMethod = KanaMoraComparer.Method,
        AudioQualityStatus = "good",
        ErrorCode = error,
    };

    [Fact]
    public async Task Start_CreatesOnce_ThenResumesTheSameProgress()
    {
        using var context = await SeedAsync();
        var service = new ShadowingPracticeProgressService(context);

        var first = (await service.StartAsync(User, Start())).Data!;
        var second = (await service.StartAsync(User, Start())).Data!;

        Assert.True(first.Created);
        Assert.False(second.Created);
        Assert.Equal(first.Id, second.Id);
        Assert.Single(context.ShadowingPracticeProgresses);
        Assert.Equal(2, first.LearnerSentenceCount);
        Assert.Equal(3, first.TotalSentenceCount);
    }

    [Fact]
    public async Task DifferentRoles_HaveSeparateProgress()
    {
        using var context = await SeedAsync();
        var service = new ShadowingPracticeProgressService(context);

        var a = (await service.StartAsync(User, Start("A"))).Data!;
        var b = (await service.StartAsync(User, Start("B"))).Data!;

        Assert.NotEqual(a.Id, b.Id);
    }

    [Fact]
    public async Task AnotherDevice_ResumesTheSamePositionAndSentenceStates()
    {
        var db = $"JCAP_ShadowingProgress_{Guid.NewGuid()}";
        Guid id;
        using (var device1 = await SeedAsync(db))
        {
            var service = new ShadowingPracticeProgressService(device1);
            id = (await service.StartAsync(User, Start())).Data!.Id;
            await service.UpdatePositionAsync(User, id, new UpdateShadowingProgressDto { CurrentSentenceIndex = 2 });
            await new ShadowingService(device1).RecordSentenceEvaluationAsync(User, 1, Result(90), id);
        }

        using var device2 = CreateContext(db); // cùng CSDL, ngữ cảnh mới (trình duyệt/máy khác)
        var resumed = (await new ShadowingPracticeProgressService(device2).GetActiveAsync(User, 1, "A")).Data!;

        Assert.Equal(id, resumed.Id);
        Assert.Equal(2, resumed.CurrentSentenceIndex);
        Assert.Equal("A2", resumed.CurrentSentenceText);
        Assert.Equal("EVALUATED", resumed.Sentences.Single(s => s.SentenceId == 1).State);
        Assert.Equal("NOT_STARTED", resumed.Sentences.Single(s => s.SentenceId == 3).State);
    }

    [Fact]
    public async Task SentenceStates_AreDerivedFromStoredEvaluations_NeverStuckInClientOnlyStates()
    {
        using var context = await SeedAsync();
        var service = new ShadowingPracticeProgressService(context);
        var shadowing = new ShadowingService(context);
        var id = (await service.StartAsync(User, Start())).Data!.Id;

        await shadowing.RecordSentenceEvaluationAsync(User, 1, Result(null, "NO_SPEECH_DETECTED"), id);
        var failedOnly = (await service.GetActiveAsync(User, 1, "A")).Data!.Sentences.Single(s => s.SentenceId == 1);
        Assert.Equal("EVALUATION_FAILED", failedOnly.State);
        Assert.Equal("NO_SPEECH_DETECTED", failedOnly.LastErrorCode);
        Assert.Null(failedOnly.BestScore);

        await shadowing.RecordSentenceEvaluationAsync(User, 1, Result(70), id);
        await shadowing.RecordSentenceEvaluationAsync(User, 1, Result(null, "AUDIO_TOO_QUIET"), id);
        var evaluated = (await service.GetActiveAsync(User, 1, "A")).Data!.Sentences.Single(s => s.SentenceId == 1);
        Assert.Equal("EVALUATED", evaluated.State);
        Assert.Equal(70, evaluated.BestScore);
        Assert.Equal(3, evaluated.SubmissionCount);
        Assert.Equal("AUDIO_TOO_QUIET", evaluated.LastErrorCode);
        Assert.All((await service.GetActiveAsync(User, 1, "A")).Data!.Sentences,
            s => Assert.Contains(s.State, new[] { "NOT_STARTED", "EVALUATED", "EVALUATION_FAILED" }));
    }

    [Fact]
    public async Task Restart_AbandonsTheOldProgress_KeepsItsHistory_AndStartsFresh()
    {
        using var context = await SeedAsync();
        var service = new ShadowingPracticeProgressService(context);
        var old = (await service.StartAsync(User, Start())).Data!;
        await service.UpdatePositionAsync(User, old.Id, new UpdateShadowingProgressDto { CurrentSentenceIndex = 2 });
        await new ShadowingService(context).RecordSentenceEvaluationAsync(User, 1, Result(80), old.Id);

        var fresh = (await service.StartAsync(User, Start(restart: true, expected: old.Id))).Data!;

        Assert.NotEqual(old.Id, fresh.Id);
        Assert.True(fresh.Created);
        Assert.Equal(0, fresh.CurrentSentenceIndex);
        Assert.Equal(ShadowingPracticeProgress.StatusAbandoned, context.ShadowingPracticeProgresses.Single(p => p.Id == old.Id).Status);
        Assert.Single(context.ShadowingSentenceEvaluations); // lịch sử chấm của phiên cũ vẫn còn
        Assert.Single(context.ShadowingPracticeProgresses.Where(p => p.Status == ShadowingPracticeProgress.StatusInProgress));
    }

    [Fact]
    public async Task RestartFromAStaleTab_DoesNotCreateASecondProgress()
    {
        using var context = await SeedAsync();
        var service = new ShadowingPracticeProgressService(context);
        var original = (await service.StartAsync(User, Start())).Data!;
        var restartedElsewhere = (await service.StartAsync(User, Start(restart: true, expected: original.Id))).Data!;

        // Tab cũ vẫn thấy phiên "original" và bấm làm lại
        var fromStaleTab = (await service.StartAsync(User, Start(restart: true, expected: original.Id))).Data!;

        Assert.Equal(restartedElsewhere.Id, fromStaleTab.Id);
        Assert.False(fromStaleTab.Created);
        Assert.Equal(2, context.ShadowingPracticeProgresses.Count());
    }

    [Fact]
    public async Task LocalSuggestion_IsUsedOnlyWhenTheServerNeverHadAProgress()
    {
        using var context = await SeedAsync();
        var service = new ShadowingPracticeProgressService(context);

        var first = (await service.StartAsync(User, Start(suggested: 2))).Data!;
        Assert.Equal(2, first.CurrentSentenceIndex);

        // Đã có phiên (kể cả đã bỏ): dữ liệu cũ trong trình duyệt không được ghi đè tiến độ server
        await service.UpdatePositionAsync(User, first.Id, new UpdateShadowingProgressDto { CurrentSentenceIndex = 1 });
        var resumed = (await service.StartAsync(User, Start(suggested: 0))).Data!;
        Assert.Equal(1, resumed.CurrentSentenceIndex);

        var restarted = (await service.StartAsync(User, Start(restart: true, expected: first.Id, suggested: 2))).Data!;
        Assert.Equal(0, restarted.CurrentSentenceIndex);
    }

    [Theory]
    [InlineData(1, "C")]
    [InlineData(2, "A")]   // bài không active
    [InlineData(404, "A")]
    public async Task InvalidDialogueOrRole_IsRejected(int dialogueId, string role)
    {
        using var context = await SeedAsync();
        var result = await new ShadowingPracticeProgressService(context)
            .StartAsync(User, new StartShadowingProgressDto { DialogueId = dialogueId, LearnerRole = role });

        Assert.False(result.Success);
        Assert.Empty(context.ShadowingPracticeProgresses);
    }

    [Fact]
    public async Task UpdatePosition_ValidatesOwnerRangeAndStatus()
    {
        using var context = await SeedAsync();
        var service = new ShadowingPracticeProgressService(context);
        var id = (await service.StartAsync(User, Start())).Data!.Id;

        Assert.False((await service.UpdatePositionAsync(User, id, new UpdateShadowingProgressDto { CurrentSentenceIndex = 3 })).Success);
        Assert.False((await service.UpdatePositionAsync(User, id, new UpdateShadowingProgressDto { CurrentSentenceIndex = -1 })).Success);
        Assert.False((await service.UpdatePositionAsync("someone-else", id, new UpdateShadowingProgressDto { CurrentSentenceIndex = 1 })).Success);
        Assert.True((await service.UpdatePositionAsync(User, id, new UpdateShadowingProgressDto { CurrentSentenceIndex = 1 })).Success);

        context.ShadowingPracticeProgresses.Single().Status = ShadowingPracticeProgress.StatusCompleted;
        await context.SaveChangesAsync();
        Assert.False((await service.UpdatePositionAsync(User, id, new UpdateShadowingProgressDto { CurrentSentenceIndex = 2 })).Success);
    }

    [Fact]
    public async Task Latest_IsTheMostRecentlyActiveInProgress()
    {
        using var context = await SeedAsync();
        var service = new ShadowingPracticeProgressService(context);
        var a = (await service.StartAsync(User, Start("A"))).Data!;
        await Task.Delay(5);
        var b = (await service.StartAsync(User, Start("B"))).Data!;

        Assert.Equal(b.Id, (await service.GetLatestAsync(User)).Data!.Id);
        await Task.Delay(5);
        await service.UpdatePositionAsync(User, a.Id, new UpdateShadowingProgressDto { CurrentSentenceIndex = 2 });
        Assert.Equal(a.Id, (await service.GetLatestAsync(User)).Data!.Id);
        Assert.Null((await service.GetLatestAsync("nobody")).Data);
    }

    [Fact]
    public async Task CompleteByProgress_UsesOnlyScoredEvaluationsOfTheProgress_AndIsIdempotent()
    {
        using var context = await SeedAsync();
        var progressService = new ShadowingPracticeProgressService(context);
        var shadowing = new ShadowingService(context);
        var id = (await progressService.StartAsync(User, Start())).Data!.Id;

        await shadowing.RecordSentenceEvaluationAsync(User, 1, Result(60), id);
        await shadowing.RecordSentenceEvaluationAsync(User, 1, Result(90), id);
        await shadowing.RecordSentenceEvaluationAsync(User, 3, Result(null, "AUDIO_SILENT"), id);
        await shadowing.RecordSentenceEvaluationAsync(User, 3, Result(100)); // không thuộc phiên: không được tính

        var dto = new ShadowingSessionCompleteDto { DialogueId = 1, LearnerRole = "A", DurationSeconds = 60, ProgressId = id };
        var done = await shadowing.CompleteSessionAsync(User, dto);
        var again = await shadowing.CompleteSessionAsync(User, dto);

        Assert.True(done.Success);
        Assert.Equal(1, done.Data!.ScoredSentenceCount);
        Assert.Equal(45, done.Data.OverallAccuracyScore); // (90 + câu chưa chấm = 0) / 2 câu của vai A
        Assert.True(again.Success);
        Assert.Equal(done.Data.SessionId, again.Data!.SessionId);
        Assert.Single(context.ShadowingPracticeSessions);

        var progress = context.ShadowingPracticeProgresses.Single();
        Assert.Equal(ShadowingPracticeProgress.StatusCompleted, progress.Status);
        Assert.Equal(done.Data.SessionId, progress.ShadowingPracticeSessionId);
        Assert.Null((await progressService.GetActiveAsync(User, 1, "A")).Data);
    }

    [Fact]
    public async Task CompleteByProgress_OfAnotherUser_IsRejected()
    {
        using var context = await SeedAsync();
        var id = (await new ShadowingPracticeProgressService(context).StartAsync("someone-else", Start())).Data!.Id;

        var result = await new ShadowingService(context).CompleteSessionAsync(User,
            new ShadowingSessionCompleteDto { DialogueId = 1, LearnerRole = "A", ProgressId = id });

        Assert.False(result.Success);
        Assert.Empty(context.ShadowingPracticeSessions);
    }
}
