using System.ComponentModel.DataAnnotations;

namespace JCAP.DTOs.CreditPackage
{
    public class CreateCreditPackageDto
    {
        [Required(ErrorMessage = "Tên gói credit là bắt buộc")]
        [StringLength(100, MinimumLength = 2, ErrorMessage = "Tên gói phải từ 2 đến 100 ký tự")]
        public string Name { get; set; } = string.Empty;

        [Required(ErrorMessage = "Số credits là bắt buộc")]
        [Range(1, int.MaxValue, ErrorMessage = "Số credits phải lớn hơn 0")]
        public int Credits { get; set; }

        [Required(ErrorMessage = "Giá tiền là bắt buộc")]
        [Range(0, (double)decimal.MaxValue, ErrorMessage = "Giá tiền không được âm")]
        public decimal Price { get; set; }
    }
}

