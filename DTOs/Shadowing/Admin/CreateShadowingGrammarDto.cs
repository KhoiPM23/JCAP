using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Shadowing.Admin
{
    public class CreateShadowingGrammarDto
    {
        public int? Id { get; set; }

        [Required(ErrorMessage = "Mẫu ngữ pháp không được để trống.")]
        [MaxLength(100)]
        public string Pattern { get; set; } = string.Empty;

        [Required(ErrorMessage = "Ý nghĩa ngữ pháp không được để trống.")]
        [MaxLength(200)]
        public string Meaning { get; set; } = string.Empty;

        [MaxLength(500)]
        public string? ExampleSentence { get; set; }
    }
}
