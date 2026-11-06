using JCAP.Data;
using JCAP.Data.Seeds;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace JCAP.Tests.Services
{
    public class ExploreContentSeederTests
    {
        private const int Hokkaido = 1;
        private const int Tokyo = 13;
        private const int Miyazaki = 45;
        private const string CafeScenario = "Đặt cà phê & bánh ngọt tại quán cafe Harajuku";

        private static async Task<AppDbContext> SeededContext(string name)
        {
            var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase($"JCAP_ExploreContent_{name}_{Guid.NewGuid()}").Options);
            var services = new ServiceCollection().AddSingleton(db).BuildServiceProvider();
            await ExploreSeeder.SeedAsync(services); // chỉ bộ mẫu ra mắt: host test không có IConfiguration nên không nạp dữ liệu roadmap
            return db;
        }

        /// <summary>Gói chỉ có một mốc, để kiểm tra quy tắc cập nhật theo phiên bản mà không phụ thuộc nội dung thật.</summary>
        private static ExploreContentPack OneSpot(ExploreContentPack.SpotEntry spot) =>
            ExploreContentPack.Load() with { Spots = new[] { spot }, Chapters = Array.Empty<ExploreContentPack.ChapterEntry>(), ProvinceWords = Array.Empty<ExploreContentPack.WordEntry>() };

        /// <summary>Một mốc đang dùng của gói mà bộ mẫu ra mắt không có (để không trùng tên với mốc mẫu trên máy).</summary>
        private static ExploreContentPack.SpotEntry SampleSpot() =>
            ExploreContentPack.Load().Spots.First(s => s.Status == ExploreSpotStatus.Published && s.IsActive
                && ExploreSeedData.Spots.All(l => l.NameJp != s.NameJp)) with { Key = "spot-test" };

        private static ExploreContentHistory History(params ExploreContentPack.SpotEntry[] old) =>
            ExploreContentHistory.Empty with { Spots = new() { ["spot-test"] = old } };

        [Fact]
        public void Pack_SentencesAreWellFormed_AndKeysAreUnique()
        {
            var pack = ExploreContentPack.Load();

            Assert.NotEmpty(pack.Spots);
            foreach (var s in pack.Spots)
            {
                Assert.NotEmpty(s.Lesson.Sentence);
                Assert.All(s.Lesson.Sentence, seg => Assert.False(string.IsNullOrWhiteSpace(seg.Text)));
                Assert.All(s.Lesson.Sentence.Where(seg => seg.Reading != null), seg => Assert.Matches("^[\\u3040-\\u30FFー]+$", seg.Reading!));
                Assert.Contains(s.Lesson.Level, new[] { "N5", "N4", "N3" });
                Assert.Contains(s.Status, new[] { ExploreSpotStatus.Draft, ExploreSpotStatus.Published });
                Assert.InRange(s.PrefectureId, 1, 47);
                Assert.False(string.IsNullOrWhiteSpace(s.Key));
            }
            Assert.Equal(pack.Spots.Length, pack.Spots.Select(s => s.Key).Distinct().Count());
            Assert.Equal(pack.Chapters.Length, pack.Chapters.Select(c => c.OrderIndex).Distinct().Count());
        }

        [Fact]
        public void Pack_EveryReferenceResolvesInsideThePack()
        {
            var pack = ExploreContentPack.Load();
            var levels = pack.Scenarios.SelectMany(s => s.Levels.Select(l => (s.Title, l.JlptLevel))).ToHashSet();
            var scenarioTitles = pack.Scenarios.Select(s => s.Title).ToHashSet();
            var dialogueTitles = pack.Dialogues.Select(d => d.Title).ToHashSet();
            var patterns = pack.Grammars.Select(g => g.Pattern).ToHashSet();
            var words = pack.Vocabularies.Select(v => v.Word).ToHashSet();

            foreach (var s in pack.Spots)
            {
                Assert.All(s.Lesson.Grammars, g => Assert.Contains(g, patterns));
                Assert.All(s.Lesson.Vocabularies, v => Assert.Contains(v, words));
                foreach (var a in s.Lesson.Activities)
                {
                    if (a.Type == ExploreActivityType.Shadowing) Assert.Contains(a.DialogueTitle!, dialogueTitles);
                    if (a.Type == ExploreActivityType.Roleplay) Assert.Contains((a.ScenarioTitle!, a.ScenarioLevel!), levels);
                }
            }
            // Bài Shadowing không bắt buộc gắn kịch bản; có gắn thì kịch bản phải nằm trong gói
            Assert.All(pack.Dialogues.Where(d => d.ScenarioTitle != null), d => Assert.Contains(d.ScenarioTitle!, scenarioTitles));
            Assert.All(pack.Dialogues, d => Assert.All(d.Grammars, g => Assert.Contains(g.Pattern, patterns)));
            Assert.All(pack.Dialogues, d => Assert.All(d.Vocabularies, v => Assert.Contains(v.Word, words)));
        }

        [Fact]
        public async Task Import_EmptyMachine_GetsEverySpotOfThePack_IncludingDraftsAndSameNamedOnes()
        {
            using var db = await SeededContext("all");
            var pack = ExploreContentPack.Load();

            var result = await ExploreContentSeeder.ImportAsync(db, pack, ExploreContentHistory.Load());

            Assert.Empty(result.UnresolvedLinks);
            Assert.Equal(pack.Spots.Length, await db.ExploreSpots.CountAsync());
            foreach (var p in pack.Spots)
            {
                var spot = await db.ExploreSpots.Include(s => s.Lesson)
                    .SingleAsync(s => s.PrefectureId == p.PrefectureId && s.NameJp == p.NameJp && s.IconId == p.IconId && s.Lesson!.JLPTLevel == p.Lesson.Level && s.Latitude == p.Latitude);
                Assert.Equal(p.Status, spot.Status);
                Assert.Equal(p.IsActive, spot.IsActive);
            }
            // Mốc mẫu ra mắt mà người soạn đã gỡ thì tắt theo: người học chỉ thấy đúng các mốc đang dùng trong gói
            Assert.Equal(pack.Spots.Count(s => s.Status == ExploreSpotStatus.Published && s.IsActive),
                await db.ExploreSpots.CountAsync(s => s.Status == ExploreSpotStatus.Published && s.IsActive));
        }

        [Fact]
        public async Task Import_ChapterRemovedByTheAuthor_IsTurnedOff_UnlessEditedOnThisMachine()
        {
            using var db = await SeededContext("chapter-removed");
            // Bộ mẫu ra mắt có 3 chương; máy này tự đổi tên chương thứ ba
            var edited = await db.ExploreChapters.SingleAsync(c => c.OrderIndex == 2);
            edited.Title = "Chương riêng của máy này";
            await db.SaveChangesAsync();
            var removed = await db.ExploreChapters.SingleAsync(c => c.OrderIndex == 1);
            var pack = new ExploreContentPack(
                Array.Empty<ExploreContentPack.GrammarEntry>(), Array.Empty<ExploreContentPack.VocabularyEntry>(),
                Array.Empty<ExploreContentPack.ScenarioEntry>(), Array.Empty<ExploreContentPack.DialogueEntry>(),
                new[] { new ExploreContentPack.ChapterEntry(0, "Chương mới", null, "N5", "N5", new[] { 12 }) },
                new[] { 12 }, Array.Empty<ExploreContentPack.SpotEntry>(), Array.Empty<ExploreContentPack.WordEntry>());

            await ExploreContentSeeder.ImportAsync(db, pack, ExploreContentHistory.Empty);

            var active = await db.ExploreChapters.Include(c => c.Prefectures).Where(c => c.IsActive).OrderBy(c => c.OrderIndex).ToListAsync();
            Assert.Equal(new[] { "Chương mới", "Chương riêng của máy này" }, active.Select(c => c.Title));
            Assert.Equal(new[] { 0, 1 }, active.Select(c => c.OrderIndex));
            Assert.Equal(new[] { 12 }, active[0].Prefectures.Select(p => p.PrefectureId));
            var off = await db.ExploreChapters.Include(c => c.Prefectures).SingleAsync(c => c.Id == removed.Id);
            Assert.False(off.IsActive);
            Assert.Empty(off.Prefectures);
        }

        [Fact]
        public async Task Import_DialogueWithoutScenario_IsCreatedWithoutScenario()
        {
            using var db = await SeededContext("no-scenario");
            var pack = ExploreContentPack.Load();
            var standalone = pack.Dialogues.Where(d => d.ScenarioTitle == null).Select(d => d.Title).ToList();
            Assert.NotEmpty(standalone);

            var result = await ExploreContentSeeder.ImportAsync(db, pack, ExploreContentHistory.Load());

            Assert.Empty(result.UnresolvedLinks);
            foreach (var title in standalone)
            {
                Assert.Null((await db.ShadowingDialogues.SingleAsync(d => d.Title == title)).ScenarioId);
            }
        }

        [Fact]
        public async Task Import_MatchesThePublishedRoadmapStructure()
        {
            using var db = await SeededContext("structure");
            var pack = ExploreContentPack.Load();

            await ExploreContentSeeder.ImportAsync(db, pack, ExploreContentHistory.Load());

            foreach (var c in pack.Chapters)
            {
                var chapter = await db.ExploreChapters.Include(x => x.Prefectures).SingleAsync(x => x.OrderIndex == c.OrderIndex);
                Assert.Equal(c.Title, chapter.Title);
                Assert.Equal(c.PrefectureIds.OrderBy(x => x), chapter.Prefectures.Select(p => p.PrefectureId).OrderBy(x => x));
            }
            Assert.Equal(pack.OpenPrefectures.OrderBy(x => x), (await db.ExplorePrefectures.Where(p => p.IsOpen).Select(p => p.Id).ToListAsync()).OrderBy(x => x));
            Assert.Equal(pack.ProvinceWords.Length, await db.ExploreProvinceWords.CountAsync());
        }

        [Fact]
        public async Task Import_BringsReferencedContent_SoSpotsKeepTheirFlow()
        {
            using var db = await SeededContext("flow");
            var pack = ExploreContentPack.Load();

            await ExploreContentSeeder.ImportAsync(db, pack, ExploreContentHistory.Load());

            Assert.Equal(pack.Spots.Sum(s => s.Lesson.Activities.Length), await db.ExploreSpotActivities.CountAsync());
            Assert.Equal(pack.Spots.Sum(s => s.Lesson.Grammars.Distinct().Count()), await db.ExploreSpotLessonGrammars.CountAsync());
            Assert.Equal(pack.Spots.Sum(s => s.Lesson.Vocabularies.Distinct().Count()), await db.ExploreSpotLessonVocabularies.CountAsync());
            var lost = await db.ShadowingDialogues.Include(d => d.Sentences).Include(d => d.DialogueGrammars).SingleAsync(d => d.Title == "Bị lạc đường");
            Assert.NotEmpty(lost.Sentences);
            Assert.NotEmpty(lost.DialogueGrammars);
        }

        [Fact]
        public async Task Import_RunTwice_ChangesNothingTheSecondTime()
        {
            using var db = await SeededContext("twice");
            var pack = ExploreContentPack.Load();
            var history = ExploreContentHistory.Load();
            await ExploreContentSeeder.ImportAsync(db, pack, history);
            var counts = new[] { await db.ExploreSpots.CountAsync(), await db.ExploreChapters.CountAsync(), await db.ExploreSpotActivities.CountAsync(), await db.Scenarios.CountAsync(), await db.ShadowingDialogues.CountAsync(), await db.Grammars.CountAsync(), await db.Vocabularies.CountAsync() };

            var second = await ExploreContentSeeder.ImportAsync(db, pack, history);

            Assert.Equal(0, second.ContentAdded + second.ChaptersAdded + second.ChaptersUpdated + second.SpotsAdded + second.SpotsUpdated
                + second.SpotsLinked + second.PrefecturesChanged + second.WordsAdded + second.WordsUpdated);
            Assert.Equal(counts, new[] { await db.ExploreSpots.CountAsync(), await db.ExploreChapters.CountAsync(), await db.ExploreSpotActivities.CountAsync(), await db.Scenarios.CountAsync(), await db.ShadowingDialogues.CountAsync(), await db.Grammars.CountAsync(), await db.Vocabularies.CountAsync() });
        }

        [Fact]
        public async Task Import_DoesNotTouchALaunchSpotAdminAlreadyEdited()
        {
            using var db = await SeededContext("edited");
            var asakusa = await db.ExploreSpots.FirstAsync(s => s.PrefectureId == Tokyo && s.IconId == "P_asakusa");
            asakusa.Latitude = 12.5;
            await db.SaveChangesAsync();

            await ExploreContentSeeder.ImportAsync(db, ExploreContentPack.Load(), ExploreContentHistory.Load());

            Assert.Equal(12.5, (await db.ExploreSpots.FindAsync(asakusa.Id))!.Latitude);
        }

        [Fact]
        public async Task Import_SpotStillOnAnOldVersion_FollowsTheNewOne_EvenWhenRenamed()
        {
            using var db = await SeededContext("version");
            var v1 = SampleSpot();
            await ExploreContentSeeder.ImportAsync(db, OneSpot(v1));
            var before = await db.ExploreSpots.CountAsync();

            var v2 = v1 with { NameJp = "新しい名前", Latitude = 33.3, Lesson = v1.Lesson with { Meaning = "Nghĩa mới" } };
            var result = await ExploreContentSeeder.ImportAsync(db, OneSpot(v2), History(v1));

            Assert.Equal(1, result.SpotsUpdated);
            Assert.Equal(0, result.SpotsAdded);
            Assert.Equal(before, await db.ExploreSpots.CountAsync());
            var spot = await db.ExploreSpots.Include(s => s.Lesson).SingleAsync(s => s.NameJp == "新しい名前");
            Assert.Equal(33.3, spot.Latitude);
            Assert.Equal("Nghĩa mới", spot.Lesson!.Meaning);
        }

        [Fact]
        public async Task Import_SpotEditedLocally_IsKept_WhenThePackMovesOn()
        {
            using var db = await SeededContext("local");
            var v1 = SampleSpot();
            await ExploreContentSeeder.ImportAsync(db, OneSpot(v1));
            var row = await db.ExploreSpots.Include(s => s.Lesson).SingleAsync(s => s.NameJp == v1.NameJp && s.IconId == v1.IconId);
            row.Lesson!.Meaning = "Thành viên tự sửa";
            await db.SaveChangesAsync();

            var v2 = v1 with { Latitude = 33.3 };
            await ExploreContentSeeder.ImportAsync(db, OneSpot(v2), History(v1));

            var again = await db.ExploreSpots.Include(s => s.Lesson).SingleAsync(s => s.Id == row.Id);
            Assert.Equal("Thành viên tự sửa", again.Lesson!.Meaning);
            Assert.Equal(v1.Latitude, again.Latitude);
        }

        [Fact]
        public async Task Import_ActivityRemovedByTheAuthor_IsRemoved_WhenTheMachineStillHasTheOldOne()
        {
            using var db = await SeededContext("activity");
            var v1 = SampleSpot();
            var withRoleplay = v1 with
            {
                Lesson = v1.Lesson with
                {
                    Activities = new[]
                    {
                        new ExploreContentPack.ActivityEntry(ExploreActivityType.Shadowing, "Bị lạc đường", null, null, 0, 0),
                        new ExploreContentPack.ActivityEntry(ExploreActivityType.Roleplay, null, CafeScenario, "N5", null, 1),
                    },
                },
            };
            await ExploreContentSeeder.ImportAsync(db, OneSpot(withRoleplay));
            var row = await db.ExploreSpots.Include(s => s.Lesson).SingleAsync(s => s.NameJp == v1.NameJp && s.IconId == v1.IconId);
            Assert.Equal(2, await db.ExploreSpotActivities.CountAsync(a => a.LessonId == row.Lesson!.Id));

            var shadowingOnly = withRoleplay with { Lesson = withRoleplay.Lesson with { Activities = new[] { withRoleplay.Lesson.Activities[0] } } };
            await ExploreContentSeeder.ImportAsync(db, OneSpot(shadowingOnly), History(withRoleplay));

            var acts = await db.ExploreSpotActivities.Where(a => a.LessonId == row.Lesson!.Id).ToListAsync();
            Assert.Single(acts);
            Assert.Equal(ExploreActivityType.Shadowing, acts[0].ActivityType);
        }

        [Fact]
        public async Task Import_PartialActivities_GetTheMissingType_AndKeepAnActivityAdminChose()
        {
            using var db = await SeededContext("partial");
            var pack = ExploreContentPack.Load();
            // Máy đã nạp bản cũ: Sảnh đến chỉ có Shadowing (bài do admin chọn), thiếu Hội thoại AI
            var arrival = await db.ExploreSpots.Include(s => s.Lesson).SingleAsync(s => s.NameJp == "成田空港 到着ロビー");
            arrival.Lesson!.Activities.Add(new ExploreSpotActivity { ActivityType = ExploreActivityType.Shadowing, ReferenceId = 999, OrderIndex = 0 });
            await db.SaveChangesAsync();

            await ExploreContentSeeder.ImportAsync(db, pack, ExploreContentHistory.Load());

            var acts = await db.ExploreSpotActivities.Where(a => a.LessonId == arrival.Lesson.Id).ToListAsync();
            Assert.Equal(999, acts.Single(a => a.ActivityType == ExploreActivityType.Shadowing).ReferenceId);
            Assert.Single(acts, a => a.ActivityType == ExploreActivityType.Roleplay);
        }

        [Fact]
        public async Task Import_Prefecture_OnlyFollowsTheAuthor_WhenTheAuthorChangedIt()
        {
            using var db = await SeededContext("pref");
            var pack = ExploreContentPack.Load();
            await ExploreContentSeeder.ImportAsync(db, pack, ExploreContentHistory.Load());

            // Thành viên tự đóng Miyazaki: người soạn chưa từng đổi tỉnh này nên không bị mở lại
            (await db.ExplorePrefectures.FindAsync(Miyazaki))!.IsOpen = false;
            await db.SaveChangesAsync();
            await ExploreContentSeeder.ImportAsync(db, pack, ExploreContentHistory.Empty);
            Assert.False((await db.ExplorePrefectures.FindAsync(Miyazaki))!.IsOpen);

            // Người soạn đóng Tokyo: máy thành viên đóng theo
            var closed = pack with { OpenPrefectures = pack.OpenPrefectures.Where(p => p != Tokyo).ToArray() };
            var history = ExploreContentHistory.Empty with { Prefectures = new() { [Tokyo.ToString()] = true } };
            await ExploreContentSeeder.ImportAsync(db, closed, history);
            Assert.False((await db.ExplorePrefectures.FindAsync(Tokyo))!.IsOpen);
        }

        [Fact]
        public async Task Import_ChapterAndWord_FollowTheNewVersion_OnlyWhenOnAnOldOne()
        {
            using var db = await SeededContext("chapter");
            var pack = ExploreContentPack.Load();
            await ExploreContentSeeder.ImportAsync(db, pack, ExploreContentHistory.Load());

            var c0 = pack.Chapters.Single(c => c.OrderIndex == 0);
            var word = pack.ProvinceWords.Single(w => w.PrefectureId == Tokyo);
            var next = pack with
            {
                Chapters = pack.Chapters.Select(c => c.OrderIndex == 0 ? c with { Title = "Chương đổi tên" } : c).ToArray(),
                ProvinceWords = pack.ProvinceWords.Select(w => w.PrefectureId == Tokyo ? w with { Meaning = "nghĩa mới" } : w).ToArray(),
            };
            var history = ExploreContentHistory.Empty with
            {
                Chapters = new() { ["0"] = new[] { c0 } },
                Words = new() { [Tokyo.ToString()] = new[] { word } },
            };
            await ExploreContentSeeder.ImportAsync(db, next, history);

            Assert.Equal("Chương đổi tên", (await db.ExploreChapters.SingleAsync(c => c.IsActive && c.OrderIndex == 0)).Title);
            Assert.Equal("nghĩa mới", (await db.ExploreProvinceWords.SingleAsync(w => w.PrefectureId == Tokyo)).Meaning);

            // Chương admin tự đổi tên trên máy này thì giữ nguyên
            var mine = await db.ExploreChapters.SingleAsync(c => c.IsActive && c.OrderIndex == 0);
            mine.Title = "Tên riêng";
            await db.SaveChangesAsync();
            var renamed = pack with { Chapters = pack.Chapters.Select(c => c.OrderIndex == 0 ? c with { Title = "Bản mới" } : c).ToArray() };
            await ExploreContentSeeder.ImportAsync(db, renamed, ExploreContentHistory.Empty with { Chapters = new() { ["0"] = new[] { c0 } } });
            Assert.Equal("Tên riêng", (await db.ExploreChapters.SingleAsync(c => c.Id == mine.Id)).Title);
        }

        [Fact]
        public async Task Import_DoesNotAssignAPrefectureThatAlreadyBelongsToAnotherChapter()
        {
            using var db = await SeededContext("assign");
            db.ExploreChapters.Add(new ExploreChapter { OrderIndex = 7, Title = "Chương khác", Prefectures = { new ExploreChapterPrefecture { PrefectureId = Hokkaido }, new ExploreChapterPrefecture { PrefectureId = Miyazaki } } });
            await db.SaveChangesAsync();

            await ExploreContentSeeder.ImportAsync(db, ExploreContentPack.Load(), ExploreContentHistory.Load());

            Assert.Single(await db.ExploreChapterPrefectures.Where(p => p.PrefectureId == Miyazaki).ToListAsync());
            Assert.Single(await db.ExploreChapterPrefectures.Where(p => p.PrefectureId == Hokkaido).ToListAsync());
        }

        [Fact]
        public async Task Import_FindsScenarioByTitle_NotByTheOriginalMachineCode()
        {
            using var db = await SeededContext("scenario");
            // Trên máy khác, mã SCN_25 có thể là một kịch bản hoàn toàn khác; kịch bản đúng mang mã của seed
            var wrong = new Scenario { Title = "Kịch bản khác", ScenarioCode = "SCN_25" };
            var right = new Scenario { Title = CafeScenario, ScenarioCode = "SCN_CAFE_01" };
            db.Scenarios.AddRange(wrong, right);
            await db.SaveChangesAsync();
            var wrongConfig = new ScenarioLevelConfiguration { ScenarioId = wrong.Id, JLPTLevel = "N5", Title = "x" };
            var rightConfig = new ScenarioLevelConfiguration { ScenarioId = right.Id, JLPTLevel = "N5", Title = "y" };
            db.ScenarioLevelConfigurations.AddRange(wrongConfig, rightConfig);
            await db.SaveChangesAsync();

            await ExploreContentSeeder.ImportAsync(db, ExploreContentPack.Load(), ExploreContentHistory.Load());

            var roleplay = await db.ExploreSpotActivities.Where(a => a.ActivityType == ExploreActivityType.Roleplay && a.ReferenceId != null).Select(a => a.ReferenceId!.Value).ToListAsync();
            Assert.Contains(rightConfig.Id, roleplay);
            Assert.DoesNotContain(wrongConfig.Id, roleplay);
        }

        [Fact]
        public async Task Import_ReportsWhatCannotBeFound_ButStillCreatesTheSpot()
        {
            using var db = await SeededContext("missing");
            var v = SampleSpot();
            var spot = v with { NameJp = "新しい場所", Lesson = v.Lesson with { Activities = new[] { new ExploreContentPack.ActivityEntry(ExploreActivityType.Shadowing, "Bài không tồn tại", null, null, 0, 0) } } };

            var result = await ExploreContentSeeder.ImportAsync(db, OneSpot(spot));

            Assert.Contains(result.UnresolvedLinks, u => u.Contains("Bài không tồn tại"));
            Assert.True(await db.ExploreSpots.AnyAsync(s => s.NameJp == "新しい場所"));
        }
    }
}
