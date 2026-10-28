using System.Text.Json;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Explore;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Bản đồ Khám phá phía người học: hành trình, các mốc của tỉnh, và tiến độ (con dấu, dấu son, chương đã mở).
    ///
    /// Con dấu do server cấp từ bằng chứng có thật, không lấy điểm client gửi lên:
    /// - Con dấu mốc: đã bấm "Đã hiểu" + có phiên Shadowing (cùng bài của mốc, chấm đủ mọi câu) đạt ngưỡng của mốc.
    ///   Phiên làm ở trang Shadowing bình thường cũng được tính vì cùng một bài.
    /// - Dấu son mốc: đã có con dấu + có phiên Hội thoại AI kết thúc tự nhiên (IsNaturallyConcluded) với kịch bản của mốc.
    /// - Con dấu tỉnh: mọi mốc đang dùng của tỉnh đều có con dấu. Dấu son tỉnh: mọi mốc có Hội thoại AI đều có dấu son.
    /// - Chương mở khi số mốc có con dấu của chương trước đạt ngưỡng; chỉ tính con dấu, không tính dấu son
    ///   (người không dùng Credit vẫn đi hết hành trình được).
    /// Đã cấp thì không bao giờ thu hồi (admin đổi bài, thêm mốc, ngừng dùng mốc đều không làm mất).
    /// </summary>
    public class ExploreService : IExploreService
    {
        public const int PrefectureCount = 47;

        /// <summary>
        /// Cờ cấu hình chỉ dùng khi test: true = cứ có phiên Shadowing của bài là được con dấu (không xét điểm, không xét
        /// số câu đã chấm). Mặc định false. Đặt trong appsettings.Local.json, đừng bật ở môi trường thật.
        /// </summary>
        public const string CountAnyShadowingSessionKey = "Explore:CountAnyShadowingSession";

        private readonly AppDbContext _context;
        private readonly bool _countAnyShadowingSession;

        public ExploreService(AppDbContext context, IConfiguration? configuration = null)
        {
            _context = context;
            _countAnyShadowingSession = configuration?.GetValue<bool>(CountAnyShadowingSessionKey) ?? false;
        }

        public async Task<ApiResponse<ExploreJourneyDto>> GetJourneyAsync(string userId)
        {
            var progress = await LoadProgressAsync(userId);
            var states = ChapterStates(progress);
            var stateById = states.ToDictionary(s => s.Id);

            var chapters = await _context.ExploreChapters
                .AsNoTracking()
                .Where(c => c.IsActive)
                .OrderBy(c => c.OrderIndex)
                .Select(c => new ExploreChapterDto
                {
                    Id = c.Id,
                    OrderIndex = c.OrderIndex,
                    Title = c.Title,
                    Description = c.Description,
                    MinLevel = c.MinLevel,
                    MaxLevel = c.MaxLevel,
                    UnlockThresholdPercent = c.UnlockThresholdPercent,
                    PrefectureIds = c.Prefectures.OrderBy(p => p.PrefectureId).Select(p => p.PrefectureId).ToList(),
                })
                .ToListAsync();
            foreach (var c in chapters)
            {
                var s = stateById[c.Id];
                c.IsUnlocked = s.Unlocked;
                c.SpotCount = s.SpotCount;
                c.StampCount = s.StampCount;
            }

            var activeChapterIds = chapters.Select(c => c.Id).ToHashSet();
            var prefectures = await _context.ExplorePrefectures
                .AsNoTracking()
                .Select(p => new
                {
                    p.Id,
                    p.IsOpen,
                    ChapterId = p.ChapterLink != null ? (int?)p.ChapterLink.ChapterId : null,
                    SpotCount = p.Spots.Count(s => s.IsActive && s.Status == ExploreSpotStatus.Published),
                    Word = p.Word != null && p.Word.Status == ExploreSpotStatus.Published
                        ? new ExploreProvinceWordDto { Word = p.Word.Word, Kana = p.Word.Kana, Meaning = p.Word.Meaning, Note = p.Word.Note }
                        : null,
                })
                .ToListAsync();
            var byId = prefectures.ToDictionary(p => p.Id);

            // Luôn trả đủ 47 tỉnh (tỉnh chưa có bản ghi coi như đang đóng) để frontend không phải tự bù
            var summaries = Enumerable.Range(1, PrefectureCount).Select(id =>
            {
                if (!byId.TryGetValue(id, out var p)) return new ExplorePrefectureSummaryDto { Id = id };
                var chapterId = p.ChapterId != null && activeChapterIds.Contains(p.ChapterId.Value) ? p.ChapterId : null;
                var spotIds = progress.VisibleSpots.Where(s => s.PrefectureId == id).Select(s => s.Id).ToList();
                return new ExplorePrefectureSummaryDto
                {
                    Id = id,
                    IsOpen = p.IsOpen,
                    ChapterId = chapterId,
                    SpotCount = p.SpotCount,
                    Word = p.Word,
                    IsLocked = chapterId != null && !stateById[chapterId.Value].Unlocked,
                    StampCount = spotIds.Count(progress.IsStamped),
                    RedStampCount = spotIds.Count(progress.IsRedStamped),
                    Stamp = ToStampDto(progress.PrefectureStamps.GetValueOrDefault(id)),
                };
            }).ToList();

            return ApiResponse<ExploreJourneyDto>.Ok(new ExploreJourneyDto { Chapters = chapters, Prefectures = summaries });
        }

        public async Task<ApiResponse<ExplorePrefectureDetailDto>> GetPrefectureAsync(string userId, int prefectureId)
        {
            if (prefectureId < 1 || prefectureId > PrefectureCount)
            {
                return ApiResponse<ExplorePrefectureDetailDto>.Fail("Mã tỉnh không hợp lệ.");
            }

            var dto = await BuildPrefectureAsync(userId, prefectureId);
            if (!dto.IsOpen) return ApiResponse<ExplorePrefectureDetailDto>.Ok(dto, "Sẽ cập nhật trong tương lai.");
            if (dto.IsLocked) return ApiResponse<ExplorePrefectureDetailDto>.Ok(dto, "Tỉnh thuộc chương bạn chưa mở.");
            return ApiResponse<ExplorePrefectureDetailDto>.Ok(dto);
        }

        public async Task<ApiResponse<ExploreSyncResultDto>> SyncPrefectureAsync(string userId, int prefectureId)
        {
            if (prefectureId < 1 || prefectureId > PrefectureCount)
            {
                return ApiResponse<ExploreSyncResultDto>.Fail("Mã tỉnh không hợp lệ.");
            }

            var awards = await AwardAsync(userId, prefectureId);
            var dto = await BuildPrefectureAsync(userId, prefectureId);
            return ApiResponse<ExploreSyncResultDto>.Ok(new ExploreSyncResultDto { Prefecture = dto, Awards = awards });
        }

        public async Task<ApiResponse<ExploreSpotDto>> GetSpotAsync(string userId, int spotId)
        {
            var spot = await LoadVisibleSpotAsync(spotId);
            if (spot == null || await IsPrefectureLockedAsync(userId, spot.PrefectureId))
            {
                return ApiResponse<ExploreSpotDto>.Fail("Không tìm thấy mốc học.");
            }

            var info = await LoadActivityInfoAsync(new[] { spot });
            var row = await _context.Set<ExploreSpotProgress>()
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == userId && p.SpotId == spotId);
            return ApiResponse<ExploreSpotDto>.Ok(ToSpotDto(spot, info, row));
        }

        public async Task<ApiResponse<ExploreSyncResultDto>> MarkUnderstoodAsync(string userId, int spotId)
        {
            var spot = await LoadVisibleSpotAsync(spotId);
            if (spot == null || await IsPrefectureLockedAsync(userId, spot.PrefectureId))
            {
                return ApiResponse<ExploreSyncResultDto>.Fail("Không tìm thấy mốc học.");
            }

            var set = _context.Set<ExploreSpotProgress>();
            var row = await set.FirstOrDefaultAsync(p => p.UserId == userId && p.SpotId == spotId);
            if (row == null)
            {
                row = new ExploreSpotProgress { UserId = userId, SpotId = spotId };
                set.Add(row);
            }
            if (row.UnderstoodAt == null)
            {
                row.UnderstoodAt = DateTime.UtcNow;
                row.UpdatedAt = row.UnderstoodAt.Value;
                await SaveIgnoringRaceAsync();
            }

            return await SyncPrefectureAsync(userId, spot.PrefectureId);
        }

        // ============================================================
        // Cấp con dấu
        // ============================================================

        /// <summary>
        /// Xét bằng chứng của mọi mốc đang dùng trong tỉnh rồi cấp những gì người học vừa đạt (con dấu, dấu son,
        /// con dấu tỉnh, chương mới mở). Tỉnh đóng hoặc thuộc chương chưa mở thì không cấp gì.
        /// </summary>
        private async Task<ExploreAwardsDto> AwardAsync(string userId, int prefectureId)
        {
            var awards = new ExploreAwardsDto();
            var before = await LoadProgressAsync(userId);
            var statesBefore = ChapterStates(before);
            var prefecture = await _context.ExplorePrefectures.AsNoTracking()
                .Where(p => p.Id == prefectureId)
                .Select(p => new { p.IsOpen, ChapterId = p.ChapterLink != null ? (int?)p.ChapterLink.ChapterId : null })
                .FirstOrDefaultAsync();
            if (prefecture is not { IsOpen: true } || IsLocked(statesBefore, prefecture.ChapterId)) return awards;

            var spots = await _context.ExploreSpots
                .AsNoTracking()
                .Where(s => s.PrefectureId == prefectureId && s.IsActive && s.Status == ExploreSpotStatus.Published)
                .Include(s => s.Lesson).ThenInclude(l => l!.Activities)
                .ToListAsync();
            if (spots.Count == 0) return awards;

            var info = await LoadActivityInfoAsync(spots);
            var spotIds = spots.Select(s => s.Id).ToList();
            var rows = await _context.Set<ExploreSpotProgress>()
                .Where(p => p.UserId == userId && spotIds.Contains(p.SpotId))
                .ToDictionaryAsync(p => p.SpotId);

            var dialogueIds = spots.SelectMany(s => Refs(s, ExploreActivityType.Shadowing)).Select(a => a.ReferenceId!.Value).Distinct().ToList();
            // Chỉ tính phiên chấm đủ mọi câu của vai người học: đọc một câu rồi kết thúc thì không được con dấu
            // (cờ test CountAnyShadowingSession bỏ điều kiện này và cả ngưỡng điểm bên dưới)
            var relaxed = _countAnyShadowingSession;
            var shadowing = await _context.ShadowingPracticeSessions
                .AsNoTracking()
                .Where(x => x.UserId == userId && x.IsActive && dialogueIds.Contains(x.ShadowingDialogueId)
                    && (relaxed || (x.LearnerSentenceCount > 0 && x.ScoredSentenceCount >= x.LearnerSentenceCount)))
                .OrderBy(x => x.CompletedAt)
                .Select(x => new { x.Id, x.ShadowingDialogueId, x.WeightedOverallScore })
                .ToListAsync();

            var configIds = info.Roleplay.Keys.ToList();
            // Hội thoại AI kết thúc tự nhiên (đủ nhiệm vụ và AI chốt hội thoại); không cần đạt điểm vì người học đã trả Credit
            var roleplay = await _context.RoleplaySessions
                .AsNoTracking()
                .Where(x => x.UserId == userId && x.IsNaturallyConcluded && configIds.Contains(x.ScenarioLevelConfigurationId))
                .OrderBy(x => x.CreatedAt)
                .Select(x => new { x.Id, x.ScenarioLevelConfigurationId })
                .ToListAsync();

            var now = DateTime.UtcNow;
            foreach (var spot in spots)
            {
                if (!rows.TryGetValue(spot.Id, out var row) || row.UnderstoodAt == null) continue;

                if (row.StampedAt == null)
                {
                    var acts = Refs(spot, ExploreActivityType.Shadowing).ToList();
                    var evidence = acts.Select(a => shadowing.FirstOrDefault(x =>
                        x.ShadowingDialogueId == a.ReferenceId
                        && (relaxed || x.WeightedOverallScore >= (a.PassThreshold ?? AdminExploreSpotService.DefaultShadowingPass)))).ToList();
                    if (acts.Count == 0 || evidence.Any(e => e == null)) continue;
                    row.StampedAt = now;
                    row.ShadowingPracticeSessionId = evidence[0]!.Id;
                    row.UpdatedAt = now;
                    awards.StampSpotIds.Add(spot.Id);
                }

                if (row.RedStampedAt == null)
                {
                    var acts = RoleplayRefs(spot, info).ToList();
                    var evidence = acts.Select(a => roleplay.FirstOrDefault(x => x.ScenarioLevelConfigurationId == a.ReferenceId)).ToList();
                    if (acts.Count == 0 || evidence.Any(e => e == null)) continue;
                    row.RedStampedAt = now;
                    row.RoleplaySessionId = evidence[0]!.Id;
                    row.UpdatedAt = now;
                    awards.RedStampSpotIds.Add(spot.Id);
                }
            }

            var stamps = _context.Set<ExplorePrefectureStamp>();
            var prefStamp = await stamps.FirstOrDefaultAsync(p => p.UserId == userId && p.PrefectureId == prefectureId);
            if (prefStamp == null && spots.All(s => rows.GetValueOrDefault(s.Id)?.StampedAt != null))
            {
                prefStamp = new ExplorePrefectureStamp { UserId = userId, PrefectureId = prefectureId, StampedAt = now };
                stamps.Add(prefStamp);
                awards.PrefectureStamp = true;
            }
            var withRoleplay = spots.Where(s => RoleplayRefs(s, info).Any()).ToList();
            if (prefStamp is { RedStampedAt: null } && withRoleplay.Count > 0
                && withRoleplay.All(s => rows.GetValueOrDefault(s.Id)?.RedStampedAt != null))
            {
                prefStamp.RedStampedAt = now;
                awards.PrefectureRedStamp = true;
            }

            if (!await SaveIgnoringRaceAsync()) return new ExploreAwardsDto();

            // Chương: lưu mọi chương đã đủ điều kiện (để không bao giờ khoá lại), nhưng chỉ báo "vừa mở" chương nhờ lần này
            var after = ChapterStates(await LoadProgressAsync(userId));
            var unlockedBefore = statesBefore.Where(s => s.Unlocked).Select(s => s.Id).ToHashSet();
            var unlocks = _context.Set<ExploreChapterUnlock>();
            foreach (var s in after.Where(s => s.Unlocked && !s.Persisted && !s.IsFirst))
            {
                unlocks.Add(new ExploreChapterUnlock { UserId = userId, ChapterId = s.Id, UnlockedAt = now });
                if (!unlockedBefore.Contains(s.Id)) awards.UnlockedChapterIds.Add(s.Id);
            }
            if (!await SaveIgnoringRaceAsync()) awards.UnlockedChapterIds.Clear();

            return awards;
        }

        /// <summary>
        /// Hai lần đồng bộ chạy cùng lúc (hai tab) có thể cùng thêm một dòng tiến độ: chỉ mục duy nhất chặn lần sau.
        /// Lần thua bỏ thay đổi của mình (lần thắng đã cấp), không báo lỗi cho người học.
        /// </summary>
        private async Task<bool> SaveIgnoringRaceAsync()
        {
            try
            {
                await _context.SaveChangesAsync();
                return true;
            }
            catch (DbUpdateException)
            {
                _context.ChangeTracker.Clear();
                return false;
            }
        }

        // ============================================================
        // Chương
        // ============================================================

        public sealed record ChapterState(int Id, bool IsFirst, bool Unlocked, bool Persisted, int SpotCount, int StampCount);

        /// <summary>Đầu vào để tính trạng thái chương (tách khỏi CSDL để kiểm thử thẳng quy tắc mở chương)</summary>
        public sealed record ChapterInput(int Id, int UnlockThresholdPercent, IReadOnlyCollection<int> PrefectureIds);

        /// <summary>
        /// Chương đầu luôn mở. Chương sau mở khi đã lưu là mở, hoặc chương ngay trước đang mở và số mốc có con dấu của
        /// chương trước / số mốc người học thấy được của chương trước ≥ ngưỡng của chương này. Chương trước chưa có mốc nào
        /// (chưa soạn nội dung) thì coi như đạt, để hành trình không bị kẹt vì phần admin chưa làm.
        /// </summary>
        public static List<ChapterState> ComputeChapterStates(
            IReadOnlyList<ChapterInput> chapters,
            IReadOnlyCollection<(int Id, int PrefectureId)> visibleSpots,
            IReadOnlySet<int> stampedSpotIds,
            IReadOnlySet<int> persistedChapterIds)
        {
            var result = new List<ChapterState>();
            for (var i = 0; i < chapters.Count; i++)
            {
                var c = chapters[i];
                var prefs = c.PrefectureIds.ToHashSet();
                var spots = visibleSpots.Where(s => prefs.Contains(s.PrefectureId)).ToList();
                var stamped = spots.Count(s => stampedSpotIds.Contains(s.Id));
                var persisted = persistedChapterIds.Contains(c.Id);
                bool unlocked;
                if (i == 0) unlocked = true;
                else
                {
                    var prev = result[i - 1];
                    var met = prev.SpotCount == 0 || prev.StampCount * 100 >= c.UnlockThresholdPercent * prev.SpotCount;
                    unlocked = persisted || (prev.Unlocked && met);
                }
                result.Add(new ChapterState(c.Id, i == 0, unlocked, persisted, spots.Count, stamped));
            }
            return result;
        }

        private static List<ChapterState> ChapterStates(UserProgress p) =>
            ComputeChapterStates(p.Chapters, p.VisibleSpots, p.StampedSpotIds, p.UnlockedChapterIds);

        private static bool IsLocked(List<ChapterState> states, int? chapterId) =>
            chapterId != null && states.FirstOrDefault(s => s.Id == chapterId)?.Unlocked == false;

        private async Task<bool> IsPrefectureLockedAsync(string userId, int prefectureId)
        {
            var chapterId = await _context.ExploreChapterPrefectures.AsNoTracking()
                .Where(l => l.PrefectureId == prefectureId)
                .Select(l => (int?)l.ChapterId)
                .FirstOrDefaultAsync();
            if (chapterId == null) return false;
            return IsLocked(ChapterStates(await LoadProgressAsync(userId)), chapterId);
        }

        // ============================================================
        // Đọc dữ liệu
        // ============================================================

        /// <summary>Toàn bộ tiến độ của một người học cùng các mốc họ thấy được (tỉnh mở, mốc Published, IsActive)</summary>
        private sealed class UserProgress
        {
            public List<ChapterInput> Chapters { get; init; } = new();
            public List<(int Id, int PrefectureId)> VisibleSpots { get; init; } = new();
            public HashSet<int> StampedSpotIds { get; init; } = new();
            public HashSet<int> RedStampedSpotIds { get; init; } = new();
            public HashSet<int> UnlockedChapterIds { get; init; } = new();
            public Dictionary<int, ExplorePrefectureStamp> PrefectureStamps { get; init; } = new();

            public bool IsStamped(int spotId) => StampedSpotIds.Contains(spotId);
            public bool IsRedStamped(int spotId) => RedStampedSpotIds.Contains(spotId);
        }

        private async Task<UserProgress> LoadProgressAsync(string userId)
        {
            var chapters = await _context.ExploreChapters.AsNoTracking()
                .Where(c => c.IsActive)
                .OrderBy(c => c.OrderIndex).ThenBy(c => c.Id)
                .Select(c => new { c.Id, c.UnlockThresholdPercent, PrefectureIds = c.Prefectures.Select(p => p.PrefectureId).ToList() })
                .ToListAsync();
            var visible = await _context.ExploreSpots.AsNoTracking()
                .Where(s => s.IsActive && s.Status == ExploreSpotStatus.Published && s.Prefecture.IsOpen)
                .Select(s => new { s.Id, s.PrefectureId })
                .ToListAsync();
            var rows = await _context.Set<ExploreSpotProgress>().AsNoTracking()
                .Where(p => p.UserId == userId && p.StampedAt != null)
                .Select(p => new { p.SpotId, Red = p.RedStampedAt != null })
                .ToListAsync();
            var unlocks = await _context.Set<ExploreChapterUnlock>().AsNoTracking()
                .Where(u => u.UserId == userId)
                .Select(u => u.ChapterId)
                .ToListAsync();
            var prefStamps = await _context.Set<ExplorePrefectureStamp>().AsNoTracking()
                .Where(p => p.UserId == userId)
                .ToListAsync();

            return new UserProgress
            {
                Chapters = chapters.Select(c => new ChapterInput(c.Id, c.UnlockThresholdPercent, c.PrefectureIds)).ToList(),
                VisibleSpots = visible.Select(s => (s.Id, s.PrefectureId)).ToList(),
                StampedSpotIds = rows.Select(r => r.SpotId).ToHashSet(),
                RedStampedSpotIds = rows.Where(r => r.Red).Select(r => r.SpotId).ToHashSet(),
                UnlockedChapterIds = unlocks.ToHashSet(),
                PrefectureStamps = prefStamps.ToDictionary(p => p.PrefectureId),
            };
        }

        private async Task<ExplorePrefectureDetailDto> BuildPrefectureAsync(string userId, int prefectureId)
        {
            var prefecture = await _context.ExplorePrefectures
                .AsNoTracking()
                .Include(p => p.ChapterLink).ThenInclude(l => l!.Chapter)
                .Include(p => p.Word)
                .FirstOrDefaultAsync(p => p.Id == prefectureId);

            var word = prefecture?.Word is { Status: ExploreSpotStatus.Published } w
                ? new ExploreProvinceWordDto { Word = w.Word, Kana = w.Kana, Meaning = w.Meaning, Note = w.Note }
                : null;
            var chapterId = prefecture?.ChapterLink?.Chapter is { IsActive: true } c ? c.Id : (int?)null;
            var dto = new ExplorePrefectureDetailDto
            {
                Id = prefectureId,
                IsOpen = prefecture?.IsOpen ?? false,
                ChapterId = chapterId,
                Word = word,
            };
            // Tỉnh đóng: người học không vào được, không trả nội dung
            if (!dto.IsOpen) return dto;

            dto.IsLocked = chapterId != null && IsLocked(ChapterStates(await LoadProgressAsync(userId)), chapterId);
            if (dto.IsLocked) return dto;

            var spots = await _context.ExploreSpots
                .AsNoTracking()
                .Where(s => s.PrefectureId == prefectureId && s.IsActive && s.Status == ExploreSpotStatus.Published)
                .Include(s => s.Lesson).ThenInclude(l => l!.Activities)
                .OrderBy(s => s.Id)
                .ToListAsync();
            var info = await LoadActivityInfoAsync(spots);
            var spotIds = spots.Select(s => s.Id).ToList();
            var rows = await _context.Set<ExploreSpotProgress>()
                .AsNoTracking()
                .Where(p => p.UserId == userId && spotIds.Contains(p.SpotId))
                .ToDictionaryAsync(p => p.SpotId);
            var stamp = await _context.Set<ExplorePrefectureStamp>()
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == userId && p.PrefectureId == prefectureId);

            dto.Spots = spots.Select(s => ToSpotDto(s, info, rows.GetValueOrDefault(s.Id))).ToList();
            dto.Stamp = ToStampDto(stamp);
            return dto;
        }

        private Task<ExploreSpot?> LoadVisibleSpotAsync(int spotId) =>
            _context.ExploreSpots
                .AsNoTracking()
                .Where(s => s.Id == spotId && s.IsActive && s.Status == ExploreSpotStatus.Published && s.Prefecture.IsOpen)
                .Include(s => s.Lesson).ThenInclude(l => l!.Activities)
                .FirstOrDefaultAsync();

        /// <summary>Tên bài Shadowing và kịch bản Hội thoại AI mà các mốc trỏ tới</summary>
        private sealed record ActivityInfo(Dictionary<int, string> Shadowing, Dictionary<int, RoleplayInfo> Roleplay);

        private sealed record RoleplayInfo(string Title, int ScenarioId, string JLPTLevel, int CreditCost);

        /// <summary>Hội thoại AI chỉ tính kịch bản đang Published (người học mới bắt đầu được phiên)</summary>
        private async Task<ActivityInfo> LoadActivityInfoAsync(IEnumerable<ExploreSpot> spots)
        {
            var list = spots.ToList();
            var dialogueIds = list.SelectMany(s => Refs(s, ExploreActivityType.Shadowing)).Select(a => a.ReferenceId!.Value).Distinct().ToList();
            var configIds = list.SelectMany(s => Refs(s, ExploreActivityType.Roleplay)).Select(a => a.ReferenceId!.Value).Distinct().ToList();

            var dialogues = dialogueIds.Count == 0
                ? new Dictionary<int, string>()
                : await _context.ShadowingDialogues.AsNoTracking()
                    .Where(d => dialogueIds.Contains(d.Id))
                    .ToDictionaryAsync(d => d.Id, d => d.Title);
            var configs = configIds.Count == 0
                ? new Dictionary<int, RoleplayInfo>()
                : (await _context.ScenarioLevelConfigurations.AsNoTracking()
                    .Where(c => configIds.Contains(c.Id) && c.Status == "Published")
                    .Select(c => new { c.Id, c.Title, c.ScenarioId, c.JLPTLevel, c.CreditCost })
                    .ToListAsync())
                    .ToDictionary(c => c.Id, c => new RoleplayInfo(c.Title, c.ScenarioId, c.JLPTLevel, c.CreditCost));
            return new ActivityInfo(dialogues, configs);
        }

        private static IEnumerable<ExploreSpotActivity> Refs(ExploreSpot s, string type) =>
            s.Lesson?.Activities.Where(a => a.ActivityType == type && a.ReferenceId != null) ?? Enumerable.Empty<ExploreSpotActivity>();

        private static IEnumerable<ExploreSpotActivity> RoleplayRefs(ExploreSpot s, ActivityInfo info) =>
            Refs(s, ExploreActivityType.Roleplay).Where(a => info.Roleplay.ContainsKey(a.ReferenceId!.Value));

        private static ExploreStampDto? ToStampDto(ExplorePrefectureStamp? s) =>
            s == null ? null : new ExploreStampDto { StampedAt = s.StampedAt, RedStampedAt = s.RedStampedAt };

        private static ExploreSpotDto ToSpotDto(ExploreSpot s, ActivityInfo info, ExploreSpotProgress? progress) => new()
        {
            Id = s.Id,
            PrefectureId = s.PrefectureId,
            IconId = s.IconId,
            NameVi = s.NameVi,
            NameJp = s.NameJp,
            NameKana = s.NameKana,
            Latitude = s.Latitude,
            Longitude = s.Longitude,
            Progress = new ExploreSpotProgressDto
            {
                UnderstoodAt = progress?.UnderstoodAt,
                StampedAt = progress?.StampedAt,
                RedStampedAt = progress?.RedStampedAt,
            },
            Lesson = s.Lesson == null
                ? null
                : new ExploreLessonDto
                {
                    JLPTLevel = s.Lesson.JLPTLevel,
                    Situation = s.Lesson.Situation,
                    RealUse = s.Lesson.RealUse,
                    Sentence = ExploreSentenceJson.Parse(s.Lesson.SentenceJson),
                    Meaning = s.Lesson.Meaning,
                    GrammarNote = s.Lesson.GrammarNote,
                    EstimatedMinutes = s.Lesson.EstimatedMinutes,
                    Activities = s.Lesson.Activities
                        .OrderBy(a => a.OrderIndex)
                        // Kịch bản Hội thoại AI không còn Published thì người học không bắt đầu được: ẩn khỏi mốc
                        .Where(a => a.ActivityType != ExploreActivityType.Roleplay || (a.ReferenceId != null && info.Roleplay.ContainsKey(a.ReferenceId.Value)))
                        .Select(a => ToActivityDto(a, info))
                        .ToList(),
                },
        };

        private static ExploreActivityDto ToActivityDto(ExploreSpotActivity a, ActivityInfo info)
        {
            var dto = new ExploreActivityDto { Type = a.ActivityType, ReferenceId = a.ReferenceId, PassThreshold = a.PassThreshold };
            if (a.ReferenceId is not int id) return dto;
            if (a.ActivityType == ExploreActivityType.Shadowing)
            {
                dto.Title = info.Shadowing.GetValueOrDefault(id);
            }
            else if (a.ActivityType == ExploreActivityType.Roleplay && info.Roleplay.TryGetValue(id, out var rp))
            {
                dto.Title = rp.Title;
                dto.ScenarioId = rp.ScenarioId;
                dto.JLPTLevel = rp.JLPTLevel;
                dto.CreditCost = rp.CreditCost;
            }
            return dto;
        }
    }

    /// <summary>Đọc/ghi câu mẫu chia đoạn (cột ExploreSpotLesson.SentenceJson).</summary>
    public static class ExploreSentenceJson
    {
        private static readonly JsonSerializerOptions Options = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        };

        public static string Serialize(IEnumerable<FuriganaSegmentDto> segments) => JsonSerializer.Serialize(segments, Options);

        /// <summary>JSON hỏng hoặc rỗng thì trả danh sách rỗng (không làm hỏng cả trang bản đồ).</summary>
        public static List<FuriganaSegmentDto> Parse(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new();
            try
            {
                return JsonSerializer.Deserialize<List<FuriganaSegmentDto>>(json, Options) ?? new();
            }
            catch (JsonException)
            {
                return new();
            }
        }
    }
}
