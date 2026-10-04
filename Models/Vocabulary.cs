using System;
using System.Collections.Generic;

namespace JCAP.Models
{
    public class Vocabulary
    {
        public int Id { get; set; }
        public string Word { get; set; } = string.Empty;
        public string? Reading { get; set; }
        public string Meaning { get; set; } = string.Empty;
        public string? JLPTLevel { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation
        public ICollection<ShadowingDialogueVocabulary> ShadowingDialogueVocabularies { get; set; } = new List<ShadowingDialogueVocabulary>();
    }
}
