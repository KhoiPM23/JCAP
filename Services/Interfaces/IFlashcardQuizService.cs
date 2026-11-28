using System.Collections.Generic;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Flashcard;

namespace JCAP.Services.Interfaces
{
    public interface IFlashcardQuizService
    {
        Task<ApiResponse<FlashcardQuizHistoryItemDto>> SubmitAttemptAsync(
            string userId,
            SubmitFlashcardQuizAttemptRequestDto request);

        Task<ApiResponse<List<FlashcardQuizHistoryItemDto>>> GetHistoryAsync(
            string userId,
            string? contentType = null,
            int? topicId = null);

        Task<ApiResponse<FlashcardQuizHistoryDetailDto>> GetHistoryDetailAsync(
            string userId,
            int attemptId);
    }
}
