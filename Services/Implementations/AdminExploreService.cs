using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Explore;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations
{
    public class AdminExploreService : IAdminExploreService
    {
        /// <summary>
        /// Số mốc đang dùng tối thiểu để mở một tỉnh: con dấu tỉnh cần đủ mọi mốc, tỉnh chỉ 1-2 mốc thì con dấu đến quá dễ.
        /// </summary>
        public const int MinSpotsToOpen = 3;

        /// <summary>Thứ tự độ khó: N5 dễ nhất</summary>
        private static readonly string[] Levels = { "N5", "N4", "N3" };

        private readonly AppDbContext _context;

        public AdminExploreService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<ApiResponse<AdminExploreOverviewDto>> GetOverviewAsync()
        {
            var chapters = await LoadChaptersAsync();
            var activeIds = chapters.Select(c => c.Id).ToHashSet();

            var rows = await _context.ExplorePrefectures
                .AsNoTracking()
                .Select(p => new
                {
                    p.Id,
                    p.IsOpen,
                    p.OpenedAt,
                    ChapterId = p.ChapterLink != null ? (int?)p.ChapterLink.ChapterId : null,
                    Published = p.Spots.Count(s => s.IsActive && s.Status == ExploreSpotStatus.Published),
                    Draft = p.Spots.Count(s => s.IsActive && s.Status == ExploreSpotStatus.Draft),
                    HasWord = p.Word != null && p.Word.Status == ExploreSpotStatus.Published,
                })
                .ToListAsync();
            var byId = rows.ToDictionary(r => r.Id);

            var prefectures = Enumerable.Range(1, ExploreService.PrefectureCount).Select(id =>
            {
                if (!byId.TryGetValue(id, out var r)) return new AdminExplorePrefectureDto { Id = id };
                return new AdminExplorePrefectureDto
                {
                    Id = id,
                    IsOpen = r.IsOpen,
                    OpenedAt = r.OpenedAt,
                    ChapterId = r.ChapterId != null && activeIds.Contains(r.ChapterId.Value) ? r.ChapterId : null,
                    PublishedSpotCount = r.Published,
                    DraftSpotCount = r.Draft,
                    HasWord = r.HasWord,
                };
            }).ToList();

            return ApiResponse<AdminExploreOverviewDto>.Ok(new AdminExploreOverviewDto { Prefectures = prefectures, Chapters = chapters });
        }

        public async Task<ApiResponse<AdminExplorePrefectureDto>> OpenPrefectureAsync(int prefectureId)
        {
            if (!IsValidPrefecture(prefectureId)) return ApiResponse<AdminExplorePrefectureDto>.Fail("Mã tỉnh không hợp lệ.");

            var prefecture = await GetOrCreatePrefectureAsync(prefectureId);
            if (prefecture.IsOpen) return ApiResponse<AdminExplorePrefectureDto>.Fail("Tỉnh này đã mở cho người học.");

            var published = await _context.ExploreSpots
                .CountAsync(s => s.PrefectureId == prefectureId && s.IsActive && s.Status == ExploreSpotStatus.Published);
            if (published < MinSpotsToOpen)
            {
                return ApiResponse<AdminExplorePrefectureDto>.Fail($"Cần ít nhất {MinSpotsToOpen} mốc đang dùng trước khi mở tỉnh cho người học.");
            }

            var now = DateTime.UtcNow;
            prefecture.IsOpen = true;
            prefecture.OpenedAt = now;
            prefecture.UpdatedAt = now;
            await _context.SaveChangesAsync();

            var overview = await GetOverviewAsync();
            return ApiResponse<AdminExplorePrefectureDto>.Ok(overview.Data!.Prefectures.Single(p => p.Id == prefectureId), "Đã mở tỉnh cho người học.");
        }

        public async Task<ApiResponse<AdminExploreOverviewDto>> AssignPrefectureChapterAsync(int prefectureId, int? chapterId)
        {
            if (!IsValidPrefecture(prefectureId)) return ApiResponse<AdminExploreOverviewDto>.Fail("Mã tỉnh không hợp lệ.");

            if (chapterId != null && !await _context.ExploreChapters.AnyAsync(c => c.Id == chapterId && c.IsActive))
            {
                return ApiResponse<AdminExploreOverviewDto>.Fail("Không tìm thấy chương.");
            }

            await GetOrCreatePrefectureAsync(prefectureId);
            var current = await _context.ExploreChapterPrefectures.FirstOrDefaultAsync(l => l.PrefectureId == prefectureId);
            if (current?.ChapterId == chapterId) return await GetOverviewAsync();

            // Một tỉnh chỉ thuộc một chương: chuyển chương = bỏ liên kết cũ rồi thêm liên kết mới
            if (current != null) _context.ExploreChapterPrefectures.Remove(current);
            if (chapterId != null)
            {
                _context.ExploreChapterPrefectures.Add(new ExploreChapterPrefecture { ChapterId = chapterId.Value, PrefectureId = prefectureId });
                await TouchChapterAsync(chapterId.Value);
            }
            if (current != null) await TouchChapterAsync(current.ChapterId);
            await _context.SaveChangesAsync();

            return await GetOverviewAsync();
        }

        public async Task<ApiResponse<AdminExploreChapterDto>> CreateChapterAsync(SaveExploreChapterDto dto)
        {
            var errors = Validate(dto);
            if (errors.Count > 0) return ApiResponse<AdminExploreChapterDto>.Fail("Thông tin chương chưa hợp lệ.", errors);

            var nextOrder = await _context.ExploreChapters.Where(c => c.IsActive).Select(c => (int?)c.OrderIndex).MaxAsync() ?? -1;
            var chapter = new ExploreChapter { OrderIndex = nextOrder + 1 };
            Apply(chapter, dto);
            _context.ExploreChapters.Add(chapter);
            await _context.SaveChangesAsync();

            return ApiResponse<AdminExploreChapterDto>.Ok(ToDto(chapter, new List<int>()), "Đã tạo chương.");
        }

        public async Task<ApiResponse<AdminExploreChapterDto>> UpdateChapterAsync(int chapterId, SaveExploreChapterDto dto)
        {
            var chapter = await _context.ExploreChapters.Include(c => c.Prefectures).FirstOrDefaultAsync(c => c.Id == chapterId && c.IsActive);
            if (chapter == null) return ApiResponse<AdminExploreChapterDto>.Fail("Không tìm thấy chương.");

            var errors = Validate(dto);
            if (errors.Count > 0) return ApiResponse<AdminExploreChapterDto>.Fail("Thông tin chương chưa hợp lệ.", errors);

            Apply(chapter, dto);
            await _context.SaveChangesAsync();
            return ApiResponse<AdminExploreChapterDto>.Ok(ToDto(chapter, chapter.Prefectures.Select(p => p.PrefectureId).ToList()), "Đã lưu chương.");
        }

        public async Task<ApiResponse<List<AdminExploreChapterDto>>> ReorderChaptersAsync(List<int> chapterIds)
        {
            var active = await _context.ExploreChapters.Where(c => c.IsActive).ToListAsync();
            var ids = chapterIds ?? new List<int>();
            if (ids.Count != active.Count || ids.Distinct().Count() != ids.Count || !active.All(c => ids.Contains(c.Id)))
            {
                return ApiResponse<List<AdminExploreChapterDto>>.Fail("Danh sách thứ tự phải gồm đủ các chương đang dùng, không trùng.");
            }

            var now = DateTime.UtcNow;
            for (var i = 0; i < ids.Count; i++)
            {
                var c = active.Single(x => x.Id == ids[i]);
                if (c.OrderIndex != i)
                {
                    c.OrderIndex = i;
                    c.UpdatedAt = now;
                }
            }
            await _context.SaveChangesAsync();
            return ApiResponse<List<AdminExploreChapterDto>>.Ok(await LoadChaptersAsync(), "Đã lưu thứ tự chương.");
        }

        public async Task<ApiResponse<bool>> DeactivateChapterAsync(int chapterId)
        {
            var chapter = await _context.ExploreChapters.Include(c => c.Prefectures).FirstOrDefaultAsync(c => c.Id == chapterId && c.IsActive);
            if (chapter == null) return ApiResponse<bool>.Fail("Không tìm thấy chương.");

            // Không xoá cứng chương; chỉ gỡ liên kết tỉnh để các tỉnh đó có thể đưa sang chương khác
            chapter.IsActive = false;
            chapter.UpdatedAt = DateTime.UtcNow;
            _context.ExploreChapterPrefectures.RemoveRange(chapter.Prefectures);
            await _context.SaveChangesAsync();

            // Dồn lại thứ tự các chương còn lại cho liền mạch (0, 1, 2...)
            var rest = await _context.ExploreChapters.Where(c => c.IsActive).OrderBy(c => c.OrderIndex).ToListAsync();
            for (var i = 0; i < rest.Count; i++) rest[i].OrderIndex = i;
            await _context.SaveChangesAsync();

            return ApiResponse<bool>.Ok(true, "Đã ngừng dùng chương.");
        }

        public async Task<ApiResponse<AdminExploreStatsDto>> GetStatsAsync()
        {
            // Mọi con số gom nhóm ngay trong SQL; chỉ số dòng theo mốc/chương (rất nhỏ) mới về bộ nhớ
            var progress = _context.Set<ExploreSpotProgress>().AsNoTracking();
            var learners = await progress.Select(p => p.UserId).Distinct().CountAsync();
            var perSpot = (await progress
                .GroupBy(p => p.SpotId)
                .Select(g => new
                {
                    SpotId = g.Key,
                    Understood = g.Count(p => p.UnderstoodAt != null),
                    Stamped = g.Count(p => p.StampedAt != null),
                    Red = g.Count(p => p.RedStampedAt != null),
                })
                .ToListAsync())
                .ToDictionary(x => x.SpotId);

            var prefectureStamps = _context.Set<ExplorePrefectureStamp>().AsNoTracking();
            var unlockedByChapter = (await _context.Set<ExploreChapterUnlock>().AsNoTracking()
                .GroupBy(u => u.ChapterId)
                .Select(g => new { ChapterId = g.Key, Count = g.Count() })
                .ToListAsync())
                .ToDictionary(x => x.ChapterId, x => x.Count);

            // Chỉ mốc người học có thể thấy trong danh sách: đang dùng và chưa ngừng dùng. Dấu son chỉ có khi kịch bản còn Published.
            var spots = await _context.ExploreSpots.AsNoTracking()
                .Where(s => s.IsActive && s.Status == ExploreSpotStatus.Published)
                .OrderBy(s => s.PrefectureId).ThenBy(s => s.Id)
                .Select(s => new
                {
                    s.Id,
                    s.NameVi,
                    s.PrefectureId,
                    PrefectureIsOpen = s.Prefecture.IsOpen,
                    HasRoleplay = s.Lesson != null && s.Lesson.Activities.Any(a =>
                        a.ActivityType == ExploreActivityType.Roleplay
                        && a.ReferenceId != null
                        && _context.ScenarioLevelConfigurations.Any(c => c.Id == a.ReferenceId && c.Status == "Published")),
                })
                .ToListAsync();

            var chapters = await LoadChaptersAsync();
            var chapterOfPrefecture = chapters
                .SelectMany(c => c.PrefectureIds.Select(p => (Prefecture: p, ChapterId: c.Id)))
                .ToDictionary(x => x.Prefecture, x => x.ChapterId);

            var spotStats = spots.Select(s =>
            {
                var n = perSpot.GetValueOrDefault(s.Id);
                var understood = n?.Understood ?? 0;
                var stamped = n?.Stamped ?? 0;
                return new AdminExploreSpotStatsDto
                {
                    SpotId = s.Id,
                    NameVi = s.NameVi,
                    PrefectureId = s.PrefectureId,
                    PrefectureIsOpen = s.PrefectureIsOpen,
                    ChapterId = chapterOfPrefecture.TryGetValue(s.PrefectureId, out var cid) ? cid : null,
                    HasRoleplay = s.HasRoleplay,
                    Understood = understood,
                    Stamped = stamped,
                    RedStamped = s.HasRoleplay ? n?.Red ?? 0 : null,
                    StuckAtShadowing = Math.Max(0, understood - stamped),
                };
            }).ToList();

            var chapterStats = chapters.Select((c, i) =>
            {
                // Cùng cách tính với người học: chỉ mốc của tỉnh đã mở mới tính vào chương
                var visible = spotStats.Where(s => s.ChapterId == c.Id && s.PrefectureIsOpen).ToList();
                var unlocked = i == 0 ? learners : unlockedByChapter.GetValueOrDefault(c.Id);
                double? avg = null;
                if (visible.Count > 0 && unlocked > 0)
                {
                    avg = Math.Round(Math.Min(100.0, visible.Sum(s => s.Stamped) * 100.0 / (visible.Count * unlocked)), 1);
                }
                return new AdminExploreChapterStatsDto
                {
                    ChapterId = c.Id,
                    OrderIndex = c.OrderIndex,
                    Title = c.Title,
                    SpotCount = visible.Count,
                    UnlockedLearners = unlocked,
                    AvgStampPercent = avg,
                };
            }).ToList();

            return ApiResponse<AdminExploreStatsDto>.Ok(new AdminExploreStatsDto
            {
                Learners = learners,
                Stamps = perSpot.Values.Sum(x => x.Stamped),
                RedStamps = perSpot.Values.Sum(x => x.Red),
                PrefectureStamps = await prefectureStamps.CountAsync(),
                PrefectureRedStamps = await prefectureStamps.CountAsync(p => p.RedStampedAt != null),
                Chapters = chapterStats,
                Spots = spotStats,
            });
        }

        // ---- helpers ----

        private static bool IsValidPrefecture(int id) => id >= 1 && id <= ExploreService.PrefectureCount;

        private async Task<ExplorePrefecture> GetOrCreatePrefectureAsync(int id)
        {
            var p = await _context.ExplorePrefectures.FindAsync(id);
            if (p != null) return p;
            // Dữ liệu seed thường đã đủ 47 tỉnh; phòng trường hợp thiếu thì tạo bản ghi (mặc định đóng)
            p = new ExplorePrefecture { Id = id, IsOpen = false, UpdatedAt = DateTime.UtcNow };
            _context.ExplorePrefectures.Add(p);
            await _context.SaveChangesAsync();
            return p;
        }

        private async Task TouchChapterAsync(int chapterId)
        {
            var c = await _context.ExploreChapters.FindAsync(chapterId);
            if (c != null) c.UpdatedAt = DateTime.UtcNow;
        }

        private async Task<List<AdminExploreChapterDto>> LoadChaptersAsync()
        {
            var chapters = await _context.ExploreChapters
                .AsNoTracking()
                .Where(c => c.IsActive)
                .OrderBy(c => c.OrderIndex).ThenBy(c => c.Id)
                .Select(c => new { Chapter = c, Ids = c.Prefectures.OrderBy(p => p.PrefectureId).Select(p => p.PrefectureId).ToList() })
                .ToListAsync();
            return chapters.Select(x => ToDto(x.Chapter, x.Ids)).ToList();
        }

        private static AdminExploreChapterDto ToDto(ExploreChapter c, List<int> prefectureIds) => new()
        {
            Id = c.Id,
            OrderIndex = c.OrderIndex,
            Title = c.Title,
            Description = c.Description,
            MinLevel = c.MinLevel,
            MaxLevel = c.MaxLevel,
            UnlockThresholdPercent = c.UnlockThresholdPercent,
            PrefectureIds = prefectureIds,
        };

        private static void Apply(ExploreChapter c, SaveExploreChapterDto dto)
        {
            c.Title = dto.Title.Trim();
            c.Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim();
            c.MinLevel = dto.MinLevel;
            c.MaxLevel = dto.MaxLevel;
            c.UnlockThresholdPercent = dto.UnlockThresholdPercent;
            c.UpdatedAt = DateTime.UtcNow;
        }

        private static List<string> Validate(SaveExploreChapterDto dto)
        {
            var errors = new List<string>();
            if (string.IsNullOrWhiteSpace(dto.Title)) errors.Add("Tên chương không được để trống.");
            else if (dto.Title.Trim().Length > 200) errors.Add("Tên chương tối đa 200 ký tự.");
            if (dto.Description?.Trim().Length > 1000) errors.Add("Mô tả tối đa 1000 ký tự.");
            var min = Array.IndexOf(Levels, dto.MinLevel);
            var max = Array.IndexOf(Levels, dto.MaxLevel);
            if (min < 0 || max < 0) errors.Add("Cấp độ chỉ được là N5, N4 hoặc N3.");
            else if (min > max) errors.Add("Cấp bắt đầu phải dễ hơn hoặc bằng cấp kết thúc (N5 → N4 → N3).");
            if (dto.UnlockThresholdPercent < 0 || dto.UnlockThresholdPercent > 100) errors.Add("Tỷ lệ mở chương phải từ 0 đến 100%.");
            return errors;
        }
    }
}
