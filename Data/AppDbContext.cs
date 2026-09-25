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
