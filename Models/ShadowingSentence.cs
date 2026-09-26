namespace JCAP.Models
{
    public class ShadowingSentence
    {
        public int Id { get; set; }
        public int ShadowingDialogueId { get; set; }
        public int OrderIndex { get; set; }
        public string SpeakerRole { get; set; } = "A"; // "A" or "B"
        public string JapaneseText { get; set; } = string.Empty;
        public string? RomajiText { get; set; }
        public string VietnameseTranslation { get; set; } = string.Empty;
        public string NativeAudioUrl { get; set; } = string.Empty;

        // Navigation properties
        public ShadowingDialogue ShadowingDialogue { get; set; } = null!;
    }
}
