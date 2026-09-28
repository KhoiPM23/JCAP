using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Shadowing.Admin
{
    public class UpdateShadowingDialogueDto
    {
        [Required(ErrorMessage = "Tiêu đề không được để trống.")]
        [MaxLength(200)]
        public string Title { get; set; } = string.Empty;

        [Required(ErrorMessage = "JLPTLevel không được để trống.")]
        [RegularExpression("^(N5|N4|N3)$", ErrorMessage = "JLPTLevel chỉ chấp nhận N5, N4 hoặc N3.")]
        public string JLPTLevel { get; set; } = "N5";

        [MaxLength(500)]
        public string? SourceDescription { get; set; }

        [Required(ErrorMessage = "Tên vai A không được để trống.")]
        [MaxLength(100)]
        public string SpeakerRoleA_Name { get; set; } = string.Empty;

        [Required(ErrorMessage = "Tên vai B không được để trống.")]
        [MaxLength(100)]
        public string SpeakerRoleB_Name { get; set; } = string.Empty;

        public bool IsActive { get; set; } = true;

        [Required(ErrorMessage = "Danh sách câu thoại không được để trống.")]
        [MinLength(1, ErrorMessage = "Phải có ít nhất 1 câu thoại.")]
        public List<CreateShadowingSentenceDto> Sentences { get; set; } = new List<CreateShadowingSentenceDto>();
    }
}
