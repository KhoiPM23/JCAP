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
    public class AdminExploreServiceTests
    {
        private static async Task<AppDbContext> SeededContext(string name)
        {
            var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase($"JCAP_AdminExplore_{name}_{Guid.NewGuid()}").Options);
            var services = new ServiceCollection().AddSingleton(db).BuildServiceProvider();
            await ExploreSeeder.SeedAsync(services);
            return db;
        }

        private static SaveExploreChapterDto Chapter(string title = "Chương thử", string min = "N5", string max = "N4", int threshold = 70) => new()
        {
            Title = title,
            MinLevel = min,
            MaxLevel = max,
            UnlockThresholdPercent = threshold,
        };

        [Fact]
        public async Task Overview_Returns47Prefectures_WithCountsAndChapters()
        {
            using var db = await SeededContext("overview");
            var result = await new AdminExploreService(db).GetOverviewAsync();

            Assert.True(result.Success);
            var data = result.Data!;
            Assert.Equal(47, data.Prefectures.Count);
            Assert.Equal(3, data.Chapters.Count);

            var tokyo = data.Prefectures.Single(p => p.Id == 13);
            Assert.True(tokyo.IsOpen);
            Assert.Equal(5, tokyo.PublishedSpotCount);
            Assert.True(tokyo.HasWord);
            Assert.Equal(data.Chapters[1].Id, tokyo.ChapterId);

            // Mốc nháp duy nhất của seed nằm ở Nara
            Assert.Equal(1, data.Prefectures.Sum(p => p.DraftSpotCount));
            Assert.Equal(1, data.Prefectures.Single(p => p.Id == 29).DraftSpotCount);

            var hokkaido = data.Prefectures.Single(p => p.Id == 1);
            Assert.False(hokkaido.IsOpen);
            Assert.Null(hokkaido.ChapterId);
            Assert.Equal(0, hokkaido.PublishedSpotCount);
        }

        [Fact]
        public async Task OpenPrefecture_WithoutPublishedSpot_Fails()
        {
            using var db = await SeededContext("open-empty");
            // Chỉ có mốc nháp thì vẫn chưa mở được
            db.ExploreSpots.Add(new ExploreSpot { PrefectureId = 1, IconId = "P_test", NameVi = "Thử", NameJp = "テスト", Status = ExploreSpotStatus.Draft });
            await db.SaveChangesAsync();

            var result = await new AdminExploreService(db).OpenPrefectureAsync(1);

            Assert.False(result.Success);
            Assert.False((await db.ExplorePrefectures.FindAsync(1))!.IsOpen);
        }

        [Fact]
        public async Task OpenPrefecture_WithPublishedSpot_OpensAndStampsDate()
        {
            using var db = await SeededContext("open-ok");
            db.ExploreSpots.Add(new ExploreSpot { PrefectureId = 1, IconId = "P_test", NameVi = "Thử", NameJp = "テスト", Status = ExploreSpotStatus.Published });
            await db.SaveChangesAsync();

            var result = await new AdminExploreService(db).OpenPrefectureAsync(1);

            Assert.True(result.Success);
            Assert.True(result.Data!.IsOpen);
            Assert.NotNull(result.Data.OpenedAt);
            Assert.True((await db.ExplorePrefectures.FindAsync(1))!.IsOpen);
        }

        [Fact]
        public async Task OpenPrefecture_AlreadyOpenOrInvalidId_Fails()
        {
            using var db = await SeededContext("open-bad");
            var service = new AdminExploreService(db);

            Assert.False((await service.OpenPrefectureAsync(13)).Success);
            Assert.False((await service.OpenPrefectureAsync(0)).Success);
            Assert.False((await service.OpenPrefectureAsync(48)).Success);
        }

        [Fact]
        public async Task AssignChapter_MovesPrefectureBetweenChapters_AndCanRemove()
        {
            using var db = await SeededContext("assign");
            var service = new AdminExploreService(db);
            var chapters = (await service.GetOverviewAsync()).Data!.Chapters;

            // Đưa Hokkaido vào chương 0 rồi chuyển sang chương 1: chỉ thuộc một chương
            await service.AssignPrefectureChapterAsync(1, chapters[0].Id);
            var moved = await service.AssignPrefectureChapterAsync(1, chapters[1].Id);

            Assert.True(moved.Success);
            Assert.DoesNotContain(1, moved.Data!.Chapters[0].PrefectureIds);
            Assert.Contains(1, moved.Data.Chapters[1].PrefectureIds);
            Assert.Equal(1, await db.ExploreChapterPrefectures.CountAsync(l => l.PrefectureId == 1));

            var removed = await service.AssignPrefectureChapterAsync(1, null);
            Assert.Null(removed.Data!.Prefectures.Single(p => p.Id == 1).ChapterId);
            Assert.Equal(0, await db.ExploreChapterPrefectures.CountAsync(l => l.PrefectureId == 1));
        }

        [Fact]
        public async Task AssignChapter_UnknownOrInactiveChapter_Fails()
        {
            using var db = await SeededContext("assign-bad");
            var service = new AdminExploreService(db);
            var first = (await service.GetOverviewAsync()).Data!.Chapters[0];
            await service.DeactivateChapterAsync(first.Id);

            Assert.False((await service.AssignPrefectureChapterAsync(1, 9999)).Success);
            Assert.False((await service.AssignPrefectureChapterAsync(1, first.Id)).Success);
            Assert.False((await service.AssignPrefectureChapterAsync(99, null)).Success);
        }

        [Fact]
        public async Task CreateChapter_AppendsAtEnd()
        {
            using var db = await SeededContext("create");
            var result = await new AdminExploreService(db).CreateChapterAsync(Chapter("  Chương Hokkaido  "));

            Assert.True(result.Success);
            Assert.Equal("Chương Hokkaido", result.Data!.Title);
            Assert.Equal(3, result.Data.OrderIndex);
            Assert.Empty(result.Data.PrefectureIds);
        }

        [Theory]
        [InlineData("", "N5", "N4", 70)]
        [InlineData("Tên", "N3", "N5", 70)]
        [InlineData("Tên", "N1", "N3", 70)]
        [InlineData("Tên", "N5", "N4", 101)]
        [InlineData("Tên", "N5", "N4", -1)]
        public async Task CreateChapter_InvalidInput_Fails(string title, string min, string max, int threshold)
        {
            using var db = await SeededContext("create-bad");
            var result = await new AdminExploreService(db).CreateChapterAsync(Chapter(title, min, max, threshold));

            Assert.False(result.Success);
            Assert.NotEmpty(result.Errors!);
            Assert.Equal(3, await db.ExploreChapters.CountAsync());
        }

        [Fact]
        public async Task UpdateChapter_ChangesFields_KeepsPrefectures()
        {
            using var db = await SeededContext("update");
            var service = new AdminExploreService(db);
            var tokyoChapter = (await service.GetOverviewAsync()).Data!.Chapters[1];

            var result = await service.UpdateChapterAsync(tokyoChapter.Id, Chapter("Tokyo mới", "N5", "N5", 50));

            Assert.True(result.Success);
            Assert.Equal("Tokyo mới", result.Data!.Title);
            Assert.Equal(50, result.Data.UnlockThresholdPercent);
            Assert.Equal(new[] { 13 }, result.Data.PrefectureIds);
            Assert.False((await service.UpdateChapterAsync(9999, Chapter())).Success);
        }

        [Fact]
        public async Task ReorderChapters_RequiresFullDistinctList()
        {
            using var db = await SeededContext("reorder");
            var service = new AdminExploreService(db);
            var ids = (await service.GetOverviewAsync()).Data!.Chapters.Select(c => c.Id).ToList();

            Assert.False((await service.ReorderChaptersAsync(ids.Take(2).ToList())).Success);
            Assert.False((await service.ReorderChaptersAsync(new List<int> { ids[0], ids[0], ids[1] })).Success);

            var reversed = Enumerable.Reverse(ids).ToList();
            var result = await service.ReorderChaptersAsync(reversed);
            Assert.True(result.Success);
            Assert.Equal(reversed, result.Data!.Select(c => c.Id));
            Assert.Equal(new[] { 0, 1, 2 }, result.Data.Select(c => c.OrderIndex));
        }

        [Fact]
        public async Task DeactivateChapter_SoftDeletes_ReleasesPrefectures_AndCompactsOrder()
        {
            using var db = await SeededContext("deactivate");
            var service = new AdminExploreService(db);
            var chapters = (await service.GetOverviewAsync()).Data!.Chapters;

            var result = await service.DeactivateChapterAsync(chapters[1].Id);

            Assert.True(result.Success);
            var stored = await db.ExploreChapters.FindAsync(chapters[1].Id);
            Assert.NotNull(stored);
            Assert.False(stored!.IsActive);
            Assert.Equal(0, await db.ExploreChapterPrefectures.CountAsync(l => l.PrefectureId == 13));
            // Tỉnh vẫn mở cho người học, chỉ không còn thuộc chương nào
            Assert.True((await db.ExplorePrefectures.FindAsync(13))!.IsOpen);

            var overview = (await service.GetOverviewAsync()).Data!;
            Assert.Equal(new[] { 0, 1 }, overview.Chapters.Select(c => c.OrderIndex));
            Assert.False((await service.DeactivateChapterAsync(chapters[1].Id)).Success);
        }
    }
}
