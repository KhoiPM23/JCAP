using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data
{
    /// <summary>
    /// Cấu hình các bảng lưu kết quả tự đánh giá (Quizlet Test) độc lập với hệ thống ôn tập SRS.
    /// </summary>
    public static class FlashcardQuizModelConfiguration
    {
        public static void Configure(ModelBuilder modelBuilder)
        {
            const string exactlyOneItemCheck =
                "([VocabularyId] IS NOT NULL AND [GrammarId] IS NULL) OR ([VocabularyId] IS NULL AND [GrammarId] IS NOT NULL)";

            modelBuilder.Entity<FlashcardQuizAttempt>(entity =>
            {
                entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);
                entity.Property(e => e.SourceType).IsRequired().HasMaxLength(30).HasDefaultValue(FlashcardSessionSource.TopicSet);
                entity.Property(e => e.SetTitleSnapshot).IsRequired().HasMaxLength(200);
                entity.Property(e => e.ContentType).IsRequired().HasMaxLength(30).HasDefaultValue(FlashcardContentType.Vocabulary);
                entity.Property(e => e.Direction).IsRequired().HasMaxLength(20).HasDefaultValue("ja_to_vi");
                entity.Property(e => e.CardScope).IsRequired().HasMaxLength(20).HasDefaultValue("all");

                entity.HasIndex(e => new { e.UserId, e.CompletedAt });

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<FlashcardQuizAttemptItem>(entity =>
            {
                entity.ToTable(t => t.HasCheckConstraint("CK_FlashcardQuizAttemptItems_ExactlyOneItem", exactlyOneItemCheck));

                entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);
                entity.Property(e => e.QuestionType).IsRequired().HasMaxLength(30);
                entity.Property(e => e.Direction).IsRequired().HasMaxLength(20);
                entity.Property(e => e.FrontTextSnapshot).IsRequired().HasMaxLength(200);
                entity.Property(e => e.MeaningSnapshot).IsRequired()
                    .HasMaxLength(LearningContentModelConfiguration.MeaningMaxLength);
                entity.Property(e => e.PromptText).IsRequired().HasMaxLength(500);
                entity.Property(e => e.CorrectAnswer).IsRequired().HasMaxLength(500);
                entity.Property(e => e.UserAnswer).HasMaxLength(500);

                entity.HasIndex(e => e.AttemptId);

                entity.HasOne(e => e.Attempt)
                    .WithMany(a => a.Items)
                    .HasForeignKey(e => e.AttemptId)
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
        }
    }
}
