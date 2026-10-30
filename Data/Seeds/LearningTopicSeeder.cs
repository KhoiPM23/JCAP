using System;
using System.Linq;
using System.Threading.Tasks;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace JCAP.Data.Seeds
{
    /// <summary>
    /// Seed chủ đề tự học mẫu (Ẩm thực &amp; Gọi món nhà hàng - N5) phục vụ tính năng Flashcards.
    /// Tự động nạp bộ từ vựng/ngữ pháp mẫu nếu DB chưa có và liên kết tường minh qua TopicVocabularies / TopicGrammars.
    /// </summary>
    public static class LearningTopicSeeder
    {
        public static async Task SeedAsync(IServiceProvider serviceProvider)
        {
            var dbContext = serviceProvider.GetRequiredService<AppDbContext>();

            // 1. Đảm bảo bộ học liệu mẫu (15 từ vựng, 6 ngữ pháp từ sample.json) đã có trong DB
            bool hasSampleVocab = await dbContext.Vocabularies.AnyAsync(v => v.Word == "食べる" && v.JLPTLevel == "N5");
            bool hasSampleGrammar = await dbContext.Grammars.AnyAsync(g => g.Pattern == "てください" && g.JLPTLevel == "N5");

            if (!hasSampleVocab || !hasSampleGrammar)
            {
                var sampleData = LearningContentSampleData.Load();
                await LearningContentSampleImporter.ImportAsync(dbContext, sampleData);
            }

            // 2. Đảm bảo từ vựng "注文" (Gọi món - N5) tồn tại để phục vụ chủ đề nhà hàng
            var chumonVocab = await dbContext.Vocabularies
                .FirstOrDefaultAsync(v => v.Word == "注文");

            if (chumonVocab == null)
            {
                chumonVocab = new Vocabulary
                {
                    Word = "注文",
                    Reading = "ちゅうもん",
                    Meaning = "Gọi món",
                    PartOfSpeech = "Danh từ; động từ する",
                    JLPTLevel = "N5",
                    Explanation = "Dùng khi gọi món ăn hoặc đồ uống tại nhà hàng, quán ăn.",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };
                dbContext.Vocabularies.Add(chumonVocab);
                await dbContext.SaveChangesAsync();
            }

            // 3. Tạo chủ đề "Ẩm thực & Gọi món nhà hàng" (TOPIC_DINING_N5) nếu chưa tồn tại
            var diningTopic = await dbContext.LearningTopics
                .Include(t => t.TopicVocabularies)
                .Include(t => t.TopicGrammars)
                .FirstOrDefaultAsync(t => t.Code == "TOPIC_DINING_N5");

            if (diningTopic == null)
            {
                diningTopic = new LearningTopic
                {
                    Code = "TOPIC_DINING_N5",
                    Name = "Ẩm thực & Gọi món nhà hàng",
                    Description = "Tổng hợp từ vựng và mẫu câu giao tiếp căn bản khi đi ăn và gọi món tại nhà hàng Nhật Bản.",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };
                dbContext.LearningTopics.Add(diningTopic);
                await dbContext.SaveChangesAsync();
            }

            // 4. Liên kết 4 từ vựng N5 vào chủ đề qua bảng nối TopicVocabularies
            var targetWords = new (string Word, int OrderIndex)[]
            {
                ("食べる", 1),
                ("飲む", 2),
                ("注文", 3),
                ("大きい", 4)
            };

            foreach (var (word, orderIndex) in targetWords)
            {
                var vocab = await dbContext.Vocabularies
                    .OrderByDescending(v => v.Examples.Count)
                    .ThenBy(v => v.Id)
                    .FirstOrDefaultAsync(v => v.Word == word && v.IsActive);

                if (vocab != null && !diningTopic.TopicVocabularies.Any(tv => tv.VocabularyId == vocab.Id))
                {
                    dbContext.TopicVocabularies.Add(new TopicVocabulary
                    {
                        TopicId = diningTopic.Id,
                        VocabularyId = vocab.Id,
                        OrderIndex = orderIndex
                    });
                }
            }

            // 5. Liên kết 2 mẫu ngữ pháp N5 vào chủ đề qua bảng nối TopicGrammars
            var targetPatterns = new (string Pattern, int OrderIndex)[]
            {
                ("てください", 1),
                ("〜てもいい", 2)
            };

            foreach (var (pattern, orderIndex) in targetPatterns)
            {
                var grammar = await dbContext.Grammars
                    .OrderByDescending(g => g.Examples.Count)
                    .ThenBy(g => g.Id)
                    .FirstOrDefaultAsync(g => g.Pattern == pattern && g.IsActive);

                if (grammar != null && !diningTopic.TopicGrammars.Any(tg => tg.GrammarId == grammar.Id))
                {
                    dbContext.TopicGrammars.Add(new TopicGrammar
                    {
                        TopicId = diningTopic.Id,
                        GrammarId = grammar.Id,
                        OrderIndex = orderIndex
                    });
                }
            }

            await dbContext.SaveChangesAsync();
        }
    }
}
