using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Feedback;
using JCAP.Models;
using JCAP.Services.Helpers;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace JCAP.Services.Implementations
{
    public class FeedbackService : IFeedbackService
    {
        private static readonly HashSet<string> AllowedCategories = new(StringComparer.OrdinalIgnoreCase)
        {
            "SCENARIO_BUG",
            "AI_ASSESSMENT",
            "PAYMENT_CREDIT",
            "SYSTEM_BUG",
            "SUGGESTION"
        };

        private readonly AppDbContext _dbContext;
        private readonly string? _cloudinaryCloudName;

        public FeedbackService(AppDbContext dbContext, IConfiguration? configuration = null)
        {
            _dbContext = dbContext;
            _cloudinaryCloudName = configuration?["Cloudinary:CloudName"];
        }

        public async Task<ApiResponse<List<FeedbackTicketDto>>> GetMyTicketsAsync(
            string userId,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return ApiResponse<List<FeedbackTicketDto>>.Fail("Không xác định được tài khoản người dùng.");
            }

            var tickets = await _dbContext.FeedbackTickets
                .AsNoTracking()
                .Include(t => t.Messages.OrderBy(m => m.CreatedAt))
                    .ThenInclude(m => m.Attachments)
                .Where(t => t.UserId == userId)
                .OrderByDescending(t => t.UpdatedAt)
                .ToListAsync(cancellationToken);

            var result = tickets.Select(MapToDto).ToList();
            return ApiResponse<List<FeedbackTicketDto>>.Ok(result, "Lấy lịch sử hòm thư góp ý thành công.");
        }

        public async Task<ApiResponse<FeedbackTicketDto>> GetMyTicketByIdAsync(
            string userId,
            int ticketId,
            CancellationToken cancellationToken = default)
        {
            var ticket = await _dbContext.FeedbackTickets
                .AsNoTracking()
                .Include(t => t.Messages.OrderBy(m => m.CreatedAt))
                    .ThenInclude(m => m.Attachments)
                .FirstOrDefaultAsync(t => t.Id == ticketId && t.UserId == userId, cancellationToken);

            if (ticket == null)
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Không tìm thấy bài góp ý hoặc bạn không có quyền truy cập.");
            }

            return ApiResponse<FeedbackTicketDto>.Ok(MapToDto(ticket), "Lấy chi tiết bài góp ý thành công.");
        }

        public async Task<ApiResponse<FeedbackTicketDto>> CreateTicketAsync(
            string userId,
            CreateFeedbackTicketDto dto,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Không xác định được tài khoản học viên.");
            }

            if (dto == null || string.IsNullOrWhiteSpace(dto.Title) || string.IsNullOrWhiteSpace(dto.Content))
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Vui lòng nhập đầy đủ tiêu đề và nội dung góp ý.");
            }

            var cleanTitle = dto.Title.Trim();
            if (cleanTitle.Length > 300)
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Tiêu đề bài góp ý không được vượt quá 300 ký tự.");
            }

            var cleanContent = dto.Content.Trim();
            if (cleanContent.Length > AttachmentSecurityHelper.MaxFeedbackContentLength)
            {
                return ApiResponse<FeedbackTicketDto>.Fail(
                    $"Nội dung góp ý không được vượt quá {AttachmentSecurityHelper.MaxFeedbackContentLength} ký tự.");
            }

            var rawAttachments = dto.Attachments ?? new List<CreateFeedbackAttachmentInputDto>();
            if (rawAttachments.Count > AttachmentSecurityHelper.MaxAttachmentsPerItem)
            {
                return ApiResponse<FeedbackTicketDto>.Fail(
                    $"Chỉ được đính kèm tối đa {AttachmentSecurityHelper.MaxAttachmentsPerItem} tệp mỗi lần gửi.");
            }

            if (rawAttachments.Any(a => !AttachmentSecurityHelper.IsAllowedAttachmentUrl(a.CloudinaryUrl, _cloudinaryCloudName)))
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Đường dẫn tệp đính kèm không hợp lệ.");
            }

            var normalizedCategory = AllowedCategories.Contains(dto.Category?.Trim() ?? "")
                ? dto.Category!.Trim().ToUpperInvariant()
                : "SUGGESTION";

            var now = DateTime.UtcNow;
            var randomCode = await GenerateUniqueAnonymousCodeAsync(cancellationToken);

            var ticket = new FeedbackTicket
            {
                UserId = userId,
                AnonymousCode = randomCode,
                Title = cleanTitle,
                Category = normalizedCategory,
                Status = "PENDING",
                CreatedAt = now,
                UpdatedAt = now
            };

            var initialMessage = new FeedbackMessage
            {
                SenderRole = "LEARNER",
                Content = cleanContent,
                CreatedAt = now
            };

            AddAttachmentsToMessage(initialMessage, rawAttachments, now);
            ticket.Messages.Add(initialMessage);

            _dbContext.FeedbackTickets.Add(ticket);
            await _dbContext.SaveChangesAsync(cancellationToken);

            return ApiResponse<FeedbackTicketDto>.Ok(MapToDto(ticket), "Đã gửi bài góp ý ẩn danh thành công.");
        }

        public async Task<ApiResponse<FeedbackTicketDto>> ReplyAsLearnerAsync(
            string userId,
            int ticketId,
            ReplyFeedbackTicketDto dto,
            CancellationToken cancellationToken = default)
        {
            var ticket = await _dbContext.FeedbackTickets
                .Include(t => t.Messages.OrderBy(m => m.CreatedAt))
                    .ThenInclude(m => m.Attachments)
                .FirstOrDefaultAsync(t => t.Id == ticketId && t.UserId == userId, cancellationToken);

            if (ticket == null)
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Không tìm thấy bài góp ý hoặc bạn không có quyền phản hồi.");
            }

            if (string.Equals(ticket.Status, "CLOSED", StringComparison.OrdinalIgnoreCase))
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Bài góp ý này đã được Admin đóng lại, không thể gửi thêm phản hồi.");
            }

            var rawAttachments = dto?.Attachments ?? new List<CreateFeedbackAttachmentInputDto>();
            if (rawAttachments.Count > AttachmentSecurityHelper.MaxAttachmentsPerItem)
            {
                return ApiResponse<FeedbackTicketDto>.Fail(
                    $"Chỉ được đính kèm tối đa {AttachmentSecurityHelper.MaxAttachmentsPerItem} tệp mỗi lần gửi.");
            }

            if (rawAttachments.Any(a => !AttachmentSecurityHelper.IsAllowedAttachmentUrl(a.CloudinaryUrl, _cloudinaryCloudName)))
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Đường dẫn tệp đính kèm không hợp lệ.");
            }

            var hasContent = !string.IsNullOrWhiteSpace(dto?.Content);
            if (!hasContent && rawAttachments.Count == 0)
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Vui lòng nhập nội dung phản hồi hoặc đính kèm ít nhất 1 tệp/ảnh.");
            }

            var cleanContent = hasContent ? dto!.Content.Trim() : "(Đính kèm tệp/ảnh)";
            if (cleanContent.Length > AttachmentSecurityHelper.MaxFeedbackContentLength)
            {
                return ApiResponse<FeedbackTicketDto>.Fail(
                    $"Nội dung phản hồi không được vượt quá {AttachmentSecurityHelper.MaxFeedbackContentLength} ký tự.");
            }

            var now = DateTime.UtcNow;
            var message = new FeedbackMessage
            {
                FeedbackTicketId = ticket.Id,
                SenderRole = "LEARNER",
                Content = cleanContent,
                CreatedAt = now
            };

            AddAttachmentsToMessage(message, rawAttachments, now);

            _dbContext.FeedbackMessages.Add(message);
            ticket.UpdatedAt = now;

            await _dbContext.SaveChangesAsync(cancellationToken);

            return await GetMyTicketByIdAsync(userId, ticket.Id, cancellationToken);
        }

        public async Task<ApiResponse<List<FeedbackTicketDto>>> GetAllTicketsForAdminAsync(
            CancellationToken cancellationToken = default)
        {
            var tickets = await _dbContext.FeedbackTickets
                .AsNoTracking()
                .Include(t => t.Messages.OrderBy(m => m.CreatedAt))
                    .ThenInclude(m => m.Attachments)
                .OrderByDescending(t => t.UpdatedAt)
                .ToListAsync(cancellationToken);

            var result = tickets.Select(MapToDto).ToList();
            return ApiResponse<List<FeedbackTicketDto>>.Ok(result, "Lấy toàn bộ danh sách góp ý ẩn danh cho Admin thành công.");
        }

        public async Task<ApiResponse<FeedbackTicketDto>> MarkTicketSeenByAdminAsync(
            int ticketId,
            CancellationToken cancellationToken = default)
        {
            var ticket = await _dbContext.FeedbackTickets
                .Include(t => t.Messages.OrderBy(m => m.CreatedAt))
                    .ThenInclude(m => m.Attachments)
                .FirstOrDefaultAsync(t => t.Id == ticketId, cancellationToken);

            if (ticket == null)
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Không tìm thấy bài góp ý.");
            }

            if (ticket.AdminSeenAt == null)
            {
                ticket.AdminSeenAt = DateTime.UtcNow;
                await _dbContext.SaveChangesAsync(cancellationToken);
            }

            return ApiResponse<FeedbackTicketDto>.Ok(MapToDto(ticket), "Đã đánh dấu Admin đã xem bài.");
        }

        public async Task<ApiResponse<FeedbackTicketDto>> ReplyAsAdminAsync(
            int ticketId,
            ReplyFeedbackTicketDto dto,
            CancellationToken cancellationToken = default)
        {
            var ticket = await _dbContext.FeedbackTickets
                .Include(t => t.Messages.OrderBy(m => m.CreatedAt))
                    .ThenInclude(m => m.Attachments)
                .FirstOrDefaultAsync(t => t.Id == ticketId, cancellationToken);

            if (ticket == null)
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Không tìm thấy bài góp ý.");
            }

            if (string.Equals(ticket.Status, "CLOSED", StringComparison.OrdinalIgnoreCase))
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Bài góp ý đã đóng. Vui lòng mở lại bài trước khi phản hồi.");
            }

            var rawAttachments = dto?.Attachments ?? new List<CreateFeedbackAttachmentInputDto>();
            if (rawAttachments.Count > AttachmentSecurityHelper.MaxAttachmentsPerItem)
            {
                return ApiResponse<FeedbackTicketDto>.Fail(
                    $"Chỉ được đính kèm tối đa {AttachmentSecurityHelper.MaxAttachmentsPerItem} tệp mỗi lần gửi.");
            }

            if (rawAttachments.Any(a => !AttachmentSecurityHelper.IsAllowedAttachmentUrl(a.CloudinaryUrl, _cloudinaryCloudName)))
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Đường dẫn tệp đính kèm không hợp lệ.");
            }

            var hasContent = !string.IsNullOrWhiteSpace(dto?.Content);
            if (!hasContent && rawAttachments.Count == 0)
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Vui lòng nhập nội dung phản hồi hoặc đính kèm tệp/ảnh.");
            }

            var cleanContent = hasContent ? dto!.Content.Trim() : "(Đính kèm tệp/ảnh từ Admin)";
            if (cleanContent.Length > AttachmentSecurityHelper.MaxFeedbackContentLength)
            {
                return ApiResponse<FeedbackTicketDto>.Fail(
                    $"Nội dung phản hồi không được vượt quá {AttachmentSecurityHelper.MaxFeedbackContentLength} ký tự.");
            }

            var now = DateTime.UtcNow;
            var message = new FeedbackMessage
            {
                FeedbackTicketId = ticket.Id,
                SenderRole = "ADMIN",
                Content = cleanContent,
                CreatedAt = now
            };

            AddAttachmentsToMessage(message, rawAttachments, now);

            _dbContext.FeedbackMessages.Add(message);

            ticket.AdminSeenAt ??= now;
            if (string.Equals(ticket.Status, "PENDING", StringComparison.OrdinalIgnoreCase))
            {
                ticket.Status = "IN_PROGRESS";
            }
            ticket.UpdatedAt = now;

            await _dbContext.SaveChangesAsync(cancellationToken);

            var updated = await _dbContext.FeedbackTickets
                .AsNoTracking()
                .Include(t => t.Messages.OrderBy(m => m.CreatedAt))
                    .ThenInclude(m => m.Attachments)
                .FirstAsync(t => t.Id == ticket.Id, cancellationToken);

            return ApiResponse<FeedbackTicketDto>.Ok(MapToDto(updated), "Admin đã gửi phản hồi thành công.");
        }

        public async Task<ApiResponse<FeedbackTicketDto>> CloseTicketAsAdminAsync(
            int ticketId,
            CancellationToken cancellationToken = default)
        {
            var ticket = await _dbContext.FeedbackTickets
                .Include(t => t.Messages.OrderBy(m => m.CreatedAt))
                    .ThenInclude(m => m.Attachments)
                .FirstOrDefaultAsync(t => t.Id == ticketId, cancellationToken);

            if (ticket == null)
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Không tìm thấy bài góp ý.");
            }

            var now = DateTime.UtcNow;
            ticket.Status = "CLOSED";
            ticket.AdminSeenAt ??= now;
            ticket.ClosedAt = now;
            ticket.UpdatedAt = now;

            await _dbContext.SaveChangesAsync(cancellationToken);
            return ApiResponse<FeedbackTicketDto>.Ok(MapToDto(ticket), "Đã đóng bài góp ý thành công.");
        }

        public async Task<ApiResponse<FeedbackTicketDto>> ReopenTicketAsAdminAsync(
            int ticketId,
            CancellationToken cancellationToken = default)
        {
            var ticket = await _dbContext.FeedbackTickets
                .Include(t => t.Messages.OrderBy(m => m.CreatedAt))
                    .ThenInclude(m => m.Attachments)
                .FirstOrDefaultAsync(t => t.Id == ticketId, cancellationToken);

            if (ticket == null)
            {
                return ApiResponse<FeedbackTicketDto>.Fail("Không tìm thấy bài góp ý.");
            }

            var now = DateTime.UtcNow;
            var hasAdminReply = ticket.Messages.Any(m => m.SenderRole == "ADMIN");
            ticket.Status = hasAdminReply ? "IN_PROGRESS" : "PENDING";
            ticket.AdminSeenAt ??= now;
            ticket.ClosedAt = null;
            ticket.UpdatedAt = now;

            await _dbContext.SaveChangesAsync(cancellationToken);
            return ApiResponse<FeedbackTicketDto>.Ok(MapToDto(ticket), "Đã mở lại bài góp ý để tiếp tục trao đổi.");
        }

        private async Task<string> GenerateUniqueAnonymousCodeAsync(CancellationToken cancellationToken)
        {
            for (var attempt = 0; attempt < 8; attempt++)
            {
                var candidate = $"#ANON-{Random.Shared.Next(1000, 10000)}";
                var exists = await _dbContext.FeedbackTickets
                    .AsNoTracking()
                    .AnyAsync(t => t.AnonymousCode == candidate, cancellationToken);
                if (!exists)
                {
                    return candidate;
                }
            }
            return $"#ANON-{Random.Shared.Next(10000, 99999)}";
        }

        private static void AddAttachmentsToMessage(
            FeedbackMessage message,
            IEnumerable<CreateFeedbackAttachmentInputDto> attachments,
            DateTime now)
        {
            foreach (var att in attachments)
            {
                var fName = string.IsNullOrWhiteSpace(att.FileName) ? "attachment" : att.FileName.Trim();
                if (fName.Length > 260) fName = fName[..260];

                var mime = string.IsNullOrWhiteSpace(att.MimeType) ? "application/octet-stream" : att.MimeType.Trim();
                if (mime.Length > 120) mime = mime[..120];

                var pubId = string.IsNullOrWhiteSpace(att.CloudinaryPublicId)
                    ? "issues/uploaded_file"
                    : att.CloudinaryPublicId.Trim();
                if (pubId.Length > 300) pubId = pubId[..300];

                message.Attachments.Add(new FeedbackAttachment
                {
                    FileName = fName,
                    FileSize = att.FileSize,
                    FileType = string.Equals(att.FileType, "FILE", StringComparison.OrdinalIgnoreCase) ? "FILE" : "IMAGE",
                    MimeType = mime,
                    CloudinaryUrl = att.CloudinaryUrl.Trim(),
                    CloudinaryPublicId = pubId,
                    CreatedAt = now
                });
            }
        }

        private static DateTime SpecifyUtc(DateTime value)
        {
            return value.Kind == DateTimeKind.Local
                ? value.ToUniversalTime()
                : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        }

        private static DateTime? SpecifyUtc(DateTime? value)
        {
            return value.HasValue ? SpecifyUtc(value.Value) : null;
        }

        private static FeedbackTicketDto MapToDto(FeedbackTicket ticket)
        {
            return new FeedbackTicketDto
            {
                Id = ticket.Id,
                AnonymousCode = ticket.AnonymousCode,
                Title = ticket.Title,
                Category = ticket.Category,
                Status = ticket.Status,
                AdminSeenAt = SpecifyUtc(ticket.AdminSeenAt),
                CreatedAt = SpecifyUtc(ticket.CreatedAt),
                UpdatedAt = SpecifyUtc(ticket.UpdatedAt),
                ClosedAt = SpecifyUtc(ticket.ClosedAt),
                Messages = (ticket.Messages ?? Array.Empty<FeedbackMessage>())
                    .OrderBy(m => m.CreatedAt)
                    .ThenBy(m => m.Id)
                    .Select(m => new FeedbackMessageDto
                    {
                        Id = m.Id,
                        TicketId = m.FeedbackTicketId,
                        SenderRole = m.SenderRole,
                        Content = m.Content,
                        CreatedAt = SpecifyUtc(m.CreatedAt),
                        Attachments = (m.Attachments ?? Array.Empty<FeedbackAttachment>())
                            .OrderBy(a => a.Id)
                            .Select(a => new FeedbackAttachmentDto
                            {
                                Id = a.Id,
                                FileName = a.FileName,
                                FileSize = a.FileSize,
                                FileType = a.FileType,
                                MimeType = a.MimeType,
                                CloudinaryUrl = a.CloudinaryUrl,
                                CloudinaryPublicId = a.CloudinaryPublicId
                            })
                            .ToList()
                    })
                    .ToList()
            };
        }
    }
}
