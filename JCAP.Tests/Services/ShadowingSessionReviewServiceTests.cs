using System.Text.Json;
using JCAP.Data;
using JCAP.DTOs.Shadowing;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace JCAP.Tests.Services;

/// <summary>Nhận xét buổi Shadowing bằng AI: chỉ gửi số liệu đã lưu, chỉ nhận đúng cấu trúc, lỗi AI không thành điểm hay nhận xét bịa.</summary>
public class ShadowingSessionReviewServiceTests
{
    private const string User = "user-1";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private sealed class FakeAi : IAiClient
    {
        private readonly Func<AiResponse> _reply;
        public AiRequest? Last;
        public int Calls;
        public FakeAi(Func<AiResponse> reply) => _reply = reply;
        public Task<AiResponse> GenerateAsync(AiRequest request, CancellationToken cancellationToken = default)
        {
            Last = request;
            Calls++;
            return Task.FromResult(_reply());
        }
    }

    private const string GoodReply = """
        {"overview":"Bạn đọc đúng phần lớn câu.","strengths":["「学校に行きます」 đạt 100."],
         "content":[{"point":"Thừa âm ngắt っ","evidence":"「エクスプレス」 nói thành えっくすぷれす","advice":"Nối liền え và く."},
                    {"point":"b","evidence":"e","advice":"a"},{"point":"c","evidence":"e","advice":"a"},{"point":"d","evidence":"e","advice":"a"}],
         "fluency":[{"point":"Ngừng giữa từ","evidence":"1 lần ngập ngừng ở 「成田エクスプレス」","advice":"Đọc liền cụm."}],
         "nextSteps":["Luyện lại 「成田エクスプレス」."]}
        """;

