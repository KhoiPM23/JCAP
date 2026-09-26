namespace JCAP.DTOs.Shadowing
{
    public class ShadowingSentenceDto
    {
        public int Id { get; set; }
        public int OrderIndex { get; set; }
        public string SpeakerRole { get; set; } = "A";
        public string JapaneseText { get; set; } = string.Empty;
        public string? RomajiText { get; set; }
        public string VietnameseTranslation { get; set; } = string.Empty;
        public string NativeAudioUrl { get; set; } = string.Empty;
    }
}
