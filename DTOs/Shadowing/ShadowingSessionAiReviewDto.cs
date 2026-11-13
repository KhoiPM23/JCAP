using System;
using System.Collections.Generic;

namespace JCAP.DTOs.Shadowing
{
    /// <summary>
    /// Nhận xét buổi Shadowing do AI viết TỪ SỐ LIỆU hệ thống đã đo, tập trung vào Phát âm (các lỗi âm hệ thống phát hiện, gom theo kiểu lỗi)
    /// và Lưu loát (nhịp nói so với giọng mẫu). Không phải điểm; không lưu vào CSDL (tạo khi người học bấm nút).
    /// </summary>
    public class ShadowingSessionAiReviewDto
    {
        /// <summary>Kết luận chính, 1 câu.</summary>
        public string Summary { get; set; } = string.Empty;
        /// <summary>Một việc quan trọng nhất nên luyện ngay.</summary>
        public string Priority { get; set; } = string.Empty;
        public ShadowingAiReviewSectionDto Pronunciation { get; set; } = new();
        /// <summary>Null khi buổi không có số liệu Lưu loát.</summary>
        public ShadowingAiReviewSectionDto? Fluency { get; set; }
        public bool HasFluencyData { get; set; }
        public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    }

    public class ShadowingAiReviewSectionDto
    {
        /// <summary>Đánh giá ngắn của phần này, 1 câu.</summary>
        public string Verdict { get; set; } = string.Empty;
        /// <summary>Tối đa 3 vấn đề, vấn đề lặp lại nhiều nhất trước.</summary>
        public List<ShadowingAiReviewPointDto> Issues { get; set; } = new();
    }

    public class ShadowingAiReviewPointDto
    {
        /// <summary>Vấn đề (ngắn).</summary>
        public string Title { get; set; } = string.Empty;
        /// <summary>Bằng chứng từ số liệu (câu, từ, con số).</summary>
        public string Evidence { get; set; } = string.Empty;
        /// <summary>Cách sửa cụ thể.</summary>
        public string Fix { get; set; } = string.Empty;
    }
}
