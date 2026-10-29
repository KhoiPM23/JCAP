using JCAP.Data;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace JCAP.Tests.Services
{
    /// <summary>Thống kê Khám phá cho admin: phễu Hiểu → Con dấu → Dấu son của từng mốc, số liệu theo chương.</summary>
    public class AdminExploreStatsTests
    {
        private const int Chiba = 12;
        private const int Tokyo = 13;
        private const int RoleplayConfig = 201;

        private sealed record World(AppDbContext Db, ExploreChapter Chapter0, ExploreChapter Chapter1, List<ExploreSpot> ChibaSpots, List<ExploreSpot> TokyoSpots);

        /// <summary>
        /// Chương 0 = Chiba (3 mốc, mốc đầu có Hội thoại AI), chương 1 = Tokyo (2 mốc đang dùng, 1 nháp, 1 đã ngừng dùng). Cả hai tỉnh đã mở.
        /// </summary>
        private static async Task<World> NewWorld(string name)
        {
            var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase($"JCAP_AdminExploreStats_{name}_{Guid.NewGuid()}").Options);
            db.ExplorePrefectures.AddRange(new ExplorePrefecture { Id = Chiba, IsOpen = true }, new ExplorePrefecture { Id = Tokyo, IsOpen = true });
            var c0 = new ExploreChapter { OrderIndex = 0, Title = "Nhập môn", Prefectures = { new ExploreChapterPrefecture { PrefectureId = Chiba } } };
            var c1 = new ExploreChapter { OrderIndex = 1, Title = "Tokyo", Prefectures = { new ExploreChapterPrefecture { PrefectureId = Tokyo } } };
            db.ExploreChapters.AddRange(c0, c1);
            db.ScenarioLevelConfigurations.Add(new ScenarioLevelConfiguration { Id = RoleplayConfig, ScenarioId = 5, JLPTLevel = "N5", Title = "Hỏi đường", CreditCost = 5, Status = "Published" });

            var chiba = Enumerable.Range(0, 3).Select(i => NewSpot(Chiba, 101 + i, i == 0 ? RoleplayConfig : null)).ToList();
            var tokyo = new List<ExploreSpot>
            {
                NewSpot(Tokyo, 111, null),
                NewSpot(Tokyo, 112, null),
                NewSpot(Tokyo, 113, null, status: ExploreSpotStatus.Draft),
                NewSpot(Tokyo, 114, null, active: false),
            };
            db.ExploreSpots.AddRange(chiba);
            db.ExploreSpots.AddRange(tokyo);
            await db.SaveChangesAsync();
            return new World(db, c0, c1, chiba, tokyo);
        }

        private static ExploreSpot NewSpot(int pref, int dialogueId, int? roleplayConfig, string status = ExploreSpotStatus.Published, bool active = true)
        {
            var lesson = new ExploreSpotLesson { Situation = "s", RealUse = "r", Meaning = "m" };
            lesson.Activities.Add(new ExploreSpotActivity { ActivityType = ExploreActivityType.Shadowing, ReferenceId = dialogueId, PassThreshold = 60, OrderIndex = 0 });
            if (roleplayConfig != null)
            {
                lesson.Activities.Add(new ExploreSpotActivity { ActivityType = ExploreActivityType.Roleplay, ReferenceId = roleplayConfig, OrderIndex = 1 });
            }
            return new ExploreSpot
            {
                PrefectureId = pref,
                IconId = "P_test",
                NameVi = "Mốc " + dialogueId,
                NameJp = "テスト" + dialogueId,
                Status = status,
                IsActive = active,
                Lesson = lesson,
            };
        }

        private static void Progress(AppDbContext db, string user, int spotId, bool understood = true, bool stamped = false, bool red = false)
        {
            var now = DateTime.UtcNow;
            db.Set<ExploreSpotProgress>().Add(new ExploreSpotProgress
            {
                UserId = user,
                SpotId = spotId,
                UnderstoodAt = understood ? now : null,
                StampedAt = stamped ? now : null,
                RedStampedAt = red ? now : null,
            });
        }

        [Fact]
        public async Task Stats_WithoutProgress_ReturnsZeroesAndListsOnlyPublishedActiveSpots()
        {
            var w = await NewWorld("empty");
            using var db = w.Db;

            var result = await new AdminExploreService(db).GetStatsAsync();

            Assert.True(result.Success);
            var data = result.Data!;
            Assert.Equal(0, data.Learners);
            Assert.Equal(0, data.Stamps);
            Assert.Equal(0, data.RedStamps);
            // Mốc nháp và mốc đã ngừng dùng của Tokyo không xuất hiện
            Assert.Equal(5, data.Spots.Count);
            Assert.DoesNotContain(data.Spots, s => s.SpotId == w.TokyoSpots[2].Id || s.SpotId == w.TokyoSpots[3].Id);
            Assert.All(data.Spots, s => Assert.Equal(0, s.Understood));
            Assert.All(data.Chapters, c => Assert.Null(c.AvgStampPercent));
        }

        [Fact]
        public async Task Stats_Funnel_CountsUnderstoodStampedAndStuckPerSpot()
        {
            var w = await NewWorld("funnel");
            using var db = w.Db;
            var spot = w.ChibaSpots[1].Id;
            Progress(db, "a", spot, stamped: true);
            Progress(db, "b", spot);
            Progress(db, "c", spot);
            await db.SaveChangesAsync();

            var data = (await new AdminExploreService(db).GetStatsAsync()).Data!;

            var row = data.Spots.Single(s => s.SpotId == spot);
            Assert.Equal(3, row.Understood);
            Assert.Equal(1, row.Stamped);
            Assert.Equal(2, row.StuckAtShadowing);
            Assert.Equal(3, data.Learners);
            Assert.Equal(1, data.Stamps);
            // Mốc khác không có ai học
            Assert.Equal(0, data.Spots.Single(s => s.SpotId == w.ChibaSpots[2].Id).Understood);
        }

        [Fact]
        public async Task Stats_SpotWithoutRoleplay_HasNullRedStampedWhileRoleplaySpotCountsIt()
        {
            var w = await NewWorld("roleplay");
            using var db = w.Db;
            Progress(db, "a", w.ChibaSpots[0].Id, stamped: true, red: true);
            Progress(db, "a", w.ChibaSpots[1].Id, stamped: true);
            await db.SaveChangesAsync();

            var data = (await new AdminExploreService(db).GetStatsAsync()).Data!;

            var withRoleplay = data.Spots.Single(s => s.SpotId == w.ChibaSpots[0].Id);
            Assert.True(withRoleplay.HasRoleplay);
            Assert.Equal(1, withRoleplay.RedStamped);
            var without = data.Spots.Single(s => s.SpotId == w.ChibaSpots[1].Id);
            Assert.False(without.HasRoleplay);
            Assert.Null(without.RedStamped);
            Assert.Equal(1, data.RedStamps);
            Assert.Equal(2, data.Stamps);
        }

        [Fact]
        public async Task Stats_RoleplayScenarioNoLongerPublished_IsNotCountedAsRoleplaySpot()
        {
            var w = await NewWorld("unpublished-scenario");
            using var db = w.Db;
            (await db.ScenarioLevelConfigurations.FindAsync(RoleplayConfig))!.Status = "Draft";
            await db.SaveChangesAsync();

            var data = (await new AdminExploreService(db).GetStatsAsync()).Data!;

            var row = data.Spots.Single(s => s.SpotId == w.ChibaSpots[0].Id);
            Assert.False(row.HasRoleplay);
            Assert.Null(row.RedStamped);
        }

        [Fact]
        public async Task Stats_Chapters_FirstUsesAllLearners_NextUsesUnlockRowsAndAveragesStamps()
        {
            var w = await NewWorld("chapters");
            using var db = w.Db;
            // 2 người học; "a" có con dấu ở 3/3 mốc Chiba, "b" ở 0/3
            foreach (var s in w.ChibaSpots) Progress(db, "a", s.Id, stamped: true);
            Progress(db, "b", w.ChibaSpots[0].Id);
            // Chỉ "a" mở chương Tokyo và có con dấu ở 1/2 mốc
            db.Set<ExploreChapterUnlock>().Add(new ExploreChapterUnlock { UserId = "a", ChapterId = w.Chapter1.Id });
            Progress(db, "a", w.TokyoSpots[0].Id, stamped: true);
            await db.SaveChangesAsync();

            var data = (await new AdminExploreService(db).GetStatsAsync()).Data!;

            var first = data.Chapters[0];
            Assert.Equal(w.Chapter0.Id, first.ChapterId);
            Assert.Equal(2, first.UnlockedLearners);
            Assert.Equal(3, first.SpotCount);
            Assert.Equal(50.0, first.AvgStampPercent); // 3 con dấu / (3 mốc × 2 người)

            var second = data.Chapters[1];
            Assert.Equal(1, second.UnlockedLearners);
            Assert.Equal(2, second.SpotCount); // nháp và ngừng dùng không tính
            Assert.Equal(50.0, second.AvgStampPercent); // 1 con dấu / (2 mốc × 1 người)
        }

        [Fact]
        public async Task Stats_PrefectureStamps_CountRedSeparately()
        {
            var w = await NewWorld("prefecture-stamps");
            using var db = w.Db;
            db.Set<ExplorePrefectureStamp>().AddRange(
                new ExplorePrefectureStamp { UserId = "a", PrefectureId = Chiba, RedStampedAt = DateTime.UtcNow },
                new ExplorePrefectureStamp { UserId = "b", PrefectureId = Chiba });
            await db.SaveChangesAsync();

            var data = (await new AdminExploreService(db).GetStatsAsync()).Data!;

            Assert.Equal(2, data.PrefectureStamps);
            Assert.Equal(1, data.PrefectureRedStamps);
        }

        [Fact]
        public async Task Stats_StampOnSpotLaterDeactivated_StaysInTotalsButNotInSpotList()
        {
            var w = await NewWorld("deactivated");
            using var db = w.Db;
            Progress(db, "a", w.TokyoSpots[3].Id, stamped: true);
            await db.SaveChangesAsync();

            var data = (await new AdminExploreService(db).GetStatsAsync()).Data!;

            Assert.Equal(1, data.Stamps);
            Assert.DoesNotContain(data.Spots, s => s.SpotId == w.TokyoSpots[3].Id);
        }
    }
}
