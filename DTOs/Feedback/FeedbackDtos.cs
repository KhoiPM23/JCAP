using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Feedback
{
    public class FeedbackAttachmentDto
    {
        public int Id { get; set; }
        public string FileName { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public string FileType { get; set; } = "IMAGE";
        public string MimeType { get; set; } = string.Empty;
        public string CloudinaryUrl { get; set; } = string.Empty;
        public string CloudinaryPublicId { get; set; } = string.Empty;
    }

    public class FeedbackMessageDto
    {
        public int Id { get; set; }
        public int TicketId { get; set; }
        public string SenderRole { get; set; } = "LEARNER";
        public string Content { get; set; } = string.Empty;
        public List<FeedbackAttachmentDto> Attachments { get; set; } = new();
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// DTO trả về cho cả Học viên và Admin.
    /// Lưu ý bảo mật: Tuyệt đối KHÔNG chứa UserId, Email hay Họ tên của Học viên để đảm bảo ẩn danh 100%.
    /// </summary>
    public class FeedbackTicketDto
    {
        public int Id { get; set; }
        public string AnonymousCode { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Category { get; set; } = "SUGGESTION";
        public string Status { get; set; } = "PENDING";
        public DateTime? AdminSeenAt { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public DateTime? ClosedAt { get; set; }
        public List<FeedbackMessageDto> Messages { get; set; } = new();
    }

    public class CreateFeedbackAttachmentInputDto
    {
        [Required]
        public string FileName { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public string FileType { get; set; } = "IMAGE";
        public string MimeType { get; set; } = string.Empty;
        [Required]
        public string CloudinaryUrl { get; set; } = string.Empty;
        public string CloudinaryPublicId { get; set; } = string.Empty;
    }

    public class CreateFeedbackTicketDto
    {
        [Required(ErrorMessage = "Tiêu đề bài góp ý không được để trống.")]
        [MaxLength(300)]
        public string Title { get; set; } = string.Empty;

        [Required]
        [MaxLength(50)]
        public string Category { get; set; } = "SUGGESTION";

        [Required(ErrorMessage = "Nội dung chi tiết không được để trống.")]
        public string Content { get; set; } = string.Empty;

        public List<CreateFeedbackAttachmentInputDto> Attachments { get; set; } = new();
    }

    public class ReplyFeedbackTicketDto
    {
        public string Content { get; set; } = string.Empty;
        public List<CreateFeedbackAttachmentInputDto> Attachments { get; set; } = new();
    }
}

