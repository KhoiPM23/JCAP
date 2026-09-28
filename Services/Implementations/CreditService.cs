using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Credit;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PayOS;
using PayOS.Models.V2.PaymentRequests;
using PayOS.Models.Webhooks;

namespace JCAP.Services.Implementations
{
    public class CreditService : ICreditService
    {
        private readonly AppDbContext _dbContext;
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly PayOsSettings _payOsSettings;
        private readonly IConfiguration _configuration;
        private readonly ILogger<CreditService> _logger;
        private readonly PayOSClient? _payOSClient;

        public CreditService(
            AppDbContext dbContext,
            UserManager<ApplicationUser> userManager,
            IOptions<PayOsSettings> payOsOptions,
            IConfiguration configuration,
            ILogger<CreditService> logger)
        {
            _dbContext = dbContext;
            _userManager = userManager;
            _payOsSettings = payOsOptions.Value;
            _configuration = configuration;
            _logger = logger;

            if (_payOsSettings.IsConfigured)
            {
                try
                {
                    _payOSClient = new PayOSClient(
                        _payOsSettings.ClientId,
                        _payOsSettings.ApiKey,
                        _payOsSettings.ChecksumKey);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Khởi tạo PayOSClient thất bại. Sẽ chuyển sang chế độ Mock.");
                    _payOSClient = null;
                }
            }
        }

        public async Task<ApiResponse<List<CreditPackageDto>>> GetActivePackagesAsync()
        {
            var packages = await _dbContext.CreditPackages
                .AsNoTracking()
                .Where(p => p.IsActive)
                .OrderBy(p => p.Price)
                .Select(p => new CreditPackageDto
                {
                    Id = p.Id,
                    Name = p.Name,
                    Credits = p.Credits,
                    Price = p.Price,
                    IsActive = p.IsActive,
                    CreatedAt = p.CreatedAt
                })
                .ToListAsync();

            return ApiResponse<List<CreditPackageDto>>.Ok(packages, "Lấy danh sách gói credit thành công.");
        }

        public async Task<ApiResponse<PurchaseCreditResponseDto>> PurchasePackageAsync(string userId, int packageId)
        {
            var package = await _dbContext.CreditPackages.FindAsync(packageId);
            if (package == null || !package.IsActive)
            {
                return ApiResponse<PurchaseCreditResponseDto>.Fail("Gói credit không tồn tại hoặc đã ngừng hoạt động.");
            }

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return ApiResponse<PurchaseCreditResponseDto>.Fail("Không tìm thấy thông tin người dùng.");
            }

            // Chế độ 1: PayOS chưa được cấu hình -> Chạy Mock Payment (Phase 1)
            if (_payOSClient == null || !_payOsSettings.IsConfigured)
            {
                _logger.LogInformation("PayOS chưa cấu hình thông tin. Chạy chế độ Mock Payment cho User: {UserId}, Package: {PackageId}", userId, packageId);

                var mockTransaction = new CreditTransaction
                {
                    UserId = userId,
                    Amount = package.Credits,
                    Type = "TopUp",
                    Description = $"Nạp gói {package.Name} (+{package.Credits} credits) [Mock]",
                    PayOsOrderCode = null,
                    Status = "Paid",
                    CreatedAt = DateTime.UtcNow
                };

                user.CreditBalance += package.Credits;

                await _dbContext.CreditTransactions.AddAsync(mockTransaction);
                await _userManager.UpdateAsync(user);
                await _dbContext.SaveChangesAsync();

                return ApiResponse<PurchaseCreditResponseDto>.Ok(new PurchaseCreditResponseDto
                {
                    Success = true,
                    Message = $"Nạp thành công {package.Credits} credits vào tài khoản (Chế độ Mock).",
                    IsMock = true,
                    AddedCredits = package.Credits,
                    NewCreditBalance = user.CreditBalance
                }, "Nạp credits thành công (Mock).");
            }

