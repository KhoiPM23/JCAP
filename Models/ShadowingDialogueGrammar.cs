namespace JCAP.Models
{
    public class ShadowingDialogueGrammar
    {
        public int ShadowingDialogueId { get; set; }
        public ShadowingDialogue ShadowingDialogue { get; set; } = null!;

        public int GrammarId { get; set; }
        public Grammar Grammar { get; set; } = null!;

        public int OrderIndex { get; set; }
        public string? Note { get; set; }
    }
}
