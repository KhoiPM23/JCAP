namespace JCAP.DTOs.Credit
{
    public class PayOsSettings
    {
        public const string SectionName = "PayOS";

        /// <summary>
        /// Cho phép Admin bật/tắt chế độ thanh toán thử nghiệm (Mock Mode) trực tiếp trên giao diện.
        /// Khi IsRuntimeMockEnabled = true, mọi giao dịch mua gói Credit và gói Hội viên đều nạp thẳng ngay lập tức.
        /// </summary>
        public static bool IsRuntimeMockEnabled { get; set; } = false;

        public string ClientId { get; set; } = string.Empty;
        public string ApiKey { get; set; } = string.Empty;
        public string ChecksumKey { get; set; } = string.Empty;
        public string ReturnUrl { get; set; } = string.Empty;
        public string CancelUrl { get; set; } = string.Empty;

        public bool IsConfigured => !string.IsNullOrWhiteSpace(ClientId) &&
                                    !string.IsNullOrWhiteSpace(ApiKey) &&
                                    !string.IsNullOrWhiteSpace(ChecksumKey);
    }

    public class PaymentModeStatusDto
    {
        public bool IsMockMode { get; set; }
        public bool IsPayOsConfigured { get; set; }
    }

    public class UpdatePaymentModeDto
    {
        public bool IsMockMode { get; set; }
    }
}
