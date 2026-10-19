using System.Security.Claims;
using JCAP.Controllers;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;

namespace JCAP.Tests.Controllers;

/// <summary>evaluate-audio lấy câu mẫu từ CSDL theo SentenceId và lưu kết quả chấm để dùng khi hoàn thành buổi luyện.</summary>
public class ShadowingControllerTests
{
    private const string UserId = "user-1";

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"JCAP_ShadowingController_{Guid.NewGuid()}")
            .Options;
        var context = new AppDbContext(options);
        context.ShadowingDialogues.Add(new ShadowingDialogue { Id = 1, ScenarioId = 1, Title = "Lesson", JLPTLevel = "N5", IsActive = true });
        context.ShadowingSentences.Add(new ShadowingSentence { Id = 5, ShadowingDialogueId = 1, OrderIndex = 0, SpeakerRole = "A", JapaneseText = "すみません" });
        context.SaveChanges();
        return context;
    }

    private static (ShadowingController controller, List<ShadowingAudioEvaluationInput> inputs) Create(
        AppDbContext context, ShadowingAudioEvaluationResponseDto result)
    {
        var inputs = new List<ShadowingAudioEvaluationInput>();
        var assessment = new Mock<IAiShadowingAssessmentService>();
        assessment
            .Setup(a => a.EvaluateAsync(It.IsAny<ShadowingAudioEvaluationInput>(), It.IsAny<CancellationToken>()))
            .Callback<ShadowingAudioEvaluationInput, CancellationToken>((input, _) => inputs.Add(input))
            .ReturnsAsync(result);

        var controller = new ShadowingController(new ShadowingService(context), assessment.Object, new Mock<ILogger<ShadowingController>>().Object)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, UserId) }, "test")),
                },
            },
        };
        return (controller, inputs);
    }

    private static IFormFile Audio() => new FormFile(new MemoryStream(new byte[] { 1, 2, 3 }), 0, 3, "audio", "a.webm")
    {
        Headers = new HeaderDictionary(),
        ContentType = "audio/webm",
    };

    private static ShadowingAudioEvaluationResponseDto Scored() => new()
    {
        EvaluationStatus = "completed",
        RecognitionSource = "web_speech",
        RecognizedText = "すみません",
        ContentMatchScore = 100,
        OverallScore = 100,
        Tier = "green",
        ScoringVersion = ShadowingScoring.Version,
        ComparisonMethod = KanaMoraComparer.Method,
    };

    private static ShadowingAudioEvaluationResponseDto Body(ActionResult<ApiResponse<ShadowingAudioEvaluationResponseDto>> r) =>
        Assert.IsType<ApiResponse<ShadowingAudioEvaluationResponseDto>>(Assert.IsType<OkObjectResult>(r.Result).Value).Data!;

    [Fact]
    public async Task WithSentenceId_UsesTheStoredSentence_AndRecordsTheEvaluation()
    {
        using var context = CreateContext();
        var (controller, inputs) = Create(context, Scored());

        var result = await controller.EvaluateAudio(new ShadowingAudioEvaluationRequestDto
        {
            Audio = Audio(),
            SentenceId = 5,
            TargetText = "ありがとう", // client gửi sai: phải bị bỏ qua
        }, CancellationToken.None);

        var data = Body(result);
        Assert.Equal("すみません", Assert.Single(inputs).TargetText);
        Assert.Equal(5, data.SentenceId);
        Assert.NotNull(data.EvaluationId);

        var saved = Assert.Single(context.ShadowingSentenceEvaluations);
        Assert.Equal(data.EvaluationId, saved.Id);
        Assert.Equal(UserId, saved.UserId);
        Assert.Equal(100, saved.OverallScore);
    }

    [Fact]
    public async Task UnknownSentence_IsRejected_WithoutScoring()
    {
        using var context = CreateContext();
        var (controller, inputs) = Create(context, Scored());

        var result = await controller.EvaluateAudio(new ShadowingAudioEvaluationRequestDto { Audio = Audio(), SentenceId = 404 }, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Empty(inputs);
    }

    [Fact]
    public async Task NotScored_IsNotRecorded()
    {
        using var context = CreateContext();
        var (controller, _) = Create(context, new ShadowingAudioEvaluationResponseDto { EvaluationStatus = "unavailable", ErrorCode = "NO_SPEECH_DETECTED" });

        var data = Body(await controller.EvaluateAudio(new ShadowingAudioEvaluationRequestDto { Audio = Audio(), SentenceId = 5 }, CancellationToken.None));

        Assert.Null(data.EvaluationId);
        Assert.Empty(context.ShadowingSentenceEvaluations);
    }

    [Fact]
    public async Task WithoutSentenceId_ScoresTheGivenText_ButRecordsNothing()
    {
        using var context = CreateContext();
        var (controller, inputs) = Create(context, Scored());

        var data = Body(await controller.EvaluateAudio(new ShadowingAudioEvaluationRequestDto { Audio = Audio(), TargetText = "すみません" }, CancellationToken.None));

        Assert.Equal("すみません", Assert.Single(inputs).TargetText);
        Assert.Null(data.EvaluationId);
        Assert.Empty(context.ShadowingSentenceEvaluations);
    }
}
