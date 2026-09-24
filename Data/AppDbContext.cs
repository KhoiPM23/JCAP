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

        // Scenario related DbSets
        public DbSet<Scenario> Scenarios { get; set; } = null!;
        public DbSet<ScenarioLevelConfiguration> ScenarioLevelConfigurations { get; set; } = null!;
        public DbSet<Mission> Missions { get; set; } = null!;
        public DbSet<TargetVocabulary> TargetVocabularies { get; set; } = null!;
        public DbSet<TargetGrammar> TargetGrammars { get; set; } = null!;

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
        }
    }
}
