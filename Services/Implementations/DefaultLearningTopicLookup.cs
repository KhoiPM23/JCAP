using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Cài đặt của ILearningTopicLookup phục vụ tra cứu chủ đề và các Từ vựng/Ngữ pháp độc lập (FE-05 Self-study).
    /// Tuyệt đối tách biệt, không tự gom từ vựng/ngữ pháp phụ thuộc của Shadowing hoặc Scenario.
    /// </summary>
    public class DefaultLearningTopicLookup : ILearningTopicLookup
    {
        private static readonly (int TopicId, string Level, string Title, string Description)[] DefaultLevelTopics =
        {
            (1, "N5", "Chủ đề Sơ cấp N5", "Tổng hợp từ vựng và mẫu ngữ pháp nền tảng trình độ JLPT N5."),
            (2, "N4", "Chủ đề Sơ - Trung cấp N4", "Tổng hợp từ vựng và mẫu ngữ pháp thông dụng trình độ JLPT N4."),
            (3, "N3", "Chủ đề Trung cấp N3", "Tổng hợp từ vựng và mẫu ngữ pháp giao tiếp trình độ JLPT N3.")
        };

        private readonly AppDbContext _db;

        public DefaultLearningTopicLookup(AppDbContext db)
        {
            _db = db;
        }

        public async Task<List<LearningTopicSnapshot>> GetActiveTopicsAsync(string? jlptLevelFilter = null, string? keyword = null)
        {
            // Chỉ lấy các từ vựng & ngữ pháp ĐỘC LẬP (không bị gắn với Shadowing Dialogues)
            var vocabularies = await _db.Vocabularies
                .AsNoTracking()
                .Where(v => v.IsActive && !v.ShadowingDialogueVocabularies.Any())
                .OrderBy(v => v.Id)
                .ToListAsync();

            var grammars = await _db.Grammars
                .AsNoTracking()
                .Where(g => g.IsActive && !g.ShadowingDialogueGrammars.Any())
                .OrderBy(g => g.Id)
                .ToListAsync();

            // Nếu không có bất kỳ từ vựng hoặc ngữ pháp độc lập nào trong DB, trả về danh sách rỗng
            if (vocabularies.Count == 0 && grammars.Count == 0)
            {
                return new List<LearningTopicSnapshot>();
            }

            var result = new List<LearningTopicSnapshot>();

            foreach (var def in DefaultLevelTopics)
            {
                if (!string.IsNullOrWhiteSpace(jlptLevelFilter) &&
                    !string.Equals(def.Level, jlptLevelFilter.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                if (!string.IsNullOrWhiteSpace(keyword))
                {
                    string kw = keyword.Trim();
                    if (!def.Title.Contains(kw, StringComparison.OrdinalIgnoreCase) &&
                        !def.Description.Contains(kw, StringComparison.OrdinalIgnoreCase) &&
                        !def.Level.Contains(kw, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                }

                var levelVocabs = vocabularies
                    .Where(v => string.Equals(v.JLPTLevel ?? "N5", def.Level, StringComparison.OrdinalIgnoreCase))
                    .ToList();

                var levelGrammars = grammars
                    .Where(g => string.Equals(g.JLPTLevel ?? "N5", def.Level, StringComparison.OrdinalIgnoreCase))
                    .ToList();

                if (levelVocabs.Count == 0 && levelGrammars.Count == 0)
                {
                    continue;
                }

                result.Add(new LearningTopicSnapshot(
                    def.TopicId,
                    def.Title,
                    def.Description,
                    def.Level,
                    levelVocabs,
                    levelGrammars));
            }

            return result;
        }

        public async Task<LearningTopicSnapshot?> GetActiveTopicByIdAsync(int topicId)
        {
            var topics = await GetActiveTopicsAsync();
            return topics.FirstOrDefault(t => t.TopicId == topicId);
        }
    }
}
