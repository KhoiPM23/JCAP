using System;
using System.Collections.Generic;

namespace JCAP.Models
{
    public class FeedbackMessage
    {
        public int Id { get; set; }

        public int FeedbackTicketId { get; set; }
        public FeedbackTicket? FeedbackTicket { get; set; }

        /// <summary>
        /// LEARNER | ADMIN
        /// </summary>
        public string SenderRole { get; set; } = "LEARNER";

        /// <summary>
        /// Nội dung văn bản của tin nhắn (lưu trực tiếp trong Database)
        /// </summary>
        public string Content { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<FeedbackAttachment> Attachments { get; set; } = new List<FeedbackAttachment>();
    }
}

