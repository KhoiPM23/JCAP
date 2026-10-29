using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Credit;
using JCAP.Models;
using JCAP.Services.Interfaces;
using JCAP.Services.Subscriptions;
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
        public const int PendingOrderTimeoutMinutes = 10;

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
                    AmountVnd = package.Price,
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

                // Sử dụng đúng giá trị niêm yết của gói credit (VND) để tạo liên kết thanh toán PayOS
                int actualPaymentAmount = (int)package.Price;

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
            var plan = SubscriptionPlanCatalog.Find(request.PlanId);
            if (plan == null)
            {
                return ApiResponse<PurchaseCreditResponseDto>.Fail("Gói đăng ký hội viên không hợp lệ hoặc không tồn tại.");
            }

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return ApiResponse<PurchaseCreditResponseDto>.Fail("Không tìm thấy thông tin người dùng.");
            }

            if (_payOSClient == null || !_payOsSettings.IsConfigured)
            {
                _logger.LogError("PayOS chưa cấu hình thông tin khi mua gói tháng cho User: {UserId}, Plan: {PlanId}", userId, plan.Id);
                return ApiResponse<PurchaseCreditResponseDto>.Fail("Cổng thanh toán PayOS chưa được kích hoạt hoặc cấu hình chưa đầy đủ. Vui lòng liên hệ quản trị viên.");
            }

            try
            {
                long orderCode = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                var frontendUrl = _configuration["FrontendUrl"]?.TrimEnd('/') ?? "http://localhost:5173";
                var returnUrl = $"{frontendUrl}/credits/payment-return?type=subscription&planId={Uri.EscapeDataString(plan.Id)}";
                var cancelUrl = $"{frontendUrl}/credits?cancel=true";

                var pendingTransaction = new CreditTransaction
                {
                    UserId = userId,
                    Amount = plan.WeeklyQuota,
                    AmountVnd = plan.Price,
                    SubscriptionPlanId = plan.Id,
                    Type = "Subscription",
                    Description = $"Đăng ký {plan.Name} ({plan.Id})",
                    PayOsOrderCode = orderCode.ToString(),
                    Status = "Pending",
                    CreatedAt = DateTime.UtcNow
                };

                await _dbContext.CreditTransactions.AddAsync(pendingTransaction);
                await _dbContext.SaveChangesAsync();

                // PayOS quy định mô tả tối đa 25 ký tự không dấu/đơn giản
                string safeDescription = $"JCAP Sub {plan.Tier}";
                if (safeDescription.Length > 25)
                {
                    safeDescription = safeDescription.Substring(0, 25);
                }

                int actualPaymentAmount = (int)plan.Price;

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
                            Name = plan.Name,
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

            // Tự động đối soát các giao dịch đang Pending gần nhất với PayOS API
            // (Giúp đồng bộ tức thì khi người dùng bấm Hủy hoặc Thanh toán ở tab PayOS song song rồi mở/quay lại Lịch sử giao dịch)
            if (_payOSClient != null && _payOsSettings.IsConfigured)
            {
                var pendingTxs = await _dbContext.CreditTransactions
                    .Where(t => t.UserId == userId && t.Status == "Pending" && t.PayOsOrderCode != null)
                    .OrderByDescending(t => t.CreatedAt)
                    .Take(pageSize)
                    .ToListAsync();

                bool hasStatusChanges = false;
                foreach (var pendingTx in pendingTxs)
                {
                    if (!long.TryParse(pendingTx.PayOsOrderCode, out var pendingOrderCode))
                    {
                        continue;
                    }

                    try
                    {
                        var paymentInfo = await _payOSClient.PaymentRequests.GetAsync(pendingOrderCode);
                        var statusStr = paymentInfo?.Status.ToString()?.ToUpperInvariant();
                        if (paymentInfo != null && statusStr == "PAID")
                        {
                            await ActivateTransactionAsync(pendingTx);
                            user = await _userManager.FindByIdAsync(userId) ?? user;
                        }
                        else if (paymentInfo != null && (statusStr == "CANCELLED" || statusStr == "CANCELED" || statusStr == "EXPIRED"))
                        {
                            pendingTx.Status = "Cancelled";
                            hasStatusChanges = true;
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Không thể đối soát trạng thái đơn Pending #{OrderCode} từ PayOS khi tải lịch sử.", pendingOrderCode);
                    }
                }

                if (hasStatusChanges)
                {
                    await _dbContext.SaveChangesAsync();
                }
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

        /// <summary>
        /// Kết quả của một lần kích hoạt giao dịch.
        /// </summary>
        private enum ActivationOutcome
        {
            /// <summary>Giao dịch vừa được chuyển sang Paid và quyền lợi đã được cấp.</summary>
            Activated,
            /// <summary>Giao dịch đã được xử lý trước đó — không cấp quyền lợi lần hai.</summary>
            AlreadyProcessed
        }

        /// <summary>
        /// Chuyển giao dịch sang trạng thái Paid một cách nguyên tử.
        ///
        /// Chống race condition: webhook PayOS và VerifyOrderAsync (frontend gọi khi PayOS redirect về)
        /// có thể chạy đồng thời cho cùng một đơn. Trước đây cả hai đều check-then-update
        /// <c>transaction.Status</c> nên credit có thể được cộng hai lần.
        ///
        /// Trên SQL Server dùng một câu UPDATE có điều kiện (<c>WHERE Status = 'Pending'</c>) —
        /// đúng một tiến trình nhận được affected = 1, tiến trình còn lại nhận 0 và dừng lại.
        /// Provider InMemory (dùng trong test) không hỗ trợ ExecuteUpdateAsync nên rơi về
        /// check-then-set thuần; test chạy đơn luồng nên không ảnh hưởng tính đúng đắn.
        /// </summary>
        private async Task<bool> TryClaimTransactionAsync(CreditTransaction transaction, CancellationToken cancellationToken = default)
        {
            var paidAt = DateTime.UtcNow;
            if (_dbContext.Database.IsRelational())
            {
                var affected = await _dbContext.CreditTransactions
                    .Where(t => t.Id == transaction.Id && t.Status == "Pending")
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(t => t.Status, "Paid")
                        .SetProperty(t => t.CreatedAt, paidAt), cancellationToken);

                if (affected == 0)
                {
                    return false;
                }

                // ExecuteUpdateAsync ghi trực tiếp xuống DB, không qua change tracker.
                // Đồng bộ lại entity đang track để các bước sau đọc đúng trạng thái.
                _dbContext.Entry(transaction).Property(t => t.Status).CurrentValue = "Paid";
                _dbContext.Entry(transaction).Property(t => t.CreatedAt).CurrentValue = paidAt;
                return true;
            }

            if (transaction.Status != "Pending")
            {
                return false;
            }

            transaction.Status = "Paid";
            transaction.CreatedAt = paidAt;
            return true;
        }

        /// <summary>
        /// Cấp quyền lợi cho một giao dịch đã thanh toán thành công. Idempotent.
        ///
        /// Dùng chung cho cả ba đường vào: webhook PayOS, VerifyOrderAsync và ContinuePaymentAsync.
        /// Trước đây mỗi đường tự cộng credit theo cách riêng, và không đường nào set
        /// <c>SubscriptionExpiresAt</c> — nên gói tháng mua xong không bao giờ được kích hoạt.
        ///
        /// Phân biệt rõ hai loại quyền lợi:
        /// - Type = "TopUp": cộng <c>Amount</c> vào CreditBalance (credit nạp thêm, không hết hạn).
        /// - Type = "Subscription": set hạn dùng gói, KHÔNG cộng vào CreditBalance. Amount của gói
        ///   tháng là hạn mức quota tuần, không phải số dư — cộng vào balance là nhầm hai khái niệm
        ///   và cho người dùng hưởng lợi hai lần (vừa có quota gói, vừa có thêm 1000 credit vĩnh viễn).
        /// </summary>
        private async Task<(ActivationOutcome Outcome, int? NewBalance)> ActivateTransactionAsync(
            CreditTransaction transaction,
            CancellationToken cancellationToken = default)
        {
            var useTransaction = _dbContext.Database.IsRelational();
            var dbTransaction = useTransaction
                ? await _dbContext.Database.BeginTransactionAsync(cancellationToken)
                : null;

            try
            {
                if (!await TryClaimTransactionAsync(transaction, cancellationToken))
                {
                    _logger.LogInformation(
                        "Giao dịch OrderCode {OrderCode} đã được xử lý trước đó. Bỏ qua để đảm bảo idempotency.",
                        transaction.PayOsOrderCode);

                    if (dbTransaction != null)
                    {
                        await dbTransaction.CommitAsync(cancellationToken);
                    }

                    var existing = await _userManager.FindByIdAsync(transaction.UserId);
                    return (ActivationOutcome.AlreadyProcessed, existing?.CreditBalance);
                }

                var user = transaction.User ?? await _userManager.FindByIdAsync(transaction.UserId);
                if (user == null)
                {
                    _logger.LogError(
                        "Giao dịch OrderCode {OrderCode} thanh toán thành công nhưng không tìm thấy User {UserId}.",
                        transaction.PayOsOrderCode, transaction.UserId);

                    await _dbContext.SaveChangesAsync(cancellationToken);
                    if (dbTransaction != null)
                    {
                        await dbTransaction.CommitAsync(cancellationToken);
                    }

                    return (ActivationOutcome.Activated, null);
                }

                var now = DateTime.UtcNow;

                if (string.Equals(transaction.Type, "Subscription", StringComparison.OrdinalIgnoreCase))
                {
                    var plan = SubscriptionPlanCatalog.FindOrDefault(transaction.SubscriptionPlanId);

                    // Gia hạn nối tiếp: nếu gói hiện tại còn hiệu lực thì cộng dồn từ ngày hết hạn cũ,
                    // không cắt ngắn thời gian người dùng đã trả tiền.
                    var startFrom = user.SubscriptionExpiresAt.HasValue && user.SubscriptionExpiresAt.Value > now
                        ? user.SubscriptionExpiresAt.Value
                        : now;

                    user.SubscriptionPlanId = plan.Id;
                    user.SubscriptionStartedAt = now;
                    user.SubscriptionExpiresAt = startFrom.AddDays(plan.DurationDays);

                    await _userManager.UpdateAsync(user);

                    _logger.LogInformation(
                        "Kích hoạt gói {PlanId} cho User {UserId}, hiệu lực đến {ExpiresAt:u}.",
                        plan.Id, user.Id, user.SubscriptionExpiresAt);
                }
                else
                {
                    user.CreditBalance += transaction.Amount;
                    await _userManager.UpdateAsync(user);

                    _logger.LogInformation(
                        "Cộng {Amount} credits cho User {UserId} từ OrderCode {OrderCode}. Số dư mới: {Balance}.",
                        transaction.Amount, user.Id, transaction.PayOsOrderCode, user.CreditBalance);
                }

                await _dbContext.SaveChangesAsync(cancellationToken);

                if (dbTransaction != null)
                {
                    await dbTransaction.CommitAsync(cancellationToken);
                }

                return (ActivationOutcome.Activated, user.CreditBalance);
            }
            catch
            {
                if (dbTransaction != null)
                {
                    await dbTransaction.RollbackAsync(cancellationToken);
                }
                throw;
            }
            finally
            {
                dbTransaction?.Dispose();
            }
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

            var (outcome, _) = await ActivateTransactionAsync(transaction);
            if (outcome == ActivationOutcome.AlreadyProcessed)
            {
                return ApiResponse<bool>.Ok(true, "Giao dịch đã được xử lý trước đó.");
            }

            return ApiResponse<bool>.Ok(true, "Xử lý thanh toán thành công.");
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

            int? currentBalance = null;

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
                        var (_, updatedBalance) = await ActivateTransactionAsync(transaction);
                        currentBalance = updatedBalance;
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

            if (currentBalance == null)
            {
                var user = await _userManager.FindByIdAsync(userId);
                currentBalance = user?.CreditBalance;
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
                CurrentCreditBalance = currentBalance
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

            if (_payOSClient == null || !_payOsSettings.IsConfigured)
            {
                _logger.LogError("PayOS chưa cấu hình thông tin. Từ chối tiếp tục thanh toán cho User: {UserId}, OrderCode: {OrderCode}", userId, orderCode);
                return ApiResponse<PurchaseCreditResponseDto>.Fail("Cổng thanh toán trực tuyến PayOS chưa được cấu hình hoặc gặp sự cố. Vui lòng liên hệ quản trị viên.");
            }

            try
            {
                var paymentInfo = await _payOSClient.PaymentRequests.GetAsync(orderCode);
                var statusStr = paymentInfo?.Status.ToString()?.ToUpperInvariant();

                if (paymentInfo != null && statusStr == "PAID")
                {
                    var (_, updatedBalance) = await ActivateTransactionAsync(transaction);
                    return ApiResponse<PurchaseCreditResponseDto>.Ok(new PurchaseCreditResponseDto
                    {
                        Success = true,
                        Message = "Đơn hàng đã được thanh toán thành công qua PayOS và quyền lợi đã được kích hoạt.",
                        OrderCode = orderCode,
                        IsMock = false,
                        NewCreditBalance = updatedBalance
                    }, "Đơn hàng đã được thanh toán thành công qua PayOS.");
                }

                if (paymentInfo != null && (statusStr == "CANCELLED" || statusStr == "CANCELED" || statusStr == "EXPIRED"))
                {
                    transaction.Status = "Cancelled";
                    await _dbContext.SaveChangesAsync();
                    return ApiResponse<PurchaseCreditResponseDto>.Fail("Đơn hàng này đã bị hủy trên cổng PayOS.");
                }

                var frontendUrl = _configuration["FrontendUrl"]?.TrimEnd('/') ?? "http://localhost:5173";
                var returnUrl = string.IsNullOrWhiteSpace(_payOsSettings.ReturnUrl)
                    ? $"{frontendUrl}/credits/payment-return"
                    : _payOsSettings.ReturnUrl;
                var cancelUrl = string.IsNullOrWhiteSpace(_payOsSettings.CancelUrl)
                    ? $"{frontendUrl}/credits"
                    : _payOsSettings.CancelUrl;

                // Xác định số tiền thanh toán thật (VND) cho cả đơn Subscription lẫn TopUp
                int packagePrice;
                string itemName;
                string safeDescription;

                if (string.Equals(transaction.Type, "Subscription", StringComparison.OrdinalIgnoreCase))
                {
                    var plan = SubscriptionPlanCatalog.FindOrDefault(transaction.SubscriptionPlanId);
                    packagePrice = transaction.AmountVnd > 0 ? (int)transaction.AmountVnd : (int)plan.Price;
                    transaction.AmountVnd = packagePrice;
                    itemName = plan.Name;
                    safeDescription = $"JCAP Sub {plan.Tier}";
                    returnUrl = $"{frontendUrl}/credits/payment-return?type=subscription&planId={Uri.EscapeDataString(plan.Id)}";
                    cancelUrl = $"{frontendUrl}/credits?cancel=true";
                }
                else
                {
                    var matchedPackage = await _dbContext.CreditPackages
                        .FirstOrDefaultAsync(p => p.Credits == transaction.Amount);

                    if (transaction.AmountVnd > 0)
                    {
                        packagePrice = (int)transaction.AmountVnd;
                    }
                    else if (matchedPackage != null)
                    {
                        packagePrice = (int)matchedPackage.Price;
                        transaction.AmountVnd = matchedPackage.Price;
                    }
                    else
                    {
                        // Fallback theo tỉ lệ mặc định nếu không tìm thấy package trong DB
                        packagePrice = (int)(transaction.Amount * 333);
                        if (packagePrice < 10000) packagePrice = 20000;
                        transaction.AmountVnd = packagePrice;
                    }

                    itemName = matchedPackage?.Name ?? $"Nạp {transaction.Amount} Credits";
                    safeDescription = $"JCAP Nap {transaction.Amount}C";
                }

                if (safeDescription.Length > 25) safeDescription = safeDescription.Substring(0, 25);

                // Nếu đơn cũ vẫn đang PENDING trên PayOS, hủy link cũ trước khi cấp mã đơn mới để tránh treo 2 link song song
                if (paymentInfo != null && statusStr == "PENDING")
                {
                    try
                    {
                        await _payOSClient.PaymentRequests.CancelAsync(orderCode, "Người dùng tạo liên kết thanh toán mới");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Không thể hủy link PayOS cũ #{OrderCode} khi tạo link mới.", orderCode);
                    }
                }

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
                            Name = itemName,
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
            bool hasActiveSub = user.SubscriptionExpiresAt.HasValue && user.SubscriptionExpiresAt.Value > now;

            // Nếu người dùng chưa đăng ký gói tháng hoặc gói đã hết hạn -> KHÔNG tự động gán gói Pro mặc định
            if (!hasActiveSub)
            {
                var expiredPlan = SubscriptionPlanCatalog.Find(user.SubscriptionPlanId);
                bool hadPlanBefore = user.SubscriptionExpiresAt.HasValue && expiredPlan != null;

                var inactiveDto = new UserQuotaDto
                {
                    WeeklyTotalCredits = 0,
                    WeeklyUsedCredits = 0,
                    WeeklyRemainingCredits = 0,
                    WeeklyRemainingPercent = 0,
                    WeeklyResetsInText = "Chưa kích hoạt gói tháng",

                    FiveHourTotalCredits = 0,
                    FiveHourUsedCredits = 0,
                    FiveHourRemainingCredits = 0,
                    FiveHourRemainingPercent = 0,
                    FiveHourResetsInText = "Chưa kích hoạt gói tháng",

                    ExtraCreditBalance = user.CreditBalance,
                    PlanId = hadPlanBefore ? expiredPlan!.Id : string.Empty,
                    PlanName = hadPlanBefore ? $"{expiredPlan!.Name} (Đã hết hạn)" : "Chưa đăng ký gói hội viên",
                    PlanTier = hadPlanBefore ? expiredPlan!.Tier : "Free",
                    HasActiveSubscription = false,
                    SubscriptionExpiresAt = user.SubscriptionExpiresAt,
                    SubscriptionDaysRemaining = 0
                };

                return ApiResponse<UserQuotaDto>.Ok(inactiveDto, "Người dùng hiện chưa có gói hội viên tháng đang hoạt động.");
            }

            var fiveHoursAgo = now.AddHours(-5);
            var sevenDaysAgo = now.AddDays(-7);

            // Xác định gói tháng đang hoạt động của người dùng
            var plan = SubscriptionPlanCatalog.FindOrDefault(user.SubscriptionPlanId);
            int fiveHourTotal = plan.FiveHourQuota;
            int weeklyTotal = plan.WeeklyQuota;

            // Chỉ đếm các giao dịch Deduct được chi trả bởi gói tháng (CoveredBySubscription = true hoặc Description bắt đầu bằng "[Gói tháng]")
            // để không đếm lẫn các lượt trừ từ CreditBalance nạp lẻ (pay-as-you-go).
            var subDeductQuery = _dbContext.CreditTransactions
                .AsNoTracking()
                .Where(t => t.UserId == userId
                    && t.Type == "Deduct"
                    && (t.CoveredBySubscription || (t.Description != null && t.Description.StartsWith("[Gói tháng]"))));

            // 1. Tính tổng credit bị khấu trừ trong 5 giờ qua từ các giao dịch gói tháng
            var used5h = await subDeductQuery
                .Where(t => t.CreatedAt >= fiveHoursAgo)
                .SumAsync(t => -t.Amount);

            // 2. Tính tổng credit bị khấu trừ trong 7 ngày qua từ các giao dịch gói tháng
            var usedWeek = await subDeductQuery
                .Where(t => t.CreatedAt >= sevenDaysAgo)
                .SumAsync(t => -t.Amount);

            int fiveHourRemaining = Math.Max(0, fiveHourTotal - used5h);
            int fiveHourPercent = fiveHourTotal > 0 ? Math.Max(0, Math.Min(100, (int)Math.Round((double)fiveHourRemaining / fiveHourTotal * 100))) : 0;

            int weeklyRemaining = Math.Max(0, weeklyTotal - usedWeek);
            int weeklyPercent = weeklyTotal > 0 ? Math.Max(0, Math.Min(100, (int)Math.Round((double)weeklyRemaining / weeklyTotal * 100))) : 0;

            // 3. Tính thời gian hồi phục hạn ngạch 5 giờ (rolling window)
            var oldestIn5h = await subDeductQuery
                .Where(t => t.CreatedAt >= fiveHoursAgo)
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

            // 4. Tính thời gian hồi phục hạn ngạch tuần (rolling window 7 ngày)
            var oldestInWeek = await subDeductQuery
                .Where(t => t.CreatedAt >= sevenDaysAgo)
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

            int daysRemaining = Math.Max(0, (int)Math.Ceiling((user.SubscriptionExpiresAt!.Value - now).TotalDays));

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
                PlanId = plan.Id,
                PlanName = plan.Name,
                PlanTier = plan.Tier,
                HasActiveSubscription = true,
                SubscriptionExpiresAt = user.SubscriptionExpiresAt,
                SubscriptionDaysRemaining = daysRemaining
            };

            return ApiResponse<UserQuotaDto>.Ok(dto, "Lấy thông tin hạn ngạch thành công.");
        }
    }
}