    private static async Task<(AppDbContext Db, Guid SessionId)> SeedAsync(bool withFluency = true, bool scored = true)
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase("JCAP_Review_" + Guid.NewGuid()).Options);
        db.ShadowingDialogues.Add(new ShadowingDialogue { Id = 1, Title = "Nhà ga", JLPTLevel = "N4", IsActive = true });
        db.ShadowingSentences.AddRange(
            new ShadowingSentence { Id = 1, ShadowingDialogueId = 1, OrderIndex = 0, SpeakerRole = "A", JapaneseText = "成田エクスプレスですね。" },
            new ShadowingSentence { Id = 2, ShadowingDialogueId = 1, OrderIndex = 1, SpeakerRole = "A", JapaneseText = "学校に行きます" });
        var sessionId = Guid.NewGuid();
        db.ShadowingPracticeSessions.Add(new ShadowingPracticeSession
        {
            Id = sessionId, UserId = User, ShadowingDialogueId = 1, LearnerRole = "A", ContentMatchScore = 80, LearnerSentenceCount = 2, IsActive = true,
        });
        var tokens = JsonSerializer.Serialize(new List<ShadowingDiffTokenDto>
        {
            new() { Text = "成田", Status = "correct" },
            new()
            {
                Text = "エクスプレス", Status = "mismatched", ExpectedReading = "えくすぷれす", SpokenPart = "えっくすぷれす", ErrorType = "sokuon",
                Issues = new() { new() { Kind = "extra", ErrorType = "sokuon", Message = "Thừa âm ngắt 「っ」 sau 「え」", Hint = "Nối liền hai âm, không dừng hơi." } },
            },
        }, Json);
        var fluency = withFluency
            ? JsonSerializer.Serialize(new ShadowingFluencySnapshotDto { RateRatio = 0.62, PauseCount = 2, ReferencePauseCount = 1, ExtraPauseCount = 1, HesitationCount = 1, MeanRunMoras = 5, ReferenceMeanRunMoras = 10 }, Json)
            : null;
        db.ShadowingSentenceEvaluations.AddRange(
            new ShadowingSentenceEvaluation
            {
                Id = Guid.NewGuid(), UserId = User, ShadowingSentenceId = 1, ShadowingPracticeSessionId = sessionId,
                OverallScore = scored ? 60 : null, ContentMatchScore = scored ? 60 : null, RecognizedText = "成田エックスプレスですね",
                DiffTokensJson = tokens, FluencyJson = fluency, EvaluationStatus = "completed",
            },
            new ShadowingSentenceEvaluation
            {
                Id = Guid.NewGuid(), UserId = User, ShadowingSentenceId = 2, ShadowingPracticeSessionId = sessionId,
                OverallScore = scored ? 100 : null, ContentMatchScore = scored ? 100 : null, RecognizedText = "学校に行きます",
                DiffTokensJson = "[]", EvaluationStatus = "completed",
            });
        await db.SaveChangesAsync();
        return (db, sessionId);
    }

    private static ShadowingSessionReviewService Service(AppDbContext db, IAiClient ai)
    {
        var insights = new Mock<IShadowingSessionInsightsService>();
        insights.Setup(i => i.BuildSummaryAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ShadowingSessionSummaryDto { LearnerSentenceCount = 2, EvaluatedSentenceCount = 2, ContentAccuracy = 80, ErrorTypeCounts = { ["sokuon"] = 1 } });
        return new ShadowingSessionReviewService(db, ai, insights.Object, NullLogger<ShadowingSessionReviewService>.Instance);
    }

    [Fact]
    public async Task SendsOnlyMeasuredData_AndReturnsTheStructuredReview()
    {
        var (db, sessionId) = await SeedAsync();
        var ai = new FakeAi(() => AiResponse.Ok(GoodReply));

        var r = await Service(db, ai).GenerateAsync(User, sessionId);

        Assert.NotNull(r.Review);
        var prompt = ai.Last!.Messages.Last().Content;
        Assert.Contains("成田エクスプレスですね。", prompt);                // câu mẫu
        Assert.Contains("Thừa âm ngắt 「っ」 sau 「え」", prompt);           // lỗi từng âm do hệ thống đo
        Assert.Contains("0.62", prompt);                                   // tỷ lệ tốc độ đã lưu
        Assert.DoesNotContain(User, prompt);                               // không gửi định danh người học
        Assert.Contains("Không tự chấm điểm mới", ai.Last.SystemInstruction);
        Assert.Equal(AiResponseFormat.Json, ai.Last.ResponseFormat);

        Assert.Equal("Bạn đọc đúng phần lớn câu.", r.Review!.Overview);
        Assert.Equal(3, r.Review.Content.Count);                           // cắt còn tối đa 3 mục
        Assert.Single(r.Review.Fluency);
        Assert.True(r.Review.HasFluencyData);
    }

    [Fact]
    public async Task WithoutFluencyData_FluencyCommentsAreDropped()
    {
        var (db, sessionId) = await SeedAsync(withFluency: false);
        var r = await Service(db, new FakeAi(() => AiResponse.Ok(GoodReply))).GenerateAsync(User, sessionId);

        Assert.False(r.Review!.HasFluencyData);
        Assert.Empty(r.Review.Fluency); // AI không được nhận xét lưu loát khi không có số liệu
    }

    [Fact]
    public async Task SomeoneElsesSession_IsNotFound_AndAiIsNotCalled()
    {
        var (db, sessionId) = await SeedAsync();
        var ai = new FakeAi(() => AiResponse.Ok(GoodReply));
        var r = await Service(db, ai).GenerateAsync("other-user", sessionId);

        Assert.True(r.NotFound);
        Assert.Equal(0, ai.Calls);
    }

    [Fact]
    public async Task NoScoredSentence_NothingToReview_AiIsNotCalled()
    {
        var (db, sessionId) = await SeedAsync(scored: false);
        var ai = new FakeAi(() => AiResponse.Ok(GoodReply));
        var r = await Service(db, ai).GenerateAsync(User, sessionId);

        Assert.Null(r.Review);
        Assert.NotNull(r.ErrorMessage);
        Assert.Equal(0, ai.Calls);
    }

    [Theory]
    [InlineData(false, "")]
    [InlineData(true, "không phải JSON")]
    [InlineData(true, "{\"strengths\":[]}")] // thiếu tổng quan
    public async Task AiFailureOrBadOutput_GivesAnErrorMessage_NotAReview(bool ok, string content)
    {
        var (db, sessionId) = await SeedAsync();
        var r = await Service(db, new FakeAi(() => ok ? AiResponse.Ok(content) : AiResponse.Fail("quota"))).GenerateAsync(User, sessionId);

        Assert.Null(r.Review);
        Assert.False(r.NotFound);
        Assert.Contains("thử lại", r.ErrorMessage);
    }

    [Fact]
    public void Parse_AcceptsJsonWrappedInACodeBlock()
    {
        var review = ShadowingSessionReviewService.Parse("```json\n" + GoodReply + "\n```");
        Assert.NotNull(review);
        Assert.Single(review!.Strengths);
    }

    [Fact]
    public void FluencySnapshot_OnlyWhenComparedWithTheReference()
    {
        Assert.Null(ShadowingFluencySnapshotDto.From(null));
        Assert.Null(ShadowingFluencySnapshotDto.From(new FluencyMetricsDto { Status = "available", Comparison = new() { Status = "unavailable" } }));

        var s = ShadowingFluencySnapshotDto.From(new FluencyMetricsDto
        {
            Status = "available", MeanRunMoras = 6, LongestPauseMs = 700,
            Reference = new() { Metrics = new() { MeanRunMoras = 12 } },
            Comparison = new() { Status = "available", ArticulationRateRatio = 0.8, LearnerPauseCount = 2, ReferencePauseCount = 1, ExtraPauseCount = 1, HesitationCount = 1 },
            Observations = { new() { Code = "extra_pause", Message = "Bạn dừng 0.7 giây…" } },
        })!;
        Assert.Equal(0.8, s.RateRatio);
        Assert.Equal(12, s.ReferenceMeanRunMoras);
        Assert.Equal(1, s.HesitationCount);
        Assert.Single(s.Notes);
    }
}
