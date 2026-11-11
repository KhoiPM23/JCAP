using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Community
{
    public class CommunityAttachmentDto
    {
        public string? Id { get; set; }
        public string? Name { get; set; }
        public long Size { get; set; }
        public string? Type { get; set; } = "IMAGE"; // IMAGE | FILE
        public string? Url { get; set; }
    }

    public class CommunityCommentDto
    {
        public string Id { get; set; } = string.Empty;
        public string PostId { get; set; } = string.Empty;
        public string? ParentCommentId { get; set; }
        public string AuthorId { get; set; } = string.Empty;
        public string AuthorName { get; set; } = string.Empty;
        public string? AuthorAvatar { get; set; }
        public string AuthorLevel { get; set; } = "N5";
        public string AuthorRole { get; set; } = "LEARNER";
        public bool IsAnonymous { get; set; }
        public bool IsOwnComment { get; set; }
        public string Content { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public int Upvotes { get; set; }
        public bool UpvotedByMe { get; set; }
        public bool IsAcceptedAnswer { get; set; }
        public List<CommunityAttachmentDto> Attachments { get; set; } = new();
    }

    public class CommunityPostDto
    {
        public string Id { get; set; } = string.Empty;
        public string Channel { get; set; } = "QA_JAPANESE";
        public string Title { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public string AuthorId { get; set; } = string.Empty;
        public string AuthorName { get; set; } = string.Empty;
        public string? AuthorAvatar { get; set; }
        public string AuthorLevel { get; set; } = "N5";
        public string AuthorRole { get; set; } = "LEARNER";
        public bool IsAnonymous { get; set; }
        public bool IsOwnPost { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public bool IsPinned { get; set; }
        public bool IsSolved { get; set; }
        public int Upvotes { get; set; }
        public bool UpvotedByMe { get; set; }
        public int Views { get; set; }
        public List<CommunityAttachmentDto> Attachments { get; set; } = new();
        public List<CommunityCommentDto> Comments { get; set; } = new();
    }

    public class CreateCommunityPostRequest
    {
        public string? Channel { get; set; } = "QA_JAPANESE";

        [Required]
        public string Title { get; set; } = string.Empty;

        [Required]
        public string Content { get; set; } = string.Empty;

        public bool IsAnonymous { get; set; }

        public string? AuthorId { get; set; }
        public string? AuthorEmail { get; set; }
        public string? AuthorName { get; set; }
        public string? AuthorLevel { get; set; }
        public string? AuthorRole { get; set; }
        public string? AuthorAvatar { get; set; }

        public List<CommunityAttachmentDto>? Attachments { get; set; }
    }

    public class CreateCommunityCommentRequest
    {
        public string? ParentCommentId { get; set; }

        [Required]
        public string Content { get; set; } = string.Empty;

        public bool IsAnonymous { get; set; }

        public string? AuthorId { get; set; }
        public string? AuthorEmail { get; set; }
        public string? AuthorName { get; set; }
        public string? AuthorLevel { get; set; }
        public string? AuthorRole { get; set; }
        public string? AuthorAvatar { get; set; }

        public List<CommunityAttachmentDto>? Attachments { get; set; }
    }
}
