using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Shadowing.Admin
{
    public class TranslateAssistRequest
    {
        [Required(ErrorMessage = "Nội dung văn bản không được để trống.")]
        [MaxLength(1000)]
        public string Text { get; set; } = string.Empty;

        [RegularExpression("^(ja|vi)$", ErrorMessage = "SourceLanguage chỉ chấp nhận 'ja' hoặc 'vi'.")]
        public string SourceLanguage { get; set; } = "ja";

        public string? JLPTLevel { get; set; }
    }
}
