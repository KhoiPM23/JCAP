using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace JCAP.Models
{
    public class LearnerMemory
    {
        public int Id { get; set; }

        [Required]
        public string UserId { get; set; } = null!;

        [ForeignKey(nameof(UserId))]
        public virtual ApplicationUser? User { get; set; }

        [Required]
        [MaxLength(100)]
        public string Category { get; set; } = null!; // FoodPreference, Origin, Hobby, WorkTopic

        [Required]
        [MaxLength(100)]
        public string Key { get; set; } = null!; // e.g. "favorite_ramen", "hometown"

        [Required]
        [MaxLength(500)]
        public string Value { get; set; } = null!; // e.g. "tonkotsu", "Da Nang"

        public double Confidence { get; set; } = 1.0;

        [MaxLength(50)]
        public string Visibility { get; set; } = "WorldKnown"; // Private, Relationship, WorldKnown

        public int SourceSessionId { get; set; }

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public DateTime LastConfirmedAtUtc { get; set; } = DateTime.UtcNow;
    }
}
