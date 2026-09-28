using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Shadowing.Admin
{
    public class CreateShadowingSentenceDto
    {
        [Required]
        [Range(1, 1000)]
        public int OrderIndex { get; set; }

        [Required]
        [RegularExpression("^(A|B)$", ErrorMessage = "SpeakerRole chỉ được phép là 'A' hoặc 'B'.")]
        public string SpeakerRole { get; set; } = "A";

        [Required(ErrorMessage = "JapaneseText không được để trống.")]
        [MaxLength(500)]
        public string JapaneseText { get; set; } = string.Empty;

        [MaxLength(500)]
        public string? RomajiText { get; set; }

        [Required(ErrorMessage = "VietnameseTranslation không được để trống.")]
        [MaxLength(500)]
        public string VietnameseTranslation { get; set; } = string.Empty;

        [Required(ErrorMessage = "NativeAudioUrl không được để trống.")]
        [MaxLength(1000)]
        public string NativeAudioUrl { get; set; } = string.Empty;
    }
}
