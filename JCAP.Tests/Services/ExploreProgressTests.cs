using JCAP.Data;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace JCAP.Tests.Services
{
    /// <summary>Con dấu, dấu son, con dấu tỉnh và mở chương: server tự cấp từ phiên Shadowing / Hội thoại AI có thật.</summary>
    public class ExploreProgressTests
    {
        private const string User = "learner-1";
        private const int Chiba = 12;
        private const int Tokyo = 13;
        /// <summary>Kịch bản Hội thoại AI gắn với mốc đầu tiên của Chiba</summary>
        private const int RoleplayConfig = 201;

        private sealed record World(AppDbContext Db, int Chapter0, int Chapter1, int[] ChibaSpots, int[] TokyoSpots);

        /// <summary>
        /// Chương 0 = Chiba (3 mốc, Shadowing bài 101..103, mốc đầu có thêm Hội thoại AI),
        /// chương 1 = Tokyo (3 mốc, bài 111..113), ngưỡng mở chương 1 là 70%.
        /// </summary>
        private static async Task<World> NewWorld(string name)
        {
            var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase($"JCAP_ExploreProgress_{name}_{Guid.NewGuid()}").Options);
            db.ExplorePrefectures.AddRange(new ExplorePrefecture { Id = Chiba, IsOpen = true }, new ExplorePrefecture { Id = Tokyo, IsOpen = true });
            var c0 = new ExploreChapter { OrderIndex = 0, Title = "Nhập môn", Prefectures = { new ExploreChapterPrefecture { PrefectureId = Chiba } } };
            var c1 = new ExploreChapter { OrderIndex = 1, Title = "Tokyo", UnlockThresholdPercent = 70, Prefectures = { new ExploreChapterPrefecture { PrefectureId = Tokyo } } };
            db.ExploreChapters.AddRange(c0, c1);
            db.ScenarioLevelConfigurations.Add(new ScenarioLevelConfiguration { Id = RoleplayConfig, ScenarioId = 5, JLPTLevel = "N5", Title = "Hỏi đường", CreditCost = 5, Status = "Published" });

            var chiba = Enumerable.Range(0, 3).Select(i => NewSpot(Chiba, 101 + i, i == 0 ? RoleplayConfig : null)).ToList();
            var tokyo = Enumerable.Range(0, 3).Select(i => NewSpot(Tokyo, 111 + i, null)).ToList();
            db.ExploreSpots.AddRange(chiba);
            db.ExploreSpots.AddRange(tokyo);
            await db.SaveChangesAsync();
            return new World(db, c0.Id, c1.Id, chiba.Select(s => s.Id).ToArray(), tokyo.Select(s => s.Id).ToArray());
        }

        private static ExploreSpot NewSpot(int pref, int dialogueId, int? roleplayConfig)
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
                Status = ExploreSpotStatus.Published,
                Lesson = lesson,
            };
        }

        private static void AddShadowing(AppDbContext db, int dialogueId, int score, string user = User, int scored = 4, int total = 4) =>
            db.ShadowingPracticeSessions.Add(new ShadowingPracticeSession
            {
                Id = Guid.NewGuid(),
                UserId = user,
                ShadowingDialogueId = dialogueId,
                WeightedOverallScore = score,
                LearnerSentenceCount = total,
                ScoredSentenceCount = scored,
            });

        private static void AddRoleplay(AppDbContext db, bool concluded, string user = User) =>
            db.RoleplaySessions.Add(new RoleplaySession { UserId = user, ScenarioLevelConfigurationId = RoleplayConfig, Status = "Completed", IsNaturallyConcluded = concluded });

        /// <summary>Hiểu + Shadowing đạt ở mọi mốc của Chiba</summary>
        private static async Task StampAllChiba(World w, ExploreService service)
        {
            for (var i = 0; i < 3; i++) AddShadowing(w.Db, 101 + i, 80);
            await w.Db.SaveChangesAsync();
            foreach (var id in w.ChibaSpots) await service.MarkUnderstoodAsync(User, id);
        }

        [Fact]
        public async Task Stamp_NeedsUnderstoodAndPassingFullShadowing()
        {
            var w = await NewWorld("stamp");
            using var db = w.Db;
            var service = new ExploreService(db);
            var spot = w.ChibaSpots[0];

            // Phiên đạt nhưng chưa bấm "Đã hiểu": chưa có con dấu
            AddShadowing(db, 101, 90);
            await db.SaveChangesAsync();
            var sync = (await service.SyncPrefectureAsync(User, Chiba)).Data!;
            Assert.Empty(sync.Awards.StampSpotIds);
            Assert.Null(sync.Prefecture.Spots.Single(s => s.Id == spot).Progress.StampedAt);

            var understood = (await service.MarkUnderstoodAsync(User, spot)).Data!;
            Assert.Equal(new[] { spot }, understood.Awards.StampSpotIds);
            var progress = understood.Prefecture.Spots.Single(s => s.Id == spot).Progress;
            Assert.NotNull(progress.UnderstoodAt);
            Assert.NotNull(progress.StampedAt);

            // Đồng bộ lại không báo "vừa đạt" lần nữa
            Assert.Empty((await service.SyncPrefectureAsync(User, Chiba)).Data!.Awards.StampSpotIds);
        }

        [Theory]
        [InlineData(59, 4, 4)] // dưới ngưỡng 60
        [InlineData(95, 1, 4)] // chỉ chấm 1/4 câu
        public async Task Stamp_NotGiven_ForFailingOrPartialShadowing(int score, int scored, int total)
        {
            var w = await NewWorld($"fail-{score}-{scored}");
            using var db = w.Db;
            AddShadowing(db, 101, score, scored: scored, total: total);
            await db.SaveChangesAsync();

            var result = (await new ExploreService(db).MarkUnderstoodAsync(User, w.ChibaSpots[0])).Data!;

            Assert.Empty(result.Awards.StampSpotIds);
            Assert.Null(result.Prefecture.Spots.Single(s => s.Id == w.ChibaSpots[0]).Progress.StampedAt);
        }

        [Fact]
        public async Task TestFlag_CountAnyShadowingSession_StampsLowScoreAndPartialSession()
        {
            var w = await NewWorld("relaxed");
            using var db = w.Db;
            AddShadowing(db, 101, 12, scored: 1, total: 4);
            await db.SaveChangesAsync();
            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?> { [ExploreService.CountAnyShadowingSessionKey] = "true" })
                .Build();

            var result = (await new ExploreService(db, config).MarkUnderstoodAsync(User, w.ChibaSpots[0])).Data!;

            Assert.Equal(new[] { w.ChibaSpots[0] }, result.Awards.StampSpotIds);
        }

        [Fact]
        public async Task Stamp_IgnoresOtherLearnersSessions()
        {
            var w = await NewWorld("other");
            using var db = w.Db;
            AddShadowing(db, 101, 100, user: "someone-else");
            await db.SaveChangesAsync();

            var result = (await new ExploreService(db).MarkUnderstoodAsync(User, w.ChibaSpots[0])).Data!;

            Assert.Empty(result.Awards.StampSpotIds);
        }

        [Fact]
        public async Task RedStamp_NeedsStampAndNaturallyConcludedRoleplay()
        {
            var w = await NewWorld("red");
            using var db = w.Db;
            var service = new ExploreService(db);
            var spot = w.ChibaSpots[0];

            // Hội thoại AI kết thúc tự nhiên nhưng chưa có con dấu: chưa có dấu son
            AddRoleplay(db, concluded: true);
            await db.SaveChangesAsync();
            Assert.Empty((await service.MarkUnderstoodAsync(User, spot)).Data!.Awards.RedStampSpotIds);

            AddShadowing(db, 101, 70);
            await db.SaveChangesAsync();
            var result = (await service.SyncPrefectureAsync(User, Chiba)).Data!;

            Assert.Equal(new[] { spot }, result.Awards.StampSpotIds);
            Assert.Equal(new[] { spot }, result.Awards.RedStampSpotIds);
        }

        [Fact]
        public async Task RedStamp_NotGiven_ForAbandonedOrUnfinishedRoleplay()
        {
            var w = await NewWorld("red-no");
            using var db = w.Db;
            AddRoleplay(db, concluded: false);
            AddShadowing(db, 101, 70);
            await db.SaveChangesAsync();

            var result = (await new ExploreService(db).MarkUnderstoodAsync(User, w.ChibaSpots[0])).Data!;

            Assert.Single(result.Awards.StampSpotIds);
            Assert.Empty(result.Awards.RedStampSpotIds);
        }

        [Fact]
        public async Task Spot_ExposesActivityTargets_ForLaunchingShadowingAndRoleplay()
        {
            var w = await NewWorld("targets");
            using var db = w.Db;
            db.ShadowingDialogues.Add(new ShadowingDialogue { Id = 101, Title = "Ở quầy check-in", ScenarioId = 5 });
            await db.SaveChangesAsync();

            var spot = (await new ExploreService(db).GetSpotAsync(User, w.ChibaSpots[0])).Data!;

            Assert.Equal(Chiba, spot.PrefectureId);
            var shadowing = spot.Lesson!.Activities.Single(a => a.Type == ExploreActivityType.Shadowing);
            Assert.Equal("Ở quầy check-in", shadowing.Title);
            var roleplay = spot.Lesson.Activities.Single(a => a.Type == ExploreActivityType.Roleplay);
            Assert.Equal(5, roleplay.ScenarioId);
            Assert.Equal(5, roleplay.CreditCost);
        }

        [Fact]
        public async Task RoleplayNoLongerPublished_IsHidden_AndDoesNotBlockPrefectureRedStamp()
        {
            var w = await NewWorld("archived");
            using var db = w.Db;
            (await db.ScenarioLevelConfigurations.FindAsync(RoleplayConfig))!.Status = "Archived";
            await db.SaveChangesAsync();
            var service = new ExploreService(db);

            var spot = (await service.GetSpotAsync(User, w.ChibaSpots[0])).Data!;
            Assert.DoesNotContain(spot.Lesson!.Activities, a => a.Type == ExploreActivityType.Roleplay);

            await StampAllChiba(w, service);
            var stamp = (await service.GetPrefectureAsync(User, Chiba)).Data!.Stamp;
            Assert.NotNull(stamp);
            Assert.Null(stamp!.RedStampedAt); // không còn mốc nào có Hội thoại AI: tỉnh không có dấu son
        }

        [Fact]
        public async Task PrefectureStamp_WhenEverySpotStamped_AndKeptAfterAdminAddsSpot()
        {
            var w = await NewWorld("pref");
            using var db = w.Db;
            var service = new ExploreService(db);

            await StampAllChiba(w, service);
            var chiba = (await service.GetPrefectureAsync(User, Chiba)).Data!;
            Assert.NotNull(chiba.Stamp);

            // Admin thêm mốc thứ 4: con dấu tỉnh giữ nguyên, tiến độ thành 3/4
            db.ExploreSpots.Add(NewSpot(Chiba, 104, null));
            await db.SaveChangesAsync();
            var journey = (await service.GetJourneyAsync(User)).Data!;
            var summary = journey.Prefectures.Single(p => p.Id == Chiba);
            Assert.Equal(4, summary.SpotCount);
            Assert.Equal(3, summary.StampCount);
            Assert.NotNull(summary.Stamp);
        }

        [Fact]
        public async Task PrefectureRedStamp_WhenEverySpotWithRoleplayIsRed()
        {
            var w = await NewWorld("pref-red");
            using var db = w.Db;
            var service = new ExploreService(db);
            await StampAllChiba(w, service);
            Assert.Null((await service.GetPrefectureAsync(User, Chiba)).Data!.Stamp!.RedStampedAt);

            AddRoleplay(db, concluded: true);
            await db.SaveChangesAsync();
            var result = (await service.SyncPrefectureAsync(User, Chiba)).Data!;

            Assert.True(result.Awards.PrefectureRedStamp);
            Assert.NotNull(result.Prefecture.Stamp!.RedStampedAt);
            Assert.Equal(1, (await service.GetJourneyAsync(User)).Data!.Prefectures.Single(p => p.Id == Chiba).RedStampCount);
        }

        [Fact]
        public async Task NextChapter_LockedUntilThreshold_ThenUnlockedForGood()
        {
            var w = await NewWorld("chapter");
            using var db = w.Db;
            var service = new ExploreService(db);

            // Chưa có con dấu nào: Tokyo (chương 1) khoá, không lộ mốc, không cho bấm "Đã hiểu"
            var tokyo = (await service.GetPrefectureAsync(User, Tokyo)).Data!;
            Assert.True(tokyo.IsLocked);
            Assert.Empty(tokyo.Spots);
            Assert.False((await service.MarkUnderstoodAsync(User, w.TokyoSpots[0])).Success);
            Assert.False((await service.GetSpotAsync(User, w.TokyoSpots[0])).Success);

            // 2/3 con dấu = 66% < 70%: vẫn khoá
            AddShadowing(db, 101, 80);
            AddShadowing(db, 102, 80);
            await db.SaveChangesAsync();
            await service.MarkUnderstoodAsync(User, w.ChibaSpots[0]);
            var second = (await service.MarkUnderstoodAsync(User, w.ChibaSpots[1])).Data!;
            Assert.Empty(second.Awards.UnlockedChapterIds);
            Assert.True((await service.GetJourneyAsync(User)).Data!.Prefectures.Single(p => p.Id == Tokyo).IsLocked);

            // 3/3: chương 1 mở và được báo đúng một lần
            AddShadowing(db, 103, 80);
            await db.SaveChangesAsync();
            var third = (await service.MarkUnderstoodAsync(User, w.ChibaSpots[2])).Data!;
            Assert.Equal(new[] { w.Chapter1 }, third.Awards.UnlockedChapterIds);
            Assert.Empty((await service.SyncPrefectureAsync(User, Chiba)).Data!.Awards.UnlockedChapterIds);

            // Admin thêm 3 mốc vào Chiba: tỷ lệ tụt còn 50%, nhưng chương đã mở thì mở mãi
            db.ExploreSpots.AddRange(NewSpot(Chiba, 104, null), NewSpot(Chiba, 105, null), NewSpot(Chiba, 106, null));
            await db.SaveChangesAsync();
            var journey = (await service.GetJourneyAsync(User)).Data!;
            Assert.True(journey.Chapters.Single(c => c.Id == w.Chapter1).IsUnlocked);
            Assert.Equal(6, journey.Chapters.Single(c => c.Id == w.Chapter0).SpotCount);
            Assert.Equal(3, journey.Chapters.Single(c => c.Id == w.Chapter0).StampCount);
            Assert.False((await service.GetPrefectureAsync(User, Tokyo)).Data!.IsLocked);
        }

        [Fact]
        public void ChapterStates_FirstAlwaysOpen_EmptyPreviousCountsAsMet_ChainNeedsPreviousUnlocked()
        {
            var chapters = new[]
            {
                new ExploreService.ChapterInput(1, 70, new[] { 12 }),
                new ExploreService.ChapterInput(2, 70, new[] { 13 }),
                new ExploreService.ChapterInput(3, 70, new[] { 26 }),
                new ExploreService.ChapterInput(4, 70, new[] { 29 }),
            };
            // Chương 1 chưa có mốc nào; chương 2 có 2 mốc, chưa có con dấu
            var spots = new List<(int Id, int PrefectureId)> { (10, 13), (11, 13) };

            var states = ExploreService.ComputeChapterStates(chapters, spots, new HashSet<int>(), new HashSet<int>());

            Assert.True(states[0].Unlocked);
            Assert.True(states[1].Unlocked); // chương trước chưa soạn mốc: không kẹt hành trình
            Assert.False(states[2].Unlocked); // 0/2 < 70%
            Assert.False(states[3].Unlocked); // chương trước còn khoá thì chương này cũng khoá

            var persisted = ExploreService.ComputeChapterStates(chapters, spots, new HashSet<int>(), new HashSet<int> { 3 });
            Assert.True(persisted[2].Unlocked);
            Assert.True(persisted[3].Unlocked); // chương 3 chưa có mốc nào
        }
    }
}
