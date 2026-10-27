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
        // Detailed explanation of meaning, usage and context.
        public string? Explanation { get; set; }
        // Exceptions, common mistakes and cautions, separate from the main explanation.
        public string? UsageNotes { get; set; }
        public string? AudioUrl { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        // UTC; set by the editing workflow when this content is updated.
        public DateTime? UpdatedAt { get; set; }

        // Navigation
        public ICollection<TopicVocabulary> TopicVocabularies { get; set; } = new List<TopicVocabulary>();
        public ICollection<VocabularyExample> Examples { get; set; } = new List<VocabularyExample>();
        public ICollection<VocabularySource> Sources { get; set; } = new List<VocabularySource>();
        public ICollection<ShadowingDialogueVocabulary> ShadowingDialogueVocabularies { get; set; } = new List<ShadowingDialogueVocabulary>();
    }
}
