using JCAP.DTOs.Common;
using JCAP.DTOs.Learning;
using JCAP.Services.Implementations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers;

[ApiController, Route("api/learning"), Authorize]
public class LearnerLearningController(LearnerLearningService service) : ControllerBase
{
    private async Task<IActionResult> Run<T>(Func<Task<T>> action)
    {
        try { return Ok(ApiResponse<T>.Ok(await action())); }
        catch (LearningRequestException e) { return StatusCode(e.Status, ApiResponse<T>.Fail(e.Message)); }
    }
    [HttpGet("topics")]
    public Task<IActionResult> Topics([FromQuery] LearnerTopicQuery q, CancellationToken ct) => Run(() => service.TopicsAsync(q, ct));
    [HttpGet("topics/{topicId:int}")]
    public Task<IActionResult> Topic(int topicId, CancellationToken ct) => Run(() => service.TopicAsync(topicId, ct));
    [HttpGet("topics/{topicId:int}/{kind:regex(^(vocabularies|grammars)$)}")]
    public Task<IActionResult> Contents(int topicId, string kind, [FromQuery] LearnerContentQuery q, CancellationToken ct) => Run(() => service.ContentsAsync(topicId, kind, q, ct));
    [HttpGet("topics/{topicId:int}/{kind:regex(^(vocabularies|grammars)$)}/{id:int}")]
    public Task<IActionResult> Detail(int topicId, string kind, int id, [FromQuery] LearnerContentQuery q, CancellationToken ct) => Run(() => service.DetailAsync(topicId, kind, id, q, ct));
}
