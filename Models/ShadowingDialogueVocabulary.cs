namespace JCAP.Models
{
    public class ShadowingDialogueVocabulary
    {
        public int ShadowingDialogueId { get; set; }
        public ShadowingDialogue ShadowingDialogue { get; set; } = null!;

        public int VocabularyId { get; set; }
        public Vocabulary Vocabulary { get; set; } = null!;

        public int OrderIndex { get; set; }
        public string? Note { get; set; }
    }
}
