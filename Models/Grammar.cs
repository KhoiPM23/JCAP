using System;
using System.Collections.Generic;

namespace JCAP.Models
{
    public class Grammar
    {
        public int Id { get; set; }
        public string Pattern { get; set; } = string.Empty;
        public string? Reading { get; set; }
        public string Meaning { get; set; } = string.Empty;
        public string? Formation { get; set; }
        // Detailed explanation of meaning, usage and context.
        public string? Explanation { get; set; }
        public string? UsageNotes { get; set; }
        // Retained for existing consumers; self-study details use Examples.
        public string? ExampleSentence { get; set; }
        public string? JLPTLevel { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        // UTC; set by the editing workflow when this content is updated.
        public DateTime? UpdatedAt { get; set; }

        // Navigation
        public ICollection<TopicGrammar> TopicGrammars { get; set; } = new List<TopicGrammar>();
        public ICollection<GrammarExample> Examples { get; set; } = new List<GrammarExample>();
        public ICollection<GrammarSource> Sources { get; set; } = new List<GrammarSource>();
        public ICollection<ShadowingDialogueGrammar> ShadowingDialogueGrammars { get; set; } = new List<ShadowingDialogueGrammar>();
    }
}
