using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.Models;

namespace JCAP.Services.Interfaces
{
    public interface IShadowingService
    {
        Task<ApiResponse<List<ShadowingDialogueListDto>>> GetLearnerCatalogAsync(string? keyword, string? jlptLevel, int? scenarioId);
        Task<ApiResponse<ShadowingDialogueDetailDto>> GetLearnerDetailAsync(int id);
        Task<ApiResponse<ShadowingSessionCompleteResponseDto>> CompleteSessionAsync(string userId, ShadowingSessionCompleteDto dto);

        /// <summary>Câu luyện tập thuộc bài đang hoạt động; null nếu không có.</summary>
        Task<ShadowingSentence?> FindPracticeSentenceAsync(int sentenceId);

        /// <summary>Lưu kết quả chấm một câu (chỉ khi có điểm). Trả về Id để dùng khi hoàn thành buổi luyện.</summary>
        Task<Guid?> RecordSentenceEvaluationAsync(string userId, int sentenceId, ShadowingAudioEvaluationResponseDto result);

        /// <summary>Lịch sử các buổi luyện đã hoàn thành của người dùng (mới nhất trước).</summary>
        Task<ApiResponse<List<ShadowingPracticeSessionDto>>> GetHistoryAsync(string userId);
    }
}

