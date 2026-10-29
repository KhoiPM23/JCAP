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

            // Đảm bảo bảng FeedbackTickets, FeedbackMessages, FeedbackAttachments tồn tại trong SQL Server
            await EnsureTablesExistAsync(context);

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

            // Các tài khoản học viên chính (bao gồm learner1@jcap.com và tài khoản học viên bạn đang đăng nhập)
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
                // 1. IN_PROGRESS: Đang trò chuyện 2 chiều với Admin (có đính kèm ảnh & file log trên Cloudinary)
                var t1 = new FeedbackTicket
                {
                    UserId = primary.Id,
                    AnonymousCode = "#ANON-8492",
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
                            Content = "Chào Admin, khi mình luyện kịch bản \"Đặt bàn nhà hàng Izakaya (N4)\", ở lượt nói thứ 2 mình nói câu 「金曜日の夜七時に予約をお願いします」. Hệ thống STT nhận diện đúng chữ 予約 nhưng nhiệm vụ số 1 vẫn chưa được tính hoàn thành. Mình gửi kèm ảnh chụp màn hình bên dưới ạ.",
                            CreatedAt = now.AddHours(-6),
                            Attachments = new List<FeedbackAttachment>
                            {
                                new FeedbackAttachment
                                {
                                    FileName = "screenshot_yoyaku_n4.svg",
                                    FileSize = 188420,
                                    FileType = "IMAGE",
                                    MimeType = "image/svg+xml",
                                    CloudinaryUrl = "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg",
                                    CloudinaryPublicId = "issues/screenshot_yoyaku_n4",
                                    CreatedAt = now.AddHours(-6)
                                }
                            }
                        },
                        new FeedbackMessage
                        {
                            SenderRole = "ADMIN",
                            Content = "Chào bạn! Admin đã kiểm tra lại cấu hình kịch bản Izakaya N4. Nguyên nhân là bộ so khớp đang yêu cầu động từ dạng 「予約する」 mà chưa chấp nhận cấu trúc danh từ 「予約をお願いします」. Đội ngũ đã cập nhật lại điều kiện chấm nhiệm vụ. Bạn thử tạo lượt hội thoại mới rồi phản hồi lại giúp Admin xem đã lên tích xanh chưa nhé!",
                            CreatedAt = now.AddHours(-4)
                        },
                        new FeedbackMessage
                        {
                            SenderRole = "LEARNER",
                            Content = "Mình vừa vào test lại câu 「予約をお願いします」 thì nhiệm vụ 1 đã lên tích xanh mượt rồi ạ! Nhưng ở nhiệm vụ 2 khi mình trả lời số người là 「四人です」 thì thỉnh thoảng hệ thống đợi hơi lâu khoảng 4 giây mới phản hồi.",
                            CreatedAt = now.AddHours(-1)
                        }
                    }
                };

                // 2. PENDING (Chưa xem): Học viên mới gửi, chờ Admin mở xem
                var t2 = new FeedbackTicket
                {
                    UserId = primary.Id,
                    AnonymousCode = "#ANON-5194",
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
                            Content = "Ở các bài hội thoại Shadowing N3, tốc độ nói tự nhiên của nhân vật AI khá nhanh với người mới lên N3. Mong đội ngũ phát triển bổ sung thêm nút nghe mẫu tốc độ 0.75x trước khi bấm thu âm để học viên nghe rõ từng âm tiết (mora) hơn ạ!",
                            CreatedAt = now.AddMinutes(-35)
                        }
                    }
                };

                // 3. PENDING (Admin đã xem): Admin đã mở bài nhưng đang kiểm tra
                var t3 = new FeedbackTicket
                {
                    UserId = primary.Id,
                    AnonymousCode = "#ANON-3920",
                    Title = "Nút thu âm trên trình duyệt Safari iOS đôi khi cần bấm 2 lần mới bắt đầu nhận mic",
                    Category = "SYSTEM_BUG",
                    Status = "PENDING",
                    AdminSeenAt = now.AddHours(-2),
                    CreatedAt = now.AddHours(-3),
                    UpdatedAt = now.AddHours(-2),
                    Messages = new List<FeedbackMessage>
                    {
                        new FeedbackMessage
                        {
                            SenderRole = "LEARNER",
                            Content = "Khi mình mở trang luyện hội thoại trên iPad (Safari iOS 17), lần bấm nút Mic đầu tiên chỉ hiện thông báo xin quyền, phải bấm thêm lần nữa thì sóng âm mới chạy. Mong Admin tối ưu trải nghiệm này giúp mình nhé.",
                            CreatedAt = now.AddHours(-3)
                        }
                    }
                };

                // 4. CLOSED: Bài đã được xử lý xong và Admin đã đóng
                var t4 = new FeedbackTicket
                {
                    UserId = primary.Id,
                    AnonymousCode = "#ANON-1108",
                    Title = "Bổ sung furigana cho từ 「領収書 (ryoushuusho)」 ở kịch bản Cửa hàng tiện lợi N5",
                    Category = "SCENARIO_BUG",
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
                            Content = "Trong kịch bản Cửa hàng tiện lợi (Konbini) cấp độ N5, nhân viên AI có dùng từ 領収書 nhưng chưa có phiên âm Hiragana bên cạnh nên học viên N5 hơi khó đọc ạ.",
                            CreatedAt = now.AddDays(-2).AddHours(-2)
                        },
                        new FeedbackMessage
                        {
                            SenderRole = "ADMIN",
                            Content = "Cảm ơn góp ý rất chi tiết của bạn! Đội ngũ nội dung đã bổ sung đầy đủ phiên âm 「領収書（りょうしゅうしょ）」 và nghĩa tiếng Việt vào danh sách Từ vựng mục tiêu của kịch bản Konbini N5. Admin xin phép đóng bài góp ý này lại nhé!",
                            CreatedAt = now.AddDays(-1)
                        }
                    }
                };

                ticketsToAdd.AddRange(new[] { t1, t2, t3, t4 });
            }

            // Bài của Học viên 2 (ẩn hoàn toàn với Học viên 1, chỉ Admin mới thấy)
            if (learner2 != null)
            {
                ticketsToAdd.Add(new FeedbackTicket
                {
                    UserId = learner2.Id,
                    AnonymousCode = "#ANON-6310",
                    Title = "Thanh toán gói Credit qua QR PayOS đã trừ tiền nhưng chờ 2 phút mới cộng vào ví",
                    Category = "PAYMENT_CREDIT",
                    Status = "PENDING",
                    AdminSeenAt = null,
                    CreatedAt = now.AddHours(-2),
                    UpdatedAt = now.AddHours(-2),
                    Messages = new List<FeedbackMessage>
                    {
                        new FeedbackMessage
                        {
                            SenderRole = "LEARNER",
                            Content = "Mình vừa quét mã VietQR mua gói 200 Credits lúc 19:30. Ngân hàng báo thành công ngay nhưng mình phải tải lại trang Lịch sử giao dịch thì số dư mới cập nhật.",
                            CreatedAt = now.AddHours(-2)
                        }
                    }
                });
            }

            // Bài của Học viên 3 (ẩn hoàn toàn với Học viên 1 & 2, chỉ Admin mới thấy)
            if (learner3 != null)
            {
                ticketsToAdd.Add(new FeedbackTicket
                {
                    UserId = learner3.Id,
                    AnonymousCode = "#ANON-9041",
                    Title = "Kịch bản \"Phỏng vấn xin việc IT tại Tokyo\" nên có thêm gợi ý kính ngữ Sonkeigo",
                    Category = "SUGGESTION",
                    Status = "IN_PROGRESS",
                    AdminSeenAt = now.AddHours(-8),
                    CreatedAt = now.AddHours(-9),
                    UpdatedAt = now.AddHours(-7),
                    Messages = new List<FeedbackMessage>
                    {
                        new FeedbackMessage
                        {
                            SenderRole = "LEARNER",
                            Content = "Trong bài phỏng vấn N3, phần nhiệm vụ yêu cầu dùng kính ngữ với nhà tuyển dụng. Nếu phần gợi ý có liệt kê sẵn các cặp động từ chuyển sang Sonkeigo / Kenjougo thì người học sẽ dễ phản xạ hơn ạ.",
                            CreatedAt = now.AddHours(-9)
                        },
                        new FeedbackMessage
                        {
                            SenderRole = "ADMIN",
                            Content = "Chào bạn, ý tưởng rất hay! Chúng mình đang biên soạn bảng tra nhanh Kính ngữ ngay trong khung gợi ý của các kịch bản N3. Bạn mong muốn có thêm ví dụ câu hoàn chỉnh hay chỉ cần bảng động từ biến đổi là đủ?",
                            CreatedAt = now.AddHours(-7)
                        }
                    }
                });
            }

            context.FeedbackTickets.AddRange(ticketsToAdd);
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
END";
            await context.Database.ExecuteSqlRawAsync(sql);
        }
    }
}
