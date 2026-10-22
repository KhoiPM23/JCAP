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

            if (_payOSClient == null || !_payOsSettings.IsConfigured)
            {
                _logger.LogError("PayOS chưa cấu hình thông tin. Từ chối khởi tạo giao dịch cho User: {UserId}, Package: {PackageId}", userId, packageId);
                return ApiResponse<PurchaseCreditResponseDto>.Fail("Cổng thanh toán trực tuyến PayOS chưa được cấu hình hoặc gặp sự cố. Vui lòng liên hệ quản trị viên.");
            }
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
                    Description = $"Nạp {package.Name} ({package.Credits} credits)",
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

                // Đối với Gói Chuyên Sâu: thiết lập số tiền thanh toán test qua PayOS là 2.500 VNĐ.
                // Các gói khác: sử dụng đúng giá trị niêm yết của gói.
                int actualPaymentAmount = (int)package.Price;
                var pkgNameLower = package.Name.ToLower();
                if (pkgNameLower.Contains("chuyên sâu") || pkgNameLower.Contains("chuyen sau") || package.Credits == 1000)
                {
                    actualPaymentAmount = 2500;
                }

                var paymentRequest = new CreatePaymentLinkRequest
                {
                    OrderCode = orderCode,
                    Amount = actualPaymentAmount,
                    Description = safeDescription,
                    ReturnUrl = returnUrl,
                    CancelUrl = cancelUrl,
                    Items = new List<PaymentLinkItem>
                    {
                        new()
                        {
                            Name = package.Name,
                            Quantity = 1,
                            Price = actualPaymentAmount
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


        public async Task<ApiResponse<PurchaseCreditResponseDto>> PurchaseSubscriptionAsync(string userId, PurchaseSubscriptionRequestDto request)
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return ApiResponse<PurchaseCreditResponseDto>.Fail("Không tìm thấy thông tin người dùng.");
            }

            if (_payOSClient == null || !_payOsSettings.IsConfigured)
            {
                _logger.LogError("PayOS chưa cấu hình thông tin khi mua gói tháng cho User: {UserId}, Plan: {PlanId}", userId, request.PlanId);
                return ApiResponse<PurchaseCreditResponseDto>.Fail("Cổng thanh toán PayOS chưa được kích hoạt hoặc cấu hình chưa đầy đủ. Vui lòng liên hệ quản trị viên.");
            }

            try
            {
                long orderCode = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                var frontendUrl = _configuration["FrontendUrl"]?.TrimEnd('/') ?? "http://localhost:5173";
                var returnUrl = $"{frontendUrl}/credits/payment-return?type=subscription&planId={Uri.EscapeDataString(request.PlanId)}";
                var cancelUrl = $"{frontendUrl}/credits?cancel=true";

                var pendingTransaction = new CreditTransaction
                {
                    UserId = userId,
                    Amount = request.CreditsAmount,
                    Type = "Subscription",
                    Description = $"Đăng ký {request.PlanName} ({request.PlanId})",
                    PayOsOrderCode = orderCode.ToString(),
                    Status = "Pending",
                    CreatedAt = DateTime.UtcNow
                };

                await _dbContext.CreditTransactions.AddAsync(pendingTransaction);
                await _dbContext.SaveChangesAsync();

                // PayOS quy định mô tả tối đa 25 ký tự không dấu/đơn giản
                string safeDescription = $"JCAP Sub {request.CreditsAmount}C";
                if (safeDescription.Length > 25)
                {
                    safeDescription = safeDescription.Substring(0, 25);
                }

                int actualPaymentAmount = (int)request.Price;
                if (actualPaymentAmount < 2000)
                {
                    actualPaymentAmount = 2500;
                }

                var paymentRequest = new CreatePaymentLinkRequest
                {
                    OrderCode = orderCode,
                    Amount = actualPaymentAmount,
                    Description = safeDescription,
                    ReturnUrl = returnUrl,
                    CancelUrl = cancelUrl,
                    Items = new List<PaymentLinkItem>
                    {
                        new()
                        {
                            Name = request.PlanName,
                            Quantity = 1,
                            Price = actualPaymentAmount
                        }
                    }
                };

                var paymentLinkResult = await _payOSClient.PaymentRequests.CreateAsync(paymentRequest);

                return ApiResponse<PurchaseCreditResponseDto>.Ok(new PurchaseCreditResponseDto
                {
                    Success = true,
                    Message = "Tạo liên kết thanh toán gói tháng PayOS thành công.",
                    CheckoutUrl = paymentLinkResult.CheckoutUrl,
                    OrderCode = orderCode,
                    IsMock = false
                }, "Khởi tạo thanh toán thành công.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi tạo payment link gói tháng với PayOS. PlanId: {PlanId}", request.PlanId);
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

                // Xác định gói nạp tương ứng để lấy đúng giá gốc của gói
                var matchedPackage = await _dbContext.CreditPackages
                    .FirstOrDefaultAsync(p => p.Credits == transaction.Amount);

                int packagePrice;
                if (matchedPackage != null)
                {
                    packagePrice = (int)matchedPackage.Price;
                }
                else
                {
                    // Fallback theo tỉ lệ mặc định nếu không tìm thấy package trong DB
                    packagePrice = (int)(transaction.Amount * 333);
                    if (packagePrice < 10000) packagePrice = 20000;
                }

                // Đối với Gói Chuyên Sâu (1000 credits hoặc tên chứa 'chuyên sâu'): giữ 2.500 VNĐ cho mục đích test
                var descLower = (transaction.Description ?? "").ToLower();
                var matchedNameLower = matchedPackage?.Name?.ToLower() ?? "";
                if (transaction.Amount == 1000 || descLower.Contains("chuyên sâu") || descLower.Contains("chuyen sau") || matchedNameLower.Contains("chuyên sâu") || matchedNameLower.Contains("chuyen sau"))
                {
                    packagePrice = 2500;
                }

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
                .FirstOrDefaultAsync(t => (t.PayOsOrderCode == orderCodeStr || t.Id.ToString() == orderCodeStr) && t.UserId == userId);

            if (transaction == null)
            {
                // Fallback tìm kiếm linh hoạt hơn
                transaction = await _dbContext.CreditTransactions
                    .FirstOrDefaultAsync(t => t.UserId == userId && t.PayOsOrderCode != null && t.PayOsOrderCode.Trim() == orderCodeStr.Trim());
            }

            if (transaction == null)
            {
                return ApiResponse<bool>.Fail("Không tìm thấy đơn hàng cần hủy.");
            }

            if (transaction.Status == "Paid")
            {
                return ApiResponse<bool>.Fail("Đơn hàng này đã thanh toán thành công, không thể hủy.");
            }

            if (transaction.Status == "Cancelled")
            {
                return ApiResponse<bool>.Ok(true, "Đơn hàng này đã ở trạng thái đã hủy.");
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

        public async Task<ApiResponse<UserQuotaDto>> GetUserQuotaAsync(string userId)
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return ApiResponse<UserQuotaDto>.Fail("Không tìm thấy người dùng.");
            }

            var now = DateTime.UtcNow;
            var fiveHoursAgo = now.AddHours(-5);
            var sevenDaysAgo = now.AddDays(-7);

            // 1. Tính tổng credit bị khấu trừ trong 5 giờ qua từ các giao dịch Deduct
            var used5h = await _dbContext.CreditTransactions
                .AsNoTracking()
                .Where(t => t.UserId == userId && t.Type == "Deduct" && t.CreatedAt >= fiveHoursAgo)
                .SumAsync(t => -t.Amount); // Amount là số âm khi Deduct (ví dụ: -1, -5) -> -t.Amount là số dương

            // 2. Tính tổng credit bị khấu trừ trong 7 ngày qua
            var usedWeek = await _dbContext.CreditTransactions
                .AsNoTracking()
                .Where(t => t.UserId == userId && t.Type == "Deduct" && t.CreatedAt >= sevenDaysAgo)
                .SumAsync(t => -t.Amount);

            // Mặc định định mức gói Pro: 50 credits/5h, 1000 credits/tuần
            int fiveHourTotal = 50;
            int weeklyTotal = 1000;

            int fiveHourRemaining = Math.Max(0, fiveHourTotal - used5h);
            int fiveHourPercent = fiveHourTotal > 0 ? Math.Max(0, Math.Min(100, (int)Math.Round((double)fiveHourRemaining / fiveHourTotal * 100))) : 0;

            int weeklyRemaining = Math.Max(0, weeklyTotal - usedWeek);
            int weeklyPercent = weeklyTotal > 0 ? Math.Max(0, Math.Min(100, (int)Math.Round((double)weeklyRemaining / weeklyTotal * 100))) : 0;

            // 3. Tính thời gian reset hạn ngạch 5 giờ
            // Dựa vào giao dịch Deduct cũ nhất trong cửa sổ 5 giờ: sau 5h kể từ lúc đó nó sẽ rơi khỏi cửa sổ
            var oldestIn5h = await _dbContext.CreditTransactions
                .AsNoTracking()
                .Where(t => t.UserId == userId && t.Type == "Deduct" && t.CreatedAt >= fiveHoursAgo)
                .OrderBy(t => t.CreatedAt)
                .Select(t => t.CreatedAt)
                .FirstOrDefaultAsync();

            string fiveHourResetsText;
            if (oldestIn5h != default)
            {
                var nextReset = oldestIn5h.AddHours(5);
                var diff = nextReset - now;
                if (diff.TotalMinutes > 0)
                {
                    int h = (int)diff.TotalHours;
                    int m = diff.Minutes;
                    fiveHourResetsText = h > 0 ? $"{h} giờ {m} phút" : $"{m} phút";
                }
                else
                {
                    fiveHourResetsText = "Đang hồi phục";
                }
            }
            else
            {
                fiveHourResetsText = "5 giờ (Đầy đủ)";
            }

            // 4. Tính thời gian reset tuần (còn lại trong chu kỳ 7 ngày)
            var oldestInWeek = await _dbContext.CreditTransactions
                .AsNoTracking()
                .Where(t => t.UserId == userId && t.Type == "Deduct" && t.CreatedAt >= sevenDaysAgo)
                .OrderBy(t => t.CreatedAt)
                .Select(t => t.CreatedAt)
                .FirstOrDefaultAsync();

            string weeklyResetsText;
            if (oldestInWeek != default)
            {
                var nextWeekReset = oldestInWeek.AddDays(7);
                var diffW = nextWeekReset - now;
                if (diffW.TotalHours > 0)
                {
                    int days = (int)diffW.TotalDays;
                    int hours = diffW.Hours;
                    weeklyResetsText = days > 0 ? $"{days} ngày {hours} giờ" : $"{hours} giờ";
                }
                else
                {
                    weeklyResetsText = "Đang hồi phục";
                }
            }
            else
            {
                weeklyResetsText = "7 ngày (Đầy đủ)";
            }

            var dto = new UserQuotaDto
            {
                WeeklyTotalCredits = weeklyTotal,
                WeeklyUsedCredits = usedWeek,
                WeeklyRemainingCredits = weeklyRemaining,
                WeeklyRemainingPercent = weeklyPercent,
                WeeklyResetsInText = weeklyResetsText,

                FiveHourTotalCredits = fiveHourTotal,
                FiveHourUsedCredits = used5h,
                FiveHourRemainingCredits = fiveHourRemaining,
                FiveHourRemainingPercent = fiveHourPercent,
                FiveHourResetsInText = fiveHourResetsText,

                ExtraCreditBalance = user.CreditBalance,
                PlanName = "Gói Tháng Pro (Cơ Bản)",
                PlanTier = "Pro"
            };

            return ApiResponse<UserQuotaDto>.Ok(dto, "Lấy thông tin hạn ngạch thành công.");
        }
    }
}
