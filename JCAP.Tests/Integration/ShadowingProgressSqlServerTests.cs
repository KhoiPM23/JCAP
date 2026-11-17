using JCAP.Data;
using JCAP.DTOs.Shadowing;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Tests.Integration;

/// <summary>Chỉ chạy khi JCAP_SQLSERVER_TEST=1 (cần SQL Server). Tạo database TẠM riêng, không dùng JCAP_DB.</summary>
public sealed class SqlServerFactAttribute : FactAttribute
{
    public SqlServerFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("JCAP_SQLSERVER_TEST") != "1")
            Skip = "Kiểm thử trên SQL Server thật: đặt JCAP_SQLSERVER_TEST=1 (tùy chọn JCAP_SQLSERVER_TEST_SERVER, mặc định .\\SQLEXPRESS).";
    }
}

/// <summary>
/// Chống phiên luyện trùng và lưu trùng lần chấm ở MỨC CƠ SỞ DỮ LIỆU (index duy nhất có lọc), điều EF InMemory không kiểm được.
/// Mỗi lần chạy tạo database tạm tên ngẫu nhiên trên cùng instance, dựng schema từ model hiện tại (EnsureCreated) rồi xóa.
/// </summary>
public class ShadowingProgressSqlServerTests : IAsyncLifetime
{
    private readonly string _connection;
    private const string User = "sql-test-user";

    public ShadowingProgressSqlServerTests()
    {
        var server = Environment.GetEnvironmentVariable("JCAP_SQLSERVER_TEST_SERVER") is { Length: > 0 } s ? s : @".\SQLEXPRESS";
        _connection = $"Server={server};Database=JCAP_M1Test_{Guid.NewGuid():N};Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=True";
    }

