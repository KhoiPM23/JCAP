using System;
using System.Collections.Generic;

namespace JCAP.Models
{
    public class Grammar
    {
        public int Id { get; set; }
        public string Pattern { get; set; } = string.Empty;
        public string Meaning { get; set; } = string.Empty;
        public string? Formation { get; set; }
        // Detailed meaning, usage and cautions are kept together here.
        public string? Explanation { get; set; }
        public string? ExampleSentence { get; set; }
        public string? JLPTLevel { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        // UTC; set by the editing workflow when this content is updated.
        public DateTime? UpdatedAt { get; set; }

        // Navigation
        public ICollection<ShadowingDialogueGrammar> ShadowingDialogueGrammars { get; set; } = new List<ShadowingDialogueGrammar>();
    }
}
