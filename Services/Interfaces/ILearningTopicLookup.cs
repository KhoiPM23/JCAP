using System.Collections.Generic;
using System.Threading.Tasks;
using JCAP.Models;

namespace JCAP.Services.Interfaces
{
    public record LearningTopicSnapshot(
        int TopicId,
        string Title,
        string? Description,
        string JLPTLevel,
        IReadOnlyList<Vocabulary> Vocabularies,
        IReadOnlyList<Grammar> Grammars);

    /// <summary>
    /// Lớp trung gian tra cứu Topic và các Từ vựng/Ngữ pháp Learner-visible thuộc Topic.
    /// Khi thành viên phụ trách Topic merge bảng Topic + bảng nối, chỉ cần cập nhật cài đặt của interface này.
    /// </summary>
    public interface ILearningTopicLookup
    {
        Task<List<LearningTopicSnapshot>> GetActiveTopicsAsync(string? jlptLevelFilter = null, string? keyword = null);
        Task<LearningTopicSnapshot?> GetActiveTopicByIdAsync(int topicId);
    }
}
