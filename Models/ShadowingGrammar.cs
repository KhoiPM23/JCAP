namespace JCAP.Models
{
    public class ShadowingGrammar
    {
        public int Id { get; set; }
        public int ShadowingDialogueId { get; set; }
        public string Pattern { get; set; } = string.Empty;
        public string Meaning { get; set; } = string.Empty;
        public string? ExampleSentence { get; set; }

        // Navigation property
        public ShadowingDialogue ShadowingDialogue { get; set; } = null!;
    }
}