            // Chế độ 2: Tích hợp cổng PayOS thực (Phase 2)
            try
            {
                long orderCode = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                var frontendUrl = _configuration["FrontendUrl"]?.TrimEnd('/') ?? "http://localhost:5173";
                var returnUrl = string.IsNullOrWhiteSpace(_payOsSettings.ReturnUrl)
                    ? $"{frontendUrl}/credits/payment-return"
                    : _payOsSettings.ReturnUrl;
                var cancelUrl = string.IsNullOrWhiteSpace(_payOsSettings.CancelUrl)
                    ? $"{frontendUrl}/credits"
                    : _payOsSettings.CancelUrl;

                var pendingTransaction = new CreditTransaction
                {
                    UserId = userId,
                    Amount = package.Credits,
                    Type = "TopUp",
                    Description = $"Nạp gói {package.Name} ({package.Credits} credits)",
                    PayOsOrderCode = orderCode.ToString(),
                    Status = "Pending",
                    CreatedAt = DateTime.UtcNow
                };

                await _dbContext.CreditTransactions.AddAsync(pendingTransaction);
                await _dbContext.SaveChangesAsync();

                // PayOS quy định mô tả tối đa 25 ký tự không dấu/đơn giản
                string safeDescription = $"JCAP Nap {package.Credits}C";
                if (safeDescription.Length > 25)
                {
                    safeDescription = safeDescription.Substring(0, 25);
                }

                var paymentRequest = new CreatePaymentLinkRequest
                {
                    OrderCode = orderCode,
                    Amount = (int)package.Price,
                    Description = safeDescription,
                    ReturnUrl = returnUrl,
                    CancelUrl = cancelUrl,
                    Items = new List<PaymentLinkItem>
                    {
                        new()
                        {
                            Name = package.Name,
                            Quantity = 1,
                            Price = (int)package.Price
                        }
                    }
                };

                var paymentLinkResult = await _payOSClient.PaymentRequests.CreateAsync(paymentRequest);

                return ApiResponse<PurchaseCreditResponseDto>.Ok(new PurchaseCreditResponseDto
                {
                    Success = true,
                    Message = "Tạo liên kết thanh toán PayOS thành công.",
                    CheckoutUrl = paymentLinkResult.CheckoutUrl,
                    OrderCode = orderCode,
                    IsMock = false
                }, "Khởi tạo thanh toán thành công.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi tạo payment link với PayOS. Order Package: {PackageId}", packageId);
                return ApiResponse<PurchaseCreditResponseDto>.Fail($"Không thể tạo yêu cầu thanh toán: {ex.Message}");
            }
        }

