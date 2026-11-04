namespace JCAP.Services.Interfaces
{
    public interface IEpisodicFactExtractor
    {
        /// <summary>
        /// Phân tích câu nói của học viên để trích xuất các thông tin cá nhân đáng nhớ (sở thích, quê quán, nghề nghiệp).
        /// Hoạt động tất định siêu tốc 0ms, không tốn token LLM.
        /// </summary>
        /// <param name="japaneseText">Câu thoại tiếng Nhật của học viên</param>
        /// <returns>Chuỗi sự kiện ngắn gọn (VD: "likes: tonkotsu_ramen", "origin: da_nang") hoặc null nếu không có</returns>
        string? ExtractFact(string japaneseText);
    }
}