    private AppDbContext NewContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(_connection).Options);

    public async Task InitializeAsync()
    {
        if (Environment.GetEnvironmentVariable("JCAP_SQLSERVER_TEST") != "1") return;
        await using var context = NewContext();
        await context.Database.EnsureCreatedAsync();
        context.Users.Add(new ApplicationUser { Id = User, UserName = "sql-test@example.invalid", NormalizedUserName = "SQL-TEST@EXAMPLE.INVALID" });
        var dialogue = new ShadowingDialogue { Title = "SQL test", JLPTLevel = "N5", IsActive = true };
        context.ShadowingDialogues.Add(dialogue);
        await context.SaveChangesAsync();
        context.ShadowingSentences.AddRange(
            new ShadowingSentence { ShadowingDialogueId = dialogue.Id, OrderIndex = 0, SpeakerRole = "A", JapaneseText = "A1" },
            new ShadowingSentence { ShadowingDialogueId = dialogue.Id, OrderIndex = 1, SpeakerRole = "B", JapaneseText = "B1" });
        await context.SaveChangesAsync();
    }

    public async Task DisposeAsync()
    {
        if (Environment.GetEnvironmentVariable("JCAP_SQLSERVER_TEST") != "1") return;
        await using var context = NewContext();
        await context.Database.EnsureDeletedAsync();
    }

    private async Task<int> DialogueIdAsync()
    {
        await using var context = NewContext();
        return (await context.ShadowingDialogues.SingleAsync()).Id;
    }

    [SqlServerFact]
    public async Task ConcurrentStarts_CreateExactlyOneProgress_AndEveryRequestGetsIt()
    {
        var dialogueId = await DialogueIdAsync();

        // 12 request bắt đầu cùng lúc, mỗi request một DbContext riêng (như 12 request HTTP)
        var tasks = Enumerable.Range(0, 12).Select(async _ =>
        {
            await using var context = NewContext();
            return (await new ShadowingPracticeProgressService(context)
                .StartAsync(User, new StartShadowingProgressDto { DialogueId = dialogueId, LearnerRole = "A" })).Data!.Id;
        }).ToList();
        var ids = await Task.WhenAll(tasks);

        await using var check = NewContext();
        var active = await check.ShadowingPracticeProgresses.Where(p => p.Status == ShadowingPracticeProgress.StatusInProgress).ToListAsync();
        Assert.Single(active);
        Assert.All(ids, id => Assert.Equal(active[0].Id, id));
    }

    [SqlServerFact]
    public async Task TheDatabaseItself_RejectsASecondInProgressForTheSameRole()
    {
        var dialogueId = await DialogueIdAsync();
        ShadowingPracticeProgress Make(string role, string status) => new()
        {
            Id = Guid.NewGuid(), UserId = User, ShadowingDialogueId = dialogueId, LearnerRole = role, Status = status,
        };

        await using var context = NewContext();
        context.ShadowingPracticeProgresses.AddRange(
            Make("A", ShadowingPracticeProgress.StatusInProgress),
            Make("A", ShadowingPracticeProgress.StatusAbandoned),   // không bị chặn: chỉ lọc in_progress
            Make("A", ShadowingPracticeProgress.StatusCompleted),
            Make("B", ShadowingPracticeProgress.StatusInProgress)); // vai khác
        await context.SaveChangesAsync();

        context.ShadowingPracticeProgresses.Add(Make("A", ShadowingPracticeProgress.StatusInProgress));
        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
        Assert.True(ShadowingPracticeProgressService.IsUniqueViolation(ex));
    }

    [SqlServerFact]
    public async Task ConcurrentRestarts_LeaveExactlyOneInProgress()
    {
        var dialogueId = await DialogueIdAsync();
        Guid original;
        await using (var context = NewContext())
        {
            original = (await new ShadowingPracticeProgressService(context)
                .StartAsync(User, new StartShadowingProgressDto { DialogueId = dialogueId, LearnerRole = "A" })).Data!.Id;
        }

        var tasks = Enumerable.Range(0, 6).Select(async _ =>
        {
            await using var context = NewContext();
            return (await new ShadowingPracticeProgressService(context).StartAsync(User, new StartShadowingProgressDto
            {
                DialogueId = dialogueId, LearnerRole = "A", Restart = true, ExpectedProgressId = original,
            })).Data!.Id;
        });
        var ids = await Task.WhenAll(tasks);

        await using var check = NewContext();
        var active = await check.ShadowingPracticeProgresses.Where(p => p.Status == ShadowingPracticeProgress.StatusInProgress).ToListAsync();
        Assert.Single(active);
        Assert.NotEqual(original, active[0].Id);
        Assert.All(ids, id => Assert.Equal(active[0].Id, id));
    }

    [SqlServerFact]
    public async Task SameClientSubmission_IsStoredOnce_EvenWhenSentConcurrently()
    {
        int sentenceId;
        await using (var context = NewContext())
        {
            sentenceId = (await context.ShadowingSentences.FirstAsync(s => s.SpeakerRole == "A")).Id;
        }
        var submission = Guid.NewGuid();
        var result = new ShadowingAudioEvaluationResponseDto
        {
            EvaluationStatus = "completed", RecognitionSource = "phoneme", ContentMatchScore = 90, OverallScore = 90, Tier = "green",
            ScoringVersion = ShadowingScoring.Version, ComparisonMethod = KanaMoraComparer.Method, AudioQualityStatus = "good",
        };

        var tasks = Enumerable.Range(0, 5).Select(async _ =>
        {
            await using var context = NewContext();
            return await new ShadowingService(context).RecordSentenceEvaluationAsync(User, sentenceId, result, clientSubmissionId: submission);
        });
        var ids = await Task.WhenAll(tasks);

        await using var check = NewContext();
        var saved = await check.ShadowingSentenceEvaluations.Where(e => e.ClientSubmissionId == submission).ToListAsync();
        Assert.Single(saved);
        Assert.All(ids, id => Assert.Equal(saved[0].Id, id));
    }
}
