using System.Threading.Tasks;

namespace JCAP.Services.Interfaces
{
    public interface IPersonaMemoryService
    {
        /// <summary>
        /// Tạo chuỗi ký ức nén siêu gọn (<65 tokens) để chèn vào System Prompt của LLM
        /// Ví dụ: "[MEM: affinity=30, visits=3, likes='shoyu_ramen', streak=2]"
        /// </summary>
        Task<string> GetCompactMemoryDirectiveAsync(string userId, string npcCode);

        /// <summary>
        /// Ghi nhận kết thúc phiên hội thoại để tăng điểm thân thiết và lưu các thông tin đáng nhớ (inside jokes, sở thích)
        /// </summary>
        Task RecordSessionAffinityAsync(string userId, string npcCode, bool completedSuccessfully, string? memorizedFact = null);

        /// <summary>
        /// Tạo lời chào mở đầu thích ứng với mối quan hệ và thời điểm trong ngày (Circadian Greeting)
        /// </summary>
        Task<string?> GetAdaptiveCircadianGreetingAsync(string userId, string npcCode);
    }
}
