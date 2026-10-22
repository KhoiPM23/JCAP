using System.Text.RegularExpressions;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Explore;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations
{
    public class AdminExploreSpotService : IAdminExploreSpotService
    {
        private static readonly string[] Levels = { "N5", "N4", "N3" };

        /// <summary>Id biểu tượng: tiền tố một chữ hoa của bộ NDC (P_, N_, F_...) hoặc X_ của JCAP</summary>
        private static readonly Regex IconPattern = new("^[A-Z]_[A-Za-z0-9_-]{1,76}$", RegexOptions.Compiled);

        /// <summary>Khung toạ độ bao nước Nhật (kể cả đảo xa); vị trí đúng trong tỉnh do trình soạn kiểm tra trên bản đồ</summary>
        private const double MinLat = 20, MaxLat = 46, MinLon = 122, MaxLon = 154;

        public const int DefaultShadowingPass = 60;
        private const int MaxTargets = 20;
        private const int MaxSegments = 60;
        private const int LookupLimit = 30;

        private readonly AppDbContext _context;

        public AdminExploreSpotService(AppDbContext context)
        {
            _context = context;
        }

        // ---------------------------------------------------------------- tỉnh

        public async Task<ApiResponse<AdminExplorePrefectureContentDto>> GetPrefectureContentAsync(int prefectureId)
        {
            if (!IsValidPrefecture(prefectureId)) return ApiResponse<AdminExplorePrefectureContentDto>.Fail("Mã tỉnh không hợp lệ.");

            var prefecture = await _context.ExplorePrefectures
                .AsNoTracking()
                .Include(p => p.ChapterLink).ThenInclude(l => l!.Chapter)
                .Include(p => p.Word)
                .FirstOrDefaultAsync(p => p.Id == prefectureId);

            var spots = await LoadSpots().AsNoTracking()
                .Where(s => s.PrefectureId == prefectureId && s.IsActive)
                .OrderBy(s => s.Id)
                .ToListAsync();
            var shadowingOk = await AvailableShadowingIdsAsync(spots);

            return ApiResponse<AdminExplorePrefectureContentDto>.Ok(new AdminExplorePrefectureContentDto
            {
                Id = prefectureId,
                IsOpen = prefecture?.IsOpen ?? false,
                ChapterId = prefecture?.ChapterLink?.Chapter is { IsActive: true } c ? c.Id : null,
                Word = prefecture?.Word == null ? null : ToWordDto(prefecture.Word),
                Spots = spots.Select(s => new AdminExploreSpotSummaryDto
                {
                    Id = s.Id,
                    IconId = s.IconId,
                    NameVi = s.NameVi,
                    NameJp = s.NameJp,
                    Latitude = s.Latitude,
                    Longitude = s.Longitude,
                    Status = s.Status,
                    JLPTLevel = s.Lesson?.JLPTLevel ?? "N5",
                    HasRoleplay = s.Lesson?.Activities.Any(a => a.ActivityType == ExploreActivityType.Roleplay && a.ReferenceId != null) ?? false,
                    UpdatedAt = Max(s.UpdatedAt, s.Lesson?.UpdatedAt),
                    Missing = Missing(s, shadowingOk),
                }).ToList(),
            });
        }

        public async Task<ApiResponse<AdminExploreWordDto>> SaveWordAsync(int prefectureId, AdminExploreWordDto dto)
        {
            if (!IsValidPrefecture(prefectureId)) return ApiResponse<AdminExploreWordDto>.Fail("Mã tỉnh không hợp lệ.");

            var errors = new List<string>();
            Require(errors, dto.Word, 50, "Từ");
            Require(errors, dto.Kana, 100, "Cách đọc");
            Require(errors, dto.Meaning, 200, "Nghĩa");
            if (dto.Note?.Trim().Length > 500) errors.Add("Ghi chú tối đa 500 ký tự.");
            if (dto.Status != ExploreSpotStatus.Draft && dto.Status != ExploreSpotStatus.Published) errors.Add("Trạng thái không hợp lệ.");
            if (errors.Count > 0) return ApiResponse<AdminExploreWordDto>.Fail("Thông tin từ chưa hợp lệ.", errors);

            await EnsurePrefectureAsync(prefectureId);
            var word = await _context.ExploreProvinceWords.FindAsync(prefectureId);
            if (word == null)
            {
                word = new ExploreProvinceWord { PrefectureId = prefectureId };
                _context.ExploreProvinceWords.Add(word);
            }
            word.Word = dto.Word.Trim();
            word.Kana = dto.Kana.Trim();
            word.Meaning = dto.Meaning.Trim();
            word.Note = string.IsNullOrWhiteSpace(dto.Note) ? null : dto.Note.Trim();
            word.Status = dto.Status;
            word.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return ApiResponse<AdminExploreWordDto>.Ok(ToWordDto(word), "Đã lưu \"Một từ ở tỉnh\".");
        }

        // ---------------------------------------------------------------- mốc

        public async Task<ApiResponse<AdminExploreSpotDto>> GetSpotAsync(int spotId)
        {
            var spot = await LoadSpots().AsNoTracking().FirstOrDefaultAsync(s => s.Id == spotId && s.IsActive);
            if (spot == null) return ApiResponse<AdminExploreSpotDto>.Fail("Không tìm thấy mốc.");
            return ApiResponse<AdminExploreSpotDto>.Ok(await ToSpotDtoAsync(spot));
        }

        public async Task<ApiResponse<AdminExploreSpotDto>> CreateSpotAsync(int prefectureId, SaveExploreSpotDto dto)
        {
            if (!IsValidPrefecture(prefectureId)) return ApiResponse<AdminExploreSpotDto>.Fail("Mã tỉnh không hợp lệ.");

            var errors = await ValidateAsync(dto);
            if (errors.Count > 0) return ApiResponse<AdminExploreSpotDto>.Fail("Thông tin mốc chưa hợp lệ.", errors);

            await EnsurePrefectureAsync(prefectureId);
            var spot = new ExploreSpot
            {
                PrefectureId = prefectureId,
                Status = ExploreSpotStatus.Draft,
                IsActive = true,
                Lesson = new ExploreSpotLesson(),
            };
            Apply(spot, dto);
            _context.ExploreSpots.Add(spot);
            await _context.SaveChangesAsync();

            return await ReloadAsync(spot.Id, "Đã tạo mốc ở trạng thái Nháp.");
        }

        public async Task<ApiResponse<AdminExploreSpotDto>> UpdateSpotAsync(int spotId, SaveExploreSpotDto dto)
        {
            var spot = await LoadSpots().FirstOrDefaultAsync(s => s.Id == spotId && s.IsActive);
            if (spot == null) return ApiResponse<AdminExploreSpotDto>.Fail("Không tìm thấy mốc.");

            var errors = await ValidateAsync(dto);
            if (errors.Count > 0) return ApiResponse<AdminExploreSpotDto>.Fail("Thông tin mốc chưa hợp lệ.", errors);

            spot.Lesson ??= new ExploreSpotLesson();
            Apply(spot, dto);

            if (spot.Status == ExploreSpotStatus.Published)
            {
                var visibleGaps = Missing(spot, null).Intersect(ExploreSpotCheck.VisibleToLearner).ToList();
                if (visibleGaps.Count > 0)
                {
                    return ApiResponse<AdminExploreSpotDto>.Fail(
                        "Mốc đang dùng: người học đang thấy mốc này nên không được để trống " + string.Join(", ", visibleGaps.Select(CheckLabel)) + ".",
                        visibleGaps.Select(CheckLabel).ToList());
                }
            }

            await _context.SaveChangesAsync();
            return await ReloadAsync(spot.Id, "Đã lưu mốc.");
        }

        public async Task<ApiResponse<AdminExploreSpotDto>> SetStatusAsync(int spotId, string status)
        {
            if (status != ExploreSpotStatus.Draft && status != ExploreSpotStatus.Published)
            {
                return ApiResponse<AdminExploreSpotDto>.Fail("Trạng thái không hợp lệ.");
            }

            var spot = await LoadSpots().FirstOrDefaultAsync(s => s.Id == spotId && s.IsActive);
            if (spot == null) return ApiResponse<AdminExploreSpotDto>.Fail("Không tìm thấy mốc.");
            if (spot.Status == status) return ApiResponse<AdminExploreSpotDto>.Ok(await ToSpotDtoAsync(spot));

            if (status == ExploreSpotStatus.Published)
            {
                var missing = Missing(spot, await AvailableShadowingIdsAsync(new[] { spot }));
                if (missing.Count > 0)
                {
                    return ApiResponse<AdminExploreSpotDto>.Fail(
                        "Chưa chuyển sang Đang dùng được: còn thiếu " + string.Join(", ", missing.Select(CheckLabel)) + ".",
                        missing.Select(CheckLabel).ToList());
                }
            }
            else
            {
                var guard = await GuardLastPublishedAsync(spot);
                if (guard != null) return ApiResponse<AdminExploreSpotDto>.Fail(guard);
            }

            spot.Status = status;
            spot.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return await ReloadAsync(spot.Id, status == ExploreSpotStatus.Published ? "Mốc đã chuyển sang Đang dùng." : "Mốc đã chuyển về Nháp.");
        }

        public async Task<ApiResponse<bool>> DeactivateSpotAsync(int spotId)
        {
            var spot = await _context.ExploreSpots.FirstOrDefaultAsync(s => s.Id == spotId && s.IsActive);
            if (spot == null) return ApiResponse<bool>.Fail("Không tìm thấy mốc.");
            // Mốc đang dùng có thể đã có người học; phải chủ động chuyển về Nháp trước rồi mới ngừng dùng
            if (spot.Status == ExploreSpotStatus.Published) return ApiResponse<bool>.Fail("Chuyển mốc về Nháp trước khi ngừng dùng.");

            spot.IsActive = false;
            spot.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return ApiResponse<bool>.Ok(true, "Đã ngừng dùng mốc.");
        }

        // ---------------------------------------------------------------- tìm nội dung để gắn

        public async Task<ApiResponse<List<ExploreLookupItemDto>>> LookupAsync(string kind, string? level, string? query)
        {
            var q = query?.Trim();
            var lv = Levels.Contains(level) ? level : null;
            List<ExploreLookupItemDto> items;

            switch (kind)
            {
                case "grammar":
                    items = await _context.Grammars.AsNoTracking()
                        .Where(g => g.IsActive && (lv == null || g.JLPTLevel == lv)
                            && (string.IsNullOrEmpty(q) || g.Pattern.Contains(q) || g.Meaning.Contains(q)))
                        .OrderBy(g => g.JLPTLevel).ThenBy(g => g.Pattern)
                        .Take(LookupLimit)
                        .Select(g => new ExploreLookupItemDto { Id = g.Id, Title = g.Pattern, Subtitle = g.Meaning, JLPTLevel = g.JLPTLevel })
                        .ToListAsync();
                    break;
                case "vocabulary":
                    items = await _context.Vocabularies.AsNoTracking()
                        .Where(v => v.IsActive && (lv == null || v.JLPTLevel == lv)
                            && (string.IsNullOrEmpty(q) || v.Word.Contains(q) || (v.Reading != null && v.Reading.Contains(q)) || v.Meaning.Contains(q)))
                        .OrderBy(v => v.JLPTLevel).ThenBy(v => v.Word)
                        .Take(LookupLimit)
                        .Select(v => new ExploreLookupItemDto
                        {
                            Id = v.Id,
                            Title = v.Reading != null && v.Reading != v.Word ? v.Word + " (" + v.Reading + ")" : v.Word,
                            Subtitle = v.Meaning,
                            JLPTLevel = v.JLPTLevel,
                        })
                        .ToListAsync();
                    break;
                case "shadowing":
                    items = await _context.ShadowingDialogues.AsNoTracking()
                        .Where(d => d.IsActive && (lv == null || d.JLPTLevel == lv)
                            && (string.IsNullOrEmpty(q) || d.Title.Contains(q) || d.Scenario.Title.Contains(q)))
                        .OrderBy(d => d.JLPTLevel).ThenBy(d => d.Title)
                        .Take(LookupLimit)
                        .Select(d => new ExploreLookupItemDto
                        {
                            Id = d.Id,
                            Title = d.Title,
                            Subtitle = d.Scenario.Title + " · " + d.Sentences.Count + " câu",
                            JLPTLevel = d.JLPTLevel,
                        })
                        .ToListAsync();
                    break;
                case "roleplay":
                    items = await _context.ScenarioLevelConfigurations.AsNoTracking()
                        .Where(c => c.Status != "Archived" && c.Scenario != null && c.Scenario.IsActive && (lv == null || c.JLPTLevel == lv)
                            && (string.IsNullOrEmpty(q) || c.Title.Contains(q) || c.Scenario.Title.Contains(q)))
                        .OrderBy(c => c.JLPTLevel).ThenBy(c => c.Scenario!.Title)
                        .Take(LookupLimit)
                        .Select(c => new ExploreLookupItemDto
                        {
                            Id = c.Id,
                            Title = c.Scenario!.Title + " · " + c.Title,
                            Subtitle = c.CreditCost + " Credit" + (c.Status == "Published" ? "" : " · " + c.Status),
                            JLPTLevel = c.JLPTLevel,
                        })
                        .ToListAsync();
                    break;
                default:
                    return ApiResponse<List<ExploreLookupItemDto>>.Fail("Loại nội dung không hợp lệ.");
            }

            return ApiResponse<List<ExploreLookupItemDto>>.Ok(items);
        }

        // ---------------------------------------------------------------- kiểm tra

        /// <summary>
        /// Các mục kiểm tra còn thiếu. shadowingOk = null: bỏ qua việc kiểm tra bài Shadowing còn dùng được không
        /// (chỉ xét đã gắn hay chưa).
        /// </summary>
        public static List<string> Missing(ExploreSpot s, ISet<int>? shadowingOk)
        {
            var l = s.Lesson;
            var missing = new List<string>();
            if (string.IsNullOrWhiteSpace(s.NameVi) || string.IsNullOrWhiteSpace(s.NameJp) || string.IsNullOrWhiteSpace(s.IconId)
                || !InJapan(s.Latitude, s.Longitude))
            {
                missing.Add(ExploreSpotCheck.Place);
            }
            if (l == null || string.IsNullOrWhiteSpace(l.Meaning)
                || !ExploreSentenceJson.Parse(l.SentenceJson).Any(seg => !string.IsNullOrWhiteSpace(seg.Text)))
            {
                missing.Add(ExploreSpotCheck.Sentence);
            }
            if (l == null || (l.LessonGrammars.Count == 0 && l.LessonVocabularies.Count == 0)) missing.Add(ExploreSpotCheck.Target);
            if (l == null || string.IsNullOrWhiteSpace(l.Situation)) missing.Add(ExploreSpotCheck.Situation);
            if (l == null || string.IsNullOrWhiteSpace(l.RealUse)) missing.Add(ExploreSpotCheck.RealUse);

            var shadowing = l?.Activities.FirstOrDefault(a => a.ActivityType == ExploreActivityType.Shadowing);
            if (shadowing?.ReferenceId == null || (shadowingOk != null && !shadowingOk.Contains(shadowing.ReferenceId.Value)))
            {
                missing.Add(ExploreSpotCheck.Shadowing);
            }
            return missing;
        }

        public static string CheckLabel(string key) => key switch
        {
            ExploreSpotCheck.Place => "tên và vị trí",
            ExploreSpotCheck.Sentence => "câu mẫu và nghĩa",
            ExploreSpotCheck.Target => "ngữ pháp/từ vựng mục tiêu",
            ExploreSpotCheck.Situation => "tình huống",
            ExploreSpotCheck.RealUse => "cách dùng thật",
            ExploreSpotCheck.Shadowing => "bài Shadowing",
            _ => key,
        };

        private async Task<List<string>> ValidateAsync(SaveExploreSpotDto dto)
        {
            var errors = new List<string>();
            Require(errors, dto.NameVi, 200, "Tên tiếng Việt");
            Require(errors, dto.NameJp, 200, "Tên tiếng Nhật");
            if (dto.NameKana?.Trim().Length > 200) errors.Add("Cách đọc tên tối đa 200 ký tự.");
            if (string.IsNullOrWhiteSpace(dto.IconId) || !IconPattern.IsMatch(dto.IconId.Trim())) errors.Add("Chọn biểu tượng cho mốc.");
            if (!InJapan(dto.Latitude, dto.Longitude)) errors.Add("Vị trí phải nằm trong nước Nhật (vĩ độ 20–46, kinh độ 122–154).");
            if (!Levels.Contains(dto.JLPTLevel)) errors.Add("Cấp độ chỉ được là N5, N4 hoặc N3.");
            if (dto.EstimatedMinutes < 1 || dto.EstimatedMinutes > 60) errors.Add("Thời lượng ước tính từ 1 đến 60 phút.");
            if (dto.Situation?.Trim().Length > 1000) errors.Add("Tình huống tối đa 1000 ký tự.");
            if (dto.RealUse?.Trim().Length > 1000) errors.Add("Cách dùng thật tối đa 1000 ký tự.");
            if (dto.Meaning?.Trim().Length > 500) errors.Add("Nghĩa câu mẫu tối đa 500 ký tự.");
            if (dto.GrammarNote?.Trim().Length > 1000) errors.Add("Ghi chú ngữ pháp tối đa 1000 ký tự.");

            var segments = dto.Sentence ?? new();
            if (segments.Count > MaxSegments || segments.Any(s => (s.Text?.Length ?? 0) > 200 || (s.Reading?.Length ?? 0) > 100))
            {
                errors.Add("Câu mẫu quá dài.");
            }
            if (segments.Any(s => !string.IsNullOrWhiteSpace(s.Reading) && string.IsNullOrWhiteSpace(s.Text)))
            {
                errors.Add("Có cách đọc (furigana) nhưng thiếu chữ.");
            }

            var grammarIds = (dto.GrammarIds ?? new()).Distinct().ToList();
            var vocabIds = (dto.VocabularyIds ?? new()).Distinct().ToList();
            if (grammarIds.Count > MaxTargets || vocabIds.Count > MaxTargets) errors.Add($"Mỗi bài tối đa {MaxTargets} ngữ pháp và {MaxTargets} từ vựng mục tiêu.");
            if (grammarIds.Count > 0 && await _context.Grammars.CountAsync(g => grammarIds.Contains(g.Id) && g.IsActive) != grammarIds.Count)
            {
                errors.Add("Có ngữ pháp mục tiêu không tồn tại hoặc đã ngừng dùng.");
            }
            if (vocabIds.Count > 0 && await _context.Vocabularies.CountAsync(v => vocabIds.Contains(v.Id) && v.IsActive) != vocabIds.Count)
            {
                errors.Add("Có từ vựng mục tiêu không tồn tại hoặc đã ngừng dùng.");
            }

            var activities = dto.Activities ?? new();
            foreach (var a in activities)
            {
                if (a.Type == ExploreActivityType.Quiz || a.Type == ExploreActivityType.Flashcard)
                {
                    errors.Add("Kiểm tra và Flashcard chưa gắn được (đang chờ module).");
                    continue;
                }
                if (a.Type != ExploreActivityType.Shadowing && a.Type != ExploreActivityType.Roleplay)
                {
                    errors.Add($"Loại hoạt động \"{a.Type}\" không hợp lệ.");
                    continue;
                }
                if (a.ReferenceId == null) errors.Add(a.Type == ExploreActivityType.Shadowing ? "Chọn bài Shadowing." : "Chọn kịch bản Hội thoại AI.");
                if (a.Type == ExploreActivityType.Shadowing && a.PassThreshold is < 0 or > 100) errors.Add("Điểm đạt Shadowing từ 0 đến 100.");
            }
            if (activities.GroupBy(a => a.Type).Any(g => g.Count() > 1)) errors.Add("Mỗi loại hoạt động chỉ gắn một lần.");

            var shadowingRef = activities.FirstOrDefault(a => a.Type == ExploreActivityType.Shadowing)?.ReferenceId;
            if (shadowingRef != null && !await _context.ShadowingDialogues.AnyAsync(d => d.Id == shadowingRef && d.IsActive))
            {
                errors.Add("Bài Shadowing đã chọn không tồn tại hoặc đã ngừng dùng.");
            }
            var roleplayRef = activities.FirstOrDefault(a => a.Type == ExploreActivityType.Roleplay)?.ReferenceId;
            if (roleplayRef != null && !await _context.ScenarioLevelConfigurations.AnyAsync(c =>
                    c.Id == roleplayRef && c.Status != "Archived" && c.Scenario != null && c.Scenario.IsActive))
            {
                errors.Add("Kịch bản Hội thoại AI đã chọn không tồn tại hoặc đã lưu trữ.");
            }

            return errors;
        }

        /// <summary>Tỉnh đang mở phải còn ít nhất một mốc đang dùng (cùng quy tắc với lúc mở tỉnh).</summary>
        private async Task<string?> GuardLastPublishedAsync(ExploreSpot spot)
        {
            if (spot.Status != ExploreSpotStatus.Published) return null;
            var isOpen = await _context.ExplorePrefectures.AnyAsync(p => p.Id == spot.PrefectureId && p.IsOpen);
            if (!isOpen) return null;
            var others = await _context.ExploreSpots.CountAsync(s =>
                s.PrefectureId == spot.PrefectureId && s.Id != spot.Id && s.IsActive && s.Status == ExploreSpotStatus.Published);
            return others == 0 ? "Tỉnh đang mở cần ít nhất 1 mốc đang dùng, nên không chuyển mốc cuối cùng về Nháp được." : null;
        }

        // ---------------------------------------------------------------- ghi

        private void Apply(ExploreSpot spot, SaveExploreSpotDto dto)
        {
            var now = DateTime.UtcNow;
            spot.IconId = dto.IconId.Trim();
            spot.NameVi = dto.NameVi.Trim();
            spot.NameJp = dto.NameJp.Trim();
            spot.NameKana = string.IsNullOrWhiteSpace(dto.NameKana) ? null : dto.NameKana.Trim();
            spot.Latitude = Math.Round(dto.Latitude, 6);
            spot.Longitude = Math.Round(dto.Longitude, 6);
            spot.UpdatedAt = now;

            var l = spot.Lesson!;
            l.JLPTLevel = dto.JLPTLevel;
            l.Situation = dto.Situation?.Trim() ?? string.Empty;
            l.RealUse = dto.RealUse?.Trim() ?? string.Empty;
            l.SentenceJson = ExploreSentenceJson.Serialize(NormalizeSentence(dto.Sentence));
            l.Meaning = dto.Meaning?.Trim() ?? string.Empty;
            l.GrammarNote = string.IsNullOrWhiteSpace(dto.GrammarNote) ? null : dto.GrammarNote.Trim();
            l.EstimatedMinutes = dto.EstimatedMinutes;
            l.UpdatedAt = now;

            var grammarIds = (dto.GrammarIds ?? new()).Distinct().ToList();
            foreach (var g in l.LessonGrammars.Where(g => !grammarIds.Contains(g.GrammarId)).ToList()) l.LessonGrammars.Remove(g);
            foreach (var id in grammarIds.Where(id => l.LessonGrammars.All(g => g.GrammarId != id)))
            {
                l.LessonGrammars.Add(new ExploreSpotLessonGrammar { GrammarId = id });
            }

            var vocabIds = (dto.VocabularyIds ?? new()).Distinct().ToList();
            foreach (var v in l.LessonVocabularies.Where(v => !vocabIds.Contains(v.VocabularyId)).ToList()) l.LessonVocabularies.Remove(v);
            foreach (var id in vocabIds.Where(id => l.LessonVocabularies.All(v => v.VocabularyId != id)))
            {
                l.LessonVocabularies.Add(new ExploreSpotLessonVocabulary { VocabularyId = id });
            }

            // Giữ nguyên bản ghi hoạt động theo loại (để tiến độ người học sau này bám được), chỉ cập nhật nội dung gắn
            var incoming = dto.Activities ?? new();
            foreach (var a in l.Activities.Where(a => incoming.All(x => x.Type != a.ActivityType)).ToList()) l.Activities.Remove(a);
            foreach (var a in incoming)
            {
                var existing = l.Activities.FirstOrDefault(x => x.ActivityType == a.Type);
                if (existing == null)
                {
                    existing = new ExploreSpotActivity { ActivityType = a.Type };
                    l.Activities.Add(existing);
                }
                existing.ReferenceId = a.ReferenceId;
                existing.PassThreshold = a.Type == ExploreActivityType.Shadowing ? a.PassThreshold ?? DefaultShadowingPass : null;
                existing.OrderIndex = a.Type == ExploreActivityType.Shadowing ? 0 : 1;
            }
        }

        /// <summary>Bỏ đoạn rỗng, gộp chữ thường liền nhau, bỏ furigana trống.</summary>
        private static List<FuriganaSegmentDto> NormalizeSentence(List<FuriganaSegmentDto>? segments)
        {
            var result = new List<FuriganaSegmentDto>();
            foreach (var s in segments ?? new())
            {
                if (string.IsNullOrEmpty(s.Text)) continue;
                var reading = string.IsNullOrWhiteSpace(s.Reading) ? null : s.Reading.Trim();
                if (reading == null && result.Count > 0 && result[^1].Reading == null)
                {
                    result[^1].Text += s.Text;
                    continue;
                }
                result.Add(new FuriganaSegmentDto { Text = s.Text, Reading = reading });
            }
            if (result.Count > 0)
            {
                result[0].Text = result[0].Text.TrimStart();
                result[^1].Text = result[^1].Text.TrimEnd();
            }
            return result.Where(s => s.Text.Length > 0).ToList();
        }

        // ---------------------------------------------------------------- đọc

        private IQueryable<ExploreSpot> LoadSpots() => _context.ExploreSpots
            .Include(s => s.Lesson).ThenInclude(l => l!.Activities)
            .Include(s => s.Lesson).ThenInclude(l => l!.LessonGrammars)
            .Include(s => s.Lesson).ThenInclude(l => l!.LessonVocabularies)
            .AsSplitQuery();

        private async Task<ApiResponse<AdminExploreSpotDto>> ReloadAsync(int spotId, string message)
        {
            _context.ChangeTracker.Clear();
            var spot = await LoadSpots().AsNoTracking().FirstAsync(s => s.Id == spotId);
            return ApiResponse<AdminExploreSpotDto>.Ok(await ToSpotDtoAsync(spot), message);
        }

        private async Task<HashSet<int>> AvailableShadowingIdsAsync(IEnumerable<ExploreSpot> spots)
        {
            var ids = spots
                .SelectMany(s => s.Lesson?.Activities ?? Enumerable.Empty<ExploreSpotActivity>())
                .Where(a => a.ActivityType == ExploreActivityType.Shadowing && a.ReferenceId != null)
                .Select(a => a.ReferenceId!.Value)
                .Distinct()
                .ToList();
            if (ids.Count == 0) return new HashSet<int>();
            return (await _context.ShadowingDialogues.Where(d => ids.Contains(d.Id) && d.IsActive).Select(d => d.Id).ToListAsync()).ToHashSet();
        }

        private async Task<AdminExploreSpotDto> ToSpotDtoAsync(ExploreSpot s)
        {
            var l = s.Lesson;
            var grammarIds = l?.LessonGrammars.Select(g => g.GrammarId).ToList() ?? new();
            var vocabIds = l?.LessonVocabularies.Select(v => v.VocabularyId).ToList() ?? new();

            var grammars = await _context.Grammars.AsNoTracking().Where(g => grammarIds.Contains(g.Id))
                .Select(g => new ExploreLookupItemDto { Id = g.Id, Title = g.Pattern, Subtitle = g.Meaning, JLPTLevel = g.JLPTLevel, Available = g.IsActive })
                .ToListAsync();
            var vocabularies = await _context.Vocabularies.AsNoTracking().Where(v => vocabIds.Contains(v.Id))
                .Select(v => new ExploreLookupItemDto
                {
                    Id = v.Id,
                    Title = v.Reading != null && v.Reading != v.Word ? v.Word + " (" + v.Reading + ")" : v.Word,
                    Subtitle = v.Meaning,
                    JLPTLevel = v.JLPTLevel,
                    Available = v.IsActive,
                })
                .ToListAsync();

            var activities = new List<AdminExploreActivityDto>();
            foreach (var a in (l?.Activities ?? new List<ExploreSpotActivity>()).OrderBy(a => a.OrderIndex))
            {
                activities.Add(new AdminExploreActivityDto
                {
                    Type = a.ActivityType,
                    ReferenceId = a.ReferenceId,
                    PassThreshold = a.PassThreshold,
                    Reference = a.ReferenceId == null ? null : await ReferenceAsync(a.ActivityType, a.ReferenceId.Value),
                });
            }

            var prefectureOpen = await _context.ExplorePrefectures.AnyAsync(p => p.Id == s.PrefectureId && p.IsOpen);
            return new AdminExploreSpotDto
            {
                Id = s.Id,
                PrefectureId = s.PrefectureId,
                PrefectureIsOpen = prefectureOpen,
                IconId = s.IconId,
                NameVi = s.NameVi,
                NameJp = s.NameJp,
                NameKana = s.NameKana,
                Latitude = s.Latitude,
                Longitude = s.Longitude,
                Status = s.Status,
                CreatedAt = s.CreatedAt,
                UpdatedAt = Max(s.UpdatedAt, l?.UpdatedAt),
                JLPTLevel = l?.JLPTLevel ?? "N5",
                Situation = l?.Situation ?? string.Empty,
                RealUse = l?.RealUse ?? string.Empty,
                Sentence = ExploreSentenceJson.Parse(l?.SentenceJson),
                Meaning = l?.Meaning ?? string.Empty,
                GrammarNote = l?.GrammarNote,
                EstimatedMinutes = l?.EstimatedMinutes ?? 5,
                // Giữ thứ tự admin đã chọn
                Grammars = grammarIds.Select(id => grammars.FirstOrDefault(g => g.Id == id)).Where(g => g != null).ToList()!,
                Vocabularies = vocabIds.Select(id => vocabularies.FirstOrDefault(v => v.Id == id)).Where(v => v != null).ToList()!,
                Activities = activities,
                Missing = Missing(s, await AvailableShadowingIdsAsync(new[] { s })),
            };
        }

        private async Task<ExploreLookupItemDto?> ReferenceAsync(string type, int id) => type switch
        {
            ExploreActivityType.Shadowing => await _context.ShadowingDialogues.AsNoTracking().Where(d => d.Id == id)
                .Select(d => new ExploreLookupItemDto
                {
                    Id = d.Id,
                    Title = d.Title,
                    Subtitle = d.Scenario.Title + " · " + d.Sentences.Count + " câu",
                    JLPTLevel = d.JLPTLevel,
                    Available = d.IsActive,
                })
                .FirstOrDefaultAsync(),
            ExploreActivityType.Roleplay => await _context.ScenarioLevelConfigurations.AsNoTracking().Where(c => c.Id == id)
                .Select(c => new ExploreLookupItemDto
                {
                    Id = c.Id,
                    Title = (c.Scenario != null ? c.Scenario.Title + " · " : "") + c.Title,
                    Subtitle = c.CreditCost + " Credit" + (c.Status == "Published" ? "" : " · " + c.Status),
                    JLPTLevel = c.JLPTLevel,
                    Available = c.Status != "Archived" && c.Scenario != null && c.Scenario.IsActive,
                })
                .FirstOrDefaultAsync(),
            _ => null,
        };

        // ---------------------------------------------------------------- tiện ích

        private static bool IsValidPrefecture(int id) => id >= 1 && id <= ExploreService.PrefectureCount;

        private static bool InJapan(double lat, double lon) => lat >= MinLat && lat <= MaxLat && lon >= MinLon && lon <= MaxLon;

        private static DateTime Max(DateTime a, DateTime? b) => b != null && b > a ? b.Value : a;

        private static void Require(List<string> errors, string? value, int max, string label)
        {
            if (string.IsNullOrWhiteSpace(value)) errors.Add($"{label} không được để trống.");
            else if (value.Trim().Length > max) errors.Add($"{label} tối đa {max} ký tự.");
        }

        private static AdminExploreWordDto ToWordDto(ExploreProvinceWord w) => new()
        {
            Word = w.Word,
            Kana = w.Kana,
            Meaning = w.Meaning,
            Note = w.Note,
            Status = w.Status,
        };

        private async Task EnsurePrefectureAsync(int id)
        {
            if (await _context.ExplorePrefectures.AnyAsync(p => p.Id == id)) return;
            // Dữ liệu seed thường đã đủ 47 tỉnh; phòng trường hợp thiếu thì tạo bản ghi (mặc định đóng)
            _context.ExplorePrefectures.Add(new ExplorePrefecture { Id = id, IsOpen = false, UpdatedAt = DateTime.UtcNow });
            await _context.SaveChangesAsync();
        }
    }
}
