using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Shadowing.Admin
{
    public class CreateShadowingVocabularyDto
    {
        [Required(ErrorMessage = "Từ vựng không được để trống.")]
        [MaxLength(100)]
        public string Word { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? Reading { get; set; }

        [Required(ErrorMessage = "Nghĩa từ vựng không được để trống.")]
        [MaxLength(200)]
        public string Meaning { get; set; } = string.Empty;
    }
}
