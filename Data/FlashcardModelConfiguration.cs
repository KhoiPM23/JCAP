using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data
{
    /// <summary>
    /// Cấu hình các bảng thuộc tính năng Flashcard & Bookmark (FE-05: UC-52 -> UC-58).
    /// Tách riêng khỏi AppDbContext để tránh xung đột khi merge với các nhánh khác.
    /// </summary>
    public static class FlashcardModelConfiguration
    {
        public static void Configure(ModelBuilder modelBuilder)
        {
            const string exactlyOneItemCheck =
                "([VocabularyId] IS NOT NULL AND [GrammarId] IS NULL) OR ([VocabularyId] IS NULL AND [GrammarId] IS NOT NULL)";

            modelBuilder.Entity<LearnerBookmark>(entity =>
            {
                entity.ToTable(t => t.HasCheckConstraint("CK_LearnerBookmarks_ExactlyOneItem", exactlyOneItemCheck));

                entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);

                entity.HasIndex(e => new { e.UserId, e.VocabularyId })
                    .IsUnique()
                    .HasFilter("[VocabularyId] IS NOT NULL");

                entity.HasIndex(e => new { e.UserId, e.GrammarId })
                    .IsUnique()
                    .HasFilter("[GrammarId] IS NOT NULL");

                entity.HasIndex(e => new { e.UserId, e.CreatedAt });

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Vocabulary)
                    .WithMany()
                    .HasForeignKey(e => e.VocabularyId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(e => e.Grammar)
                    .WithMany()
                    .HasForeignKey(e => e.GrammarId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<LearnerFlashcardProgress>(entity =>
            {
                entity.ToTable(t => t.HasCheckConstraint("CK_LearnerFlashcardProgresses_ExactlyOneItem", exactlyOneItemCheck));

                entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);
                entity.Property(e => e.LastRating).IsRequired().HasMaxLength(20).HasDefaultValue(FlashcardRating.Good);
                entity.Property(e => e.EaseFactor).HasDefaultValue(2.5);

                entity.HasIndex(e => new { e.UserId, e.VocabularyId })
                    .IsUnique()
                    .HasFilter("[VocabularyId] IS NOT NULL");

                entity.HasIndex(e => new { e.UserId, e.GrammarId })
                    .IsUnique()
                    .HasFilter("[GrammarId] IS NOT NULL");

                entity.HasIndex(e => new { e.UserId, e.NextReviewAt });

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Vocabulary)
                    .WithMany()
                    .HasForeignKey(e => e.VocabularyId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(e => e.Grammar)
                    .WithMany()
                    .HasForeignKey(e => e.GrammarId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<FlashcardStudySession>(entity =>
            {
                entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);
                entity.Property(e => e.SourceType).IsRequired().HasMaxLength(30).HasDefaultValue(FlashcardSessionSource.TopicSet);
                entity.Property(e => e.SetTitleSnapshot).IsRequired().HasMaxLength(200);
                entity.Property(e => e.ContentType).IsRequired().HasMaxLength(30).HasDefaultValue(FlashcardContentType.Vocabulary);

                entity.HasIndex(e => new { e.UserId, e.StartedAt });

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<FlashcardReviewLog>(entity =>
            {
                entity.ToTable(t => t.HasCheckConstraint("CK_FlashcardReviewLogs_ExactlyOneItem", exactlyOneItemCheck));

                entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);
                entity.Property(e => e.FrontTextSnapshot).IsRequired().HasMaxLength(200);
                entity.Property(e => e.MeaningSnapshot).IsRequired()
                    .HasMaxLength(LearningContentModelConfiguration.MeaningMaxLength);
                entity.Property(e => e.Rating).IsRequired().HasMaxLength(20);

                entity.HasIndex(e => e.SessionId);
                entity.HasIndex(e => new { e.UserId, e.IsNewCard, e.ReviewedAt });

                entity.HasOne(e => e.Session)
                    .WithMany(s => s.ReviewLogs)
                    .HasForeignKey(e => e.SessionId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(e => e.Vocabulary)
                    .WithMany()
                    .HasForeignKey(e => e.VocabularyId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(e => e.Grammar)
                    .WithMany()
                    .HasForeignKey(e => e.GrammarId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<LearnerDailyFlashcardQuota>(entity =>
            {
                entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);

                entity.HasIndex(e => new { e.UserId, e.DateVn }).IsUnique();

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });
        }
    }
}
