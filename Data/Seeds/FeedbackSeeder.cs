using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace JCAP.Data.Seeds
{
    public static class FeedbackSeeder
    {
        public static async Task SeedAsync(IServiceProvider serviceProvider)
        {
            var context = serviceProvider.GetRequiredService<AppDbContext>();
            await EnsureReadyAsync(context);
        }

        public static async Task EnsureReadyAsync(AppDbContext context)
        {
            // Đảm bảo bảng Feedback và bảng Community Forum tồn tại trong SQL Server
            await EnsureTablesExistAsync(context);

            await SeedFeedbackTicketsIfEmptyAsync(context);
            await SeedCommunityPostsIfEmptyAsync(context);
        }

        private static async Task SeedFeedbackTicketsIfEmptyAsync(AppDbContext context)
        {
            if (await context.FeedbackTickets.AnyAsync())
            {
                return;
            }

            var learners = await context.Users
                .Where(u => u.Role != "Admin")
                .OrderBy(u => u.CreatedAt)
                .ToListAsync();

            if (learners.Count == 0)
            {
                return;
            }

            var learner2 = learners.FirstOrDefault(u =>
                string.Equals(u.Email, "learner2@jcap.com", StringComparison.OrdinalIgnoreCase));
            var learner3 = learners.FirstOrDefault(u =>
                string.Equals(u.Email, "learner3@jcap.com", StringComparison.OrdinalIgnoreCase));

            var primaryLearners = learners
                .Where(u => u.Id != learner2?.Id && u.Id != learner3?.Id)
                .ToList();

            if (primaryLearners.Count == 0)
            {
                primaryLearners.Add(learners[0]);
            }

            var now = DateTime.UtcNow;
            var ticketsToAdd = new List<FeedbackTicket>();

            foreach (var primary in primaryLearners)
            {
                var t1 = new FeedbackTicket
                {
                    UserId = primary.Id,
                    AnonymousCode = "#SUP-8492",
                    Title = "AI chấm sót từ vựng mục tiêu 「予約 (yoyaku)」 dù phát âm đã nhận diện đúng",
                    Category = "AI_ASSESSMENT",
                    Status = "IN_PROGRESS",
                    AdminSeenAt = now.AddHours(-5),
                    CreatedAt = now.AddHours(-6),
                    UpdatedAt = now.AddHours(-1),
                    Messages = new List<FeedbackMessage>
                    {
                        new FeedbackMessage
                        {
                            SenderRole = "LEARNER",
                            Content = "Chào Admin, khi mình luyện kịch bản \"Đặt bàn nhà hàng Izakaya (N4)\", ở lượt nói thứ 2 mình nói câu 「金曜日の夜七時に予約をお願いします」. Hệ thống STT nhận diện đúng chữ 予約 nhưng nhiệm vụ số 1 vẫn chưa được tính hoàn thành.",
                            CreatedAt = now.AddHours(-6)
                        },
                        new FeedbackMessage
                        {
                            SenderRole = "ADMIN",
                            Content = "Chào bạn! Admin đã kiểm tra lại cấu hình kịch bản Izakaya N4. Đội ngũ đã cập nhật lại điều kiện chấm nhiệm vụ chấp nhận cả cấu trúc danh từ 「予約をお願いします」. Bạn thử tạo lượt hội thoại mới rồi phản hồi lại giúp Admin nhé!",
                            CreatedAt = now.AddHours(-4)
                        }
                    }
                };

                var t2 = new FeedbackTicket
                {
                    UserId = primary.Id,
                    AnonymousCode = "#SUG-5194",
                    Title = "Đề xuất thêm tốc độ đọc mẫu 0.75x cho các bài luyện Shadowing cấp độ N3",
                    Category = "SUGGESTION",
                    Status = "PENDING",
                    AdminSeenAt = null,
                    CreatedAt = now.AddMinutes(-35),
                    UpdatedAt = now.AddMinutes(-35),
                    Messages = new List<FeedbackMessage>
                    {
                        new FeedbackMessage
                        {
                            SenderRole = "LEARNER",
                            Content = "Ở các bài hội thoại Shadowing N3, tốc độ nói tự nhiên của nhân vật AI khá nhanh với người mới lên N3. Mong đội ngũ phát triển bổ sung thêm nút nghe mẫu tốc độ 0.75x trước khi bấm thu âm.",
                            CreatedAt = now.AddMinutes(-35)
                        }
                    }
                };

                var t3 = new FeedbackTicket
                {
                    UserId = primary.Id,
                    AnonymousCode = "#SUP-1108",
                    Title = "Đã thanh toán gói Credit qua QR PayOS nhưng chờ 2 phút mới cộng vào ví",
                    Category = "PAYMENT_CREDIT",
                    Status = "CLOSED",
                    AdminSeenAt = now.AddDays(-2),
                    CreatedAt = now.AddDays(-2).AddHours(-2),
                    UpdatedAt = now.AddDays(-1),
                    ClosedAt = now.AddDays(-1),
                    Messages = new List<FeedbackMessage>
                    {
                        new FeedbackMessage
                        {
                            SenderRole = "LEARNER",
                            Content = "Mình vừa quét mã VietQR mua gói Credit, ngân hàng báo trừ tiền thành công nhưng số dư chưa nhảy ngay.",
                            CreatedAt = now.AddDays(-2).AddHours(-2)
                        },
                        new FeedbackMessage
                        {
                            SenderRole = "ADMIN",
                            Content = "Admin đã đối soát mã đơn PayOS và cộng bù đủ Credit vào ví của bạn, đồng thời nâng cấp cơ chế đồng bộ tự động ngay khi thanh toán.",
                            CreatedAt = now.AddDays(-1)
                        }
                    }
                };

                ticketsToAdd.AddRange(new[] { t1, t2, t3 });
            }

            if (learner2 != null)
            {
                ticketsToAdd.Add(new FeedbackTicket
                {
                    UserId = learner2.Id,
                    AnonymousCode = "#SUP-6310",
                    Title = "File âm thanh câu số 4 trong bài Shadowing Ga Tokyo không phát được trên Safari",
                    Category = "SYSTEM_BUG",
                    Status = "PENDING",
                    AdminSeenAt = null,
                    CreatedAt = now.AddHours(-2),
                    UpdatedAt = now.AddHours(-2),
                    Messages = new List<FeedbackMessage>
                    {
                        new FeedbackMessage
                        {
                            SenderRole = "LEARNER",
                            Content = "Khi mình mở bài Shadowing trên Safari iOS, câu số 4 bấm nghe mẫu bị đứng ở 00:00. Nhờ Admin kiểm tra giúp ạ.",
                            CreatedAt = now.AddHours(-2)
                        }
                    }
                });
            }

            context.FeedbackTickets.AddRange(ticketsToAdd);
            await context.SaveChangesAsync();
        }

        private static async Task SeedCommunityPostsIfEmptyAsync(AppDbContext context)
        {
            if (await context.CommunityPosts.AnyAsync())
            {
                return;
            }

            var users = await context.Users.OrderBy(u => u.CreatedAt).ToListAsync();
            if (users.Count == 0) return;

            var admin = users.FirstOrDefault(u => u.Role == "Admin") ?? users[0];
            var learners = users.Where(u => u.Role != "Admin").ToList();
            var learner1 = learners.FirstOrDefault(u => string.Equals(u.Email, "learner1@jcap.com", StringComparison.OrdinalIgnoreCase))
                ?? learners.FirstOrDefault() ?? users[0];
            var learner2 = learners.FirstOrDefault(u => string.Equals(u.Email, "learner2@jcap.com", StringComparison.OrdinalIgnoreCase))
                ?? (learners.Count > 1 ? learners[1] : learner1);
            var learner3 = learners.FirstOrDefault(u => string.Equals(u.Email, "learner3@jcap.com", StringComparison.OrdinalIgnoreCase))
                ?? (learners.Count > 2 ? learners[2] : learner2);

            var now = DateTime.UtcNow;

            var post1 = new CommunityPost
            {
                AuthorUserId = learner2.Id,
                AuthorDisplayName = string.IsNullOrWhiteSpace(learner2.FullName) ? "Học Viên Luyện Nói 2" : learner2.FullName,
                AuthorLevel = "N3",
                AuthorRole = "LEARNER",
                IsAnonymous = false,
                Channel = "RESOURCES",
                Title = "Tổng hợp bảng Kính ngữ (Sonkeigo & Kenjougo) giúp vượt qua mọi kịch bản Nhà hàng & Khách sạn N4-N3",
                Content = "Chào mọi người! Khi luyện Hội thoại AI ở các kịch bản Nhà hàng, Khách sạn hay Phỏng vấn N3, mình thấy nhiều bạn hay nhầm giữa Tôn kính ngữ (dùng cho khách/đối phương) và Khiêm nhường ngữ (dùng cho bản thân).\n\nVí dụ:\n• 行く / 来る → いらっしゃる (Tôn kính) / 伺う・参る (Khiêm nhường)\n• 食べる / 飲む → 召し上がる (Tôn kính) / いただく (Khiêm nhường)\n• 言う → おっしゃる (Tôn kính) / 申し上げる (Khiêm nhường)\n\nMọi người lưu lại để áp dụng khi vào phòng Roleplay AI nhé!",
                IsPinned = true,
                IsSolved = false,
                Upvotes = 24,
                Views = 142,
                CreatedAt = now.AddHours(-8),
                UpdatedAt = now.AddHours(-6)
            };

            var post2 = new CommunityPost
            {
                AuthorUserId = learner3.Id,
                AuthorDisplayName = "Thành viên ẩn danh #409",
                AuthorLevel = "N5",
                AuthorRole = "LEARNER",
                IsAnonymous = true,
                Channel = "QA_JAPANESE",
                Title = "Khi gọi món ở quán Ramen, phân biệt 「〜にします」 và 「〜をお願いします」 thế nào ạ?",
                Content = "Mình mới học N5, lúc vào kịch bản Quán mì Ramen thấy nhân viên hỏi gọi món gì. Mình nghe bạn mình bảo nói 「とんこつラーメンにします」 cũng được mà 「とんこつラーメンをお願いします」 cũng đúng. Hai câu này khác sắc thái nhau thế nào vậy mọi người?",
                IsPinned = false,
                IsSolved = true,
                Upvotes = 15,
                Views = 88,
                CreatedAt = now.AddHours(-5),
                UpdatedAt = now.AddHours(-3)
            };

            var post3 = new CommunityPost
            {
                AuthorUserId = learner1.Id,
                AuthorDisplayName = string.IsNullOrWhiteSpace(learner1.FullName) ? "Học Viên Luyện Nói 1" : learner1.FullName,
                AuthorLevel = "N4",
                AuthorRole = "LEARNER",
                IsAnonymous = false,
                Channel = "SPEAKING_TIPS",
                Title = "Mẹo kéo điểm Fluency từ 70 lên 92 khi luyện Shadowing cho người hay bị hụt hơi cuối câu",
                Content = "Trước đây mình đọc đuổi theo audio VOICEVOX toàn bị dính chữ cuối câu và điểm Fluency chỉ tầm 68-72. Sau 1 tuần thử cách nghe mẫu 2 lần để bắt nhịp ngắt nghỉ sau trợ từ は / を / に trước khi bấm thu âm, điểm của mình đã lên 92! Bạn nào đang luyện Shadowing thử áp dụng xem sao nhé.",
                IsPinned = false,
                IsSolved = false,
                Upvotes = 19,
                Views = 95,
                CreatedAt = now.AddHours(-2),
                UpdatedAt = now.AddHours(-1)
            };

            context.CommunityPosts.AddRange(post1, post2, post3);
            await context.SaveChangesAsync();

            // Thêm bình luận chéo giữa các học viên và Admin
            var c1 = new CommunityComment
            {
                CommunityPostId = post1.Id,
                AuthorUserId = learner1.Id,
                AuthorDisplayName = string.IsNullOrWhiteSpace(learner1.FullName) ? "Học Viên Luyện Nói 1" : learner1.FullName,
                AuthorLevel = "N4",
                AuthorRole = "LEARNER",
                IsAnonymous = false,
                Content = "Cảm ơn bạn nhiều lắm! Hôm qua mình vào kịch bản Đặt phòng khách sạn cứ quen miệng nói 食べます thay vì いただきます, bảng này đúng thứ mình đang cần.",
                Upvotes = 6,
                CreatedAt = now.AddHours(-7)
            };

            var c2 = new CommunityComment
            {
                CommunityPostId = post1.Id,
                AuthorUserId = admin.Id,
                AuthorDisplayName = "Ban Quản trị JCAP",
                AuthorLevel = "ADMIN",
                AuthorRole = "ADMIN",
                IsAnonymous = false,
                Content = "Bài tổng hợp rất trực quan cho các bạn đang luyện Roleplay! Admin đã ghim bài viết này lên đầu diễn đàn để mọi học viên dễ tra cứu.",
                Upvotes = 9,
                CreatedAt = now.AddHours(-6)
            };

            var c3 = new CommunityComment
            {
                CommunityPostId = post2.Id,
                AuthorUserId = learner2.Id,
                AuthorDisplayName = string.IsNullOrWhiteSpace(learner2.FullName) ? "Học Viên Luyện Nói 2" : learner2.FullName,
                AuthorLevel = "N3",
                AuthorRole = "LEARNER",
                IsAnonymous = false,
                IsAcceptedAnswer = true,
                Content = "Giải thích ngắn gọn cho bạn dễ nhớ nhé:\n• 「A にします」 nhấn mạnh vào QUYẾT ĐỊNH CHỌN sau khi xem thực đơn (\"Tôi chốt chọn món A nhé\").\n• 「A をお願いします」 là câu YÊU CẦU / GỌI MÓN trực tiếp với nhân viên (\"Cho tôi món A làm ơn\").\nTrong quán ăn người Nhật dùng cả 2 đều rất tự nhiên!",
                Upvotes = 12,
                CreatedAt = now.AddHours(-4)
            };

            context.CommunityComments.AddRange(c1, c2, c3);
            await context.SaveChangesAsync();
        }

        private static async Task EnsureTablesExistAsync(AppDbContext context)
        {
            const string sql = @"
IF OBJECT_ID(N'[dbo].[FeedbackTickets]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[FeedbackTickets] (
        [Id] int NOT NULL IDENTITY,
        [UserId] nvarchar(450) NOT NULL,
        [AnonymousCode] nvarchar(30) NOT NULL,
        [Title] nvarchar(300) NOT NULL,
        [Category] nvarchar(50) NOT NULL,
        [Status] nvarchar(30) NOT NULL,
        [AdminSeenAt] datetime2 NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [ClosedAt] datetime2 NULL,
        CONSTRAINT [PK_FeedbackTickets] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_FeedbackTickets_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [dbo].[AspNetUsers] ([Id]) ON DELETE NO ACTION
    );
    CREATE INDEX [IX_FeedbackTickets_UserId_UpdatedAt] ON [dbo].[FeedbackTickets] ([UserId], [UpdatedAt]);
    CREATE INDEX [IX_FeedbackTickets_Status_UpdatedAt] ON [dbo].[FeedbackTickets] ([Status], [UpdatedAt]);
END

IF OBJECT_ID(N'[dbo].[FeedbackMessages]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[FeedbackMessages] (
        [Id] int NOT NULL IDENTITY,
        [FeedbackTicketId] int NOT NULL,
        [SenderRole] nvarchar(20) NOT NULL,
        [Content] nvarchar(max) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_FeedbackMessages] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_FeedbackMessages_FeedbackTickets_FeedbackTicketId] FOREIGN KEY ([FeedbackTicketId]) REFERENCES [dbo].[FeedbackTickets] ([Id]) ON DELETE CASCADE
    );
    CREATE INDEX [IX_FeedbackMessages_TicketId_CreatedAt] ON [dbo].[FeedbackMessages] ([FeedbackTicketId], [CreatedAt]);
END

IF OBJECT_ID(N'[dbo].[FeedbackAttachments]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[FeedbackAttachments] (
        [Id] int NOT NULL IDENTITY,
        [FeedbackMessageId] int NOT NULL,
        [FileName] nvarchar(260) NOT NULL,
        [FileSize] bigint NOT NULL,
        [FileType] nvarchar(20) NOT NULL,
        [MimeType] nvarchar(120) NOT NULL,
        [CloudinaryUrl] nvarchar(max) NOT NULL,
        [CloudinaryPublicId] nvarchar(300) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_FeedbackAttachments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_FeedbackAttachments_FeedbackMessages_FeedbackMessageId] FOREIGN KEY ([FeedbackMessageId]) REFERENCES [dbo].[FeedbackMessages] ([Id]) ON DELETE CASCADE
    );
    CREATE INDEX [IX_FeedbackAttachments_MessageId] ON [dbo].[FeedbackAttachments] ([FeedbackMessageId]);
