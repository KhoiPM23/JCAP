using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Shadowing.Admin
{
    public class GenerateShadowingDialogueRequest
    {
        public int? ScenarioId { get; set; }

        [Required(ErrorMessage = "Tiêu đề hoặc chủ đề không được để trống.")]
        [MaxLength(200)]
        public string ContextTitle { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string? ContextDescription { get; set; }

        [Required]
        [RegularExpression("^(N5|N4|N3)$", ErrorMessage = "JLPTLevel chỉ chấp nhận N5, N4 hoặc N3.")]
        public string JLPTLevel { get; set; } = "N5";

        public List<string>? SpeakerRoles { get; set; }

        [Range(2, 20)]
        public int SentenceCount { get; set; } = 4;

        [Range(1, 10)]
        public int VocabCount { get; set; } = 3;

        [Range(1, 10)]
        public int GrammarCount { get; set; } = 2;

        [MaxLength(1000)]
        public string? CustomInstructions { get; set; }
    }
}
