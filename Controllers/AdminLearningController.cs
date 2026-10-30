using JCAP.DTOs.Common;
using JCAP.DTOs.Learning;
using JCAP.Services.Implementations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Controllers;

[ApiController, Route("api/admin/learning"), Authorize(Roles = "Admin")]
public class AdminLearningController(AdminLearningService service) : ControllerBase
{
    private async Task<IActionResult> Run<T>(Func<Task<T>> action)
    {
        try { return Ok(ApiResponse<T>.Ok(await action())); }
        catch (LearningRequestException error) { return StatusCode(error.Status, ApiResponse<T>.Fail(error.Message)); }
        catch (DbUpdateException) { return Conflict(ApiResponse<T>.Fail("Dữ liệu đã thay đổi hoặc bị trùng. Hãy tải lại và kiểm tra.")); }
    }

    [HttpGet("topics/options")]
    public Task<IActionResult> Options([FromQuery] string? jlptLevel) => Run(() => service.TopicOptionsAsync(jlptLevel));
    [HttpGet("topics")]
    public Task<IActionResult> Topics([FromQuery] LearningQuery query) => Run(() => service.TopicsAsync(query));
    [HttpGet("topics/{id:int}")]
    public Task<IActionResult> Topic(int id) => Run(() => service.TopicAsync(id));
    [HttpPost("topics")]
    public Task<IActionResult> CreateTopic(SaveTopicRequest input) => Run(() => service.SaveTopicAsync(null, input));
    [HttpPut("topics/{id:int}")]
    public Task<IActionResult> UpdateTopic(int id, SaveTopicRequest input) => Run(() => service.SaveTopicAsync(id, input));
    [HttpPut("topics/{id:int}/contents")]
    public Task<IActionResult> Contents(int id, TopicContentsRequest input) => Run(() => service.SetTopicContentsAsync(id, input));
    [HttpPost("assign-topics")]
    public Task<IActionResult> Assign(AssignTopicsRequest input) => Run(async () => { await service.AssignTopicsAsync(input); return true; });
    [HttpPost("bulk-status")]
    public Task<IActionResult> BulkStatus(BulkLearningStatusRequest input) => Run(async () => { await service.BulkStatusAsync(input); return true; });
    [HttpGet("{kind:regex(^(vocabularies|grammars)$)}")]
    public Task<IActionResult> List(string kind, [FromQuery] LearningQuery query) => Run(() => service.ContentsAsync(kind, query));
    [HttpGet("{kind:regex(^(vocabularies|grammars)$)}/{id:int}")]
    public Task<IActionResult> Detail(string kind, int id) => Run(() => service.ContentAsync(kind, id));
    [HttpPost("{kind:regex(^(vocabularies|grammars)$)}")]
    public Task<IActionResult> Create(string kind, SaveContentRequest input) => Run(() => service.SaveContentAsync(kind, null, input));
    [HttpPut("{kind:regex(^(vocabularies|grammars)$)}/{id:int}")]
    public Task<IActionResult> Update(string kind, int id, SaveContentRequest input) => Run(() => service.SaveContentAsync(kind, id, input));
    [HttpPut("{kind:regex(^(topics|vocabularies|grammars)$)}/{id:int}/status")]
    public Task<IActionResult> Status(string kind, int id, LearningStatusRequest input) => Run(async () => { await service.SetStatusAsync(kind, id, input.IsActive); return true; });
}
