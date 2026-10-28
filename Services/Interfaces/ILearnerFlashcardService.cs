using System.Collections.Generic;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Flashcard;

namespace JCAP.Services.Interfaces
{
    public interface ILearnerFlashcardService
    {
        Task<ApiResponse<FlashcardQuotaDto>> GetDailyQuotaAsync(string userId);
        Task<ApiResponse<FlashcardQuotaDto>> UnlockExtraQuotaAsync(string userId);

        Task<ApiResponse<List<FlashcardSetSummaryDto>>> GetFlashcardSetsAsync(
            string userId,
            string? contentType = null,
            string? jlptLevel = null,
            string? keyword = null);

        Task<ApiResponse<FlashcardSetDetailDto>> GetFlashcardSetDetailAsync(
            string userId,
            int topicId,
            string contentType);

        Task<ApiResponse<FlashcardSessionDto>> StartSessionAsync(
            string userId,
            StartFlashcardSessionRequestDto request);

        Task<ApiResponse<FlashcardReviewResultDto>> SubmitCardReviewAsync(
            string userId,
            int sessionId,
            SubmitFlashcardReviewRequestDto request);

        Task<ApiResponse<CompleteFlashcardSessionResponseDto>> CompleteSessionAsync(
            string userId,
            int sessionId);

        Task<ApiResponse<List<FlashcardSessionHistoryItemDto>>> GetSessionHistoryAsync(string userId);
        Task<ApiResponse<FlashcardSessionHistoryDetailDto>> GetSessionHistoryDetailAsync(string userId, int sessionId);
    }
}
