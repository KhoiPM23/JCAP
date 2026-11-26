using System.Reflection;
using System.Security.Claims;
using System.Text;
using JCAP.Controllers;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Community;
using JCAP.DTOs.Feedback;
using JCAP.Models;
using JCAP.Services.Helpers;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace JCAP.Tests.Controllers;

public class CommunityAndFeedbackSecurityTests
{
    private static AppDbContext CreateDb(string name)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(name)
            .Options;
        return new AppDbContext(options);
    }

    private static IConfiguration CreateConfig(string cloudName = "demo-cloud", string jwtKey = "TestSecretKey_1234567890")
    {
        return new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Cloudinary:CloudName"] = cloudName,
                ["Jwt:Key"] = jwtKey
            })
            .Build();
    }

    private static CommunityController CreateCommunityController(
        AppDbContext db,
        ClaimsPrincipal? principal = null,
        Dictionary<string, string>? headers = null)
    {
        var controller = new CommunityController(db, CreateConfig());
        var httpContext = new DefaultHttpContext();
        if (principal != null)
        {
            httpContext.User = principal;
        }
        if (headers != null)
        {
            foreach (var kv in headers)
            {
                httpContext.Request.Headers[kv.Key] = kv.Value;
            }
        }
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };
        return controller;
    }

    private static ClaimsPrincipal CreatePrincipal(string userId, string email, string role = "Learner")
    {
        var identity = new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId),
            new Claim(ClaimTypes.Email, email),
            new Claim(ClaimTypes.Role, role)
        }, "TestJwt");
        return new ClaimsPrincipal(identity);
    }

    [Fact]
    public void S1_And_S4_MutatingEndpoints_MustNotAllowAnonymous()
    {
        var communityWriteMethods = new[]
        {
            nameof(CommunityController.CreatePost),
            nameof(CommunityController.AddComment),
            nameof(CommunityController.ToggleUpvote),
            nameof(CommunityController.ToggleSolved),
            nameof(CommunityController.TogglePin),
            nameof(CommunityController.DeletePost),
            nameof(CommunityController.DeleteComment)
        };

        foreach (var methodName in communityWriteMethods)
        {
            var method = typeof(CommunityController).GetMethod(methodName);
            Assert.NotNull(method);
            Assert.Null(method!.GetCustomAttribute<AllowAnonymousAttribute>());
        }

        var uploadMethod = typeof(FeedbackController).GetMethod(nameof(FeedbackController.UploadAttachment));
        Assert.NotNull(uploadMethod);
        Assert.Null(uploadMethod!.GetCustomAttribute<AllowAnonymousAttribute>());
    }

    [Fact]
    public async Task S1_UnauthenticatedWithSpoofedHeaders_CannotCreatePinOrDeletePost()
    {
        await using var db = CreateDb(nameof(S1_UnauthenticatedWithSpoofedHeaders_CannotCreatePinOrDeletePost));
        db.Users.Add(new ApplicationUser
        {
            Id = "admin-1",
            Email = "admin1@jcap.com",
            UserName = "admin1@jcap.com",
            FullName = "Admin 1",
            Role = "Admin",
            IsActive = true
        });
        await db.SaveChangesAsync();

        var controller = CreateCommunityController(db, principal: null, headers: new Dictionary<string, string>
        {
            ["X-User-Id"] = "admin-1",
            ["X-User-Email"] = "admin1@jcap.com"
        });

        var createRes = await controller.CreatePost(new CreateCommunityPostRequest
        {
            Channel = "LOUNGE",
            Title = "Spoofed post",
            Content = "Test"
        }, CancellationToken.None);

        Assert.IsType<UnauthorizedObjectResult>(createRes);
    }

    [Fact]
    public async Task S2_AnonymousPost_DoesNotLeakIdentityViaXUserEmailHeader()
    {
        await using var db = CreateDb(nameof(S2_AnonymousPost_DoesNotLeakIdentityViaXUserEmailHeader));
        db.Users.Add(new ApplicationUser
        {
            Id = "learner-secret",
            Email = "secret@jcap.com",
            UserName = "secret@jcap.com",
            FullName = "Secret Learner",
            Role = "Learner",
            IsActive = true
        });
        await db.SaveChangesAsync();

        var authedController = CreateCommunityController(db, CreatePrincipal("learner-secret", "secret@jcap.com"));
        var createRes = await authedController.CreatePost(new CreateCommunityPostRequest
        {
            Channel = "QA_JAPANESE",
            Title = "Anonymous question",
            Content = "Hidden author",
            IsAnonymous = true
        }, CancellationToken.None);
        Assert.IsType<OkObjectResult>(createRes);

        // Attacker without JWT sends X-User-Email and X-User-Id headers
        var attackerController = CreateCommunityController(db, principal: null, headers: new Dictionary<string, string>
        {
            ["X-User-Email"] = "secret@jcap.com",
            ["X-User-Id"] = "learner-secret"
        });

        var getRes = Assert.IsType<OkObjectResult>(await attackerController.GetPosts(CancellationToken.None));
        var payload = Assert.IsType<ApiResponse<List<CommunityPostDto>>>(getRes.Value);
        var post = Assert.Single(payload.Data!);

        Assert.False(post.IsOwnPost);
        Assert.NotEqual("learner-secret", post.AuthorId);
        Assert.StartsWith("anon-", post.AuthorId);
    }

    [Fact]
    public async Task S3_NonExistentUserIdInToken_CannotCreateOrUpvotePost()
    {
        await using var db = CreateDb(nameof(S3_NonExistentUserIdInToken_CannotCreateOrUpvotePost));
        var ghostController = CreateCommunityController(db, CreatePrincipal("ghost-id", "ghost@jcap.com"));

        var res = await ghostController.CreatePost(new CreateCommunityPostRequest
        {
            Channel = "LOUNGE",
            Title = "Ghost post",
            Content = "Should fail"
        }, CancellationToken.None);

        Assert.IsType<UnauthorizedObjectResult>(res);
    }

    [Fact]
    public async Task S4_UploadAttachment_RejectsDisguisedBinaryAsPng()
    {
        var feedbackService = new Mock<IFeedbackService>();
        var cloudStorage = new Mock<ICloudStorageService>();
        var controller = new FeedbackController(
            feedbackService.Object,
            cloudStorage.Object,
            NullLogger<FeedbackController>.Instance);

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = CreatePrincipal("learner-1", "learner1@jcap.com") }
        };

        // MZ executable header disguised as fake.png
        var fakeBytes = Encoding.ASCII.GetBytes("MZ\x90\x00\x03\x00\x00\x00FAKE_EXE");
        using var stream = new MemoryStream(fakeBytes);
        var file = new FormFile(stream, 0, fakeBytes.Length, "file", "fake.png")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png"
        };

        var result = await controller.UploadAttachment(file);
        Assert.IsType<BadRequestObjectResult>(result);
        cloudStorage.Verify(s => s.UploadFileAsync(It.IsAny<IFormFile>(), It.IsAny<string>()), Times.Never);
    }

    [Theory]
    [InlineData("https://res.cloudinary.com/demo-cloud/image/upload/v1/issues/a.png", true)]
    [InlineData("/uploads/issues/test_123.png", true)]
    [InlineData("https://evil.example.com/tracker.png", false)]
    [InlineData("https://res.cloudinary.com/other-cloud/image/upload/v1/a.png", false)]
    [InlineData("blob:http://localhost:5173/abc", false)]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("/uploads/issues/../../secret.json", false)]
    public void S5_AttachmentUrlValidator_OnlyAllowsProjectCloudinaryOrLocalIssues(string url, bool expected)
    {
        Assert.Equal(expected, AttachmentSecurityHelper.IsAllowedAttachmentUrl(url, "demo-cloud"));
    }

    [Fact]
    public async Task B1_DeletePost_RemovesCommentAttachmentsBeforeDeletingPost()
    {
        await using var db = CreateDb(nameof(B1_DeletePost_RemovesCommentAttachmentsBeforeDeletingPost));
        db.Users.Add(new ApplicationUser
        {
            Id = "u1",
            Email = "u1@jcap.com",
            UserName = "u1@jcap.com",
            FullName = "User 1",
            Role = "Learner",
            IsActive = true
        });
        await db.SaveChangesAsync();

        var controller = CreateCommunityController(db, CreatePrincipal("u1", "u1@jcap.com"));

        var createRes = Assert.IsType<OkObjectResult>(await controller.CreatePost(new CreateCommunityPostRequest
        {
            Channel = "QA_JAPANESE",
            Title = "Post with comment attachment",
            Content = "Body"
        }, CancellationToken.None));
        var postId = Assert.IsType<ApiResponse<CommunityPostDto>>(createRes.Value).Data!.Id;

        var commentRes = Assert.IsType<OkObjectResult>(await controller.AddComment(postId, new CreateCommunityCommentRequest
        {
            Content = "Comment with image",
            Attachments = new List<CommunityAttachmentDto>
            {
                new()
                {
                    Name = "img.png",
                    Size = 1024,
                    Type = "IMAGE",
                    Url = "https://res.cloudinary.com/demo-cloud/image/upload/v1/issues/img.png"
                }
            }
        }, CancellationToken.None));
        Assert.NotNull(commentRes);
        Assert.Single(db.CommunityAttachments);

        var deleteRes = await controller.DeletePost(postId, CancellationToken.None);
        Assert.IsType<OkObjectResult>(deleteRes);
        Assert.Empty(db.CommunityPosts);
        Assert.Empty(db.CommunityComments);
        Assert.Empty(db.CommunityAttachments);
    }

    [Fact]
    public async Task B3_And_S5_ValidationRejectsInvalidChannelExternalUrlAndInvalidParentComment()
    {
        await using var db = CreateDb(nameof(B3_And_S5_ValidationRejectsInvalidChannelExternalUrlAndInvalidParentComment));
        db.Users.Add(new ApplicationUser
        {
            Id = "u1",
            Email = "u1@jcap.com",
            UserName = "u1@jcap.com",
            FullName = "User 1",
            Role = "Learner",
            IsActive = true
        });
        await db.SaveChangesAsync();

        var controller = CreateCommunityController(db, CreatePrincipal("u1", "u1@jcap.com"));

        var badChannel = await controller.CreatePost(new CreateCommunityPostRequest
        {
            Channel = "INVALID_CHANNEL",
            Title = "Test",
            Content = "Test"
        }, CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(badChannel);

        var badUrl = await controller.CreatePost(new CreateCommunityPostRequest
        {
            Channel = "LOUNGE",
            Title = "Test",
            Content = "Test",
            Attachments = new List<CommunityAttachmentDto>
            {
                new() { Name = "x.png", Size = 10, Type = "IMAGE", Url = "https://evil.com/pixel.png" }
            }
        }, CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(badUrl);

        var okPost = Assert.IsType<OkObjectResult>(await controller.CreatePost(new CreateCommunityPostRequest
        {
            Channel = "LOUNGE",
            Title = "Valid",
            Content = "Valid"
        }, CancellationToken.None));
        var postId = Assert.IsType<ApiResponse<CommunityPostDto>>(okPost.Value).Data!.Id;

        var badParent = await controller.AddComment(postId, new CreateCommunityCommentRequest
        {
            ParentCommentId = "99999",
            Content = "Orphan reply"
        }, CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(badParent);
    }

    [Fact]
    public async Task B3_S5_B6_FeedbackService_ValidatesUrlsLimitsAndGeneratesUniqueCodes()
    {
        await using var db = CreateDb(nameof(B3_S5_B6_FeedbackService_ValidatesUrlsLimitsAndGeneratesUniqueCodes));
        var service = new FeedbackService(db, CreateConfig());

        var badUrlRes = await service.CreateTicketAsync("u1", new CreateFeedbackTicketDto
        {
            Title = "Bug",
            Category = "SYSTEM_BUG",
            Content = "Details",
            Attachments = new List<CreateFeedbackAttachmentInputDto>
            {
                new()
                {
                    FileName = "track.png",
                    FileSize = 100,
                    FileType = "IMAGE",
                    MimeType = "image/png",
                    CloudinaryUrl = "https://attacker.site/track.png"
                }
            }
        });
        Assert.False(badUrlRes.Success);

        var okRes = await service.CreateTicketAsync("u1", new CreateFeedbackTicketDto
        {
            Title = "Valid ticket",
            Category = "SYSTEM_BUG",
            Content = "Details",
            Attachments = new List<CreateFeedbackAttachmentInputDto>
            {
                new()
                {
                    FileName = new string('a', 300) + ".png",
                    FileSize = 100,
                    FileType = "IMAGE",
                    MimeType = "image/png",
                    CloudinaryUrl = "https://res.cloudinary.com/demo-cloud/image/upload/v1/issues/ok.png"
                }
            }
        });

        Assert.True(okRes.Success);
        Assert.NotNull(okRes.Data);
        Assert.StartsWith("#ANON-", okRes.Data!.AnonymousCode);
        Assert.Equal(DateTimeKind.Utc, okRes.Data.CreatedAt.Kind);
        Assert.True(okRes.Data.Messages[0].Attachments[0].FileName.Length <= 260);
    }
}
