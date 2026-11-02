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
        private const int Miyazaki = 45;

        private static async Task<AppDbContext> SeededContext(string name)
        {
            var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase($"JCAP_ExploreContent_{name}_{Guid.NewGuid()}").Options);
            var services = new ServiceCollection().AddSingleton(db).BuildServiceProvider();
            await ExploreSeeder.SeedAsync(services); // chỉ bộ mẫu ra mắt: host test không có IConfiguration nên không nạp gói nội dung
            return db;
        }

        [Fact]
        public void Pack_EverySentenceHasTextAndKanaReadings_AndLevelsAreValid()
        {
            var pack = ExploreContentPack.Load();

            Assert.NotEmpty(pack.Spots);
            foreach (var s in pack.Spots)
            {
                Assert.NotEmpty(s.Lesson.Sentence);
                Assert.All(s.Lesson.Sentence, seg => Assert.False(string.IsNullOrWhiteSpace(seg.Text)));
                Assert.All(s.Lesson.Sentence.Where(seg => seg.Reading != null), seg => Assert.Matches("^[\\u3040-\\u30FFー]+$", seg.Reading!));
                Assert.DoesNotContain(s.Lesson.Sentence, seg => seg.Text.Contains('}') || seg.Text.Contains('{'));
                Assert.Contains(s.Lesson.Level, new[] { "N5", "N4", "N3" });
                Assert.Contains(s.Status, new[] { ExploreSpotStatus.Draft, ExploreSpotStatus.Published });
                Assert.False(string.IsNullOrWhiteSpace(s.Lesson.Situation));
                Assert.False(string.IsNullOrWhiteSpace(s.Lesson.RealUse));
                Assert.InRange(s.PrefectureId, 1, 47);
            }
            // Mỗi (tỉnh, tên Nhật, cấp độ) chỉ một lần: đó là khoá để nạp lại không sinh trùng
            Assert.Equal(pack.Spots.Length, pack.Spots.Select(s => (s.PrefectureId, s.NameJp, s.Lesson.Level)).Distinct().Count());
        }

        [Fact]
        public async Task Import_AddsMissingChapterSpotsAndWord_AndOpensTheNewPrefecture()
        {
            using var db = await SeededContext("add");
            var pack = ExploreContentPack.Load();
            var before = await db.ExploreSpots.CountAsync();

            var result = await ExploreContentSeeder.ImportAsync(db, pack);

            var chapter = await db.ExploreChapters.Include(c => c.Prefectures).SingleAsync(c => c.OrderIndex == 3);
            Assert.Equal(new[] { Miyazaki }, chapter.Prefectures.Select(p => p.PrefectureId));
            Assert.Equal(1, result.ChaptersAdded);
            Assert.True(result.SpotsAdded > 0);
            Assert.Equal(before + result.SpotsAdded, await db.ExploreSpots.CountAsync());
            Assert.True((await db.ExplorePrefectures.FindAsync(Miyazaki))!.IsOpen);
            Assert.Equal(1, result.PrefecturesOpened);
            Assert.True(await db.ExploreSpots.AnyAsync(s => s.PrefectureId == Miyazaki && s.Status == ExploreSpotStatus.Published && s.IsActive));
            Assert.True(await db.ExploreProvinceWords.AnyAsync(w => w.PrefectureId == Miyazaki));
            // Mốc nháp trong gói vẫn là nháp, không hiện với người học
            Assert.All(await db.ExploreSpots.Where(s => s.PrefectureId == Miyazaki && s.Status == ExploreSpotStatus.Draft).ToListAsync(), s => Assert.False(s.IsActive));
        }

        [Fact]
        public async Task Import_RunTwice_AddsNothingTheSecondTime()
        {
            using var db = await SeededContext("twice");
            var pack = ExploreContentPack.Load();
            await ExploreContentSeeder.ImportAsync(db, pack);
            var spots = await db.ExploreSpots.CountAsync();
            var chapters = await db.ExploreChapters.CountAsync();

            var second = await ExploreContentSeeder.ImportAsync(db, pack);

            Assert.Equal(0, second.ChaptersAdded);
            Assert.Equal(0, second.SpotsAdded);
            Assert.Equal(0, second.PrefecturesOpened);
            Assert.Equal(0, second.WordsAdded);
            Assert.Equal(spots, await db.ExploreSpots.CountAsync());
            Assert.Equal(chapters, await db.ExploreChapters.CountAsync());
        }

        [Fact]
        public async Task Import_KeepsAdminEdits_AndDoesNotReopenAPrefectureAdminClosed()
        {
            using var db = await SeededContext("keep");
            var pack = ExploreContentPack.Load();
            await ExploreContentSeeder.ImportAsync(db, pack);

            // Admin sửa nội dung một mốc và đóng tỉnh Miyazaki
            var spot = await db.ExploreSpots.Include(s => s.Lesson).FirstAsync(s => s.PrefectureId == 13);
            spot.Lesson!.Meaning = "Admin đã sửa";
            spot.NameVi = "Tên admin đặt";
            (await db.ExplorePrefectures.FindAsync(Miyazaki))!.IsOpen = false;
            await db.SaveChangesAsync();

            await ExploreContentSeeder.ImportAsync(db, pack);

            var again = await db.ExploreSpots.Include(s => s.Lesson).FirstAsync(s => s.Id == spot.Id);
            Assert.Equal("Admin đã sửa", again.Lesson!.Meaning);
            Assert.Equal("Tên admin đặt", again.NameVi);
            Assert.False((await db.ExplorePrefectures.FindAsync(Miyazaki))!.IsOpen);
        }

        [Fact]
        public async Task Import_DoesNotAssignAPrefectureThatAlreadyBelongsToAnotherChapter()
        {
            using var db = await SeededContext("chapter");
            var other = new ExploreChapter { OrderIndex = 7, Title = "Chương khác", Prefectures = { new ExploreChapterPrefecture { PrefectureId = Miyazaki } } };
            db.ExploreChapters.Add(other);
            await db.SaveChangesAsync();

            await ExploreContentSeeder.ImportAsync(db, ExploreContentPack.Load());

            Assert.Single(await db.ExploreChapterPrefectures.Where(p => p.PrefectureId == Miyazaki).ToListAsync());
        }

        [Fact]
        public async Task Import_LinksByContentKey_AndReportsWhatIsMissingOnThisMachine()
        {
            using var db = await SeededContext("links");
            var pack = ExploreContentPack.Load();

            // Máy chưa có bài Shadowing, kịch bản, ngữ pháp, từ vựng nào: mốc vẫn tạo, liên kết thiếu được báo lại
            var bare = await ExploreContentSeeder.ImportAsync(db, pack);
            Assert.NotEmpty(bare.UnresolvedLinks);
            Assert.Empty(db.ExploreSpotActivities);

            // Máy có đủ nội dung (ID khác hẳn máy gốc): nạp lại thì bổ sung liên kết cho bài còn trống
            var scenario = new Scenario { Title = "Kịch bản thử", ScenarioCode = "SCN_25" };
            db.Scenarios.Add(scenario);
            await db.SaveChangesAsync();
            db.ScenarioLevelConfigurations.Add(new ScenarioLevelConfiguration { ScenarioId = scenario.Id, JLPTLevel = "N5", Title = "t" });
            var dialogue = new ShadowingDialogue { Title = "Hội thoại gọi món Ramen và xin thêm nước", ScenarioId = scenario.Id };
            db.ShadowingDialogues.Add(dialogue);
            db.Grammars.Add(new Grammar { Pattern = "てください", Meaning = "xin hãy" });
            db.Vocabularies.Add(new Vocabulary { Word = "大きい", Meaning = "to" });
            await db.SaveChangesAsync();

            var linked = await ExploreContentSeeder.ImportAsync(db, pack);

            Assert.True(linked.SpotsLinked > 0);
            var config = await db.ScenarioLevelConfigurations.SingleAsync();
            Assert.Contains(await db.ExploreSpotActivities.ToListAsync(),
                a => a.ActivityType == ExploreActivityType.Shadowing && a.ReferenceId == dialogue.Id);
            Assert.Contains(await db.ExploreSpotActivities.ToListAsync(),
                a => a.ActivityType == ExploreActivityType.Roleplay && a.ReferenceId == config.Id);
            Assert.NotEmpty(await db.ExploreSpotLessonGrammars.ToListAsync());
            Assert.NotEmpty(await db.ExploreSpotLessonVocabularies.ToListAsync());
        }
    }
}
