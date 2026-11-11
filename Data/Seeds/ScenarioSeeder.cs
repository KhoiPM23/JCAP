using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds
{
    public static class ScenarioSeeder
    {
        public static async Task SeedAsync(IServiceProvider serviceProvider)
        {
            var dbContext = serviceProvider.GetRequiredService<AppDbContext>();

            // 1. Tự động dọn dẹp các kịch bản trùng lặp nếu có do lỗi nhân bản seed trước đây
            await CleanupDuplicatesAsync(dbContext);

            if (!await dbContext.Scenarios.AnyAsync())
            {
                var initialScenarios = ScenarioSeedData.GetInitialScenarios();
                await dbContext.Scenarios.AddRangeAsync(initialScenarios);
                await dbContext.SaveChangesAsync();
            }
            else
            {
                // 2. Đồng bộ cập nhật kịch bản mẫu: Tìm theo cả ScenarioCode lẫn Title để chống duplicate
                var initialScenariosList = ScenarioSeedData.GetInitialScenarios();
                foreach (var seedScenario in initialScenariosList)
                {
                    var existingScenario = await dbContext.Scenarios
                        .Include(s => s.LevelConfigurations)
                            .ThenInclude(lc => lc.Missions)
                        .Include(s => s.LevelConfigurations)
                            .ThenInclude(lc => lc.TargetVocabularies)
                        .Include(s => s.LevelConfigurations)
                            .ThenInclude(lc => lc.TargetGrammars)
                        .FirstOrDefaultAsync(s =>
                            (!string.IsNullOrEmpty(s.ScenarioCode) && s.ScenarioCode == seedScenario.ScenarioCode) ||
                            s.Title.Trim().ToLower() == seedScenario.Title.Trim().ToLower());

                    if (existingScenario != null)
                    {
                        // Khôi phục mã kịch bản chuẩn ngữ nghĩa
                        if (existingScenario.ScenarioCode != seedScenario.ScenarioCode)
                        {
                            existingScenario.ScenarioCode = seedScenario.ScenarioCode;
                        }
                        existingScenario.Description = seedScenario.Description;
                        existingScenario.Thumbnail = seedScenario.Thumbnail;
                        existingScenario.IsActive = true;

                        foreach (var seedLevel in seedScenario.LevelConfigurations)
                        {
                            var existingLevel = existingScenario.LevelConfigurations
                                .FirstOrDefault(lc => lc.JLPTLevel == seedLevel.JLPTLevel);

                            if (existingLevel != null)
                            {
                                existingLevel.Title = seedLevel.Title;
                                existingLevel.Description = seedLevel.Description;
                                existingLevel.AiPersona = seedLevel.AiPersona;
                                existingLevel.CreditCost = seedLevel.CreditCost;
                                existingLevel.Status = seedLevel.Status;

                                // Đồng bộ Missions
                                foreach (var seedMission in seedLevel.Missions)
                                {
                                    var existingMission = existingLevel.Missions
                                        .FirstOrDefault(m => m.Order == seedMission.Order);

                                    if (existingMission != null)
                                    {
                                        existingMission.Content = seedMission.Content;
                                        existingMission.CompletionCriteriaJson = seedMission.CompletionCriteriaJson;
                                    }
                                    else
                                    {
                                        existingLevel.Missions.Add(new Mission
                                        {
                                            Content = seedMission.Content,
                                            Order = seedMission.Order,
                                            CompletionCriteriaJson = seedMission.CompletionCriteriaJson,
                                            IsActive = true
                                        });
                                    }
                                }

                                // Đồng bộ TargetVocabularies (khớp theo Word để cập nhật hoặc thêm mới)
                                var seedWords = seedLevel.TargetVocabularies
                                    .Select(v => v.Word.Trim())
                                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                                var vocabsToRemove = existingLevel.TargetVocabularies
                                    .Where(v => !seedWords.Contains(v.Word.Trim()))
                                    .ToList();

                                foreach (var obsoleteVocab in vocabsToRemove)
                                {
                                    existingLevel.TargetVocabularies.Remove(obsoleteVocab);
                                    dbContext.TargetVocabularies.Remove(obsoleteVocab);
                                }

                                foreach (var seedVocab in seedLevel.TargetVocabularies)
                                {
                                    var existingVocab = existingLevel.TargetVocabularies
                                        .FirstOrDefault(v => v.Word.Trim().Equals(seedVocab.Word.Trim(), StringComparison.OrdinalIgnoreCase));

                                    if (existingVocab != null)
                                    {
                                        existingVocab.Reading = seedVocab.Reading;
                                        existingVocab.Meaning = seedVocab.Meaning;
                                    }
                                    else
                                    {
                                        existingLevel.TargetVocabularies.Add(new TargetVocabulary
                                        {
                                            Word = seedVocab.Word,
                                            Reading = seedVocab.Reading,
                                            Meaning = seedVocab.Meaning
                                        });
                                    }
                                }

                                // Đồng bộ TargetGrammars (khớp theo Pattern để cập nhật hoặc thêm mới)
                                var seedPatterns = seedLevel.TargetGrammars
                                    .Select(g => g.Pattern.Trim())
                                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                                var grammarsToRemove = existingLevel.TargetGrammars
                                    .Where(g => !seedPatterns.Contains(g.Pattern.Trim()))
                                    .ToList();

                                foreach (var obsoleteGrammar in grammarsToRemove)
                                {
                                    existingLevel.TargetGrammars.Remove(obsoleteGrammar);
                                    dbContext.TargetGrammars.Remove(obsoleteGrammar);
                                }

                                foreach (var seedGrammar in seedLevel.TargetGrammars)
                                {
                                    var existingGrammar = existingLevel.TargetGrammars
                                        .FirstOrDefault(g => g.Pattern.Trim().Equals(seedGrammar.Pattern.Trim(), StringComparison.OrdinalIgnoreCase));

                                    if (existingGrammar != null)
                                    {
                                        existingGrammar.Meaning = seedGrammar.Meaning;
                                        existingGrammar.ExampleSentence = seedGrammar.ExampleSentence;
                                    }
                                    else
                                    {
                                        existingLevel.TargetGrammars.Add(new TargetGrammar
                                        {
                                            Pattern = seedGrammar.Pattern,
                                            Meaning = seedGrammar.Meaning,
                                            ExampleSentence = seedGrammar.ExampleSentence
                                        });
                                    }
                                }
                            }
                            else
                            {
                                existingScenario.LevelConfigurations.Add(seedLevel);
                            }
                        }
                    }
                    else
                    {
                        await dbContext.Scenarios.AddAsync(seedScenario);
                    }
                }
                await dbContext.SaveChangesAsync();
            }

            // 3. Đồng bộ toàn diện vào Kho học liệu: Master Vocabularies, Master Grammars & Topic links
            var allSeedScenarios = ScenarioSeedData.GetInitialScenarios();
            await SynchronizeScenarioLearningContentAsync(dbContext, allSeedScenarios);
        }

        private static async Task CleanupDuplicatesAsync(AppDbContext dbContext)
        {
            var allScenarios = await dbContext.Scenarios
                .Include(s => s.LevelConfigurations)
                .ToListAsync();

            if (!allScenarios.Any()) return;

            // Nhóm theo Title đã chuẩn hoá (loại trừ khoảng trắng và chữ hoa chữ thường)
            var duplicateGroups = allScenarios
                .GroupBy(s => s.Title.Trim().ToLowerInvariant())
                .Where(g => g.Count() > 1)
                .ToList();

            bool hasChanges = false;
            foreach (var group in duplicateGroups)
            {
                // Ưu tiên giữ lại bản ghi có ScenarioCode chuẩn (dạng SCN_XXX_01) hoặc có Id nhỏ nhất
                var primary = group
                    .OrderByDescending(s => !string.IsNullOrEmpty(s.ScenarioCode) && !s.ScenarioCode.StartsWith("SCN_") || (s.ScenarioCode != null && s.ScenarioCode.Length > 6 && !char.IsDigit(s.ScenarioCode.Replace("SCN_", "")[0])))
                    .ThenBy(s => s.Id)
                    .First();

                var duplicates = group.Where(s => s.Id != primary.Id).ToList();
                foreach (var dup in duplicates)
                {
                    var hasSessions = await dbContext.RoleplaySessions
                        .AnyAsync(rs => rs.ScenarioLevelConfiguration != null && rs.ScenarioLevelConfiguration.ScenarioId == dup.Id);

                    if (!hasSessions)
                    {
                        dbContext.Scenarios.Remove(dup);
                        hasChanges = true;
                    }
                    else if (dup.IsActive)
                    {
                        // Nếu đã có session lịch sử người dùng, chỉ tắt IsActive để không làm vỡ liên kết DB
                        dup.IsActive = false;
                        hasChanges = true;
                    }
                }
            }

            if (hasChanges)
            {
                await dbContext.SaveChangesAsync();
            }
        }

        private static async Task SynchronizeScenarioLearningContentAsync(AppDbContext dbContext, List<Scenario> scenarios)
        {
            // 1. Đảm bảo 5 chủ đề nền tảng liên kết Scenarios luôn tồn tại ở các cấp N5, N4, N3
            var baseTopicDefinitions = new (string Code, string Name, string Description)[]
            {
                ("DINING", "Ẩm thực", "Giao tiếp khi gọi món, chọn khẩu vị và thanh toán tại nhà hàng, quán ăn."),
                ("TRANSPORT", "Di chuyển", "Giao tiếp khi đi tàu điện, hỏi đường, mua vé và tìm lối đi."),
                ("SHOPPING", "Mua sắm", "Mua sắm, thanh toán và sử dụng dịch vụ tại cửa hàng tiện lợi."),
                ("STUDY_WORK", "Công sở & Phỏng vấn", "Phỏng vấn xin việc, chào hỏi ngày đầu đi làm và giao tiếp công sở."),
                ("DAILY_LIFE", "Sinh hoạt hằng ngày", "Hoạt động, nhu cầu và môi trường sống thường ngày.")
            };

            var levels = new[] { "N5", "N4", "N3" };
            var existingTopics = await dbContext.LearningTopics
                .Include(t => t.TopicVocabularies)
                .Include(t => t.TopicGrammars)
                .ToListAsync();

            var topicMap = new Dictionary<string, LearningTopic>(StringComparer.OrdinalIgnoreCase);

            foreach (var (code, name, desc) in baseTopicDefinitions)
            {
                foreach (var lvl in levels)
                {
                    var topicCode = lvl == "N5" ? code : $"{code}_{lvl}";
                    var key = $"{code}_{lvl}";
                    var topic = existingTopics.FirstOrDefault(t =>
                        (t.Code == topicCode || (t.Code == code && t.JLPTLevel == lvl) || (t.Name == name && t.JLPTLevel == lvl)));

                    if (topic == null)
                    {
                        topic = new LearningTopic
                        {
                            Code = topicCode,
                            Name = name,
                            Description = desc,
                            JLPTLevel = lvl,
                            IsActive = true,
                            CreatedAt = DateTime.UtcNow
                        };
                        dbContext.LearningTopics.Add(topic);
                        existingTopics.Add(topic);
                    }
                    topicMap[key] = topic;
                    topicMap[topicCode] = topic;
                }
            }

            // 2. Tra cứu Vocabularies và Grammars hiện có trong DB
            var existingVocabs = await dbContext.Vocabularies.ToListAsync();
            var existingGrammars = await dbContext.Grammars.ToListAsync();

            var vocabByWordLevel = existingVocabs
                .GroupBy(v => $"{v.Word.Trim()}_{v.JLPTLevel?.ToUpper() ?? "N5"}", StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            var grammarByPatternLevel = existingGrammars
                .GroupBy(g => $"{g.Pattern.Trim()}_{g.JLPTLevel?.ToUpper() ?? "N5"}", StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            // 3. Quét qua từng Scenario để đồng bộ vào Master Vocabularies & Grammars và gán vào Topic
            foreach (var scenario in scenarios)
            {
                var topicBaseCode = ScenarioService.ResolveScenarioTopicCode(scenario);

                foreach (var level in scenario.LevelConfigurations)
                {
                    var lvl = level.JLPTLevel ?? "N5";
                    var topicKey = $"{topicBaseCode}_{lvl}";
                    if (!topicMap.TryGetValue(topicKey, out var learningTopic))
                    {
                        if (!topicMap.TryGetValue(topicBaseCode, out learningTopic))
                        {
                            learningTopic = existingTopics.FirstOrDefault(t => t.JLPTLevel == lvl);
                        }
                    }

                    // Đồng bộ TargetVocabulary sang Master Vocabulary
                    int vOrder = learningTopic?.TopicVocabularies.Count ?? 0;
                    foreach (var tv in level.TargetVocabularies)
                    {
                        var cleanWord = tv.Word.Trim();
                        var key = $"{cleanWord}_{lvl}";

                        if (!vocabByWordLevel.TryGetValue(key, out var masterVocab))
                        {
                            masterVocab = existingVocabs.FirstOrDefault(v => v.Word.Trim().Equals(cleanWord, StringComparison.OrdinalIgnoreCase));
                        }

                        if (masterVocab == null)
                        {
                            masterVocab = new Vocabulary
                            {
                                Word = cleanWord,
                                Reading = tv.Reading?.Trim(),
                                Meaning = tv.Meaning.Trim(),
                                JLPTLevel = lvl,
                                PartOfSpeech = ExtractPartOfSpeech(tv.Meaning),
                                Explanation = tv.Meaning.Trim(),
                                IsActive = true,
                                CreatedAt = DateTime.UtcNow
                            };
                            dbContext.Vocabularies.Add(masterVocab);
                            existingVocabs.Add(masterVocab);
                            vocabByWordLevel[key] = masterVocab;
                        }
                        else
                        {
                            if (string.IsNullOrWhiteSpace(masterVocab.Reading) && !string.IsNullOrWhiteSpace(tv.Reading))
                                masterVocab.Reading = tv.Reading.Trim();
                            if (string.IsNullOrWhiteSpace(masterVocab.Meaning) && !string.IsNullOrWhiteSpace(tv.Meaning))
                                masterVocab.Meaning = tv.Meaning.Trim();
                            if (string.IsNullOrWhiteSpace(masterVocab.JLPTLevel))
                                masterVocab.JLPTLevel = lvl;
                        }

                        if (learningTopic != null && masterVocab.Id > 0)
                        {
                            bool alreadyLinked = learningTopic.TopicVocabularies.Any(x => x.VocabularyId == masterVocab.Id);
                            if (!alreadyLinked)
                            {
                                learningTopic.TopicVocabularies.Add(new TopicVocabulary
                                {
                                    Vocabulary = masterVocab,
                                    Topic = learningTopic,
                                    OrderIndex = vOrder++
                                });
                            }
                        }
                    }

                    // Đồng bộ TargetGrammar sang Master Grammar
                    int gOrder = learningTopic?.TopicGrammars.Count ?? 0;
                    foreach (var tg in level.TargetGrammars)
                    {
                        var cleanPattern = tg.Pattern.Trim();
                        var key = $"{cleanPattern}_{lvl}";

                        if (!grammarByPatternLevel.TryGetValue(key, out var masterGrammar))
                        {
                            masterGrammar = existingGrammars.FirstOrDefault(g => g.Pattern.Trim().Equals(cleanPattern, StringComparison.OrdinalIgnoreCase));
                        }

                        if (masterGrammar == null)
                        {
                            masterGrammar = new Grammar
                            {
                                Pattern = cleanPattern,
                                Meaning = tg.Meaning.Trim(),
                                ExampleSentence = tg.ExampleSentence?.Trim(),
                                JLPTLevel = lvl,
                                Explanation = tg.Meaning.Trim(),
                                IsActive = true,
                                CreatedAt = DateTime.UtcNow
                            };
                            dbContext.Grammars.Add(masterGrammar);
                            existingGrammars.Add(masterGrammar);
                            grammarByPatternLevel[key] = masterGrammar;
                        }
                        else
                        {
                            if (string.IsNullOrWhiteSpace(masterGrammar.Meaning) && !string.IsNullOrWhiteSpace(tg.Meaning))
                                masterGrammar.Meaning = tg.Meaning.Trim();
                            if (string.IsNullOrWhiteSpace(masterGrammar.ExampleSentence) && !string.IsNullOrWhiteSpace(tg.ExampleSentence))
                                masterGrammar.ExampleSentence = tg.ExampleSentence.Trim();
                            if (string.IsNullOrWhiteSpace(masterGrammar.JLPTLevel))
                                masterGrammar.JLPTLevel = lvl;
                        }

                        if (learningTopic != null && masterGrammar.Id > 0)
                        {
                            bool alreadyLinked = learningTopic.TopicGrammars.Any(x => x.GrammarId == masterGrammar.Id);
                            if (!alreadyLinked)
                            {
                                learningTopic.TopicGrammars.Add(new TopicGrammar
                                {
                                    Grammar = masterGrammar,
                                    Topic = learningTopic,
                                    OrderIndex = gOrder++
                                });
                            }
                        }
                    }
                }
            }

            await dbContext.SaveChangesAsync();

            // Đối với các masterVocab / masterGrammar vừa được gán Id mới sau khi SaveChanges, gán nốt liên kết Topic
            bool hasDeferredLinks = false;
            foreach (var scenario in scenarios)
            {
                var topicBaseCode = ScenarioService.ResolveScenarioTopicCode(scenario);
                foreach (var level in scenario.LevelConfigurations)
                {
                    var lvl = level.JLPTLevel ?? "N5";
                    var topicKey = $"{topicBaseCode}_{lvl}";
                    if (!topicMap.TryGetValue(topicKey, out var learningTopic)) continue;

                    int vOrder = learningTopic.TopicVocabularies.Count;
                    foreach (var tv in level.TargetVocabularies)
                    {
                        var cleanWord = tv.Word.Trim();
                        var key = $"{cleanWord}_{lvl}";
                        if (vocabByWordLevel.TryGetValue(key, out var masterVocab) && masterVocab.Id > 0)
                        {
                            if (!learningTopic.TopicVocabularies.Any(x => x.VocabularyId == masterVocab.Id))
                            {
                                learningTopic.TopicVocabularies.Add(new TopicVocabulary
                                {
                                    TopicId = learningTopic.Id,
                                    VocabularyId = masterVocab.Id,
                                    OrderIndex = vOrder++
                                });
                                hasDeferredLinks = true;
                            }
                        }
                    }

                    int gOrder = learningTopic.TopicGrammars.Count;
                    foreach (var tg in level.TargetGrammars)
                    {
                        var cleanPattern = tg.Pattern.Trim();
                        var key = $"{cleanPattern}_{lvl}";
                        if (grammarByPatternLevel.TryGetValue(key, out var masterGrammar) && masterGrammar.Id > 0)
                        {
                            if (!learningTopic.TopicGrammars.Any(x => x.GrammarId == masterGrammar.Id))
                            {
                                learningTopic.TopicGrammars.Add(new TopicGrammar
                                {
                                    TopicId = learningTopic.Id,
                                    GrammarId = masterGrammar.Id,
                                    OrderIndex = gOrder++
                                });
                                hasDeferredLinks = true;
                            }
                        }
                    }
                }
            }

            if (hasDeferredLinks)
            {
                await dbContext.SaveChangesAsync();
            }
        }

        private static string ExtractPartOfSpeech(string meaning)
        {
            if (string.IsNullOrWhiteSpace(meaning)) return "Danh từ";
            if (meaning.Contains("[Danh từ")) return "Danh từ";
            if (meaning.Contains("[Động từ")) return "Động từ";
            if (meaning.Contains("[Tính từ")) return "Tính từ";
            if (meaning.Contains("[Phó từ")) return "Phó từ";
            if (meaning.Contains("[Thành ngữ")) return "Thành ngữ";
            if (meaning.Contains("[Cụm từ")) return "Cụm từ";
            return "Danh từ";
        }
    }
}
