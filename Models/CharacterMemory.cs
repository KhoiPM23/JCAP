using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace JCAP.Models
{
    public class CharacterMemory
    {
        public int Id { get; set; }

        [Required]
        public string UserId { get; set; } = null!;

        [ForeignKey(nameof(UserId))]
        public virtual ApplicationUser? User { get; set; }

        [Required]
        [MaxLength(100)]
        public string CharacterPersonaKey { get; set; } = null!; // e.g. "ramen_master_ken", "shinjuku_clerk"

        public int AffinityScore { get; set; } = 0; // Cumulative affinity score

        public int EncounterCount { get; set; } = 1; // Number of encounters

        [MaxLength(200)]
        public string? LastInteractionSummary { get; set; } // Short summary of previous encounter (max 120-200 chars)

        public DateTime LastMetAtUtc { get; set; } = DateTime.UtcNow;
    }
}
