using JCAP.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data
{
    public class AppDbContext : IdentityDbContext<ApplicationUser>
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<CreditPackage> CreditPackages { get; set; } = null!;
        public DbSet<CreditTransaction> CreditTransactions { get; set; } = null!;
        public DbSet<RoleplayResult> RoleplayResults { get; set; } = null!;

        // Scenario related DbSets
        public DbSet<Scenario> Scenarios { get; set; } = null!;
        public DbSet<ScenarioLevelConfiguration> ScenarioLevelConfigurations { get; set; } = null!;
        public DbSet<Mission> Missions { get; set; } = null!;
        public DbSet<TargetVocabulary> TargetVocabularies { get; set; } = null!;
        public DbSet<TargetGrammar> TargetGrammars { get; set; } = null!;

        // Shadowing related DbSets
        public DbSet<ShadowingDialogue> ShadowingDialogues { get; set; } = null!;
        public DbSet<ShadowingSentence> ShadowingSentences { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // ApplicationUser configuration
            modelBuilder.Entity<ApplicationUser>(entity =>
            {
                entity.Property(e => e.JLPTLevel)
                    .IsRequired()
                    .HasMaxLength(10)
                    .HasDefaultValue("N5");
            });

            // CreditPackage configuration
            modelBuilder.Entity<CreditPackage>(entity =>
            {
                entity.Property(e => e.Name)
                    .IsRequired()
                    .HasMaxLength(100);

                entity.Property(e => e.Price)
                    .HasPrecision(18, 2);
            });

            // CreditTransaction configuration
            modelBuilder.Entity<CreditTransaction>(entity =>
            {
                entity.Property(e => e.Type)
                    .IsRequired()
                    .HasMaxLength(20);

                entity.Property(e => e.Status)
                    .IsRequired()
                    .HasMaxLength(20);

                entity.Property(e => e.Description)
                    .HasMaxLength(500);

                entity.Property(e => e.PayOsOrderCode)
                    .HasMaxLength(100);

                // ApplicationUser 1 - N CreditTransaction
                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            // Scenario configuration
            modelBuilder.Entity<Scenario>(entity =>
            {
                entity.Property(e => e.Title)
                    .IsRequired()
                    .HasMaxLength(200);

                entity.Property(e => e.Description)
                    .HasMaxLength(1000);

                entity.Property(e => e.Thumbnail)
                    .HasMaxLength(500);

                entity.Property(e => e.ScenarioCode)
                    .HasMaxLength(50);

                entity.HasMany(e => e.LevelConfigurations)
                    .WithOne(e => e.Scenario)
                    .HasForeignKey(e => e.ScenarioId)
                    .OnDelete(DeleteBehavior.Cascade);

            });

            // ScenarioLevelConfiguration configuration
            modelBuilder.Entity<ScenarioLevelConfiguration>(entity =>
            {
                // Unique Index for ScenarioId + JLPTLevel
                entity.HasIndex(e => new { e.ScenarioId, e.JLPTLevel })
                    .IsUnique();

                entity.Property(e => e.JLPTLevel)
                    .IsRequired()
                    .HasMaxLength(10);

                entity.Property(e => e.Title)
                    .IsRequired()
                    .HasMaxLength(200);

                entity.Property(e => e.Description)
                    .HasMaxLength(1000);

                entity.Property(e => e.AiPersona)
                    .IsRequired()
                    .HasMaxLength(100);

                entity.Property(e => e.Status)
                    .IsRequired()
                    .HasMaxLength(20)
                    .HasDefaultValue("Draft");

                entity.HasMany(e => e.Missions)
                    .WithOne(e => e.ScenarioLevelConfiguration)
                    .HasForeignKey(e => e.ScenarioLevelConfigurationId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(e => e.TargetVocabularies)
                    .WithOne(e => e.ScenarioLevelConfiguration)
                    .HasForeignKey(e => e.ScenarioLevelConfigurationId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(e => e.TargetGrammars)
                    .WithOne(e => e.ScenarioLevelConfiguration)
                    .HasForeignKey(e => e.ScenarioLevelConfigurationId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Mission configuration
            modelBuilder.Entity<Mission>(entity =>
            {
                entity.Property(e => e.Content)
                    .IsRequired()
                    .HasMaxLength(500);

                entity.Property(e => e.CompletionCriteriaJson)
                    .IsRequired();
            });

            // TargetVocabulary configuration
            modelBuilder.Entity<TargetVocabulary>(entity =>
            {
                entity.Property(e => e.Word)
                    .IsRequired()
                    .HasMaxLength(100);

                entity.Property(e => e.Reading)
                    .HasMaxLength(100);

                entity.Property(e => e.Meaning)
                    .IsRequired()
                    .HasMaxLength(200);
            });

            // TargetGrammar configuration
            modelBuilder.Entity<TargetGrammar>(entity =>
            {
                entity.Property(e => e.Pattern)
                    .IsRequired()
                    .HasMaxLength(100);

                entity.Property(e => e.Meaning)
                    .IsRequired()
                    .HasMaxLength(200);

                entity.Property(e => e.ExampleSentence)
                    .HasMaxLength(500);
            });
// ShadowingDialogue configuration
            modelBuilder.Entity<ShadowingDialogue>(entity =>
            {
                entity.Property(e => e.Title)
                    .IsRequired()
                    .HasMaxLength(200);

                entity.Property(e => e.JLPTLevel)
                    .IsRequired()
                    .HasMaxLength(10);

                entity.Property(e => e.SourceDescription)
                    .HasMaxLength(500);

                entity.Property(e => e.SpeakerRoleA_Name)
                    .IsRequired()
                    .HasMaxLength(100);

                entity.Property(e => e.SpeakerRoleB_Name)
                    .IsRequired()
                    .HasMaxLength(100);

                entity.Property(e => e.IsActive)
                    .HasDefaultValue(true);

                entity.Property(e => e.CreatedAt)
                    .HasDefaultValueSql("GETUTCDATE()");

                entity.HasIndex(e => new { e.ScenarioId, e.JLPTLevel });

                entity.HasOne(e => e.Scenario)
                    .WithMany(s => s.ShadowingDialogues)
                    .HasForeignKey(e => e.ScenarioId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasMany(e => e.Sentences)
                    .WithOne(e => e.ShadowingDialogue)
                    .HasForeignKey(e => e.ShadowingDialogueId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // ShadowingSentence configuration
            modelBuilder.Entity<ShadowingSentence>(entity =>
            {
                entity.Property(e => e.SpeakerRole)
                    .IsRequired()
                    .HasMaxLength(10);

                entity.Property(e => e.JapaneseText)
                    .IsRequired()
                    .HasMaxLength(500);

                entity.Property(e => e.RomajiText)
                    .HasMaxLength(500);

                entity.Property(e => e.VietnameseTranslation)
                    .IsRequired()
                    .HasMaxLength(500);

                entity.Property(e => e.NativeAudioUrl)
                    .IsRequired()
                    .HasMaxLength(1000);

                entity.HasIndex(e => new { e.ShadowingDialogueId, e.OrderIndex });
            });

            // Roleplay result configuration
            modelBuilder.Entity<RoleplayResult>(entity =>
            {
                entity.HasIndex(e => new { e.RoleplaySessionId, e.UserId })
                    .IsUnique();

                entity.Property(e => e.ScenarioTitle)
                    .IsRequired()
                    .HasMaxLength(200);

                entity.Property(e => e.JLPTLevel)
                    .IsRequired()
                    .HasMaxLength(10);

                entity.Property(e => e.GeneralFeedbackText)
                    .IsRequired()
                    .HasMaxLength(4000);

                entity.Property(e => e.CompletedMissionsSummaryJson)
                    .IsRequired()
                    .HasColumnType("nvarchar(max)");

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Restrict);
            });
        }
    }
}
