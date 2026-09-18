using JCAP.DTOs.Common;
using JCAP.DTOs.Credit;
using PayOS.Models.Webhooks;

namespace JCAP.Services.Interfaces
{
    public interface ICreditService
    {
        Task<ApiResponse<List<CreditPackageDto>>> GetActivePackagesAsync();
        Task<ApiResponse<PurchaseCreditResponseDto>> PurchasePackageAsync(string userId, int packageId);
        Task<ApiResponse<CreditHistoryResponseDto>> GetHistoryAsync(string userId, int page = 1, int pageSize = 10);
        Task<ApiResponse<bool>> HandlePayOsWebhookAsync(Webhook webhook);
        Task<ApiResponse<CreditTransactionDto>> VerifyOrderAsync(string userId, long orderCode);
    }
}
