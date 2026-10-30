using System;

namespace JCAP.Models
{
    public class FeedbackAttachment
    {
        public int Id { get; set; }

        public int FeedbackMessageId { get; set; }
        public FeedbackMessage? FeedbackMessage { get; set; }

        public string FileName { get; set; } = string.Empty;
        public long FileSize { get; set; }

        /// <summary>
        /// IMAGE | FILE
        /// </summary>
        public string FileType { get; set; } = "IMAGE";

        public string MimeType { get; set; } = string.Empty;

        /// <summary>
        /// Đường dẫn file/ảnh được lưu trên Cloudinary (folder: issues/)
        /// </summary>
        public string CloudinaryUrl { get; set; } = string.Empty;

        /// <summary>
        /// Public ID trên Cloudinary (VD: issues/screenshot_xyz)
        /// </summary>
        public string CloudinaryPublicId { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}

