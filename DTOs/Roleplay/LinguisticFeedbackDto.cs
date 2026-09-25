namespace JCAP.DTOs.Roleplay;

public class LinguisticFeedbackDto
{
    /// <summary>
    /// Trạng thái đánh giá nhanh: "Good" (Xanh lá), "Warning" (Chấm than vàng), "Error" (Đỏ)
    /// </summary>
    public string Status { get; set; } = "Good";
    public string QuickStatus { get => Status; set => Status = value; }

    /// <summary>
    /// Tóm tắt đánh giá: ví dụ "Khá tốt • Cần điều chỉnh nhỏ", "Rất chính xác"
    /// </summary>
    public string Summary { get; set; } = string.Empty;

    /// <summary>
    /// Danh sách phân tích ngôn ngữ chi tiết (ngữ cảnh, trợ từ, văn phong...)
    /// </summary>
    public List<LinguisticDetailItemDto> Details { get; set; } = [];

    /// <summary>
    /// Câu gợi ý tự nhiên hơn chuẩn người bản xứ
    /// </summary>
    public string? NaturalAlternative { get; set; }

    /// <summary>
    /// Mẹo văn hóa bản xứ hoặc chú thích thêm
    /// </summary>
    public string? CulturalTip { get; set; }
}

public class LinguisticDetailItemDto
{
    /// <summary>
    /// Loại item: "success" (tích xanh), "warning" (chấm than vàng), "error" (chấm đỏ)
    /// </summary>
    public string Type { get; set; } = "success";

    /// <summary>
    /// Khía cạnh: "Ngữ cảnh gọi món", "Trợ từ", "Văn phong lịch sự"...
    /// </summary>
    public string Aspect { get; set; } = string.Empty;

    /// <summary>
    /// Nội dung nhận xét chi tiết
    /// </summary>
    public string Comment { get; set; } = string.Empty;
}
