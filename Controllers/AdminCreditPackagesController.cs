using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.CreditPackage;
using JCAP.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/admin/credits/packages")]
    [Authorize(Roles = "Admin")]
    public class AdminCreditPackagesController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly ILogger<AdminCreditPackagesController> _logger;

        public AdminCreditPackagesController(AppDbContext context, ILogger<AdminCreditPackagesController> logger)
        {
            _context = context;
            _logger = logger;
        }

        /// <summary>
        /// GET: /api/admin/credits/packages
        /// Lấy toàn bộ danh sách gói credit (bao gồm cả gói không hoạt động), sắp xếp theo Id giảm dần.
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<ApiResponse<IEnumerable<CreditPackage>>>> GetAll()
        {
            try
            {
                var packages = await _context.CreditPackages
                    .OrderByDescending(p => p.Id)
                    .ToListAsync();

                return Ok(ApiResponse<IEnumerable<CreditPackage>>.Ok(packages, "Lấy danh sách gói credit thành công."));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi xảy ra khi lấy danh sách gói credit.");
                return StatusCode(500, ApiResponse<IEnumerable<CreditPackage>>.Fail("Lỗi hệ thống khi tải danh sách gói credit."));
            }
        }

        /// <summary>
        /// GET: /api/admin/credits/packages/{id}
        /// Lấy chi tiết một gói credit theo Id.
        /// </summary>
        [HttpGet("{id:int}")]
        public async Task<ActionResult<ApiResponse<CreditPackage>>> GetById(int id)
        {
            try
            {
                var package = await _context.CreditPackages.FindAsync(id);
                if (package == null)
                {
                    return NotFound(ApiResponse<CreditPackage>.Fail($"Không tìm thấy gói credit với Id = {id}."));
                }

                return Ok(ApiResponse<CreditPackage>.Ok(package, "Lấy thông tin gói credit thành công."));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi lấy gói credit Id = {Id}", id);
                return StatusCode(500, ApiResponse<CreditPackage>.Fail("Lỗi hệ thống khi tải thông tin gói credit."));
            }
        }

        /// <summary>
        /// POST: /api/admin/credits/packages
        /// Tạo mới một gói credit. Mặc định IsActive = true, CreatedAt = DateTime.UtcNow.
        /// </summary>
        [HttpPost]
        public async Task<ActionResult<ApiResponse<CreditPackage>>> Create([FromBody] CreateCreditPackageDto dto)
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage)
                    .ToList();
                return BadRequest(ApiResponse<CreditPackage>.Fail("Dữ liệu gửi lên không hợp lệ.", errors));
            }

            try
            {
                var package = new CreditPackage
                {
                    Name = dto.Name.Trim(),
                    Credits = dto.Credits,
                    Price = dto.Price,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };

                _context.CreditPackages.Add(package);
                await _context.SaveChangesAsync();

                return CreatedAtAction(
                    nameof(GetById),
                    new { id = package.Id },
                    ApiResponse<CreditPackage>.Ok(package, "Tạo gói credit mới thành công.")
                );
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi tạo gói credit mới.");
                return StatusCode(500, ApiResponse<CreditPackage>.Fail("Lỗi hệ thống khi tạo gói credit."));
            }
        }

        /// <summary>
        /// PUT: /api/admin/credits/packages/{id}
        /// Cập nhật thông tin gói credit (Name, Credits, Price, IsActive).
        /// </summary>
        [HttpPut("{id:int}")]
        public async Task<ActionResult<ApiResponse<CreditPackage>>> Update(int id, [FromBody] UpdateCreditPackageDto dto)
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage)
                    .ToList();
                return BadRequest(ApiResponse<CreditPackage>.Fail("Dữ liệu gửi lên không hợp lệ.", errors));
            }

            try
            {
                var package = await _context.CreditPackages.FindAsync(id);
                if (package == null)
                {
                    return NotFound(ApiResponse<CreditPackage>.Fail($"Không tìm thấy gói credit với Id = {id}."));
                }

                package.Name = dto.Name.Trim();
                package.Credits = dto.Credits;
                package.Price = dto.Price;
                package.IsActive = dto.IsActive;

                await _context.SaveChangesAsync();

                return Ok(ApiResponse<CreditPackage>.Ok(package, "Cập nhật gói credit thành công."));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi cập nhật gói credit Id = {Id}", id);
                return StatusCode(500, ApiResponse<CreditPackage>.Fail("Lỗi hệ thống khi cập nhật gói credit."));
            }
        }

        /// <summary>
        /// DELETE: /api/admin/credits/packages/{id}
        /// Xóa mềm (Soft Delete) gói credit - Đặt IsActive = false thay vì xóa khỏi database.
        /// </summary>
        [HttpDelete("{id:int}")]
        public async Task<ActionResult<ApiResponse<CreditPackage>>> Delete(int id)
        {
            try
            {
                var package = await _context.CreditPackages.FindAsync(id);
                if (package == null)
                {
                    return NotFound(ApiResponse<CreditPackage>.Fail($"Không tìm thấy gói credit với Id = {id}."));
                }

                // Thực hiện Soft Delete
                package.IsActive = false;
                await _context.SaveChangesAsync();

                return Ok(ApiResponse<CreditPackage>.Ok(package, "Đã vô hiệu hóa (xóa mềm) gói credit thành công."));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi vô hiệu hóa gói credit Id = {Id}", id);
                return StatusCode(500, ApiResponse<CreditPackage>.Fail("Lỗi hệ thống khi vô hiệu hóa gói credit."));
            }
        }
    }
}

