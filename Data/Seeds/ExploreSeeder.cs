using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Data.Seeds
{
    /// <summary>
    /// Nạp dữ liệu ban đầu của bản đồ Khám phá. Chạy nhiều lần không sinh trùng: chỉ thêm phần còn thiếu,
    /// không ghi đè những gì admin đã sửa (trạng thái tỉnh, nội dung mốc, chương).
    /// </summary>
    public static class ExploreSeeder
    {
        public static async Task SeedAsync(IServiceProvider serviceProvider)
        {
            var db = serviceProvider.GetRequiredService<AppDbContext>();
            var now = DateTime.UtcNow;

            // 1. Đủ 47 tỉnh; chỉ các tỉnh ra mắt được mở
            var existingPrefectures = await db.ExplorePrefectures.Select(p => p.Id).ToListAsync();
            var missing = Enumerable.Range(1, ExploreService.PrefectureCount).Except(existingPrefectures).ToList();
            foreach (var id in missing)
            {
                var open = ExploreSeedData.OpenPrefectures.Contains(id);
                db.ExplorePrefectures.Add(new ExplorePrefecture { Id = id, IsOpen = open, OpenedAt = open ? now : null, UpdatedAt = now });
            }
            if (missing.Count > 0) await db.SaveChangesAsync();

            // 2. Chương (chỉ khi chưa có chương nào, để không đụng chương admin đã sắp xếp)
            if (!await db.ExploreChapters.AnyAsync())
            {
                foreach (var c in ExploreSeedData.Chapters)
                {
                    db.ExploreChapters.Add(new ExploreChapter
                    {
                        OrderIndex = c.OrderIndex,
                        Title = c.Title,
                        Description = c.Description,
                        MinLevel = c.MinLevel,
                        MaxLevel = c.MaxLevel,
                        Prefectures = c.PrefectureIds.Select(p => new ExploreChapterPrefecture { PrefectureId = p }).ToList(),
                    });
                }
                await db.SaveChangesAsync();
            }

            // 3. Mốc thử: chỉ nạp khi chưa có mốc nào. Không so theo tên: admin đổi tên hay vị trí một mốc mẫu thì
            // lần khởi động sau không được tạo lại mốc gốc ở chỗ cũ (người học sẽ thấy cả hai)
            if (!await db.ExploreSpots.AnyAsync())
            {
                db.ExploreSpots.AddRange(ExploreSeedData.Spots.Select(ExploreSeedData.ToEntity));
                await db.SaveChangesAsync();
            }

            // 4. "Một từ ở tỉnh"
            var existingWords = await db.ExploreProvinceWords.Select(w => w.PrefectureId).ToListAsync();
            var addedWord = false;
            foreach (var w in ExploreSeedData.Words.Where(w => !existingWords.Contains(w.PrefectureId)))
            {
                db.ExploreProvinceWords.Add(new ExploreProvinceWord
                {
                    PrefectureId = w.PrefectureId,
                    Word = w.Word,
                    Kana = w.Kana,
                    Meaning = w.Meaning,
                    Note = w.Note,
                    Status = ExploreSpotStatus.Published,
                    UpdatedAt = now,
                });
                addedWord = true;
            }
            if (addedWord) await db.SaveChangesAsync();
        }
    }
}
