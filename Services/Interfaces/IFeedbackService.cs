using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Feedback;

namespace JCAP.Services.Interfaces
{
    public interface IFeedbackService
    {
        // Learner methods (UC-09: Chỉ xem và tương tác với bài của chính mình)
        Task<ApiResponse<List<FeedbackTicketDto>>> GetMyTicketsAsync(string userId, CancellationToken cancellationToken = default);
        Task<ApiResponse<FeedbackTicketDto>> GetMyTicketByIdAsync(string userId, int ticketId, CancellationToken cancellationToken = default);
        Task<ApiResponse<FeedbackTicketDto>> CreateTicketAsync(string userId, CreateFeedbackTicketDto dto, CancellationToken cancellationToken = default);
        Task<ApiResponse<FeedbackTicketDto>> ReplyAsLearnerAsync(string userId, int ticketId, ReplyFeedbackTicketDto dto, CancellationToken cancellationToken = default);

        // Admin methods (UC-59: Xem tất cả bài ẩn danh, phản hồi, đóng/mở lại bài)
        Task<ApiResponse<List<FeedbackTicketDto>>> GetAllTicketsForAdminAsync(CancellationToken cancellationToken = default);
        Task<ApiResponse<FeedbackTicketDto>> MarkTicketSeenByAdminAsync(int ticketId, CancellationToken cancellationToken = default);
        Task<ApiResponse<FeedbackTicketDto>> ReplyAsAdminAsync(int ticketId, ReplyFeedbackTicketDto dto, CancellationToken cancellationToken = default);
        Task<ApiResponse<FeedbackTicketDto>> CloseTicketAsAdminAsync(int ticketId, CancellationToken cancellationToken = default);
        Task<ApiResponse<FeedbackTicketDto>> ReopenTicketAsAdminAsync(int ticketId, CancellationToken cancellationToken = default);
    }
}

