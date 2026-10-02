namespace JCAP.Models
{
    public class ShadowingVocabulary
    {
        public int Id { get; set; }
        public int ShadowingDialogueId { get; set; }
        public string Word { get; set; } = string.Empty;
        public string? Reading { get; set; }
        public string Meaning { get; set; } = string.Empty;

        // Navigation property
        public ShadowingDialogue ShadowingDialogue { get; set; } = null!;
    }
}
