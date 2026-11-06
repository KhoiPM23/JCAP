using JCAP.DTOs.Explore;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds
{
    public record ExploreContentResult(
        int ChaptersAdded, int ChaptersUpdated, int SpotsAdded, int SpotsUpdated, int SpotsLinked, int PrefecturesChanged,
        int WordsAdded, int WordsUpdated, int ContentAdded, string[] UnresolvedLinks);

    /// <summary>
    /// Nạp dữ liệu roadmap (explore-content.json) để máy thành viên có đúng các mốc của người soạn, mà không ghi đè chỉnh sửa riêng:
    /// một dòng đang đúng y bản mẫu ra mắt hoặc một phiên bản cũ trong explore-content.history.json thì được cập nhật theo bản mới;
    /// khác tất cả thì coi là đã sửa trên máy đó và giữ nguyên.
    /// - ngữ pháp, từ vựng, kịch bản, bài Shadowing mà mốc tham chiếu: thêm nếu máy chưa có (theo mẫu câu, từ, tiêu đề);
    /// - chương: thêm chương chưa có; gắn thêm các tỉnh chưa thuộc chương nào; chương người soạn đã xoá thì tắt theo nếu máy này chưa sửa nó;
    /// - mốc: tìm theo phiên bản đã biết, rồi theo (tỉnh, tên Nhật, cấp độ); không thấy thì thêm;
    /// - liên kết của bài: ngữ pháp/từ vựng thay khi đang trống hoặc trùng phiên bản cũ; hoạt động xử lý theo từng loại;
    /// - tỉnh: mở tỉnh vừa được thêm mốc đang dùng; tỉnh người soạn từng đổi trạng thái thì theo trạng thái mới nhất của người soạn.
    /// Không tìm thấy nội dung được tham chiếu thì bỏ liên kết đó và ghi vào UnresolvedLinks.
    /// </summary>
    public static class ExploreContentSeeder
    {
        public static async Task<ExploreContentResult> ImportAsync(AppDbContext db, ExploreContentPack pack, ExploreContentHistory? history = null)
        {
            history ??= ExploreContentHistory.Empty;
            var now = DateTime.UtcNow;
            var unresolved = new List<string>();

            // 1. Nội dung được tham chiếu (lưu ngay để có ID cho các liên kết bên dưới)
            var contentAdded = await AddReferencedContentAsync(db, pack, unresolved);

            // 2. Chương
            var (chaptersAdded, chaptersUpdated) = await SyncChaptersAsync(db, pack, history, now);

            // 3. Tra cứu theo khoá (cùng khoá thì lấy bản đang dùng, ID nhỏ nhất) và tra ngược từ ID ra khoá
            var dialogueRows = await db.ShadowingDialogues.ToListAsync();
            var dialogues = dialogueRows.GroupBy(d => d.Title)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(d => d.IsActive).ThenBy(d => d.Id).First().Id);
            var grammarRows = await db.Grammars.Select(g => new { g.Id, g.Pattern, g.IsActive }).ToListAsync();
            var grammars = grammarRows.GroupBy(g => g.Pattern)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.IsActive).ThenBy(x => x.Id).First().Id);
            var vocabularyRows = await db.Vocabularies.Select(v => new { v.Id, v.Word, v.IsActive }).ToListAsync();
            var vocabularies = vocabularyRows.GroupBy(v => v.Word)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.IsActive).ThenBy(x => x.Id).First().Id);
            var configRows = await db.ScenarioLevelConfigurations.Include(c => c.Scenario).Where(c => c.Scenario != null).ToListAsync();
            var scenarioConfigs = configRows.GroupBy(c => (c.Scenario!.Title, c.JLPTLevel)).ToDictionary(
                g => g.Key,
                g => g.OrderByDescending(c => c.Scenario!.IsActive).ThenByDescending(c => c.Status == "Published").ThenBy(c => c.Id).First().Id);
            var refs = new References(
                dialogues, grammars, vocabularies, scenarioConfigs,
                dialogueRows.ToDictionary(d => d.Id, d => d.Title),
                grammarRows.ToDictionary(g => g.Id, g => g.Pattern),
                vocabularyRows.ToDictionary(v => v.Id, v => v.Word),
                configRows.ToDictionary(c => c.Id, c => (c.Scenario!.Title, c.JLPTLevel)));

            // 4. Mốc
            var existing = await db.ExploreSpots
                .Include(s => s.Lesson).ThenInclude(l => l!.Activities)
                .Include(s => s.Lesson).ThenInclude(l => l!.LessonGrammars)
                .Include(s => s.Lesson).ThenInclude(l => l!.LessonVocabularies)
                .AsSplitQuery()
                .ToListAsync();

            var spotsAdded = 0;
            var spotsUpdated = 0;
            var spotsLinked = 0;
            var withNewPublished = new HashSet<int>();
            var claimed = new HashSet<ExploreSpot>();
            var toLink = new List<(ExploreContentPack.SpotEntry Entry, ExploreSpot Spot, bool IsNew, ExploreContentPack.SpotEntry[] Versions)>();
            foreach (var p in pack.Spots)
            {
                var versions = p.Key != null && history.Spots.TryGetValue(p.Key, out var old) ? old : Array.Empty<ExploreContentPack.SpotEntry>();
                var spot = FindSpot(existing, claimed, p, versions);
                var isNew = spot == null;
                if (spot == null)
                {
                    spot = new ExploreSpot { Lesson = new ExploreSpotLesson() };
                    Apply(spot, p);
                    db.ExploreSpots.Add(spot);
                    spotsAdded++;
                    if (p.Status == ExploreSpotStatus.Published && p.IsActive) withNewPublished.Add(p.PrefectureId);
                }
                else if (spot.Lesson != null && !SameContent(spot, p)
                    && (IsLaunchCopy(spot) || versions.Any(v => SameContent(spot, v))))
                {
                    Apply(spot, p);
                    spot.UpdatedAt = now;
                    spot.Lesson.UpdatedAt = now;
                    spotsUpdated++;
                }
                claimed.Add(spot);
                if (spot.Lesson == null) continue;
                toLink.Add((p, spot, isNew, versions));
            }
            foreach (var (entry, spot, isNew, versions) in toLink)
            {
                if (LinkLesson(spot.Lesson!, entry, versions, refs, unresolved) && !isNew) spotsLinked++;
            }

            // 5. Trạng thái đóng/mở của tỉnh
            var prefecturesChanged = 0;
            var open = pack.OpenPrefectures.ToHashSet();
            foreach (var pref in await db.ExplorePrefectures.ToListAsync())
            {
                var wanted = pref.IsOpen;
                if (withNewPublished.Contains(pref.Id)) wanted = true;
                if (history.Prefectures.ContainsKey(pref.Id.ToString())) wanted = open.Contains(pref.Id);
                if (wanted == pref.IsOpen) continue;
                pref.IsOpen = wanted;
                pref.OpenedAt = wanted ? now : null;
                pref.UpdatedAt = now;
                prefecturesChanged++;
            }

            // 6. "Một từ ở tỉnh"
            var wordRows = await db.ExploreProvinceWords.ToDictionaryAsync(w => w.PrefectureId);
            var wordsAdded = 0;
            var wordsUpdated = 0;
            foreach (var w in pack.ProvinceWords)
            {
                if (!wordRows.TryGetValue(w.PrefectureId, out var row))
                {
                    db.ExploreProvinceWords.Add(new ExploreProvinceWord { PrefectureId = w.PrefectureId, Word = w.Word, Kana = w.Kana, Meaning = w.Meaning, Note = w.Note, Status = w.Status, UpdatedAt = now });
                    wordsAdded++;
                    continue;
                }
                var versions = history.Words.TryGetValue(w.PrefectureId.ToString(), out var old) ? old : Array.Empty<ExploreContentPack.WordEntry>();
                if (SameWord(row, w) || !versions.Any(v => SameWord(row, v))) continue;
                row.Word = w.Word;
                row.Kana = w.Kana;
                row.Meaning = w.Meaning;
                row.Note = w.Note;
                row.Status = w.Status;
                row.UpdatedAt = now;
                wordsUpdated++;
            }

            await db.SaveChangesAsync();
            return new ExploreContentResult(chaptersAdded, chaptersUpdated, spotsAdded, spotsUpdated, spotsLinked, prefecturesChanged, wordsAdded, wordsUpdated, contentAdded, unresolved.Distinct().ToArray());
        }

        /// <summary>Thêm ngữ pháp, từ vựng, kịch bản, bài Shadowing còn thiếu. Đã có (cùng khoá) thì không đụng tới. Trả số bản ghi đã thêm.</summary>
        private static async Task<int> AddReferencedContentAsync(AppDbContext db, ExploreContentPack pack, List<string> unresolved)
        {
            var added = 0;

            var patterns = (await db.Grammars.Select(g => g.Pattern).ToListAsync()).ToHashSet();
            foreach (var g in pack.Grammars.Where(g => patterns.Add(g.Pattern)))
            {
                db.Grammars.Add(new Grammar
                {
                    Pattern = g.Pattern,
                    Reading = g.Reading,
                    Meaning = g.Meaning,
                    Formation = g.Formation,
                    Explanation = g.Explanation,
                    UsageNotes = g.UsageNotes,
                    ExampleSentence = g.ExampleSentence,
                    JLPTLevel = g.JlptLevel,
                });
                added++;
            }

            var words = (await db.Vocabularies.Select(v => v.Word).ToListAsync()).ToHashSet();
            foreach (var v in pack.Vocabularies.Where(v => words.Add(v.Word)))
            {
                db.Vocabularies.Add(new Vocabulary
                {
                    Word = v.Word,
                    Reading = v.Reading,
                    Meaning = v.Meaning,
                    PartOfSpeech = v.PartOfSpeech,
                    JLPTLevel = v.JlptLevel,
                    Explanation = v.Explanation,
                    UsageNotes = v.UsageNotes,
                });
                added++;
            }

            var scenarios = await db.Scenarios.Include(s => s.LevelConfigurations).ToListAsync();
            foreach (var s in pack.Scenarios)
            {
                var scenario = scenarios.Where(x => x.Title == s.Title).OrderBy(x => x.Id).FirstOrDefault();
                if (scenario == null)
                {
                    scenario = new Scenario { Title = s.Title, Description = s.Description, Thumbnail = s.Thumbnail };
                    db.Scenarios.Add(scenario);
                    scenarios.Add(scenario);
                    added++;
                }
                foreach (var l in s.Levels.Where(l => scenario.LevelConfigurations.All(c => c.JLPTLevel != l.JlptLevel)))
                {
                    scenario.LevelConfigurations.Add(new ScenarioLevelConfiguration
                    {
                        JLPTLevel = l.JlptLevel,
                        Title = l.Title,
                        Description = l.Description,
                        AiPersona = l.AiPersona,
                        CreditCost = l.CreditCost,
                        Status = l.Status,
                        Missions = l.Missions.Select(m => new Mission { Content = m.Content, Order = m.Order, CompletionCriteriaJson = m.CompletionCriteriaJson, IsActive = m.IsActive }).ToList(),
                        TargetVocabularies = l.TargetVocabularies.Select(t => new TargetVocabulary { Word = t.Word, Reading = t.Reading, Meaning = t.Meaning }).ToList(),
                        TargetGrammars = l.TargetGrammars.Select(t => new TargetGrammar { Pattern = t.Pattern, Meaning = t.Meaning, ExampleSentence = t.ExampleSentence }).ToList(),
                    });
                    added++;
                }
            }
            await db.SaveChangesAsync();

            var dialogueTitles = (await db.ShadowingDialogues.Select(d => d.Title).ToListAsync()).ToHashSet();
            var grammarIds = (await db.Grammars.Select(g => new { g.Pattern, g.Id }).ToListAsync())
                .GroupBy(g => g.Pattern).ToDictionary(g => g.Key, g => g.Min(x => x.Id));
            var vocabularyIds = (await db.Vocabularies.Select(v => new { v.Word, v.Id }).ToListAsync())
                .GroupBy(v => v.Word).ToDictionary(g => g.Key, g => g.Min(x => x.Id));
            foreach (var d in pack.Dialogues.Where(d => !dialogueTitles.Contains(d.Title)))
            {
                // Bài Shadowing không bắt buộc gắn kịch bản; có ghi tên kịch bản mà máy này không có thì vẫn tạo bài, bỏ liên kết
                var scenario = d.ScenarioTitle == null ? null : scenarios.Where(x => x.Title == d.ScenarioTitle).OrderBy(x => x.Id).FirstOrDefault();
                if (d.ScenarioTitle != null && scenario == null) unresolved.Add($"Kịch bản “{d.ScenarioTitle}” của bài Shadowing “{d.Title}”");
                db.ShadowingDialogues.Add(new ShadowingDialogue
                {
                    Title = d.Title,
                    ScenarioId = scenario?.Id,
                    JLPTLevel = d.JlptLevel,
                    SourceDescription = d.SourceDescription,
                    SpeakerRoleA_Name = d.SpeakerRoleA_Name,
                    SpeakerRoleB_Name = d.SpeakerRoleB_Name,
                    SpeakerRolesJson = d.SpeakerRolesJson,
                    Sentences = d.Sentences.Select(x => new ShadowingSentence
                    {
                        OrderIndex = x.OrderIndex,
                        SpeakerRole = x.SpeakerRole,
                        JapaneseText = x.JapaneseText,
                        RomajiText = x.RomajiText,
                        VietnameseTranslation = x.VietnameseTranslation,
                        AudioDurationMs = x.AudioDurationMs,
                    }).ToList(),
                    DialogueVocabularies = d.Vocabularies.Where(v => vocabularyIds.ContainsKey(v.Word))
                        .Select(v => new ShadowingDialogueVocabulary { VocabularyId = vocabularyIds[v.Word], OrderIndex = v.OrderIndex, Note = v.Note }).ToList(),
                    DialogueGrammars = d.Grammars.Where(g => grammarIds.ContainsKey(g.Pattern))
                        .Select(g => new ShadowingDialogueGrammar { GrammarId = grammarIds[g.Pattern], OrderIndex = g.OrderIndex, Note = g.Note }).ToList(),
                });
                added++;
            }
            await db.SaveChangesAsync();
            return added;
        }

        private static async Task<(int Added, int Updated)> SyncChaptersAsync(AppDbContext db, ExploreContentPack pack, ExploreContentHistory history, DateTime now)
        {
            var added = 0;
            var updated = 0;
            var chapters = await db.ExploreChapters.Include(c => c.Prefectures).Where(c => c.IsActive).ToListAsync();
            var assigned = chapters.SelectMany(c => c.Prefectures).Select(p => p.PrefectureId).ToHashSet();
            var claimed = new HashSet<ExploreChapter>();
            foreach (var c in pack.Chapters)
            {
                var free = c.PrefectureIds.Where(p => !assigned.Contains(p)).ToList();
                assigned.UnionWith(free);
                var row = chapters.FirstOrDefault(x => x.OrderIndex == c.OrderIndex);
                if (row == null)
                {
                    db.ExploreChapters.Add(new ExploreChapter
                    {
                        OrderIndex = c.OrderIndex,
                        Title = c.Title,
                        Description = c.Description,
                        MinLevel = c.MinLevel,
                        MaxLevel = c.MaxLevel,
                        Prefectures = free.Select(p => new ExploreChapterPrefecture { PrefectureId = p }).ToList(),
                    });
                    added++;
                    continue;
                }
                claimed.Add(row);
                foreach (var p in free) row.Prefectures.Add(new ExploreChapterPrefecture { PrefectureId = p });
                var versions = history.Chapters.TryGetValue(c.OrderIndex.ToString(), out var old) ? old : Array.Empty<ExploreContentPack.ChapterEntry>();
                if (SameChapter(row, c) || !(IsLaunchChapter(row) || versions.Any(v => SameChapter(row, v)))) continue;
                // Chương chưa ai sửa: theo đúng bản mới, kể cả bỏ các tỉnh người soạn đã gỡ khỏi chương
                foreach (var link in row.Prefectures.Where(x => !c.PrefectureIds.Contains(x.PrefectureId)).ToList())
                {
                    row.Prefectures.Remove(link);
                    db.ExploreChapterPrefectures.Remove(link);
                }
                row.Title = c.Title;
                row.Description = c.Description;
                row.MinLevel = c.MinLevel;
                row.MaxLevel = c.MaxLevel;
                row.UpdatedAt = now;
                updated++;
            }

            // Chương có trên máy này nhưng không còn trong gói: người soạn đã xoá. Chỉ tắt chương đúng y một bản người soạn từng có
            // (hoặc bản mẫu ra mắt); chương máy này tự tạo hay đã sửa thì giữ. Tắt giống admin: IsActive = false và gỡ tỉnh.
            var known = history.Chapters.Values.SelectMany(v => v).ToList();
            var removed = chapters.Where(r => !claimed.Contains(r) && (IsLaunchChapter(r) || known.Any(v => SameChapter(r, v)))).ToList();
            foreach (var r in removed)
            {
                r.IsActive = false;
                r.UpdatedAt = now;
                db.ExploreChapterPrefectures.RemoveRange(r.Prefectures);
                updated++;
            }
            if (removed.Count > 0)
            {
                // Dồn thứ tự các chương còn dùng cho liền mạch (0, 1, 2...) như khi admin xoá chương
                var rest = chapters.Except(removed).OrderBy(r => r.OrderIndex).ToList();
                for (var i = 0; i < rest.Count; i++) rest[i].OrderIndex = i;
            }
            return (added, updated);
        }

        private static bool IsLaunchChapter(ExploreChapter row) => ExploreSeedData.Chapters.Any(s =>
            row.Title == s.Title && row.Description == s.Description && row.MinLevel == s.MinLevel && row.MaxLevel == s.MaxLevel);

        private static bool SameChapter(ExploreChapter row, ExploreContentPack.ChapterEntry c) =>
            row.Title == c.Title && row.Description == c.Description && row.MinLevel == c.MinLevel && row.MaxLevel == c.MaxLevel;

        private static bool SameWord(ExploreProvinceWord row, ExploreContentPack.WordEntry w) =>
            row.Word == w.Word && row.Kana == w.Kana && row.Meaning == w.Meaning && row.Note == w.Note && row.Status == w.Status;

        /// <summary>Thứ tự ưu tiên: trùng hẳn bản hiện tại, trùng một phiên bản cũ, rồi cùng (tỉnh, tên Nhật, cấp độ) và ưu tiên cùng biểu tượng.</summary>
        private static ExploreSpot? FindSpot(List<ExploreSpot> existing, HashSet<ExploreSpot> claimed, ExploreContentPack.SpotEntry p, ExploreContentPack.SpotEntry[] versions)
        {
            var free = existing.Where(s => !claimed.Contains(s) && s.Lesson != null).ToList();
            var byKey = free.Where(s => s.PrefectureId == p.PrefectureId && s.NameJp == p.NameJp && s.Lesson!.JLPTLevel == p.Lesson.Level).ToList();
            return free.FirstOrDefault(s => s.PrefectureId == p.PrefectureId && SameContent(s, p))
                ?? free.FirstOrDefault(s => versions.Any(v => s.PrefectureId == v.PrefectureId && SameContent(s, v)))
                ?? byKey.FirstOrDefault(s => s.IconId == p.IconId)
                ?? byKey.FirstOrDefault()
                ?? existing.FirstOrDefault(s => !claimed.Contains(s) && s.Lesson == null && s.PrefectureId == p.PrefectureId && s.NameJp == p.NameJp);
        }

        private static void Apply(ExploreSpot spot, ExploreContentPack.SpotEntry p)
        {
            spot.PrefectureId = p.PrefectureId;
            spot.IconId = p.IconId;
            spot.NameVi = p.NameVi;
            spot.NameJp = p.NameJp;
            spot.NameKana = p.NameKana;
            spot.Latitude = p.Latitude;
            spot.Longitude = p.Longitude;
            spot.Status = p.Status;
            spot.IsActive = p.IsActive;
            var lesson = spot.Lesson!;
            lesson.JLPTLevel = p.Lesson.Level;
            lesson.Situation = p.Lesson.Situation;
            lesson.RealUse = p.Lesson.RealUse;
            lesson.SentenceJson = ExploreSentenceJson.Serialize(p.Lesson.Sentence);
            lesson.Meaning = p.Lesson.Meaning;
            lesson.GrammarNote = p.Lesson.GrammarNote;
            lesson.EstimatedMinutes = p.Lesson.EstimatedMinutes;
        }

        private static string Sentence(string? json) => ExploreSentenceJson.Serialize(ExploreSentenceJson.Parse(json));

        private static bool SameContent(ExploreSpot s, ExploreContentPack.SpotEntry p) =>
            s.Lesson != null && s.IconId == p.IconId && s.NameVi == p.NameVi && s.NameJp == p.NameJp && s.NameKana == p.NameKana
            && s.Latitude.Equals(p.Latitude) && s.Longitude.Equals(p.Longitude)
            && s.Status == p.Status && s.IsActive == p.IsActive && s.Lesson.JLPTLevel == p.Lesson.Level
            && s.Lesson.Situation == p.Lesson.Situation && s.Lesson.RealUse == p.Lesson.RealUse
            && Sentence(s.Lesson.SentenceJson) == ExploreSentenceJson.Serialize(p.Lesson.Sentence)
            && s.Lesson.Meaning == p.Lesson.Meaning && s.Lesson.GrammarNote == p.Lesson.GrammarNote
            && s.Lesson.EstimatedMinutes == p.Lesson.EstimatedMinutes;

        /// <summary>Mốc vẫn đúng y bản trong bộ mẫu ra mắt, tức là chưa có admin nào sửa trên máy này.</summary>
        private static bool IsLaunchCopy(ExploreSpot spot)
        {
            if (spot.Lesson == null) return false;
            var seed = ExploreSeedData.Spots.FirstOrDefault(s => s.PrefectureId == spot.PrefectureId
                && s.NameJp == spot.NameJp && s.Lesson.Level == spot.Lesson.JLPTLevel);
            if (seed == null) return false;
            var e = ExploreSeedData.ToEntity(seed);
            return spot.IconId == e.IconId && spot.NameVi == e.NameVi && spot.NameKana == e.NameKana
                && spot.Latitude.Equals(e.Latitude) && spot.Longitude.Equals(e.Longitude)
                && spot.Status == e.Status && spot.IsActive == e.IsActive
                && spot.Lesson.Situation == e.Lesson!.Situation && spot.Lesson.RealUse == e.Lesson.RealUse
                && Sentence(spot.Lesson.SentenceJson) == Sentence(e.Lesson.SentenceJson)
                && spot.Lesson.Meaning == e.Lesson.Meaning && spot.Lesson.GrammarNote == e.Lesson.GrammarNote
                && spot.Lesson.EstimatedMinutes == e.Lesson.EstimatedMinutes;
        }

        private record References(
            Dictionary<string, int> Dialogues, Dictionary<string, int> Grammars, Dictionary<string, int> Vocabularies,
            Dictionary<(string Title, string JLPTLevel), int> ScenarioConfigs,
            Dictionary<int, string> DialogueTitles, Dictionary<int, string> GrammarPatterns, Dictionary<int, string> VocabularyWords,
            Dictionary<int, (string Title, string JLPTLevel)> ConfigKeys);

        /// <summary>Đồng bộ liên kết của bài. Trả true nếu có đổi.</summary>
        private static bool LinkLesson(
            ExploreSpotLesson lesson, ExploreContentPack.SpotEntry p, ExploreContentPack.SpotEntry[] versions, References refs, List<string> unresolved)
        {
            var changed = false;

            // Ngữ pháp: thay khi bài đang trống hoặc đúng y một phiên bản cũ
            var grammarKeys = lesson.LessonGrammars.Select(g => refs.GrammarPatterns.GetValueOrDefault(g.GrammarId, "")).OrderBy(x => x, StringComparer.Ordinal).ToList();
            var wantedGrammars = p.Lesson.Grammars.Distinct().ToList();
            if (!grammarKeys.SequenceEqual(wantedGrammars.OrderBy(x => x, StringComparer.Ordinal))
                && (grammarKeys.Count == 0 || versions.Any(v => grammarKeys.SequenceEqual(v.Lesson.Grammars.Distinct().OrderBy(x => x, StringComparer.Ordinal)))))
            {
                lesson.LessonGrammars.Clear();
                foreach (var pattern in wantedGrammars)
                {
                    if (!refs.Grammars.TryGetValue(pattern, out var id)) { unresolved.Add($"Ngữ pháp “{pattern}” ({p.NameVi})"); continue; }
                    lesson.LessonGrammars.Add(new ExploreSpotLessonGrammar { GrammarId = id });
                }
                changed = true;
            }

            // Từ vựng: cùng quy tắc
            var wordKeys = lesson.LessonVocabularies.Select(v => refs.VocabularyWords.GetValueOrDefault(v.VocabularyId, "")).OrderBy(x => x, StringComparer.Ordinal).ToList();
            var wantedWords = p.Lesson.Vocabularies.Distinct().ToList();
            if (!wordKeys.SequenceEqual(wantedWords.OrderBy(x => x, StringComparer.Ordinal))
                && (wordKeys.Count == 0 || versions.Any(v => wordKeys.SequenceEqual(v.Lesson.Vocabularies.Distinct().OrderBy(x => x, StringComparer.Ordinal)))))
            {
                lesson.LessonVocabularies.Clear();
                foreach (var word in wantedWords)
                {
                    if (!refs.Vocabularies.TryGetValue(word, out var id)) { unresolved.Add($"Từ vựng “{word}” ({p.NameVi})"); continue; }
                    lesson.LessonVocabularies.Add(new ExploreSpotLessonVocabulary { VocabularyId = id });
                }
                changed = true;
            }

            // Hoạt động, theo từng loại: chưa có thì thêm; đang đúng một phiên bản cũ thì đổi theo bản mới (kể cả bỏ đi); còn lại giữ nguyên
            foreach (var type in p.Lesson.Activities.Select(a => a.Type).Concat(lesson.Activities.Select(a => a.ActivityType)).Distinct().ToList())
            {
                var row = lesson.Activities.FirstOrDefault(a => a.ActivityType == type);
                var wanted = p.Lesson.Activities.FirstOrDefault(a => a.Type == type);
                if (row != null && wanted != null && SameActivity(row, wanted, refs)) continue;
                if (row != null)
                {
                    var known = versions.Select(v => v.Lesson.Activities.FirstOrDefault(a => a.Type == type)).Where(a => a != null);
                    if (!known.Any(a => SameActivity(row, a!, refs))) continue;
                }
                if (wanted == null)
                {
                    lesson.Activities.Remove(row!);
                    changed = true;
                    continue;
                }

                int? reference = null;
                if (wanted.Type == ExploreActivityType.Shadowing && wanted.DialogueTitle != null)
                {
                    if (!refs.Dialogues.TryGetValue(wanted.DialogueTitle, out var id)) { unresolved.Add($"Bài Shadowing “{wanted.DialogueTitle}” ({p.NameVi})"); continue; }
                    reference = id;
                }
                else if (wanted.Type == ExploreActivityType.Roleplay && wanted.ScenarioTitle != null && wanted.ScenarioLevel != null)
                {
                    if (!refs.ScenarioConfigs.TryGetValue((wanted.ScenarioTitle, wanted.ScenarioLevel), out var id)) { unresolved.Add($"Kịch bản “{wanted.ScenarioTitle}” {wanted.ScenarioLevel} ({p.NameVi})"); continue; }
                    reference = id;
                }
                if (row == null)
                {
                    lesson.Activities.Add(new ExploreSpotActivity { ActivityType = wanted.Type, ReferenceId = reference, PassThreshold = wanted.PassThreshold, OrderIndex = wanted.Order });
                }
                else
                {
                    row.ReferenceId = reference;
                    row.PassThreshold = wanted.PassThreshold;
                    row.OrderIndex = wanted.Order;
                }
                changed = true;
            }

            return changed;
        }

        private static bool SameActivity(ExploreSpotActivity row, ExploreContentPack.ActivityEntry a, References refs)
        {
            if (row.ActivityType != a.Type || row.PassThreshold != a.PassThreshold || row.OrderIndex != a.Order) return false;
            if (a.Type == ExploreActivityType.Shadowing)
                return row.ReferenceId is int d && refs.DialogueTitles.GetValueOrDefault(d) == a.DialogueTitle;
            if (a.Type == ExploreActivityType.Roleplay)
                return row.ReferenceId is int c && refs.ConfigKeys.TryGetValue(c, out var key) && key.Title == a.ScenarioTitle && key.JLPTLevel == a.ScenarioLevel;
            return true;
        }
    }
}
