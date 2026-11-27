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
        private static readonly HashSet<string> DemoLearnerEmails = new(StringComparer.OrdinalIgnoreCase)
        {
            "learner1@jcap.com",
            "learner2@jcap.com",
            "learner3@jcap.com"
        };

        private static readonly HashSet<string> DemoAdminEmails = new(StringComparer.OrdinalIgnoreCase)
        {
            "admin1@jcap.com",
            "admin2@jcap.com",
            "admin3@jcap.com"
        };

        /// <summary>
        /// Chỉ nạp dữ liệu mẫu cho môi trường Development và chỉ gắn vào các tài khoản mẫu trong AccountSeedData.
        /// Không tạo bảng bằng SQL ngoài migration và không chèn dữ liệu mẫu vào tài khoản người dùng thật.
        /// </summary>
        public static async Task SeedAsync(IServiceProvider serviceProvider)
        {
            var context = serviceProvider.GetRequiredService<AppDbContext>();
            await SeedFeedbackTicketsIfEmptyAsync(context);
            await SeedCommunityPostsIfEmptyAsync(context);
        }

        private static async Task SeedFeedbackTicketsIfEmptyAsync(AppDbContext context)
        {
            if (await context.FeedbackTickets.AnyAsync())
            {
                return;
            }

            var demoLearners = await context.Users
                .Where(u => u.Email != null && DemoLearnerEmails.Contains(u.Email))
                .OrderBy(u => u.CreatedAt)
                .ToListAsync();

            if (demoLearners.Count == 0)
            {
                return;
            }

            var learner1 = demoLearners.FirstOrDefault(u =>
                string.Equals(u.Email, "learner1@jcap.com", StringComparison.OrdinalIgnoreCase));
            var learner2 = demoLearners.FirstOrDefault(u =>
                string.Equals(u.Email, "learner2@jcap.com", StringComparison.OrdinalIgnoreCase));

            var now = DateTime.UtcNow;
            var ticketsToAdd = new List<FeedbackTicket>();

            if (learner1 != null)
            {
                ticketsToAdd.AddRange(new[]
                {
                    new FeedbackTicket
                    {
                        UserId = learner1.Id,
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
                    },
                    new FeedbackTicket
                    {
                        UserId = learner1.Id,
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
                    },
                    new FeedbackTicket
                    {
                        UserId = learner1.Id,
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
                    }
                });
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

            if (ticketsToAdd.Count == 0)
            {
                return;
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

            var demoEmails = DemoLearnerEmails.Concat(DemoAdminEmails).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var demoUsers = await context.Users
                .Where(u => u.Email != null && demoEmails.Contains(u.Email))
                .OrderBy(u => u.CreatedAt)
                .ToListAsync();

            if (demoUsers.Count == 0) return;

            var admin = demoUsers.FirstOrDefault(u => u.Email != null && DemoAdminEmails.Contains(u.Email)) ?? demoUsers[0];
            var learners = demoUsers.Where(u => u.Email != null && DemoLearnerEmails.Contains(u.Email)).ToList();
            var learner1 = learners.FirstOrDefault(u => string.Equals(u.Email, "learner1@jcap.com", StringComparison.OrdinalIgnoreCase))
                ?? learners.FirstOrDefault() ?? demoUsers[0];
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
    }
}
