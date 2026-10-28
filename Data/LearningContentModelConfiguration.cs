using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data;

/// <summary>Self-study content mapping, intentionally independent of scenario and journey topics.</summary>
public static class LearningContentModelConfiguration
{
    public const int MeaningMaxLength = 1000;

    public static void Configure(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Vocabulary>().Property(v => v.Meaning).HasMaxLength(MeaningMaxLength);
        modelBuilder.Entity<Vocabulary>().Property(v => v.UsageNotes).HasColumnType("nvarchar(max)");
        modelBuilder.Entity<Grammar>().Property(g => g.Meaning).HasMaxLength(MeaningMaxLength);
        modelBuilder.Entity<Grammar>().Property(g => g.Reading).HasMaxLength(200);
        modelBuilder.Entity<Grammar>().Property(g => g.UsageNotes).HasColumnType("nvarchar(max)");

        modelBuilder.Entity<LearningTopic>(entity =>
        {
            entity.ToTable("LearningTopics", table =>
            {
                table.HasCheckConstraint("CK_LearningTopics_Code_NotBlank", "LEN(LTRIM(RTRIM([Code]))) > 0");
                table.HasCheckConstraint("CK_LearningTopics_Name_NotBlank", "LEN(LTRIM(RTRIM([Name]))) > 0");
            });
            entity.Property(t => t.Code).IsRequired().HasMaxLength(50);
            entity.Property(t => t.Name).IsRequired().HasMaxLength(200);
            entity.Property(t => t.Description).HasMaxLength(1000);
            entity.Property(t => t.IsActive).HasDefaultValue(true).HasSentinel(true);
            entity.Property(t => t.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
            entity.HasIndex(t => t.Code).IsUnique();
            entity.HasIndex(t => t.Name).IsUnique();
        });

        modelBuilder.Entity<TopicVocabulary>(entity =>
        {
            entity.ToTable("TopicVocabularies", table => table.HasCheckConstraint(
                "CK_TopicVocabularies_OrderIndex", "[OrderIndex] >= 0"));
            entity.HasKey(t => new { t.TopicId, t.VocabularyId });
            entity.HasIndex(t => new { t.TopicId, t.OrderIndex });
            entity.HasOne(t => t.Topic).WithMany(t => t.TopicVocabularies)
                .HasForeignKey(t => t.TopicId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(t => t.Vocabulary).WithMany(v => v.TopicVocabularies)
                .HasForeignKey(t => t.VocabularyId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<TopicGrammar>(entity =>
        {
            entity.ToTable("TopicGrammars", table => table.HasCheckConstraint(
                "CK_TopicGrammars_OrderIndex", "[OrderIndex] >= 0"));
            entity.HasKey(t => new { t.TopicId, t.GrammarId });
            entity.HasIndex(t => new { t.TopicId, t.OrderIndex });
            entity.HasOne(t => t.Topic).WithMany(t => t.TopicGrammars)
                .HasForeignKey(t => t.TopicId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(t => t.Grammar).WithMany(g => g.TopicGrammars)
                .HasForeignKey(t => t.GrammarId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VocabularyExample>(entity =>
        {
            entity.ToTable("VocabularyExamples", table =>
            {
                table.HasCheckConstraint("CK_VocabularyExamples_OrderIndex", "[OrderIndex] >= 0");
                table.HasCheckConstraint("CK_VocabularyExamples_JapaneseText_NotBlank", "LEN(LTRIM(RTRIM([JapaneseText]))) > 0");
                table.HasCheckConstraint("CK_VocabularyExamples_SourceReference", "[ExternalId] IS NULL OR [SourceId] IS NOT NULL");
            });
            entity.Property(e => e.JapaneseText).IsRequired().HasMaxLength(2000);
            entity.Property(e => e.VietnameseTranslation).HasMaxLength(2000);
            entity.Property(e => e.Furigana).HasMaxLength(4000);
            entity.Property(e => e.ExternalId).HasMaxLength(200);
            entity.HasIndex(e => new { e.VocabularyId, e.OrderIndex });
            entity.HasOne(e => e.Vocabulary).WithMany(v => v.Examples)
                .HasForeignKey(e => e.VocabularyId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Source).WithMany()
                .HasForeignKey(e => e.SourceId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<GrammarExample>(entity =>
        {
            entity.ToTable("GrammarExamples", table =>
            {
                table.HasCheckConstraint("CK_GrammarExamples_OrderIndex", "[OrderIndex] >= 0");
                table.HasCheckConstraint("CK_GrammarExamples_JapaneseText_NotBlank", "LEN(LTRIM(RTRIM([JapaneseText]))) > 0");
                table.HasCheckConstraint("CK_GrammarExamples_SourceReference", "[ExternalId] IS NULL OR [SourceId] IS NOT NULL");
            });
            entity.Property(e => e.JapaneseText).IsRequired().HasMaxLength(2000);
            entity.Property(e => e.VietnameseTranslation).HasMaxLength(2000);
            entity.Property(e => e.Furigana).HasMaxLength(4000);
            entity.Property(e => e.ExternalId).HasMaxLength(200);
            entity.HasIndex(e => new { e.GrammarId, e.OrderIndex });
            entity.HasOne(e => e.Grammar).WithMany(g => g.Examples)
                .HasForeignKey(e => e.GrammarId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Source).WithMany()
                .HasForeignKey(e => e.SourceId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<LearningContentSource>(entity =>
        {
            entity.ToTable("LearningContentSources", table => table.HasCheckConstraint(
                "CK_LearningContentSources_Provenance_NotBlank",
                "LEN(LTRIM(RTRIM([Name]))) > 0 AND LEN(LTRIM(RTRIM([Version]))) > 0 " +
                "AND LEN(LTRIM(RTRIM([SourceUrl]))) > 0 AND LEN(LTRIM(RTRIM([License]))) > 0 " +
                "AND LEN(LTRIM(RTRIM([LicenseUrl]))) > 0 AND LEN(LTRIM(RTRIM([Attribution]))) > 0"));
            entity.Property(s => s.Name).IsRequired().HasMaxLength(100);
            entity.Property(s => s.Version).IsRequired().HasMaxLength(100);
            entity.Property(s => s.SourceUrl).IsRequired().HasMaxLength(1000);
            entity.Property(s => s.License).IsRequired().HasMaxLength(100);
            entity.Property(s => s.LicenseUrl).IsRequired().HasMaxLength(1000);
            entity.Property(s => s.Attribution).IsRequired().HasColumnType("nvarchar(max)");
            entity.HasIndex(s => new { s.Name, s.Version }).IsUnique();
        });

        modelBuilder.Entity<VocabularySource>(entity =>
        {
            entity.ToTable("VocabularySources", table => table.HasCheckConstraint(
                "CK_VocabularySources_ExternalId_NotBlank", "LEN(LTRIM(RTRIM([ExternalId]))) > 0"));
            entity.HasKey(s => new { s.VocabularyId, s.SourceId, s.ExternalId });
            entity.Property(s => s.ExternalId).IsRequired().HasMaxLength(200);
            entity.HasIndex(s => new { s.SourceId, s.ExternalId });
            entity.HasOne(s => s.Vocabulary).WithMany(v => v.Sources)
                .HasForeignKey(s => s.VocabularyId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(s => s.Source).WithMany(s => s.VocabularySources)
                .HasForeignKey(s => s.SourceId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<GrammarSource>(entity =>
        {
            entity.ToTable("GrammarSources", table => table.HasCheckConstraint(
                "CK_GrammarSources_ExternalId_NotBlank", "LEN(LTRIM(RTRIM([ExternalId]))) > 0"));
            entity.HasKey(s => new { s.GrammarId, s.SourceId, s.ExternalId });
            entity.Property(s => s.ExternalId).IsRequired().HasMaxLength(200);
            entity.HasIndex(s => new { s.SourceId, s.ExternalId });
            entity.HasOne(s => s.Grammar).WithMany(g => g.Sources)
                .HasForeignKey(s => s.GrammarId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(s => s.Source).WithMany(s => s.GrammarSources)
                .HasForeignKey(s => s.SourceId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
