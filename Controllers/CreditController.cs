using JCAP.DTOs.Common;
using JCAP.DTOs.Credit;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PayOS.Models.Webhooks;
using System.Security.Claims;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/credits")]
    public class CreditController : ControllerBase
    {
        private readonly ICreditService _creditService;

        public CreditController(ICreditService creditService)
        {
            _creditService = creditService;
        }

        /// <summary>
        /// UC11: Lấy danh sách các gói nạp credit đang hoạt động
        /// </summary>
        [HttpGet("packages")]
        [AllowAnonymous]
        public async Task<IActionResult> GetPackages()
        {
            var result = await _creditService.GetActivePackagesAsync();
            return Ok(result);
        }

        /// <summary>
        /// UC12: Mua gói credit (Hỗ trợ cả Mock Payment và tạo Payment Link PayOS thật)
        /// </summary>
        [HttpPost("purchase")]
        [Authorize]
        public async Task<IActionResult> PurchaseCredit([FromBody] PurchaseCreditRequestDto request)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<PurchaseCreditResponseDto>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            var result = await _creditService.PurchasePackageAsync(userId, request.PackageId);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// UC13: Lấy lịch sử biến động số dư và giao dịch nạp credit của học viên
        /// </summary>
        [HttpGet("history")]
        [Authorize]
        public async Task<IActionResult> GetHistory([FromQuery] int page = 1, [FromQuery] int pageSize = 10)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<CreditHistoryResponseDto>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            var result = await _creditService.GetHistoryAsync(userId, page, pageSize);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// Kiểm tra trạng thái đơn hàng sau khi PayOS chuyển hướng về
        /// </summary>
        [HttpGet("verify-order/{orderCode}")]
        [Authorize]
        public async Task<IActionResult> VerifyOrder(long orderCode)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<CreditTransactionDto>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            var result = await _creditService.VerifyOrderAsync(userId, orderCode);
            if (!result.Success)
            {
                return NotFound(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// Tiếp tục nạp tiền cho đơn hàng đang ở trạng thái Pending
        /// </summary>
        [HttpPost("continue-payment/{orderCode}")]
        [Authorize]
        public async Task<IActionResult> ContinuePayment(long orderCode)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<PurchaseCreditResponseDto>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            var result = await _creditService.ContinuePaymentAsync(userId, orderCode);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// Hủy đơn hàng đang ở trạng thái Pending
        /// </summary>
        [HttpPost("cancel-order/{orderCode}")]
        [Authorize]
        public async Task<IActionResult> CancelOrder(long orderCode)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(ApiResponse<bool>.Fail("Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ."));
            }

            var result = await _creditService.CancelOrderAsync(userId, orderCode);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// Webhook IPN tiếp nhận thông báo thanh toán từ PayOS
        /// Bắt buộc xác thực chữ ký số HMAC-SHA256 và cơ chế Idempotency
        /// </summary>
        [HttpPost("/api/webhooks/payos")]
        [AllowAnonymous]
        public async Task<IActionResult> HandlePayOsWebhook([FromBody] Webhook webhook)
        {
            var result = await _creditService.HandlePayOsWebhookAsync(webhook);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        private string? GetCurrentUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("nameid")
                ?? User.FindFirstValue("sub");
        }
    }
}
