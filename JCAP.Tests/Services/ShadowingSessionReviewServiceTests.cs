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
        {"summary":"Lỗi chính là thiếu bật hơi ở âm trong và dừng giữa từ.",
         "priority":"Đọc 「エクスプレス」 chậm, nối liền え-く.",
         "pronunciation":{"verdict":"Âm trong ở đầu từ hay bị đọc đục.",
           "issues":[{"title":"Thừa âm ngắt っ","evidence":"「エクスプレス」 nói thành えっくすぷれす","fix":"Nối liền え và く."},
                     {"title":"b","evidence":"e","fix":"f"},{"title":"c","evidence":"e","fix":"f"},{"title":"d","evidence":"e","fix":"f"}]},
         "fluency":{"verdict":"Chậm hơn mẫu và có ngập ngừng.",
           "issues":[{"title":"Ngừng giữa từ","evidence":"1 lần ngập ngừng ở 「成田エクスプレス」","fix":"Đọc liền cụm."}]}}
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
        Assert.DoesNotContain("0.62", prompt);                             // KHÔNG gửi số liệu gốc
        Assert.Contains("chậm hơn giọng mẫu khá nhiều", prompt);           // gửi bằng lời
        Assert.DoesNotContain("leadingSilence", prompt);                   // thời gian chờ do thao tác: không gửi
        Assert.DoesNotContain(User, prompt);                               // không gửi định danh người học
        Assert.Contains("Không chấm điểm", ai.Last.SystemInstruction);
        Assert.Equal(AiResponseFormat.Json, ai.Last.ResponseFormat);

        Assert.Contains("pronunciationPatterns", prompt);                // kiểu lỗi đã gom sẵn
        Assert.Contains("fluencySummary", prompt);                       // nhịp nói cả buổi tính sẵn

        Assert.StartsWith("Lỗi chính", r.Review!.Summary);
        Assert.NotEmpty(r.Review.Priority);
        Assert.Equal(3, r.Review.Pronunciation.Issues.Count);             // cắt còn tối đa 3 mục
        Assert.Single(r.Review.Fluency!.Issues);
        Assert.True(r.Review.HasFluencyData);
    }

    [Fact]
    public async Task WithoutFluencyData_FluencyCommentsAreDropped()
    {
        var (db, sessionId) = await SeedAsync(withFluency: false);
        var r = await Service(db, new FakeAi(() => AiResponse.Ok(GoodReply))).GenerateAsync(User, sessionId);

        Assert.False(r.Review!.HasFluencyData);
        Assert.Null(r.Review.Fluency); // không có số liệu thì bỏ phần lưu loát dù AI có viết
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
    [InlineData(true, "{\"summary\":\"x\"}")] // thiếu phần phát âm
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
        Assert.NotEmpty(review!.Pronunciation.Verdict);
    }

    [Fact]
    public void Patterns_AreGroupedAcrossAttempts_IgnoringPosition_MostFrequentFirst()
    {
        ShadowingSentenceEvaluation Eval(string word, params ShadowingMoraIssueDto[] issues) => new()
        {
            DiffTokensJson = JsonSerializer.Serialize(new List<ShadowingDiffTokenDto>
            {
                new() { Text = word, Status = "mismatched", Issues = issues.ToList() },
            }, Json),
        };
        var voicing = new ShadowingMoraIssueDto { Kind = "substitute", Expected = "く", Spoken = "ぐ", ErrorType = "voicing", After = "え", Message = "x" };
        var sokuon = new ShadowingMoraIssueDto { Kind = "extra", Spoken = "っ", ErrorType = "sokuon", After = "え", Message = "y" };

        var patterns = ShadowingSessionReviewService.BuildPatterns(new[]
        {
            Eval("エクスプレス。", voicing, sokuon),
            Eval("エクスプレス", voicing),
            Eval("くつ", new ShadowingMoraIssueDto { Kind = "substitute", Expected = "く", Spoken = "ぐ", ErrorType = "voicing", After = null, Message = "z" }),
        });

        Assert.Equal("「く」 đọc thành 「ぐ」", patterns[0].Pattern);
        Assert.Equal(3, patterns[0].Count);                                   // gộp dù vị trí khác nhau
        Assert.Equal(new[] { "エクスプレス", "くつ" }, patterns[0].Examples); // bỏ dấu câu, không lặp ví dụ
        Assert.Equal("thừa 「っ」", patterns[1].Pattern);
    }

    [Fact]
    public void FluencySummary_AggregatesTheSession()
    {
        var s = ShadowingSessionReviewService.BuildFluencySummary(new()
        {
            new() { RateRatio = 0.6, ExtraPauseCount = 1, HesitationCount = 1, MeanRunMoras = 5, ReferenceMeanRunMoras = 10, LongestPauseMs = 700, LeadingSilenceMs = 400 },
            new() { RateRatio = 0.9, ExtraPauseCount = 0, HesitationCount = 0, MeanRunMoras = 7, ReferenceMeanRunMoras = 12, LongestPauseMs = 300, LeadingSilenceMs = 600 },
            new() { RateRatio = 1.2, ExtraPauseCount = 2, MeanRunMoras = 9, ReferenceMeanRunMoras = 11 },
        })!;
        Assert.Equal(3, s.SentencesMeasured);
        Assert.Equal(0.9, s.MedianRateRatio);
        Assert.Equal(1, s.SlowerThanReferenceSentences);
        Assert.Equal(3, s.ExtraPauses);
        Assert.Equal(1, s.Hesitations);
        Assert.Equal(7, s.AverageMeanRunMoras);
        Assert.Equal(11, s.AverageReferenceMeanRunMoras);
        Assert.Equal(700, s.LongestPauseMs);
        Assert.Equal(500, s.MedianLeadingSilenceMs);
        Assert.Null(ShadowingSessionReviewService.BuildFluencySummary(new()));
    }

    [Theory]
    [InlineData(0.4, "chậm hơn giọng mẫu rất nhiều")]
    [InlineData(0.59, "chậm hơn giọng mẫu khá nhiều")]
    [InlineData(0.85, "hơi chậm hơn giọng mẫu")]
    [InlineData(1.0, "gần bằng giọng mẫu")]
    [InlineData(1.6, "nhanh hơn giọng mẫu (không phải lỗi)")]
    public void Speed_IsDescribedInPlainWords(double ratio, string words) =>
        Assert.Equal(words, ShadowingSessionReviewService.SpeedInWords(ratio));

    [Fact]
    public void FluencySummary_CarriesPlainWordDescriptions()
    {
        var s = ShadowingSessionReviewService.BuildFluencySummary(new()
        {
            new() { RateRatio = 0.59, ExtraPauseCount = 2, HesitationCount = 1, MeanRunMoras = 5, ReferenceMeanRunMoras = 10 },
        })!;
        Assert.Equal("chậm hơn giọng mẫu khá nhiều", s.SpeedInWords);
        Assert.Equal("hay ngắt câu thành các đoạn ngắn hơn giọng mẫu", s.ContinuityInWords);
        Assert.Equal("dừng 2 lần ở chỗ giọng mẫu không dừng, trong đó 1 lần dừng ngay giữa một từ", s.PausesInWords);
    }

    [Fact]
    public void TechnicalFieldNames_AreRemovedFromTheReview()
    {
        // Ảnh chụp thật: "Tốc độ nói trung bình (medianRateRatio) chỉ đạt ..."
        Assert.Equal("Tốc độ nói trung bình chỉ đạt mức chậm.",
            ShadowingSessionReviewService.StripTechnicalTerms("Tốc độ nói trung bình (medianRateRatio) chỉ đạt mức chậm."));
        Assert.Equal("Bạn có 2 chỗ dừng thừa.", ShadowingSessionReviewService.StripTechnicalTerms("Bạn có 2 extraPauses chỗ dừng thừa."));
        Assert.Equal("Đọc 「エクスプレス」 liền hơn.", ShadowingSessionReviewService.StripTechnicalTerms("Đọc 「エクスプレス」 liền hơn."));
        // Ảnh chụp thật: "khoảng lặng trước khi bắt đầu câu (leading silence) lên tới 1060ms."
        Assert.Equal("Dữ liệu cho thấy khoảng lặng trước khi bắt đầu câu.",
            ShadowingSessionReviewService.StripTechnicalTerms("Dữ liệu cho thấy khoảng lặng trước khi bắt đầu câu (leading silence) lên tới 1060ms."));
        Assert.Equal("Tốc độ nói chậm hơn mẫu.", ShadowingSessionReviewService.StripTechnicalTerms("Tốc độ nói (0.59) chậm hơn mẫu."));
        Assert.Equal("Bạn dừng giữa từ 「成田」 2 lần.", ShadowingSessionReviewService.StripTechnicalTerms("Bạn dừng giữa từ 「成田」 2 lần."));
    }

    [Fact]
    public void Prompt_ForbidsNumbersAndFieldNamesInTheText() =>
        Assert.Contains("TUYỆT ĐỐI không đưa vào câu chữ", ShadowingSessionReviewService.SystemInstruction);

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
