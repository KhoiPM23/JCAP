using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.Data.Static;
using JCAP.DTOs.Common;
using JCAP.DTOs.Community;
using JCAP.Models;
using JCAP.Services.Helpers;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/community")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class CommunityController : ControllerBase
    {
        private static readonly HashSet<string> AllowedChannels = new(StringComparer.OrdinalIgnoreCase)
        {
            "QA_JAPANESE",
            "SPEAKING_TIPS",
            "STUDY_BUDDY",
            "RESOURCES",
            "LOUNGE"
        };

        private readonly AppDbContext _context;
        private readonly string? _cloudinaryCloudName;
        private readonly string _anonHashSecret;

        public CommunityController(AppDbContext context, IConfiguration? configuration = null)
        {
            _context = context;
            _cloudinaryCloudName = configuration?["Cloudinary:CloudName"];
            _anonHashSecret = configuration?["Jwt:Key"] ?? "JCAP_Community_Anon_Salt_v1";
        }

        private sealed class ResolvedActor
        {
            public string UserId { get; set; } = string.Empty;
            public string DisplayName { get; set; } = "Học viên JCAP";
            public string? AvatarUrl { get; set; }
            public string Level { get; set; } = "N5";
            public string Role { get; set; } = "LEARNER";
            public bool IsAdmin { get; set; }
        }

        private string? GetClaimUserId()
        {
            if (User.Identity?.IsAuthenticated != true)
            {
                return null;
            }

            return User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("nameid")
                ?? User.FindFirstValue("sub");
        }

        private async Task<ResolvedActor?> ResolveActorAsync(CancellationToken cancellationToken)
        {
            var userId = GetClaimUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return null;
            }

            var dbUser = await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);

            if (dbUser == null || !dbUser.IsActive)
            {
                return null;
            }

            var isAdmin = User.IsInRole(UserRoles.Admin)
                || string.Equals(dbUser.Role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase);

            var displayName = !string.IsNullOrWhiteSpace(dbUser.FullName)
                ? dbUser.FullName!
                : !string.IsNullOrWhiteSpace(dbUser.Email)
                ? dbUser.Email!.Split('@')[0]
                : "Học viên JCAP";

            var level = !string.IsNullOrWhiteSpace(dbUser.JLPTLevel)
                ? dbUser.JLPTLevel
                : "N5";
            if (level.Length > 20)
            {
                level = level[..20];
            }

            var avatar = dbUser.ProfilePictureUrl;
            if (avatar != null && avatar.Length > 500)
            {
                avatar = avatar[..500];
            }

            return new ResolvedActor
            {
                UserId = dbUser.Id,
                DisplayName = displayName.Length > 140 ? displayName[..140] : displayName,
                AvatarUrl = avatar,
                Level = isAdmin ? "ADMIN" : level,
                Role = isAdmin ? "ADMIN" : "LEARNER",
                IsAdmin = isAdmin
            };
        }

        private static bool TryParsePostId(string rawId, out int postId)
        {
            if (int.TryParse(rawId, out postId) && postId > 0)
            {
                return true;
            }

            postId = 0;
            return false;
        }

        private int ComputeStableAnonSuffix(string userId)
        {
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_anonHashSecret));
            var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(userId));
            var value = BitConverter.ToUInt32(hash, 0);
            return (int)(value % 9000) + 1000;
        }

        [HttpGet("posts")]
        [AllowAnonymous]
        public async Task<IActionResult> GetPosts(CancellationToken cancellationToken)
        {
            var currentUserId = GetClaimUserId();

            var posts = await _context.CommunityPosts
                .AsNoTracking()
                .Include(p => p.Attachments)
                .Include(p => p.PostUpvotes)
                .Include(p => p.Comments)
                    .ThenInclude(c => c.Attachments)
                .OrderByDescending(p => p.IsPinned)
                .ThenByDescending(p => p.CreatedAt)
                .ToListAsync(cancellationToken);

            var result = posts.Select(p => MapPostToDto(p, currentUserId)).ToList();
            return Ok(ApiResponse<List<CommunityPostDto>>.Ok(result));
        }

        [HttpGet("posts/{id}")]
        [AllowAnonymous]
        public async Task<IActionResult> GetPostById(string id, CancellationToken cancellationToken)
        {
            if (!TryParsePostId(id, out var postId))
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var currentUserId = GetClaimUserId();

            var post = await _context.CommunityPosts
                .Include(p => p.Attachments)
                .Include(p => p.PostUpvotes)
                .Include(p => p.Comments)
                    .ThenInclude(c => c.Attachments)
                .FirstOrDefaultAsync(p => p.Id == postId, cancellationToken);

            if (post == null)
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            post.Views += 1;
            await _context.SaveChangesAsync(cancellationToken);

            return Ok(ApiResponse<CommunityPostDto>.Ok(MapPostToDto(post, currentUserId)));
        }

        [HttpPost("posts")]
        [EnableRateLimiting("community-write")]
        public async Task<IActionResult> CreatePost(
            [FromBody] CreateCommunityPostRequest request,
            CancellationToken cancellationToken)
        {
            var actor = await ResolveActorAsync(cancellationToken);
            if (actor == null)
            {
                return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại."));
            }

            var cleanTitle = (request.Title ?? string.Empty).Trim();
            var cleanContent = (request.Content ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(cleanTitle) || string.IsNullOrWhiteSpace(cleanContent))
            {
                return BadRequest(ApiResponse<object>.Fail("Vui lòng nhập đầy đủ tiêu đề và nội dung bài thảo luận."));
            }
            if (cleanTitle.Length > 300)
            {
                return BadRequest(ApiResponse<object>.Fail("Tiêu đề bài viết không được vượt quá 300 ký tự."));
            }
            if (cleanContent.Length > AttachmentSecurityHelper.MaxPostContentLength)
            {
                return BadRequest(ApiResponse<object>.Fail(
                    $"Nội dung bài viết không được vượt quá {AttachmentSecurityHelper.MaxPostContentLength} ký tự."));
            }

            var rawChannel = string.IsNullOrWhiteSpace(request.Channel) ? "QA_JAPANESE" : request.Channel.Trim();
            if (!AllowedChannels.Contains(rawChannel))
            {
                return BadRequest(ApiResponse<object>.Fail("Chuyên mục bài viết không hợp lệ."));
            }
            var normalizedChannel = rawChannel.ToUpperInvariant();

            var rawAttachments = request.Attachments ?? new List<CommunityAttachmentDto>();
            if (rawAttachments.Count > AttachmentSecurityHelper.MaxAttachmentsPerItem)
            {
                return BadRequest(ApiResponse<object>.Fail(
                    $"Chỉ được đính kèm tối đa {AttachmentSecurityHelper.MaxAttachmentsPerItem} tệp cho mỗi bài viết."));
            }

            if (rawAttachments.Any(a => !AttachmentSecurityHelper.IsAllowedAttachmentUrl(a.Url, _cloudinaryCloudName)))
            {
                return BadRequest(ApiResponse<object>.Fail("Đường dẫn tệp đính kèm không hợp lệ."));
            }

            var isAnon = request.IsAnonymous && !actor.IsAdmin;
            string displayName;
            string? avatarUrl = null;
            if (isAnon)
            {
                var suffix = ComputeStableAnonSuffix(actor.UserId);
                displayName = $"Thành viên ẩn danh #{suffix}";
            }
            else
            {
                displayName = actor.DisplayName;
                avatarUrl = actor.AvatarUrl;
            }

            var now = DateTime.UtcNow;
            var post = new CommunityPost
            {
                AuthorUserId = actor.UserId,
                AuthorDisplayName = displayName,
                AuthorAvatarUrl = avatarUrl,
                AuthorLevel = actor.Level,
                AuthorRole = actor.Role,
                IsAnonymous = isAnon,
                Channel = normalizedChannel,
                Title = cleanTitle,
                Content = cleanContent,
                IsPinned = false,
                IsSolved = false,
                Upvotes = 1,
                Views = 1,
                CreatedAt = now,
                UpdatedAt = now
            };

            post.PostUpvotes.Add(new CommunityPostUpvote
            {
                UserId = actor.UserId,
                CreatedAt = now
            });

            foreach (var att in rawAttachments)
            {
                var fName = string.IsNullOrWhiteSpace(att.Name) ? "attachment" : att.Name.Trim();
                if (fName.Length > 250) fName = fName[..250];

                post.Attachments.Add(new CommunityAttachment
                {
                    FileName = fName,
                    FileSize = att.Size,
                    FileType = string.Equals(att.Type, "FILE", StringComparison.OrdinalIgnoreCase) ? "FILE" : "IMAGE",
                    Url = att.Url!.Trim(),
                    CreatedAt = now
                });
            }

            _context.CommunityPosts.Add(post);
            await _context.SaveChangesAsync(cancellationToken);

            return Ok(ApiResponse<CommunityPostDto>.Ok(
                MapPostToDto(post, actor.UserId),
                "Đã đăng bài thảo luận lên diễn đàn cộng đồng."));
        }

        [HttpPost("posts/{id}/comments")]
        [EnableRateLimiting("community-write")]
        public async Task<IActionResult> AddComment(
            string id,
            [FromBody] CreateCommunityCommentRequest request,
            CancellationToken cancellationToken)
        {
            if (!TryParsePostId(id, out var postId))
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var actor = await ResolveActorAsync(cancellationToken);
            if (actor == null)
            {
                return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại."));
            }

            var post = await _context.CommunityPosts
                .Include(p => p.Attachments)
                .Include(p => p.PostUpvotes)
                .Include(p => p.Comments)
                    .ThenInclude(c => c.Attachments)
                .FirstOrDefaultAsync(p => p.Id == postId, cancellationToken);

            if (post == null)
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var rawAttachments = request.Attachments ?? new List<CommunityAttachmentDto>();
            if (rawAttachments.Count > AttachmentSecurityHelper.MaxAttachmentsPerItem)
            {
                return BadRequest(ApiResponse<object>.Fail(
                    $"Chỉ được đính kèm tối đa {AttachmentSecurityHelper.MaxAttachmentsPerItem} tệp cho mỗi bình luận."));
            }

            if (rawAttachments.Any(a => !AttachmentSecurityHelper.IsAllowedAttachmentUrl(a.Url, _cloudinaryCloudName)))
            {
                return BadRequest(ApiResponse<object>.Fail("Đường dẫn tệp đính kèm không hợp lệ."));
            }

            var hasContent = !string.IsNullOrWhiteSpace(request.Content);
            if (!hasContent && rawAttachments.Count == 0)
            {
                return BadRequest(ApiResponse<object>.Fail("Vui lòng nhập nội dung bình luận hoặc đính kèm ít nhất 1 tệp/ảnh."));
            }

            var cleanContent = hasContent ? request.Content.Trim() : "(Đính kèm tệp/ảnh)";
            if (cleanContent.Length > AttachmentSecurityHelper.MaxCommentContentLength)
            {
                return BadRequest(ApiResponse<object>.Fail(
                    $"Nội dung bình luận không được vượt quá {AttachmentSecurityHelper.MaxCommentContentLength} ký tự."));
            }

            int? parentId = null;
            if (!string.IsNullOrWhiteSpace(request.ParentCommentId))
            {
                if (!int.TryParse(request.ParentCommentId, out var parsedParent))
                {
                    return BadRequest(ApiResponse<object>.Fail("Bình luận cha không hợp lệ."));
                }

                var parentComment = post.Comments.FirstOrDefault(c => c.Id == parsedParent);
                if (parentComment == null)
                {
                    return BadRequest(ApiResponse<object>.Fail("Không tìm thấy bình luận cha trong bài viết này."));
                }

                // Giữ cấu trúc tối đa 2 cấp để bình luận không bị ẩn khỏi giao diện
                parentId = parentComment.ParentCommentId ?? parentComment.Id;
            }

            var isAnon = request.IsAnonymous && !actor.IsAdmin;
            string displayName;
            string? avatarUrl = null;
            if (isAnon)
            {
                var suffix = ComputeStableAnonSuffix(actor.UserId);
                displayName = $"Thành viên ẩn danh #{suffix}";
            }
            else
            {
                displayName = actor.DisplayName;
                avatarUrl = actor.AvatarUrl;
            }

            var now = DateTime.UtcNow;
            var comment = new CommunityComment
            {
                CommunityPostId = post.Id,
                ParentCommentId = parentId,
                AuthorUserId = actor.UserId,
                AuthorDisplayName = displayName,
                AuthorAvatarUrl = avatarUrl,
                AuthorLevel = actor.Level,
                AuthorRole = actor.Role,
                IsAnonymous = isAnon,
                Content = cleanContent,
                Upvotes = 0,
                IsAcceptedAnswer = false,
                CreatedAt = now
            };

            foreach (var att in rawAttachments)
            {
                var fName = string.IsNullOrWhiteSpace(att.Name) ? "attachment" : att.Name.Trim();
                if (fName.Length > 250) fName = fName[..250];

                comment.Attachments.Add(new CommunityAttachment
                {
                    FileName = fName,
                    FileSize = att.Size,
                    FileType = string.Equals(att.Type, "FILE", StringComparison.OrdinalIgnoreCase) ? "FILE" : "IMAGE",
                    Url = att.Url!.Trim(),
                    CreatedAt = now
                });
            }

            _context.CommunityComments.Add(comment);
            post.UpdatedAt = now;
            await _context.SaveChangesAsync(cancellationToken);

            if (!post.Comments.Any(c => c.Id == comment.Id))
            {
                post.Comments.Add(comment);
            }

            return Ok(ApiResponse<CommunityPostDto>.Ok(
                MapPostToDto(post, actor.UserId),
                "Đã gửi bình luận."));
        }

        [HttpPost("posts/{id}/upvote")]
        [EnableRateLimiting("community-write")]
        public async Task<IActionResult> ToggleUpvote(string id, CancellationToken cancellationToken)
        {
            if (!TryParsePostId(id, out var postId))
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var actor = await ResolveActorAsync(cancellationToken);
            if (actor == null)
            {
                return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ."));
            }

            var post = await _context.CommunityPosts
                .Include(p => p.Attachments)
                .Include(p => p.PostUpvotes)
                .Include(p => p.Comments)
                    .ThenInclude(c => c.Attachments)
                .FirstOrDefaultAsync(p => p.Id == postId, cancellationToken);

            if (post == null)
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var existingUpvote = post.PostUpvotes.FirstOrDefault(
                u => string.Equals(u.UserId, actor.UserId, StringComparison.OrdinalIgnoreCase));
            if (existingUpvote != null)
            {
                _context.CommunityPostUpvotes.Remove(existingUpvote);
                post.PostUpvotes.Remove(existingUpvote);
                post.Upvotes = Math.Max(0, post.Upvotes - 1);
            }
            else
            {
                var upvote = new CommunityPostUpvote
                {
                    CommunityPostId = post.Id,
                    UserId = actor.UserId,
                    CreatedAt = DateTime.UtcNow
                };
                _context.CommunityPostUpvotes.Add(upvote);
                post.PostUpvotes.Add(upvote);
                post.Upvotes += 1;
            }

            await _context.SaveChangesAsync(cancellationToken);

            return Ok(ApiResponse<CommunityPostDto>.Ok(MapPostToDto(post, actor.UserId)));
        }

        [HttpPost("posts/{id}/toggle-solved")]
        [EnableRateLimiting("community-write")]
        public async Task<IActionResult> ToggleSolved(string id, CancellationToken cancellationToken)
        {
            if (!TryParsePostId(id, out var postId))
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var actor = await ResolveActorAsync(cancellationToken);
            if (actor == null)
            {
                return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ."));
            }

            var post = await _context.CommunityPosts
                .Include(p => p.Attachments)
                .Include(p => p.PostUpvotes)
                .Include(p => p.Comments)
                    .ThenInclude(c => c.Attachments)
                .FirstOrDefaultAsync(p => p.Id == postId, cancellationToken);

            if (post == null)
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            if (!string.Equals(post.AuthorUserId, actor.UserId, StringComparison.OrdinalIgnoreCase) && !actor.IsAdmin)
            {
                return StatusCode(403, ApiResponse<object>.Fail("Chỉ tác giả bài viết hoặc Admin mới có quyền cập nhật trạng thái giải đáp."));
            }

            post.IsSolved = !post.IsSolved;
            await _context.SaveChangesAsync(cancellationToken);

            return Ok(ApiResponse<CommunityPostDto>.Ok(MapPostToDto(post, actor.UserId)));
        }

        [HttpPost("posts/{id}/toggle-pin")]
        [EnableRateLimiting("community-write")]
        public async Task<IActionResult> TogglePin(string id, CancellationToken cancellationToken)
        {
            if (!TryParsePostId(id, out var postId))
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var actor = await ResolveActorAsync(cancellationToken);
            if (actor == null)
            {
                return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ."));
            }
            if (!actor.IsAdmin)
            {
                return StatusCode(403, ApiResponse<object>.Fail("Chỉ Admin mới có quyền ghim bài viết."));
            }

            var post = await _context.CommunityPosts
                .Include(p => p.Attachments)
                .Include(p => p.PostUpvotes)
                .Include(p => p.Comments)
                    .ThenInclude(c => c.Attachments)
                .FirstOrDefaultAsync(p => p.Id == postId, cancellationToken);

            if (post == null)
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            post.IsPinned = !post.IsPinned;
            await _context.SaveChangesAsync(cancellationToken);

            return Ok(ApiResponse<CommunityPostDto>.Ok(MapPostToDto(post, actor.UserId)));
        }

        [HttpDelete("posts/{id}")]
        [EnableRateLimiting("community-write")]
        public async Task<IActionResult> DeletePost(string id, CancellationToken cancellationToken)
        {
            if (!TryParsePostId(id, out var postId))
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var actor = await ResolveActorAsync(cancellationToken);
            if (actor == null)
            {
                return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ."));
            }

            var post = await _context.CommunityPosts
                .Include(p => p.Attachments)
                .Include(p => p.PostUpvotes)
                .Include(p => p.Comments)
                    .ThenInclude(c => c.Attachments)
                .FirstOrDefaultAsync(p => p.Id == postId, cancellationToken);

            if (post == null)
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            if (!string.Equals(post.AuthorUserId, actor.UserId, StringComparison.OrdinalIgnoreCase) && !actor.IsAdmin)
            {
                return StatusCode(403, ApiResponse<object>.Fail("Bạn không có quyền xóa bài thảo luận này."));
            }

            // FK_CommunityAttachments_CommunityComments_CommunityCommentId dùng ON DELETE NO ACTION,
            // nên cần xóa tệp đính kèm của bình luận trước khi xóa bài viết để tránh lỗi khóa ngoại 500.
            var commentAttachments = post.Comments.SelectMany(c => c.Attachments).ToList();
            if (commentAttachments.Count > 0)
            {
                _context.CommunityAttachments.RemoveRange(commentAttachments);
            }

            _context.CommunityPosts.Remove(post);
            await _context.SaveChangesAsync(cancellationToken);

            return Ok(ApiResponse<object>.Ok(new { id = postId }, "Đã xóa bài thảo luận."));
        }

        [HttpDelete("comments/{commentId:int}")]
        [EnableRateLimiting("community-write")]
        public async Task<IActionResult> DeleteComment(int commentId, CancellationToken cancellationToken)
        {
            var actor = await ResolveActorAsync(cancellationToken);
            if (actor == null)
            {
                return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ."));
            }

            var targetComment = await _context.CommunityComments
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == commentId, cancellationToken);
            if (targetComment == null)
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bình luận."));
            }

            var post = await _context.CommunityPosts
                .Include(p => p.Attachments)
                .Include(p => p.PostUpvotes)
                .Include(p => p.Comments)
                    .ThenInclude(c => c.Attachments)
                .FirstOrDefaultAsync(p => p.Id == targetComment.CommunityPostId, cancellationToken);

            if (post == null)
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var commentEntity = post.Comments.FirstOrDefault(c => c.Id == commentId);
            if (commentEntity == null)
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bình luận."));
            }

            if (!string.Equals(commentEntity.AuthorUserId, actor.UserId, StringComparison.OrdinalIgnoreCase) && !actor.IsAdmin)
            {
                return StatusCode(403, ApiResponse<object>.Fail("Bạn không có quyền xóa bình luận này."));
            }

            var toDelete = post.Comments
                .Where(c => c.Id == commentId || c.ParentCommentId == commentId)
                .ToList();

            var commentAttachments = toDelete.SelectMany(c => c.Attachments).ToList();
            if (commentAttachments.Count > 0)
            {
                _context.CommunityAttachments.RemoveRange(commentAttachments);
            }

            _context.CommunityComments.RemoveRange(toDelete);
            foreach (var c in toDelete)
            {
                post.Comments.Remove(c);
            }

            await _context.SaveChangesAsync(cancellationToken);

            return Ok(ApiResponse<CommunityPostDto>.Ok(
                MapPostToDto(post, actor.UserId),
                "Đã xóa bình luận."));
        }

        private static DateTime SpecifyUtc(DateTime value)
        {
            return value.Kind == DateTimeKind.Local
                ? value.ToUniversalTime()
                : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        }

        private static CommunityPostDto MapPostToDto(CommunityPost post, string? currentUserId)
        {
            var isOwnPost = !string.IsNullOrWhiteSpace(currentUserId)
                && string.Equals(post.AuthorUserId, currentUserId, StringComparison.OrdinalIgnoreCase);

            var upvotedByMe = !string.IsNullOrWhiteSpace(currentUserId)
                && post.PostUpvotes.Any(u => string.Equals(u.UserId, currentUserId, StringComparison.OrdinalIgnoreCase));

            return new CommunityPostDto
            {
                Id = post.Id.ToString(),
                Channel = post.Channel,
                Title = post.Title,
                Content = post.Content,
                AuthorId = post.IsAnonymous && !isOwnPost ? $"anon-{post.Id}" : post.AuthorUserId,
                AuthorName = post.AuthorDisplayName,
                AuthorAvatar = post.IsAnonymous ? null : post.AuthorAvatarUrl,
                AuthorLevel = post.AuthorLevel,
                AuthorRole = post.AuthorRole,
                IsAnonymous = post.IsAnonymous,
                IsOwnPost = isOwnPost,
                CreatedAt = SpecifyUtc(post.CreatedAt),
                UpdatedAt = SpecifyUtc(post.UpdatedAt),
                IsPinned = post.IsPinned,
                IsSolved = post.IsSolved,
                Upvotes = post.Upvotes,
                UpvotedByMe = upvotedByMe,
                Views = post.Views,
                Attachments = post.Attachments
                    .GroupBy(a => a.Id)
                    .Select(g => g.First())
                    .OrderBy(a => a.Id)
                    .Select(a => new CommunityAttachmentDto
                    {
                        Id = a.Id.ToString(),
                        Name = a.FileName,
                        Size = a.FileSize,
                        Type = a.FileType,
                        Url = a.Url
                    })
                    .ToList(),
                Comments = post.Comments
                    .GroupBy(c => c.Id)
                    .Select(g => g.First())
                    .OrderBy(c => c.CreatedAt)
                    .Select(c =>
                    {
                        var isOwnComment = !string.IsNullOrWhiteSpace(currentUserId)
                            && string.Equals(c.AuthorUserId, currentUserId, StringComparison.OrdinalIgnoreCase);

                        return new CommunityCommentDto
                        {
                            Id = c.Id.ToString(),
                            PostId = post.Id.ToString(),
                            ParentCommentId = c.ParentCommentId?.ToString(),
                            AuthorId = c.IsAnonymous && !isOwnComment ? $"anon-cmt-{c.Id}" : c.AuthorUserId,
                            AuthorName = c.AuthorDisplayName,
                            AuthorAvatar = c.IsAnonymous ? null : c.AuthorAvatarUrl,
                            AuthorLevel = c.AuthorLevel,
                            AuthorRole = c.AuthorRole,
                            IsAnonymous = c.IsAnonymous,
                            IsOwnComment = isOwnComment,
                            Content = c.Content,
                            CreatedAt = SpecifyUtc(c.CreatedAt),
                            Upvotes = c.Upvotes,
                            UpvotedByMe = false,
                            IsAcceptedAnswer = c.IsAcceptedAnswer,
                            Attachments = c.Attachments
                                .OrderBy(a => a.Id)
                                .Select(a => new CommunityAttachmentDto
                                {
                                    Id = a.Id.ToString(),
                                    Name = a.FileName,
                                    Size = a.FileSize,
                                    Type = a.FileType,
                                    Url = a.Url
                                })
                                .ToList()
                        };
                    })
                    .ToList()
            };
        }
    }
}
