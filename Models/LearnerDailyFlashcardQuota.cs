using System;

namespace JCAP.Models
{
    public class LearnerDailyFlashcardQuota
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public DateOnly DateVn { get; set; }
        public int ExtraUnlockedCards { get; set; } = 0;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Navigation property
        public ApplicationUser User { get; set; } = null!;
    }
}
