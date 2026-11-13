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

        /// <summary>
        /// Lưu MỖI lần gửi chấm một câu, kể cả lần chưa chấm được (điểm null + mã lỗi). Trả về Id của dòng đã lưu.
        /// Cùng ClientSubmissionId đã có thì không tạo dòng mới, trả Id cũ.
        /// </summary>
        Task<Guid?> RecordSentenceEvaluationAsync(
            string userId, int sentenceId, ShadowingAudioEvaluationResponseDto result,
            Guid? progressId = null, Guid? clientSubmissionId = null);

        /// <summary>Id các câu của một bài đang hoạt động (rỗng nếu bài không tồn tại/không hoạt động).</summary>
        Task<List<int>> GetActiveSentenceIdsAsync(int dialogueId);

        /// <summary>Lần chấm đã lưu theo ClientSubmissionId của người dùng; null nếu chưa có.</summary>
        Task<ShadowingSentenceEvaluation?> FindEvaluationBySubmissionAsync(string userId, Guid clientSubmissionId);

        /// <summary>Lịch sử các buổi luyện đã hoàn thành của người dùng (mới nhất trước).</summary>
        Task<ApiResponse<List<ShadowingPracticeSessionDto>>> GetHistoryAsync(string userId);
    }
}

