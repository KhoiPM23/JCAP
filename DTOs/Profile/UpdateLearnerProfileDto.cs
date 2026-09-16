using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.Profile
{
    public class UpdateLearnerProfileDto
    {
        [Required(ErrorMessage = "Họ và tên là bắt buộc.")]
        [MinLength(2, ErrorMessage = "Họ và tên tối thiểu phải 2 ký tự.")]
        [MaxLength(100, ErrorMessage = "Họ và tên không được vượt quá 100 ký tự.")]
        public string FullName { get; set; } = string.Empty;

        [RegularExpression(@"^(0[0-9]{9})?$", ErrorMessage = "Số điện thoại không hợp lệ (gồm 10 chữ số và bắt đầu bằng số 0).")]
        public string? PhoneNumber { get; set; }

        [Url(ErrorMessage = "Đường dẫn ảnh đại diện không hợp lệ.")]
        public string? ProfilePictureUrl { get; set; }

        [Required(ErrorMessage = "Trình độ JLPT là bắt buộc.")]
        [RegularExpression("^(N5|N4|N3)$", ErrorMessage = "Trình độ JLPT chỉ chấp nhận N5, N4 hoặc N3. Tuyệt đối không hỗ trợ N2 hoặc N1.")]
        public string JLPTLevel { get; set; } = "N5";
    }
}
