using System;
using System.Collections.Generic;

namespace JCAP.Models
{
    public class CommunityPost
    {
        public int Id { get; set; }

        public string AuthorUserId { get; set; } = string.Empty;

        /// <summary>
        /// Tên hiển thị khi đăng (Tên thật hoặc "Thành viên ẩn danh #xxxx" nếu IsAnonymous = true)
        /// </summary>
        public string AuthorDisplayName { get; set; } = string.Empty;
        public string? AuthorAvatarUrl { get; set; }
        public string AuthorLevel { get; set; } = "N5";
        public string AuthorRole { get; set; } = "LEARNER";
        public bool IsAnonymous { get; set; }

        /// <summary>
        /// QA_JAPANESE | SPEAKING_TIPS | STUDY_BUDDY | RESOURCES | LOUNGE
        /// </summary>
        public string Channel { get; set; } = "QA_JAPANESE";

        public string Title { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;

        public bool IsPinned { get; set; }
        public bool IsSolved { get; set; }
        public int Upvotes { get; set; }
        public int Views { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<CommunityComment> Comments { get; set; } = new List<CommunityComment>();
        public ICollection<CommunityAttachment> Attachments { get; set; } = new List<CommunityAttachment>();
        public ICollection<CommunityPostUpvote> PostUpvotes { get; set; } = new List<CommunityPostUpvote>();
    }

    public class CommunityComment
    {
        public int Id { get; set; }

        public int CommunityPostId { get; set; }
        public CommunityPost? CommunityPost { get; set; }

        public int? ParentCommentId { get; set; }

        public string AuthorUserId { get; set; } = string.Empty;
        public string AuthorDisplayName { get; set; } = string.Empty;
        public string? AuthorAvatarUrl { get; set; }
        public string AuthorLevel { get; set; } = "N5";
        public string AuthorRole { get; set; } = "LEARNER";
        public bool IsAnonymous { get; set; }

        public string Content { get; set; } = string.Empty;
        public int Upvotes { get; set; }
        public bool IsAcceptedAnswer { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<CommunityAttachment> Attachments { get; set; } = new List<CommunityAttachment>();
    }

    public class CommunityAttachment
    {
        public int Id { get; set; }

        public int? CommunityPostId { get; set; }
        public CommunityPost? CommunityPost { get; set; }

        public int? CommunityCommentId { get; set; }
        public CommunityComment? CommunityComment { get; set; }

        public string FileName { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public string FileType { get; set; } = "IMAGE"; // IMAGE | FILE
        public string Url { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class CommunityPostUpvote
    {
        public int Id { get; set; }
        public int CommunityPostId { get; set; }
        public CommunityPost? CommunityPost { get; set; }
        public string UserId { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
