using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data
{
    /// <summary>
    /// Cấu hình bảng của chức năng Khám phá (bản đồ hành trình học). Tách khỏi AppDbContext để phần chung chỉ cần
    /// một dòng gọi Configure trong OnModelCreating.
    /// </summary>
    public static class ExploreModelConfiguration
    {
        public static void Configure(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<ExplorePrefecture>(entity =>
            {
                // Mã tỉnh JIS 1..47, do hệ thống đặt (không tự tăng)
                entity.Property(e => e.Id).ValueGeneratedNever();
                entity.ToTable(t => t.HasCheckConstraint("CK_ExplorePrefecture_Id", "[Id] BETWEEN 1 AND 47"));
            });

            modelBuilder.Entity<ExploreChapter>(entity =>
            {
                entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
                entity.Property(e => e.Description).HasMaxLength(1000);
                entity.Property(e => e.MinLevel).IsRequired().HasMaxLength(10);
                entity.Property(e => e.MaxLevel).IsRequired().HasMaxLength(10);
                entity.HasIndex(e => e.OrderIndex);
            });

            modelBuilder.Entity<ExploreChapterPrefecture>(entity =>
            {
                entity.HasKey(e => new { e.ChapterId, e.PrefectureId });
                // Một tỉnh chỉ thuộc tối đa một chương
                entity.HasIndex(e => e.PrefectureId).IsUnique();
                entity.HasOne(e => e.Chapter)
                    .WithMany(c => c.Prefectures)
                    .HasForeignKey(e => e.ChapterId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Prefecture)
                    .WithOne(p => p.ChapterLink)
                    .HasForeignKey<ExploreChapterPrefecture>(e => e.PrefectureId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<ExploreSpot>(entity =>
            {
                entity.Property(e => e.IconId).IsRequired().HasMaxLength(80);
                entity.Property(e => e.NameVi).IsRequired().HasMaxLength(200);
                entity.Property(e => e.NameJp).IsRequired().HasMaxLength(200);
                entity.Property(e => e.NameKana).HasMaxLength(200);
                entity.Property(e => e.Status).IsRequired().HasMaxLength(20).HasDefaultValue(ExploreSpotStatus.Draft);
                entity.HasIndex(e => new { e.PrefectureId, e.Status, e.IsActive });
                entity.HasOne(e => e.Prefecture)
                    .WithMany(p => p.Spots)
                    .HasForeignKey(e => e.PrefectureId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<ExploreSpotLesson>(entity =>
            {
                entity.Property(e => e.JLPTLevel).IsRequired().HasMaxLength(10).HasDefaultValue("N5");
                entity.Property(e => e.Situation).IsRequired().HasMaxLength(1000);
                entity.Property(e => e.RealUse).IsRequired().HasMaxLength(1000);
                entity.Property(e => e.SentenceJson).IsRequired();
                entity.Property(e => e.Meaning).IsRequired().HasMaxLength(500);
                entity.Property(e => e.GrammarNote).HasMaxLength(1000);
                // Một mốc có đúng một bài (giai đoạn hiện tại chưa có phiên bản)
                entity.HasIndex(e => e.SpotId).IsUnique();
                entity.HasOne(e => e.Spot)
                    .WithOne(s => s.Lesson)
                    .HasForeignKey<ExploreSpotLesson>(e => e.SpotId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ExploreSpotLessonGrammar>(entity =>
            {
                entity.HasKey(e => new { e.LessonId, e.GrammarId });
                entity.HasOne(e => e.Lesson)
                    .WithMany(l => l.LessonGrammars)
                    .HasForeignKey(e => e.LessonId)
                    .OnDelete(DeleteBehavior.Cascade);
                // Ngữ pháp là tài nguyên dùng chung: không cho xoá dây chuyền từ phía Grammar
                entity.HasOne(e => e.Grammar)
                    .WithMany()
                    .HasForeignKey(e => e.GrammarId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<ExploreSpotLessonVocabulary>(entity =>
            {
                entity.HasKey(e => new { e.LessonId, e.VocabularyId });
                entity.HasOne(e => e.Lesson)
                    .WithMany(l => l.LessonVocabularies)
                    .HasForeignKey(e => e.LessonId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Vocabulary)
                    .WithMany()
                    .HasForeignKey(e => e.VocabularyId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<ExploreSpotActivity>(entity =>
            {
                entity.Property(e => e.ActivityType).IsRequired().HasMaxLength(20);
                entity.HasIndex(e => new { e.LessonId, e.OrderIndex });
                entity.HasOne(e => e.Lesson)
                    .WithMany(l => l.Activities)
                    .HasForeignKey(e => e.LessonId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ExploreProvinceWord>(entity =>
            {
                entity.HasKey(e => e.PrefectureId);
                entity.Property(e => e.Word).IsRequired().HasMaxLength(50);
                entity.Property(e => e.Kana).IsRequired().HasMaxLength(100);
                entity.Property(e => e.Meaning).IsRequired().HasMaxLength(200);
                entity.Property(e => e.Note).HasMaxLength(500);
                entity.Property(e => e.Status).IsRequired().HasMaxLength(20).HasDefaultValue(ExploreSpotStatus.Draft);
                entity.HasOne(e => e.Prefecture)
                    .WithOne(p => p.Word)
                    .HasForeignKey<ExploreProvinceWord>(e => e.PrefectureId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Tiến độ người học: không có DbSet trong AppDbContext, đọc ghi qua context.Set<T>()
            modelBuilder.Entity<ExploreSpotProgress>(entity =>
            {
                entity.ToTable("ExploreSpotProgresses");
                entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);
                entity.HasIndex(e => new { e.UserId, e.SpotId }).IsUnique();
                entity.HasOne<ApplicationUser>()
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.Spot)
                    .WithMany()
                    .HasForeignKey(e => e.SpotId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<ExplorePrefectureStamp>(entity =>
            {
                entity.ToTable("ExplorePrefectureStamps");
                entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);
                entity.HasIndex(e => new { e.UserId, e.PrefectureId }).IsUnique();
                entity.HasOne<ApplicationUser>()
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.Prefecture)
                    .WithMany()
                    .HasForeignKey(e => e.PrefectureId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<ExploreChapterUnlock>(entity =>
            {
                entity.ToTable("ExploreChapterUnlocks");
                entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);
                entity.HasIndex(e => new { e.UserId, e.ChapterId }).IsUnique();
                entity.HasOne<ApplicationUser>()
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.Chapter)
                    .WithMany()
                    .HasForeignKey(e => e.ChapterId)
                    .OnDelete(DeleteBehavior.Restrict);
            });
        }
    }
}