END

IF OBJECT_ID(N'[dbo].[CommunityPosts]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[CommunityPosts] (
        [Id] int NOT NULL IDENTITY,
        [AuthorUserId] nvarchar(450) NOT NULL,
        [AuthorDisplayName] nvarchar(150) NOT NULL,
        [AuthorAvatarUrl] nvarchar(500) NULL,
        [AuthorLevel] nvarchar(20) NOT NULL,
        [AuthorRole] nvarchar(20) NOT NULL,
        [IsAnonymous] bit NOT NULL,
        [Channel] nvarchar(40) NOT NULL,
        [Title] nvarchar(300) NOT NULL,
        [Content] nvarchar(max) NOT NULL,
        [IsPinned] bit NOT NULL,
        [IsSolved] bit NOT NULL,
        [Upvotes] int NOT NULL,
        [Views] int NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_CommunityPosts] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_CommunityPosts_Pinned_CreatedAt] ON [dbo].[CommunityPosts] ([IsPinned], [CreatedAt]);
END
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_CommunityPosts_AspNetUsers_AuthorUserId')
BEGIN
    ALTER TABLE [dbo].[CommunityPosts] DROP CONSTRAINT [FK_CommunityPosts_AspNetUsers_AuthorUserId];
END

IF OBJECT_ID(N'[dbo].[CommunityComments]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[CommunityComments] (
        [Id] int NOT NULL IDENTITY,
        [CommunityPostId] int NOT NULL,
        [ParentCommentId] int NULL,
        [AuthorUserId] nvarchar(450) NOT NULL,
        [AuthorDisplayName] nvarchar(150) NOT NULL,
        [AuthorAvatarUrl] nvarchar(500) NULL,
        [AuthorLevel] nvarchar(20) NOT NULL,
        [AuthorRole] nvarchar(20) NOT NULL,
        [IsAnonymous] bit NOT NULL,
        [Content] nvarchar(max) NOT NULL,
        [Upvotes] int NOT NULL,
        [IsAcceptedAnswer] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_CommunityComments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_CommunityComments_CommunityPosts_CommunityPostId] FOREIGN KEY ([CommunityPostId]) REFERENCES [dbo].[CommunityPosts] ([Id]) ON DELETE CASCADE
    );
    CREATE INDEX [IX_CommunityComments_PostId_CreatedAt] ON [dbo].[CommunityComments] ([CommunityPostId], [CreatedAt]);