        public async Task<ApiResponse<CreditHistoryResponseDto>> GetHistoryAsync(string userId, int page = 1, int pageSize = 10)
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 10;
            if (pageSize > 50) pageSize = 50;

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return ApiResponse<CreditHistoryResponseDto>.Fail("Không tìm thấy người dùng.");
            }

            var query = _dbContext.CreditTransactions
                .AsNoTracking()
                .Where(t => t.UserId == userId);

            var totalCount = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

            var transactions = await query
                .OrderByDescending(t => t.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(t => new CreditTransactionDto
                {
                    Id = t.Id,
                    Amount = t.Amount,
                    Type = t.Type,
                    Description = t.Description,
                    PayOsOrderCode = t.PayOsOrderCode,
                    Status = t.Status,
                    CreatedAt = t.CreatedAt
                })
                .ToListAsync();

            var response = new CreditHistoryResponseDto
            {
                Transactions = transactions,
                TotalCount = totalCount,
                Page = page,
                PageSize = pageSize,
                TotalPages = totalPages,
                CurrentCreditBalance = user.CreditBalance
            };

            return ApiResponse<CreditHistoryResponseDto>.Ok(response, "Lấy lịch sử giao dịch thành công.");
        }

        public async Task<ApiResponse<bool>> HandlePayOsWebhookAsync(Webhook webhook)
        {
            if (_payOSClient == null || !_payOsSettings.IsConfigured)
            {
                _logger.LogWarning("Nhận webhook PayOS nhưng PayOS chưa cấu hình Client.");
                return ApiResponse<bool>.Fail("PayOS chưa được cấu hình.");
            }

            WebhookData verifiedData;
            try
            {
                // Bắt buộc xác thực HMAC-SHA256 signature
                verifiedData = await _payOSClient.Webhooks.VerifyAsync(webhook);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Chữ ký số webhook PayOS không hợp lệ hoặc giả mạo.");
                return ApiResponse<bool>.Fail("Xác thực chữ ký webhook thất bại.");
            }

            if (verifiedData == null)
            {
                return ApiResponse<bool>.Fail("Dữ liệu webhook rỗng.");
            }

            var orderCodeStr = verifiedData.OrderCode.ToString();
            var transaction = await _dbContext.CreditTransactions
                .Include(t => t.User)
                .FirstOrDefaultAsync(t => t.PayOsOrderCode == orderCodeStr);

            if (transaction == null)
            {
                _logger.LogWarning("Nhận webhook thành công nhưng không tìm thấy đơn hàng OrderCode: {OrderCode}", orderCodeStr);
                return ApiResponse<bool>.Ok(true, "Không tìm thấy giao dịch tương ứng trong hệ thống.");
            }

            // Bắt buộc Idempotency: Kiểm tra nếu đã thanh toán trước đó thì không cộng lần 2
            if (transaction.Status == "Paid")
            {
                _logger.LogInformation("Giao dịch OrderCode {OrderCode} đã ở trạng thái Paid. Bỏ qua idempotency.", orderCodeStr);
                return ApiResponse<bool>.Ok(true, "Giao dịch đã được xử lý trước đó.");
            }

            // Cập nhật trạng thái và cộng credit
            transaction.Status = "Paid";
            if (transaction.User != null)
            {
                transaction.User.CreditBalance += transaction.Amount;
                await _userManager.UpdateAsync(transaction.User);
            }
            else
            {
                var user = await _userManager.FindByIdAsync(transaction.UserId);
                if (user != null)
                {
                    user.CreditBalance += transaction.Amount;
                    await _userManager.UpdateAsync(user);
                }
            }

            await _dbContext.SaveChangesAsync();
            _logger.LogInformation("Thanh toán thành công qua PayOS OrderCode: {OrderCode}, đã cộng {Amount} credits cho User {UserId}",
                orderCodeStr, transaction.Amount, transaction.UserId);

            return ApiResponse<bool>.Ok(true, "Cộng credit thành công.");
        }

        public async Task<ApiResponse<CreditTransactionDto>> VerifyOrderAsync(string userId, long orderCode)
        {
            var orderCodeStr = orderCode.ToString();
            var transaction = await _dbContext.CreditTransactions
                .FirstOrDefaultAsync(t => t.PayOsOrderCode == orderCodeStr && t.UserId == userId);

            if (transaction == null)
            {
                return ApiResponse<CreditTransactionDto>.Fail("Không tìm thấy giao dịch này.");
            }

            var user = await _userManager.FindByIdAsync(userId);

            // Nếu đơn hàng đang Pending và PayOS được cấu hình, gọi trực tiếp API PayOS để chủ động đối soát
            // (Hỗ trợ tốt cho môi trường Dev Local khi chưa cấu hình Webhook public ngrok/localtunnel)
            if (transaction.Status == "Pending" && _payOSClient != null && _payOsSettings.IsConfigured)
            {
                try
                {
                    var paymentInfo = await _payOSClient.PaymentRequests.GetAsync(orderCode);
                    var statusStr = paymentInfo?.Status.ToString()?.ToUpperInvariant();
                    if (paymentInfo != null && statusStr == "PAID")
                    {
                        transaction.Status = "Paid";

                        if (user != null)
                        {
                            user.CreditBalance += transaction.Amount;
                            await _userManager.UpdateAsync(user);
                        }

                        await _dbContext.SaveChangesAsync();
                        _logger.LogInformation("Xác minh đơn hàng #{OrderCode} thành công qua PayOS API direct check, đã cộng {Amount} credits cho User {UserId}", orderCode, transaction.Amount, userId);
                    }
                    else if (paymentInfo != null && (statusStr == "CANCELLED" || statusStr == "CANCELED"))
                    {
                        transaction.Status = "Cancelled";
                        await _dbContext.SaveChangesAsync();
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Không thể xác minh đơn hàng #{OrderCode} từ PayOS API.", orderCode);
                }
            }

            var dto = new CreditTransactionDto
            {
                Id = transaction.Id,
                Amount = transaction.Amount,
                Type = transaction.Type,
                Description = transaction.Description,
                PayOsOrderCode = transaction.PayOsOrderCode,
                Status = transaction.Status,
                CreatedAt = transaction.CreatedAt,
                CurrentCreditBalance = user?.CreditBalance
            };

            return ApiResponse<CreditTransactionDto>.Ok(dto, "Lấy thông tin giao dịch thành công.");
        }

        public async Task<ApiResponse<PurchaseCreditResponseDto>> ContinuePaymentAsync(string userId, long orderCode)
        {
            var orderCodeStr = orderCode.ToString();
            var transaction = await _dbContext.CreditTransactions
                .FirstOrDefaultAsync(t => t.PayOsOrderCode == orderCodeStr && t.UserId == userId);

            if (transaction == null)
            {
                return ApiResponse<PurchaseCreditResponseDto>.Fail("Không tìm thấy đơn hàng cần tiếp tục nạp.");
            }

            if (transaction.Status == "Paid")
            {
                return ApiResponse<PurchaseCreditResponseDto>.Fail("Đơn hàng này đã được thanh toán thành công trước đó.");
            }

            if (transaction.Status == "Cancelled")
            {
                return ApiResponse<PurchaseCreditResponseDto>.Fail("Đơn hàng này đã bị hủy.");
            }

            // Chế độ 1: Mock Payment
            if (_payOSClient == null || !_payOsSettings.IsConfigured)
            {
                transaction.Status = "Paid";
                var user = await _userManager.FindByIdAsync(userId);
                if (user != null)
                {
                    user.CreditBalance += transaction.Amount;
                    await _userManager.UpdateAsync(user);
                }
                await _dbContext.SaveChangesAsync();

                return ApiResponse<PurchaseCreditResponseDto>.Ok(new PurchaseCreditResponseDto
                {
                    Success = true,
                    Message = $"Nạp thành công {transaction.Amount} credits (Chế độ Mock).",
                    IsMock = true,
                    AddedCredits = transaction.Amount,
                    NewCreditBalance = user?.CreditBalance
                }, "Thanh toán thành công (Mock).");
            }

            // Chế độ 2: PayOS Real Client
            try
            {
                var paymentInfo = await _payOSClient.PaymentRequests.GetAsync(orderCode);
                var statusStr = paymentInfo?.Status.ToString()?.ToUpperInvariant();

                if (paymentInfo != null && statusStr == "PAID")
                {
                    transaction.Status = "Paid";
                    var user = await _userManager.FindByIdAsync(userId);
                    if (user != null)
                    {
                        user.CreditBalance += transaction.Amount;
                        await _userManager.UpdateAsync(user);
                    }
                    await _dbContext.SaveChangesAsync();
                    return ApiResponse<PurchaseCreditResponseDto>.Fail("Đơn hàng đã được thanh toán thành công qua PayOS.");
                }

                var frontendUrl = _configuration["FrontendUrl"]?.TrimEnd('/') ?? "http://localhost:5173";
                var returnUrl = string.IsNullOrWhiteSpace(_payOsSettings.ReturnUrl)
                    ? $"{frontendUrl}/credits/payment-return"
                    : _payOsSettings.ReturnUrl;
                var cancelUrl = string.IsNullOrWhiteSpace(_payOsSettings.CancelUrl)
                    ? $"{frontendUrl}/credits"
                    : _payOsSettings.CancelUrl;

                int packagePrice = (int)(transaction.Amount * 333);
                if (packagePrice < 10000) packagePrice = 20000;

                string safeDescription = $"JCAP Nap {transaction.Amount}C";
                if (safeDescription.Length > 25) safeDescription = safeDescription.Substring(0, 25);

                var newOrderCode = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                transaction.PayOsOrderCode = newOrderCode.ToString();
                await _dbContext.SaveChangesAsync();

                var paymentRequest = new CreatePaymentLinkRequest
                {
                    OrderCode = newOrderCode,
                    Amount = packagePrice,
                    Description = safeDescription,
                    ReturnUrl = returnUrl,
                    CancelUrl = cancelUrl,
                    Items = new List<PaymentLinkItem>
                    {
                        new()
                        {
                            Name = $"Nạp {transaction.Amount} Credits",
                            Quantity = 1,
                            Price = packagePrice
                        }
                    }
                };

                var paymentLinkResult = await _payOSClient.PaymentRequests.CreateAsync(paymentRequest);

                return ApiResponse<PurchaseCreditResponseDto>.Ok(new PurchaseCreditResponseDto
                {
                    Success = true,
                    Message = "Tạo liên kết thanh toán PayOS mới thành công.",
                    CheckoutUrl = paymentLinkResult.CheckoutUrl,
                    OrderCode = newOrderCode,
                    IsMock = false
                }, "Khởi tạo thanh toán thành công.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi tiếp tục thanh toán cho OrderCode: {OrderCode}", orderCode);
                return ApiResponse<PurchaseCreditResponseDto>.Fail($"Không thể tạo lại liên kết thanh toán: {ex.Message}");
            }
        }

        public async Task<ApiResponse<bool>> CancelOrderAsync(string userId, long orderCode)
        {
            var orderCodeStr = orderCode.ToString();
            var transaction = await _dbContext.CreditTransactions
                .FirstOrDefaultAsync(t => t.PayOsOrderCode == orderCodeStr && t.UserId == userId);

            if (transaction == null)
            {
                return ApiResponse<bool>.Fail("Không tìm thấy đơn hàng cần hủy.");
            }

            if (transaction.Status == "Paid")
            {
                return ApiResponse<bool>.Fail("Đơn hàng này đã thanh toán thành công, không thể hủy.");
            }

            transaction.Status = "Cancelled";

            if (_payOSClient != null && _payOsSettings.IsConfigured)
            {
                try
                {
                    await _payOSClient.PaymentRequests.CancelAsync(orderCode, "Người dùng hủy giao dịch");
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Không thể hủy đơn hàng #{OrderCode} trên cổng PayOS.", orderCode);
                }
            }

            await _dbContext.SaveChangesAsync();
            _logger.LogInformation("Hủy đơn hàng #{OrderCode} thành công cho User {UserId}", orderCode, userId);

            return ApiResponse<bool>.Ok(true, "Hủy giao dịch thành công.");
        }
    }
}
