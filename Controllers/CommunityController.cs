using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.Data.Seeds;
using JCAP.DTOs.Common;
using JCAP.DTOs.Community;
using JCAP.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/community")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class CommunityController : ControllerBase
    {
        private static bool _tablesVerified;
        private readonly AppDbContext _context;

        public CommunityController(AppDbContext context)
        {
            _context = context;
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
            return User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("nameid")
                ?? User.FindFirstValue("sub")
                ?? Request.Headers["X-User-Id"].FirstOrDefault();
        }

        private string? GetClaimUserEmail()
        {
            return User.FindFirstValue(ClaimTypes.Email)
                ?? User.FindFirstValue("email")
                ?? Request.Headers["X-User-Email"].FirstOrDefault();
        }

        private async Task<string?> ResolveCurrentUserIdAsync(CancellationToken cancellationToken)
        {
            var claimId = GetClaimUserId();
            var claimEmail = GetClaimUserEmail();

            if (!string.IsNullOrWhiteSpace(claimId))
            {
                var existsById = await _context.Users
                    .AsNoTracking()
                    .AnyAsync(u => u.Id == claimId, cancellationToken);
                if (existsById)
                {
                    return claimId;
                }
            }

            if (!string.IsNullOrWhiteSpace(claimEmail))
            {
                var userByEmail = await _context.Users
                    .AsNoTracking()
                    .FirstOrDefaultAsync(u => u.Email == claimEmail, cancellationToken);
                if (userByEmail != null)
                {
                    return userByEmail.Id;
                }
            }

            return claimId;
        }

        private async Task<ResolvedActor?> ResolveActorAsync(
            string? fallbackId,
            string? fallbackEmail,
            string? fallbackName,
            string? fallbackLevel,
            string? fallbackRole,
            string? fallbackAvatar,
            CancellationToken cancellationToken)
        {
            var candidateId = GetClaimUserId() ?? fallbackId;
            var candidateEmail = GetClaimUserEmail() ?? fallbackEmail;

            ApplicationUser? dbUser = null;

            if (!string.IsNullOrWhiteSpace(candidateId))
            {
                dbUser = await _context.Users
                    .AsNoTracking()
                    .FirstOrDefaultAsync(u => u.Id == candidateId, cancellationToken);
            }

            if (dbUser == null && !string.IsNullOrWhiteSpace(candidateEmail))
            {
                dbUser = await _context.Users
                    .AsNoTracking()
                    .FirstOrDefaultAsync(u => u.Email == candidateEmail, cancellationToken);
            }

            var claimRole = User.FindFirstValue(ClaimTypes.Role)
                ?? User.FindFirstValue("role")
                ?? fallbackRole;

            var isAdmin = User.IsInRole("Admin")
                || string.Equals(claimRole, "Admin", StringComparison.OrdinalIgnoreCase)
                || string.Equals(dbUser?.Role, "Admin", StringComparison.OrdinalIgnoreCase);

            var finalUserId = dbUser?.Id
                ?? (!string.IsNullOrWhiteSpace(candidateId) ? candidateId! : null)
                ?? (!string.IsNullOrWhiteSpace(candidateEmail) ? candidateEmail! : null);

            if (string.IsNullOrWhiteSpace(finalUserId))
            {
                return null;
            }

            var claimName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("unique_name");
            var displayName = !string.IsNullOrWhiteSpace(dbUser?.FullName)
                ? dbUser!.FullName!
                : !string.IsNullOrWhiteSpace(fallbackName)
                ? fallbackName!
                : !string.IsNullOrWhiteSpace(claimName)
                ? claimName!
                : !string.IsNullOrWhiteSpace(dbUser?.Email)
                ? dbUser!.Email!.Split('@')[0]
                : !string.IsNullOrWhiteSpace(candidateEmail)
                ? candidateEmail!.Split('@')[0]
                : "Học viên JCAP";

            var level = !string.IsNullOrWhiteSpace(dbUser?.JLPTLevel)
                ? dbUser!.JLPTLevel
                : !string.IsNullOrWhiteSpace(fallbackLevel)
                ? fallbackLevel!
                : "N5";

            var avatar = !string.IsNullOrWhiteSpace(dbUser?.ProfilePictureUrl)
                ? dbUser!.ProfilePictureUrl
                : fallbackAvatar;

            if (avatar != null && avatar.Length > 500)
            {
                avatar = avatar.Substring(0, 500);
            }

            return new ResolvedActor
            {
                UserId = finalUserId,
                DisplayName = displayName.Length > 140 ? displayName.Substring(0, 140) : displayName,
                AvatarUrl = avatar,
                Level = isAdmin ? "ADMIN" : level,
                Role = isAdmin ? "ADMIN" : "LEARNER",
                IsAdmin = isAdmin
            };
        }

        private static bool TryParsePostId(string rawId, out int postId)
        {
            if (int.TryParse(rawId, out postId))
            {
                return true;
            }

            if (string.Equals(rawId, "post-101", StringComparison.OrdinalIgnoreCase))
            {
                postId = 1;
                return true;
            }
            if (string.Equals(rawId, "post-102", StringComparison.OrdinalIgnoreCase))
            {
                postId = 2;
                return true;
            }
            if (string.Equals(rawId, "post-103", StringComparison.OrdinalIgnoreCase))
            {
                postId = 3;
                return true;
            }

            postId = 0;
            return false;
        }

        private async Task EnsureDatabaseReadyAsync()
        {
            if (_tablesVerified)
            {
                return;
            }

            await FeedbackSeeder.EnsureReadyAsync(_context);
            _tablesVerified = true;
        }

        [HttpGet("posts")]
        [AllowAnonymous]
        public async Task<IActionResult> GetPosts(CancellationToken cancellationToken)
        {
            await EnsureDatabaseReadyAsync();
            var currentUserId = await ResolveCurrentUserIdAsync(cancellationToken);

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
            await EnsureDatabaseReadyAsync();
            if (!TryParsePostId(id, out var postId))
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var currentUserId = await ResolveCurrentUserIdAsync(cancellationToken);

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
        [AllowAnonymous]
        public async Task<IActionResult> CreatePost(
            [FromBody] CreateCommunityPostRequest request,
            CancellationToken cancellationToken)
        {
            await EnsureDatabaseReadyAsync();

            var actor = await ResolveActorAsync(
                request.AuthorId,
                request.AuthorEmail,
                request.AuthorName,
                request.AuthorLevel,
                request.AuthorRole,
                request.AuthorAvatar,
                cancellationToken);

            if (actor == null)
            {
                return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại."));
            }

            string displayName;
            string? avatarUrl = null;
            if (request.IsAnonymous && !actor.IsAdmin)
            {
                var suffix = Math.Abs(actor.UserId.GetHashCode() % 9000) + 1000;
                displayName = $"Thành viên ẩn danh #{suffix}";
            }
            else
            {
                displayName = actor.DisplayName;
                avatarUrl = actor.AvatarUrl;
            }

            var cleanTitle = (request.Title ?? string.Empty).Trim();
            if (cleanTitle.Length > 290)
            {
                cleanTitle = cleanTitle.Substring(0, 290);
            }

            var now = DateTime.UtcNow;
            var post = new CommunityPost
            {
                AuthorUserId = actor.UserId,
                AuthorDisplayName = displayName,
                AuthorAvatarUrl = avatarUrl,
                AuthorLevel = actor.Level,
                AuthorRole = actor.Role,
                IsAnonymous = request.IsAnonymous && !actor.IsAdmin,
                Channel = string.IsNullOrWhiteSpace(request.Channel) ? "QA_JAPANESE" : request.Channel.Trim(),
                Title = cleanTitle,
                Content = (request.Content ?? string.Empty).Trim(),
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

            if (request.Attachments != null)
            {
                foreach (var att in request.Attachments.Where(a => !string.IsNullOrWhiteSpace(a.Url)))
                {
                    var fName = string.IsNullOrWhiteSpace(att.Name) ? "attachment" : att.Name.Trim();
                    if (fName.Length > 250) fName = fName.Substring(0, 250);

                    post.Attachments.Add(new CommunityAttachment
                    {
                        FileName = fName,
                        FileSize = att.Size,
                        FileType = string.Equals(att.Type, "FILE", StringComparison.OrdinalIgnoreCase) ? "FILE" : "IMAGE",
                        Url = att.Url!,
                        CreatedAt = now
                    });
                }
            }

            _context.CommunityPosts.Add(post);
            await _context.SaveChangesAsync(cancellationToken);

            return Ok(ApiResponse<CommunityPostDto>.Ok(
                MapPostToDto(post, actor.UserId),
                "Đã đăng bài thảo luận lên diễn đàn cộng đồng."));
        }

        [HttpPost("posts/{id}/comments")]
        [AllowAnonymous]
        public async Task<IActionResult> AddComment(
            string id,
            [FromBody] CreateCommunityCommentRequest request,
            CancellationToken cancellationToken)
        {
            await EnsureDatabaseReadyAsync();

            if (!TryParsePostId(id, out var postId))
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var actor = await ResolveActorAsync(
                request.AuthorId,
                request.AuthorEmail,
                request.AuthorName,
                request.AuthorLevel,
                request.AuthorRole,
                request.AuthorAvatar,
                cancellationToken);

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

            string displayName;
            string? avatarUrl = null;
            if (request.IsAnonymous && !actor.IsAdmin)
            {
                var suffix = Math.Abs(actor.UserId.GetHashCode() % 9000) + 1000;
                displayName = $"Thành viên ẩn danh #{suffix}";
            }
            else
            {
                displayName = actor.DisplayName;
                avatarUrl = actor.AvatarUrl;
            }

            int? parentId = null;
            if (!string.IsNullOrWhiteSpace(request.ParentCommentId) && int.TryParse(request.ParentCommentId, out var parsedParent))
            {
                parentId = parsedParent;
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
                IsAnonymous = request.IsAnonymous && !actor.IsAdmin,
                Content = (request.Content ?? string.Empty).Trim(),
                Upvotes = 0,
                IsAcceptedAnswer = false,
                CreatedAt = now
            };

            if (request.Attachments != null)
            {
                foreach (var att in request.Attachments.Where(a => !string.IsNullOrWhiteSpace(a.Url)))
                {
                    var fName = string.IsNullOrWhiteSpace(att.Name) ? "attachment" : att.Name.Trim();
                    if (fName.Length > 250) fName = fName.Substring(0, 250);

                    comment.Attachments.Add(new CommunityAttachment
                    {
                        FileName = fName,
                        FileSize = att.Size,
                        FileType = string.Equals(att.Type, "FILE", StringComparison.OrdinalIgnoreCase) ? "FILE" : "IMAGE",
                        Url = att.Url!,
                        CreatedAt = now
                    });
                }
            }

            _context.CommunityComments.Add(comment);
            post.UpdatedAt = now;
            await _context.SaveChangesAsync(cancellationToken);

            // EF Core relationship fix-up already adds `comment` to `post.Comments` for tracked entities;
            // only add manually if not yet present to avoid returning duplicate comments before next poll.
            if (!post.Comments.Any(c => c.Id == comment.Id))
            {
                post.Comments.Add(comment);
            }

            return Ok(ApiResponse<CommunityPostDto>.Ok(
                MapPostToDto(post, actor.UserId),
                "Đã gửi bình luận."));
        }

        [HttpPost("posts/{id}/upvote")]
        [AllowAnonymous]
        public async Task<IActionResult> ToggleUpvote(string id, CancellationToken cancellationToken)
        {
            await EnsureDatabaseReadyAsync();

            if (!TryParsePostId(id, out var postId))
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var userId = await ResolveCurrentUserIdAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(userId))
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

            var existingUpvote = post.PostUpvotes.FirstOrDefault(u => u.UserId == userId);
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
                    UserId = userId,
                    CreatedAt = DateTime.UtcNow
                };
                _context.CommunityPostUpvotes.Add(upvote);
                post.PostUpvotes.Add(upvote);
                post.Upvotes += 1;
            }

            await _context.SaveChangesAsync(cancellationToken);
            return Ok(ApiResponse<CommunityPostDto>.Ok(MapPostToDto(post, userId)));
        }

        [HttpPost("posts/{id}/toggle-solved")]
        [AllowAnonymous]
        public async Task<IActionResult> ToggleSolved(string id, CancellationToken cancellationToken)
        {
            await EnsureDatabaseReadyAsync();
            if (!TryParsePostId(id, out var postId))
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var actor = await ResolveActorAsync(null, null, null, null, null, null, cancellationToken);
            if (actor == null)
            {
                return Unauthorized();
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
                return Forbid();
            }

            post.IsSolved = !post.IsSolved;
            await _context.SaveChangesAsync(cancellationToken);

            return Ok(ApiResponse<CommunityPostDto>.Ok(MapPostToDto(post, actor.UserId)));
        }

        [HttpPost("posts/{id}/toggle-pin")]
        [AllowAnonymous]
        public async Task<IActionResult> TogglePin(string id, CancellationToken cancellationToken)
        {
            await EnsureDatabaseReadyAsync();
            if (!TryParsePostId(id, out var postId))
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var actor = await ResolveActorAsync(null, null, null, null, null, null, cancellationToken);
            if (actor == null || !actor.IsAdmin)
            {
                return Forbid();
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
        [AllowAnonymous]
        public async Task<IActionResult> DeletePost(string id, CancellationToken cancellationToken)
        {
            await EnsureDatabaseReadyAsync();
            if (!TryParsePostId(id, out var postId))
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            var actor = await ResolveActorAsync(null, null, null, null, null, null, cancellationToken);
            if (actor == null)
            {
                return Unauthorized();
            }

            var post = await _context.CommunityPosts
                .FirstOrDefaultAsync(p => p.Id == postId, cancellationToken);

            if (post == null)
            {
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài thảo luận."));
            }

            if (!string.Equals(post.AuthorUserId, actor.UserId, StringComparison.OrdinalIgnoreCase) && !actor.IsAdmin)
            {
                return Forbid();
            }

            _context.CommunityPosts.Remove(post);
            await _context.SaveChangesAsync(cancellationToken);

            return Ok(ApiResponse<object>.Ok(new { id = postId }, "Đã xóa bài thảo luận."));
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
                CreatedAt = post.CreatedAt,
                UpdatedAt = post.UpdatedAt,
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
                            CreatedAt = c.CreatedAt,
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
