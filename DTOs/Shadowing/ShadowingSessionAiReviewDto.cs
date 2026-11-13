using System;
using System.Collections.Generic;

namespace JCAP.DTOs.Shadowing
{
    /// <summary>
    /// Nhận xét tổng hợp buổi Shadowing do AI viết TỪ SỐ LIỆU hệ thống đã đo (điểm nội dung, lỗi từng âm, số liệu Lưu loát).
    /// Không phải điểm mới; không lưu vào CSDL (tạo khi người học bấm nút).
    /// </summary>
    public class ShadowingSessionAiReviewDto
    {
        /// <summary>Tổng quan 2–3 câu.</summary>
        public string Overview { get; set; } = string.Empty;
        public List<string> Strengths { get; set; } = new();
        /// <summary>Nhận xét về nội dung/âm (dựa trên lỗi theo từ và từng âm).</summary>
        public List<ShadowingAiReviewPointDto> Content { get; set; } = new();
        /// <summary>Nhận xét về nhịp nói (so với giọng mẫu, tham khảo). Rỗng khi không có số liệu Lưu loát.</summary>
        public List<ShadowingAiReviewPointDto> Fluency { get; set; } = new();
        public List<string> NextSteps { get; set; } = new();
        /// <summary>Buổi có số liệu Lưu loát để nhận xét không.</summary>
        public bool HasFluencyData { get; set; }
        public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    }

    public class ShadowingAiReviewPointDto
    {
        /// <summary>Vấn đề hoặc nhận định.</summary>
        public string Point { get; set; } = string.Empty;
        /// <summary>Bằng chứng trích từ số liệu (câu, từ, con số).</summary>
        public string Evidence { get; set; } = string.Empty;
        /// <summary>Cách luyện cụ thể.</summary>
        public string Advice { get; set; } = string.Empty;
    }
}