END

IF OBJECT_ID(N'[dbo].[CommunityAttachments]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[CommunityAttachments] (
        [Id] int NOT NULL IDENTITY,
        [CommunityPostId] int NULL,
        [CommunityCommentId] int NULL,
        [FileName] nvarchar(260) NOT NULL,
        [FileSize] bigint NOT NULL,
        [FileType] nvarchar(20) NOT NULL,
        [Url] nvarchar(max) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_CommunityAttachments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_CommunityAttachments_CommunityPosts_CommunityPostId] FOREIGN KEY ([CommunityPostId]) REFERENCES [dbo].[CommunityPosts] ([Id]) ON DELETE CASCADE
    );
END

IF OBJECT_ID(N'[dbo].[CommunityPostUpvotes]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[CommunityPostUpvotes] (
        [Id] int NOT NULL IDENTITY,
        [CommunityPostId] int NOT NULL,
        [UserId] nvarchar(450) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_CommunityPostUpvotes] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_CommunityPostUpvotes_CommunityPosts_CommunityPostId] FOREIGN KEY ([CommunityPostId]) REFERENCES [dbo].[CommunityPosts] ([Id]) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX [IX_CommunityPostUpvotes_PostId_UserId] ON [dbo].[CommunityPostUpvotes] ([CommunityPostId], [UserId]);
END";
            await context.Database.ExecuteSqlRawAsync(sql);
        }
    }
}
