using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.DTOs.Shadowing.Admin;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/admin/[controller]")]
    [Authorize(Roles = "Admin")]
    public class AdminShadowingController : ControllerBase
    {
        private readonly IAdminShadowingService _adminService;

        public AdminShadowingController(IAdminShadowingService adminService)
        {
            _adminService = adminService;
        }

        /// <summary>
        /// Lấy toàn bộ danh sách bài học Shadowing dành cho Admin (bao gồm cả bài đã vô hiệu hóa).
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<ApiResponse<List<ShadowingDialogueListDto>>>> GetAll()
        {
            var result = await _adminService.GetAdminCatalogAsync();
            return Ok(result);
        }

        /// <summary>
        /// Lấy chi tiết một bài học Shadowing kèm danh sách câu thoại để hiển thị lên Form quản trị.
        /// </summary>
        [HttpGet("{id:int}")]
        public async Task<ActionResult<ApiResponse<ShadowingDialogueDetailDto>>> GetById(int id)
        {
            var result = await _adminService.GetAdminDetailAsync(id);
            if (!result.Success)
            {
                return NotFound(result);
            }
            return Ok(result);
        }

        /// <summary>
        /// UC-30: Thêm mới một bài học Shadowing kèm danh sách câu thoại trong 1 Transaction.
        /// </summary>
        [HttpPost]
        public async Task<ActionResult<ApiResponse<ShadowingDialogueDetailDto>>> Create([FromBody] CreateShadowingDialogueDto dto)
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage)
                    .ToList();
                return BadRequest(ApiResponse<ShadowingDialogueDetailDto>.Fail("Dữ liệu gửi lên không hợp lệ.", errors));
            }

            var result = await _adminService.CreateDialogueAsync(dto);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return CreatedAtAction(nameof(GetById), new { id = result.Data!.Id }, result);
        }

        /// <summary>
        /// UC-31: Cập nhật thông tin bài học Shadowing và đồng bộ lại danh sách câu thoại.
        /// </summary>
        [HttpPut("{id:int}")]
        public async Task<ActionResult<ApiResponse<ShadowingDialogueDetailDto>>> Update(int id, [FromBody] UpdateShadowingDialogueDto dto)
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage)
                    .ToList();
                return BadRequest(ApiResponse<ShadowingDialogueDetailDto>.Fail("Dữ liệu gửi lên không hợp lệ.", errors));
            }

            var result = await _adminService.UpdateDialogueAsync(id, dto);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// UC-32: Xóa mềm (Soft Delete) bài học Shadowing - Gán IsActive = false.
        /// </summary>
        [HttpDelete("{id:int}")]
        public async Task<ActionResult<ApiResponse<bool>>> Delete(int id)
        {
            var result = await _adminService.SoftDeleteDialogueAsync(id);
            if (!result.Success)
            {
                return NotFound(result);
            }

            return Ok(result);
        }
    }
}
