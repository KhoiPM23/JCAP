using JCAP.DTOs.Common;
using JCAP.DTOs.Learning;
using JCAP.Services.Implementations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;

namespace JCAP.Controllers;

[ApiController, Route("api/admin/learning/import"), Authorize(Roles = "Admin")]
public class AdminLearningImportController(AdminLearningImportService service) : ControllerBase
{
    [HttpGet("template")]
    public IActionResult Template() => File(LearningImportWorkbook.Template(),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "JCAP_Learning_Import_v1.xlsx");

    [HttpPost("preview"), RequestSizeLimit(6 * 1024 * 1024), RequestFormLimits(MultipartBodyLengthLimit = 6 * 1024 * 1024)]
    public Task<IActionResult> Preview([FromForm] IFormFile file, CancellationToken ct) => Run(file, null, ct);

    [HttpPost("confirm"), RequestSizeLimit(6 * 1024 * 1024), RequestFormLimits(MultipartBodyLengthLimit = 6 * 1024 * 1024)]
    public Task<IActionResult> Confirm([FromForm] IFormFile file, [FromForm] string fileHash, CancellationToken ct) => Run(file, fileHash, ct);

    private async Task<IActionResult> Run(IFormFile file, string? fileHash, CancellationToken ct)
    {
        try
        {
            if (file.Length == 0 || file.Length > LearningImportWorkbook.MaxBytes)
                throw new LearningRequestException("File phải không rỗng và không vượt quá 5 MB.");
            await using var stream = new MemoryStream(); await file.CopyToAsync(stream, ct);
            var result = fileHash is null ? await service.PreviewAsync(stream.ToArray(), file.FileName, ct)
                : await service.ImportAsync(stream.ToArray(), file.FileName, fileHash, ct);
            return Ok(ApiResponse<LearningImportReport>.Ok(result));
        }
        catch (LearningRequestException e) { return StatusCode(e.Status, ApiResponse<LearningImportReport>.Fail(e.Message)); }
        catch (DbUpdateException) { return Conflict(ApiResponse<LearningImportReport>.Fail("Dữ liệu đã thay đổi hoặc trùng với mục có sẵn. Chưa nhập file; hãy kiểm tra lại.")); }
        catch (SqlException e) when (e.Number is 1205 or 1222)
        { return Conflict(ApiResponse<LearningImportReport>.Fail("Kho đang được cập nhật bởi thao tác khác. Chưa nhập file; hãy kiểm tra và thử lại.")); }
    }
}
