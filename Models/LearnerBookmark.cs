using System;

namespace JCAP.Models
{
    public class LearnerBookmark
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public int? VocabularyId { get; set; }
        public int? GrammarId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public ApplicationUser User { get; set; } = null!;
        public Vocabulary? Vocabulary { get; set; }
        public Grammar? Grammar { get; set; }
    }
}
