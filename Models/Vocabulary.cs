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
        public string? PartOfSpeech { get; set; }
        public string? JLPTLevel { get; set; }
        // Detailed meaning, usage and cautions are kept together here.
        public string? Explanation { get; set; }
        public string? AudioUrl { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        // UTC; set by the editing workflow when this content is updated.
        public DateTime? UpdatedAt { get; set; }

        // Navigation
        public ICollection<ShadowingDialogueVocabulary> ShadowingDialogueVocabularies { get; set; } = new List<ShadowingDialogueVocabulary>();
    }
}
