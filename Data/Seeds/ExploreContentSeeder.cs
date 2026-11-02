using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds
{
    public record ExploreContentResult(
        int ChaptersAdded, int SpotsAdded, int SpotsLinked, int PrefecturesOpened, int WordsAdded, string[] UnresolvedLinks);

    /// <summary>
    /// Nạp gói nội dung Khám phá (explore-content.json). Chỉ thêm phần còn thiếu, không ghi đè những gì admin đã sửa:
    /// - chương: thêm chương theo OrderIndex chưa có; chỉ gắn các tỉnh chưa thuộc chương nào;
    /// - mốc: khớp theo (tỉnh, tên Nhật, cấp độ); có rồi thì bỏ qua, chỉ bổ sung liên kết ngữ pháp/từ vựng/hoạt động nếu bài đang trống;
    /// - tỉnh: chỉ mở một tỉnh đang đóng khi lần nạp này vừa thêm mốc đang dùng vào tỉnh đó;
    /// - "Một từ ở tỉnh": thêm cho tỉnh chưa có.
    /// Liên kết sang module khác tìm theo khoá nội dung; không tìm thấy thì bỏ liên kết đó và ghi vào UnresolvedLinks.
    /// </summary>
    public static class ExploreContentSeeder
    {
        public static async Task<ExploreContentResult> ImportAsync(AppDbContext db, ExploreContentPack pack)
        {
            var now = DateTime.UtcNow;
            var unresolved = new List<string>();

            // 1. Chương bổ sung
            var chaptersAdded = 0;
            var existingOrders = (await db.ExploreChapters.Select(c => c.OrderIndex).ToListAsync()).ToHashSet();
            var assigned = (await db.ExploreChapterPrefectures.Select(p => p.PrefectureId).ToListAsync()).ToHashSet();
            foreach (var c in pack.Chapters.Where(c => !existingOrders.Contains(c.OrderIndex)))
            {
                var free = c.PrefectureIds.Where(p => !assigned.Contains(p)).ToList();
                db.ExploreChapters.Add(new ExploreChapter
                {
                    OrderIndex = c.OrderIndex,
                    Title = c.Title,
                    Description = c.Description,
                    MinLevel = c.MinLevel,
                    MaxLevel = c.MaxLevel,
                    Prefectures = free.Select(p => new ExploreChapterPrefecture { PrefectureId = p }).ToList(),
                });
                assigned.UnionWith(free);
                chaptersAdded++;
            }

            // 2. Tra cứu nội dung của module khác theo khoá (cùng khoá thì lấy bản đang dùng, ID nhỏ nhất)
            var titles = pack.Spots.SelectMany(s => s.Lesson.Activities).Select(a => a.DialogueTitle).Where(t => t != null).Distinct().ToList();
            var dialogues = (await db.ShadowingDialogues.Where(d => titles.Contains(d.Title)).ToListAsync())
                .GroupBy(d => d.Title).ToDictionary(g => g.Key, g => g.OrderByDescending(d => d.IsActive).ThenBy(d => d.Id).First().Id);
            var patterns = pack.Spots.SelectMany(s => s.Lesson.Grammars).Distinct().ToList();
            var grammars = (await db.Grammars.Where(g => patterns.Contains(g.Pattern)).ToListAsync())
                .GroupBy(g => g.Pattern).ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.IsActive).ThenBy(x => x.Id).First().Id);
            var wordKeys = pack.Spots.SelectMany(s => s.Lesson.Vocabularies).Distinct().ToList();
            var vocabularies = (await db.Vocabularies.Where(v => wordKeys.Contains(v.Word)).ToListAsync())
                .GroupBy(v => v.Word).ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.IsActive).ThenBy(x => x.Id).First().Id);
            var codes = pack.Spots.SelectMany(s => s.Lesson.Activities).Select(a => a.ScenarioCode).Where(c => c != null).Distinct().ToList();
            var scenarioConfigs = (await db.ScenarioLevelConfigurations.Include(c => c.Scenario)
                    .Where(c => c.Scenario != null && codes.Contains(c.Scenario.ScenarioCode)).ToListAsync())
                .GroupBy(c => (c.Scenario!.ScenarioCode!, c.JLPTLevel)).ToDictionary(g => g.Key, g => g.OrderBy(c => c.Id).First().Id);

            // 3. Mốc
            var prefectureIds = pack.Spots.Select(s => s.PrefectureId).Distinct().ToList();
            var existing = await db.ExploreSpots
                .Include(s => s.Lesson).ThenInclude(l => l!.Activities)
                .Include(s => s.Lesson).ThenInclude(l => l!.LessonGrammars)
                .Include(s => s.Lesson).ThenInclude(l => l!.LessonVocabularies)
                .AsSplitQuery()
                .Where(s => prefectureIds.Contains(s.PrefectureId))
                .ToListAsync();

            var spotsAdded = 0;
            var spotsLinked = 0;
            var withNewPublished = new HashSet<int>();
            foreach (var p in pack.Spots)
            {
                var spot = existing.FirstOrDefault(s => s.PrefectureId == p.PrefectureId && s.NameJp == p.NameJp
                    && (s.Lesson == null || s.Lesson.JLPTLevel == p.Lesson.Level));
                var isNew = spot == null;
                if (spot == null)
                {
                    spot = new ExploreSpot
                    {
                        PrefectureId = p.PrefectureId,
                        IconId = p.IconId,
                        NameVi = p.NameVi,
                        NameJp = p.NameJp,
                        NameKana = p.NameKana,
                        Latitude = p.Latitude,
                        Longitude = p.Longitude,
                        Status = p.Status,
                        IsActive = p.IsActive,
                        Lesson = new ExploreSpotLesson
                        {
                            JLPTLevel = p.Lesson.Level,
                            Situation = p.Lesson.Situation,
                            RealUse = p.Lesson.RealUse,
                            SentenceJson = ExploreSentenceJson.Serialize(p.Lesson.Sentence),
                            Meaning = p.Lesson.Meaning,
                            GrammarNote = p.Lesson.GrammarNote,
                            EstimatedMinutes = p.Lesson.EstimatedMinutes,
                        },
                    };
                    db.ExploreSpots.Add(spot);
                    existing.Add(spot);
                    spotsAdded++;
                    if (p.Status == ExploreSpotStatus.Published && p.IsActive) withNewPublished.Add(p.PrefectureId);
                }
                if (spot.Lesson == null) continue;

                var linked = LinkLesson(spot.Lesson, p, dialogues, grammars, vocabularies, scenarioConfigs, unresolved);
                if (linked && !isNew) spotsLinked++;
            }

            // 4. Mở tỉnh vừa được thêm mốc đang dùng
            var opened = 0;
            if (withNewPublished.Count > 0)
            {
                foreach (var pref in await db.ExplorePrefectures.Where(x => withNewPublished.Contains(x.Id) && !x.IsOpen).ToListAsync())
                {
                    pref.IsOpen = true;
                    pref.OpenedAt = now;
                    pref.UpdatedAt = now;
                    opened++;
                }
            }

            // 5. "Một từ ở tỉnh"
            var wordPrefectures = (await db.ExploreProvinceWords.Select(w => w.PrefectureId).ToListAsync()).ToHashSet();
            var wordsAdded = 0;
            foreach (var w in pack.ProvinceWords.Where(w => !wordPrefectures.Contains(w.PrefectureId)))
            {
                db.ExploreProvinceWords.Add(new ExploreProvinceWord
                {
                    PrefectureId = w.PrefectureId,
                    Word = w.Word,
                    Kana = w.Kana,
                    Meaning = w.Meaning,
                    Note = w.Note,
                    Status = w.Status,
                    UpdatedAt = now,
                });
                wordPrefectures.Add(w.PrefectureId);
                wordsAdded++;
            }

            await db.SaveChangesAsync();
            return new ExploreContentResult(chaptersAdded, spotsAdded, spotsLinked, opened, wordsAdded, unresolved.Distinct().ToArray());
        }

        /// <summary>Gắn ngữ pháp, từ vựng, hoạt động còn thiếu của bài (mỗi loại chỉ khi bài chưa có loại đó). Trả true nếu thêm gì.</summary>
        private static bool LinkLesson(
            ExploreSpotLesson lesson, ExploreContentPack.SpotEntry p,
            Dictionary<string, int> dialogues, Dictionary<string, int> grammars, Dictionary<string, int> vocabularies,
            Dictionary<(string, string), int> scenarioConfigs, List<string> unresolved)
        {
            var added = false;

            if (lesson.LessonGrammars.Count == 0)
            {
                foreach (var pattern in p.Lesson.Grammars.Distinct())
                {
                    if (!grammars.TryGetValue(pattern, out var id)) { unresolved.Add($"Ngữ pháp “{pattern}” ({p.NameVi})"); continue; }
                    lesson.LessonGrammars.Add(new ExploreSpotLessonGrammar { GrammarId = id });
                    added = true;
                }
            }

            if (lesson.LessonVocabularies.Count == 0)
            {
                foreach (var word in p.Lesson.Vocabularies.Distinct())
                {
                    if (!vocabularies.TryGetValue(word, out var id)) { unresolved.Add($"Từ vựng “{word}” ({p.NameVi})"); continue; }
                    lesson.LessonVocabularies.Add(new ExploreSpotLessonVocabulary { VocabularyId = id });
                    added = true;
                }
            }

            if (lesson.Activities.Count == 0)
            {
                foreach (var a in p.Lesson.Activities.OrderBy(a => a.Order))
                {
                    int? reference = null;
                    if (a.Type == ExploreActivityType.Shadowing && a.DialogueTitle != null)
                    {
                        if (!dialogues.TryGetValue(a.DialogueTitle, out var id)) { unresolved.Add($"Bài Shadowing “{a.DialogueTitle}” ({p.NameVi})"); continue; }
                        reference = id;
                    }
                    else if (a.Type == ExploreActivityType.Roleplay && a.ScenarioCode != null && a.ScenarioLevel != null)
                    {
                        if (!scenarioConfigs.TryGetValue((a.ScenarioCode, a.ScenarioLevel), out var id)) { unresolved.Add($"Kịch bản {a.ScenarioCode} {a.ScenarioLevel} ({p.NameVi})"); continue; }
                        reference = id;
                    }
                    lesson.Activities.Add(new ExploreSpotActivity { ActivityType = a.Type, ReferenceId = reference, PassThreshold = a.PassThreshold, OrderIndex = a.Order });
                    added = true;
                }
            }

            return added;
        }
    }
}
