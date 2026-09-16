using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/credits/packages")]
    [Authorize]
    public class LearnerCreditsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly ILogger<LearnerCreditsController> _logger;

        public LearnerCreditsController(AppDbContext context, ILogger<LearnerCreditsController> logger)
        {
            _context = context;
            _logger = logger;
        }

        /// <summary>
        /// GET: /api/credits/packages
        /// Lấy danh sách các gói credit đang hoạt động (IsActive == true), sắp xếp theo Giá (Price) tăng dần.
        /// Dành cho tất cả học viên/người dùng đã đăng nhập (không yêu cầu quyền Admin).
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<ApiResponse<IEnumerable<CreditPackage>>>> GetActivePackages()
        {
            try
            {
                var packages = await _context.CreditPackages
                    .Where(p => p.IsActive)
                    .OrderBy(p => p.Price)
                    .ToListAsync();

                return Ok(ApiResponse<IEnumerable<CreditPackage>>.Ok(packages, "Lấy danh sách gói credit thành công."));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi xảy ra khi lấy danh sách gói credit cho học viên.");
                return StatusCode(500, ApiResponse<IEnumerable<CreditPackage>>.Fail("Lỗi hệ thống khi tải danh sách gói credit."));
            }
        }
    }
}

