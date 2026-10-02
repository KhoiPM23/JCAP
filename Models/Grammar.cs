using System;
using System.Collections.Generic;

namespace JCAP.Models
{
    public class Grammar
    {
        public int Id { get; set; }
        public string Pattern { get; set; } = string.Empty;
        public string Meaning { get; set; } = string.Empty;
        public string? ExampleSentence { get; set; }
        public string? JLPTLevel { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation
        public ICollection<ShadowingDialogueGrammar> ShadowingDialogueGrammars { get; set; } = new List<ShadowingDialogueGrammar>();
    }
}
