using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data
{
    public static class FeedbackModelConfiguration
    {
        public static void Configure(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<FeedbackTicket>(entity =>
            {
                entity.ToTable("FeedbackTickets");

                entity.Property(e => e.UserId)
                    .IsRequired()
                    .HasMaxLength(450);

                entity.Property(e => e.AnonymousCode)
                    .IsRequired()
                    .HasMaxLength(30);

                entity.Property(e => e.Title)
                    .IsRequired()
                    .HasMaxLength(300);

                entity.Property(e => e.Category)
                    .IsRequired()
                    .HasMaxLength(50);

                entity.Property(e => e.Status)
                    .IsRequired()
                    .HasMaxLength(30);

                entity.HasIndex(e => new { e.UserId, e.UpdatedAt })
                    .HasDatabaseName("IX_FeedbackTickets_UserId_UpdatedAt");

                entity.HasIndex(e => new { e.Status, e.UpdatedAt })
                    .HasDatabaseName("IX_FeedbackTickets_Status_UpdatedAt");

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasMany(e => e.Messages)
                    .WithOne(m => m.FeedbackTicket)
                    .HasForeignKey(m => m.FeedbackTicketId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<FeedbackMessage>(entity =>
            {
                entity.ToTable("FeedbackMessages");

                entity.Property(e => e.SenderRole)
                    .IsRequired()
                    .HasMaxLength(20);

                entity.Property(e => e.Content)
                    .IsRequired()
                    .HasColumnType("nvarchar(max)");

                entity.HasIndex(e => new { e.FeedbackTicketId, e.CreatedAt })
                    .HasDatabaseName("IX_FeedbackMessages_TicketId_CreatedAt");

                entity.HasMany(e => e.Attachments)
                    .WithOne(a => a.FeedbackMessage)
                    .HasForeignKey(a => a.FeedbackMessageId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<FeedbackAttachment>(entity =>
            {
                entity.ToTable("FeedbackAttachments");

                entity.Property(e => e.FileName)
                    .IsRequired()
                    .HasMaxLength(260);

                entity.Property(e => e.FileType)
                    .IsRequired()
                    .HasMaxLength(20);

                entity.Property(e => e.MimeType)
                    .IsRequired()
                    .HasMaxLength(120);

                entity.Property(e => e.CloudinaryUrl)
                    .IsRequired()
                    .HasColumnType("nvarchar(max)");

                entity.Property(e => e.CloudinaryPublicId)
                    .IsRequired()
                    .HasMaxLength(300);

                entity.HasIndex(e => e.FeedbackMessageId)
                    .HasDatabaseName("IX_FeedbackAttachments_MessageId");
            });

            // ================= COMMUNITY FORUM MODELS =================
            modelBuilder.Entity<CommunityPost>(entity =>
            {
                entity.ToTable("CommunityPosts");

                entity.Property(e => e.AuthorUserId).IsRequired().HasMaxLength(450);
                entity.Property(e => e.AuthorDisplayName).IsRequired().HasMaxLength(150);
                entity.Property(e => e.AuthorAvatarUrl).HasMaxLength(500);
                entity.Property(e => e.AuthorLevel).IsRequired().HasMaxLength(20);
                entity.Property(e => e.AuthorRole).IsRequired().HasMaxLength(20);
                entity.Property(e => e.Channel).IsRequired().HasMaxLength(40);
                entity.Property(e => e.Title).IsRequired().HasMaxLength(300);
                entity.Property(e => e.Content).IsRequired().HasColumnType("nvarchar(max)");

                entity.HasIndex(e => new { e.IsPinned, e.CreatedAt })
                    .HasDatabaseName("IX_CommunityPosts_Pinned_CreatedAt");

                entity.HasMany(e => e.Comments)
                    .WithOne(c => c.CommunityPost)
                    .HasForeignKey(c => c.CommunityPostId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(e => e.Attachments)
                    .WithOne(a => a.CommunityPost)
                    .HasForeignKey(a => a.CommunityPostId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(e => e.PostUpvotes)
                    .WithOne(u => u.CommunityPost)
                    .HasForeignKey(u => u.CommunityPostId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<CommunityComment>(entity =>
            {
                entity.ToTable("CommunityComments");

                entity.Property(e => e.AuthorUserId).IsRequired().HasMaxLength(450);
                entity.Property(e => e.AuthorDisplayName).IsRequired().HasMaxLength(150);
                entity.Property(e => e.AuthorAvatarUrl).HasMaxLength(500);
                entity.Property(e => e.AuthorLevel).IsRequired().HasMaxLength(20);
                entity.Property(e => e.AuthorRole).IsRequired().HasMaxLength(20);
                entity.Property(e => e.Content).IsRequired().HasColumnType("nvarchar(max)");

                entity.HasIndex(e => new { e.CommunityPostId, e.CreatedAt })
                    .HasDatabaseName("IX_CommunityComments_PostId_CreatedAt");

                entity.HasMany(e => e.Attachments)
                    .WithOne(a => a.CommunityComment)
                    .HasForeignKey(a => a.CommunityCommentId)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            modelBuilder.Entity<CommunityAttachment>(entity =>
            {
                entity.ToTable("CommunityAttachments");

                entity.Property(e => e.FileName).IsRequired().HasMaxLength(260);
                entity.Property(e => e.FileType).IsRequired().HasMaxLength(20);
                entity.Property(e => e.Url).IsRequired().HasColumnType("nvarchar(max)");
            });

            modelBuilder.Entity<CommunityPostUpvote>(entity =>
            {
                entity.ToTable("CommunityPostUpvotes");

                entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);
                entity.HasIndex(e => new { e.CommunityPostId, e.UserId })
                    .IsUnique()
                    .HasDatabaseName("IX_CommunityPostUpvotes_PostId_UserId");
            });
        }
    }
}
