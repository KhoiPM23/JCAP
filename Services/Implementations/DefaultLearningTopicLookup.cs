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
    /// Cài đặt của ILearningTopicLookup tra cứu chủ đề tự học trực tiếp từ bảng LearningTopics và các bảng nối TopicVocabularies, TopicGrammars.
    /// Thiết kế theo nguyên tắc Ràng buộc thuận (Positive Association):
    /// Chỉ lấy các từ vựng và ngữ pháp được gán tường minh vào chủ đề tự học (Self-study LearningTopics),
    /// hoàn toàn độc lập và không chứa bất kỳ logic loại trừ phụ thuộc nào vào Scenario hay Shadowing.
    /// </summary>
    public class DefaultLearningTopicLookup : ILearningTopicLookup
    {
        private readonly AppDbContext _db;

        public DefaultLearningTopicLookup(AppDbContext db)
        {
            _db = db;
        }

        public async Task<List<LearningTopicSnapshot>> GetActiveTopicsAsync(string? jlptLevelFilter = null, string? keyword = null)
        {
            var query = _db.LearningTopics
                .AsNoTracking()
                .Where(t => t.IsActive);
            if (!string.IsNullOrWhiteSpace(jlptLevelFilter))
                query = query.Where(t => t.JLPTLevel == jlptLevelFilter.Trim().ToUpper());

            if (!string.IsNullOrWhiteSpace(keyword))
            {
                string kw = keyword.Trim();
                query = query.Where(t => t.Name.Contains(kw) || (t.Description != null && t.Description.Contains(kw)));
            }

            var topics = await query
                .Include(t => t.TopicVocabularies.OrderBy(tv => tv.OrderIndex))
                    .ThenInclude(tv => tv.Vocabulary)
                .Include(t => t.TopicGrammars.OrderBy(tg => tg.OrderIndex))
                    .ThenInclude(tg => tg.Grammar)
                .OrderBy(t => t.Id)
                .ToListAsync();

            if (topics.Count == 0)
            {
                return new List<LearningTopicSnapshot>();
            }

            var result = new List<LearningTopicSnapshot>();

            foreach (var topic in topics)
            {
                var matchedVocabs = topic.TopicVocabularies
                    .Select(tv => tv.Vocabulary)
                    .Where(v => v != null && v.IsActive && (v.JLPTLevel ?? "N5") == topic.JLPTLevel)
                    .Where(v => string.IsNullOrWhiteSpace(jlptLevelFilter) ||
                                string.Equals(v.JLPTLevel ?? "N5", jlptLevelFilter.Trim(), StringComparison.OrdinalIgnoreCase))
                    .ToList();

                var matchedGrammars = topic.TopicGrammars
                    .Select(tg => tg.Grammar)
                    .Where(g => g != null && g.IsActive && (g.JLPTLevel ?? "N5") == topic.JLPTLevel)
                    .Where(g => string.IsNullOrWhiteSpace(jlptLevelFilter) ||
                                string.Equals(g.JLPTLevel ?? "N5", jlptLevelFilter.Trim(), StringComparison.OrdinalIgnoreCase))
                    .ToList();

                if (matchedVocabs.Count == 0 && matchedGrammars.Count == 0)
                {
                    continue;
                }

                // Xác định JLPT Level đại diện cho Topic snapshot
                string topicLevel = topic.JLPTLevel;

                result.Add(new LearningTopicSnapshot(
                    topic.Id,
                    topic.Name,
                    topic.Description,
                    topicLevel,
                    matchedVocabs,
                    matchedGrammars));
            }

            return result;
        }

        public async Task<LearningTopicSnapshot?> GetActiveTopicByIdAsync(int topicId)
        {
            var topic = await _db.LearningTopics
                .AsNoTracking()
                .Where(t => t.Id == topicId && t.IsActive)
                .Include(t => t.TopicVocabularies.OrderBy(tv => tv.OrderIndex))
                    .ThenInclude(tv => tv.Vocabulary)
                .Include(t => t.TopicGrammars.OrderBy(tg => tg.OrderIndex))
                    .ThenInclude(tg => tg.Grammar)
                .FirstOrDefaultAsync();

            if (topic == null)
            {
                return null;
            }

            var matchedVocabs = topic.TopicVocabularies
                .Select(tv => tv.Vocabulary)
                .Where(v => v != null && v.IsActive && (v.JLPTLevel ?? "N5") == topic.JLPTLevel)
                .ToList();

            var matchedGrammars = topic.TopicGrammars
                .Select(tg => tg.Grammar)
                .Where(g => g != null && g.IsActive && (g.JLPTLevel ?? "N5") == topic.JLPTLevel)
                .ToList();

            string topicLevel = topic.JLPTLevel;

            return new LearningTopicSnapshot(
                topic.Id,
                topic.Name,
                topic.Description,
                topicLevel,
                matchedVocabs,
                matchedGrammars);
        }
    }
}
