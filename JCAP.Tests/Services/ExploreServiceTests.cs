using JCAP.Data;
using JCAP.Data.Seeds;
using JCAP.DTOs.Explore;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace JCAP.Tests.Services
{
    public class ExploreServiceTests
    {
        private static AppDbContext NewContext(string name) =>
            new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase($"JCAP_Explore_{name}_{Guid.NewGuid()}").Options);

        private static async Task<AppDbContext> SeededContext(string name)
        {
            var db = NewContext(name);
            var services = new ServiceCollection().AddSingleton(db).BuildServiceProvider();
            await ExploreSeeder.SeedAsync(services);
            return db;
        }

        private static ExploreSpot Spot(int pref, string nameJp, string status, bool active = true) => new()
        {
            PrefectureId = pref,
            IconId = "P_test",
            NameVi = nameJp,
            NameJp = nameJp,
            Latitude = 35,
            Longitude = 139,
            Status = status,
            IsActive = active,
        };

        [Fact]
        public async Task Seeder_CreatesAll47Prefectures_OpensOnlyLaunchPrefectures()
        {
            using var db = await SeededContext("seed");

            var prefectures = await db.ExplorePrefectures.ToListAsync();
            Assert.Equal(47, prefectures.Count);
            Assert.Equal(new[] { 12, 13, 26, 29 }, prefectures.Where(p => p.IsOpen).Select(p => p.Id).OrderBy(i => i));
            Assert.All(prefectures.Where(p => p.IsOpen), p => Assert.NotNull(p.OpenedAt));
        }

        [Fact]
        public async Task Seeder_Creates3Chapters_14PublishedSpotsWithLessons_AndOneDraft()
        {
            using var db = await SeededContext("spots");

            var chapters = await db.ExploreChapters.Include(c => c.Prefectures).OrderBy(c => c.OrderIndex).ToListAsync();
            Assert.Equal(new[] { 0, 1, 2 }, chapters.Select(c => c.OrderIndex));
            Assert.Equal(new[] { 12 }, chapters[0].Prefectures.Select(p => p.PrefectureId));
            Assert.Equal(new[] { 26, 29 }, chapters[2].Prefectures.Select(p => p.PrefectureId).OrderBy(i => i));

            var spots = await db.ExploreSpots.Include(s => s.Lesson).ToListAsync();
            Assert.Equal(14, spots.Count(s => s.Status == ExploreSpotStatus.Published));
            Assert.Single(spots, s => s.Status == ExploreSpotStatus.Draft);
            Assert.All(spots, s => Assert.NotNull(s.Lesson));
            // Ba mốc của chương 0 ở sân bay Narita (Chiba), dùng biểu tượng máy bay riêng của JCAP
            Assert.Equal(3, spots.Count(s => s.PrefectureId == 12 && s.IconId == "X_airport"));
        }

        [Fact]
        public async Task Seeder_RunTwice_DoesNotDuplicate_AndKeepsAdminChanges()
        {
            var db = await SeededContext("twice");
            // Admin đóng Tokyo và sửa một mốc giữa hai lần khởi động
            (await db.ExplorePrefectures.FindAsync(13))!.IsOpen = false;
            var asakusa = await db.ExploreSpots.Include(s => s.Lesson).FirstAsync(s => s.NameJp == "浅草");
            asakusa.Lesson!.Meaning = "Admin đã sửa";
            await db.SaveChangesAsync();

            var services = new ServiceCollection().AddSingleton(db).BuildServiceProvider();
            await ExploreSeeder.SeedAsync(services);

            Assert.Equal(47, await db.ExplorePrefectures.CountAsync());
            Assert.Equal(3, await db.ExploreChapters.CountAsync());
            Assert.Equal(15, await db.ExploreSpots.CountAsync());
            Assert.Equal(4, await db.ExploreProvinceWords.CountAsync());
            Assert.False((await db.ExplorePrefectures.FindAsync(13))!.IsOpen);
            Assert.Equal("Admin đã sửa", (await db.ExploreSpotLessons.FirstAsync(l => l.SpotId == asakusa.Id)).Meaning);
        }

        [Fact]
        public async Task Seeder_AfterAdminRenamesOrMovesSeedSpot_DoesNotRecreateTheOriginal()
        {
            var db = await SeededContext("renamed");
            // Admin đổi tên tiếng Nhật và dời vị trí một mốc mẫu giữa hai lần khởi động
            var baggage = await db.ExploreSpots.FirstAsync(s => s.NameJp == "成田空港 手荷物受取所");
            baggage.NameJp = "成田空港 第1ターミナル";
            baggage.Latitude = 35.7647;
            baggage.Longitude = 140.3864;
            await db.SaveChangesAsync();

            var services = new ServiceCollection().AddSingleton(db).BuildServiceProvider();
            await ExploreSeeder.SeedAsync(services);

            // Không có bản sao của mốc gốc ở vị trí cũ quay lại
            Assert.Equal(15, await db.ExploreSpots.CountAsync());
            Assert.False(await db.ExploreSpots.AnyAsync(s => s.NameJp == "成田空港 手荷物受取所"));
            Assert.Equal(35.7647, (await db.ExploreSpots.FindAsync(baggage.Id))!.Latitude);
        }

        [Fact]
        public async Task SeedData_EverySentenceHasTextAndReadingsAreKana()
        {
            foreach (var s in ExploreSeedData.Spots)
            {
                Assert.NotEmpty(s.Lesson.Sentence);
                Assert.All(s.Lesson.Sentence, seg => Assert.False(string.IsNullOrWhiteSpace(seg.Text)));
                // Cách đọc chỉ gồm hiragana/katakana (và dấu kéo dài)
                Assert.All(s.Lesson.Sentence.Where(seg => seg.Reading != null), seg =>
                    Assert.Matches("^[\\u3040-\\u30FFー]+$", seg.Reading!));
                Assert.False(string.IsNullOrWhiteSpace(s.Lesson.Situation));
                Assert.False(string.IsNullOrWhiteSpace(s.Lesson.RealUse));
                Assert.Contains(s.Lesson.Level, new[] { "N5", "N4", "N3" });
            }
            // Mốc đang dùng chỉ nằm ở tỉnh đang mở
            Assert.All(ExploreSeedData.Spots.Where(s => s.Status == ExploreSpotStatus.Published),
                s => Assert.Contains(s.PrefectureId, ExploreSeedData.OpenPrefectures));
            await Task.CompletedTask;
        }

        [Fact]
        public async Task GetJourney_Returns47Prefectures_WithOpenState_SpotCounts_AndWords()
        {
            using var db = await SeededContext("journey");
            var service = new ExploreService(db);

            var result = await service.GetJourneyAsync();

            Assert.True(result.Success);
            var journey = result.Data!;
            Assert.Equal(3, journey.Chapters.Count);
            Assert.Equal(47, journey.Prefectures.Count);
            var nara = journey.Prefectures.Single(p => p.Id == 29);
            Assert.True(nara.IsOpen);
            Assert.Equal(3, nara.SpotCount); // mốc nháp núi Kii không được đếm
            Assert.Equal("鹿", nara.Word!.Word);
            var hokkaido = journey.Prefectures.Single(p => p.Id == 1);
            Assert.False(hokkaido.IsOpen);
            Assert.Null(hokkaido.ChapterId);
            Assert.Equal(0, hokkaido.SpotCount);
        }

        [Fact]
        public async Task GetJourney_EmptyDatabase_StillReturns47ClosedPrefectures()
        {
            using var db = NewContext("empty");
            var result = await new ExploreService(db).GetJourneyAsync();

            Assert.True(result.Success);
            Assert.Equal(47, result.Data!.Prefectures.Count);
            Assert.All(result.Data.Prefectures, p => Assert.False(p.IsOpen));
        }

        [Fact]
        public async Task GetPrefecture_Closed_ReturnsNotOpen_WithoutSpots()
        {
            using var db = await SeededContext("closed");
            var result = await new ExploreService(db).GetPrefectureAsync(1);

            Assert.True(result.Success);
            Assert.False(result.Data!.IsOpen);
            Assert.Empty(result.Data.Spots);
        }

        [Theory]
        [InlineData(0)]
        [InlineData(48)]
        public async Task GetPrefecture_InvalidId_Fails(int id)
        {
            using var db = NewContext("invalid");
            var result = await new ExploreService(db).GetPrefectureAsync(id);
            Assert.False(result.Success);
        }

        [Fact]
        public async Task GetPrefecture_Open_ReturnsOnlyPublishedActiveSpots_WithParsedSentence()
        {
            using var db = await SeededContext("open");
            var result = await new ExploreService(db).GetPrefectureAsync(29);

            Assert.True(result.Success);
            var nara = result.Data!;
            Assert.True(nara.IsOpen);
            Assert.Equal(3, nara.Spots.Count);
            Assert.DoesNotContain(nara.Spots, s => s.IconId == "N_kiisanchi");
            var park = nara.Spots.Single(s => s.IconId == "P_nara-park");
            Assert.Equal("鹿せんべいを一つください。", string.Concat(park.Lesson!.Sentence.Select(x => x.Text)));
            Assert.Equal("しか", park.Lesson.Sentence[0].Reading);
            Assert.Null(park.Lesson.Sentence[1].Reading);
        }

        [Fact]
        public async Task GetPrefecture_HidesDeactivatedSpot_AndOrdersActivities()
        {
            using var db = NewContext("activities");
            db.ExplorePrefectures.Add(new ExplorePrefecture { Id = 13, IsOpen = true });
            var visible = Spot(13, "見える", ExploreSpotStatus.Published);
            visible.Lesson = new ExploreSpotLesson
            {
                Situation = "s",
                RealUse = "r",
                Meaning = "m",
                SentenceJson = "not json",
                Activities =
                {
                    new ExploreSpotActivity { ActivityType = ExploreActivityType.Roleplay, ReferenceId = 7, OrderIndex = 2 },
                    new ExploreSpotActivity { ActivityType = ExploreActivityType.Shadowing, ReferenceId = 3, PassThreshold = 60, OrderIndex = 1 },
                },
            };
            db.ExploreSpots.AddRange(visible, Spot(13, "停止", ExploreSpotStatus.Published, active: false), Spot(13, "下書き", ExploreSpotStatus.Draft));
            await db.SaveChangesAsync();

            var result = await new ExploreService(db).GetPrefectureAsync(13);

            var spot = Assert.Single(result.Data!.Spots);
            Assert.Equal("見える", spot.NameJp);
            // JSON hỏng không làm hỏng cả tỉnh
            Assert.Empty(spot.Lesson!.Sentence);
            Assert.Equal(new[] { "Shadowing", "Roleplay" }, spot.Lesson.Activities.Select(a => a.Type));
            Assert.Equal(60, spot.Lesson.Activities[0].PassThreshold);
        }

        [Fact]
        public void SentenceJson_RoundTrips_AndKeepsJapaneseReadable()
        {
            var json = ExploreSentenceJson.Serialize(new[]
            {
                new FuriganaSegmentDto { Text = "鹿", Reading = "しか" },
                new FuriganaSegmentDto { Text = "です。" },
            });

            Assert.Contains("鹿", json); // không bị mã hoá thành \uXXXX, admin đọc được trong DB
            Assert.DoesNotContain("reading\":null", json);
            var back = ExploreSentenceJson.Parse(json);
            Assert.Equal("しか", back[0].Reading);
            Assert.Null(back[1].Reading);
            Assert.Empty(ExploreSentenceJson.Parse(null));
        }
    }
}
