using System.Text.Json;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Explore;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations
{
    public class ExploreService : IExploreService
    {
        public const int PrefectureCount = 47;

        private readonly AppDbContext _context;

        public ExploreService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<ApiResponse<ExploreJourneyDto>> GetJourneyAsync()
        {
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
                return new ExplorePrefectureSummaryDto
                {
                    Id = id,
                    IsOpen = p.IsOpen,
                    ChapterId = p.ChapterId != null && activeChapterIds.Contains(p.ChapterId.Value) ? p.ChapterId : null,
                    SpotCount = p.SpotCount,
                    Word = p.Word,
                };
            }).ToList();

            return ApiResponse<ExploreJourneyDto>.Ok(new ExploreJourneyDto { Chapters = chapters, Prefectures = summaries });
        }

        public async Task<ApiResponse<ExplorePrefectureDetailDto>> GetPrefectureAsync(int prefectureId)
        {
            if (prefectureId < 1 || prefectureId > PrefectureCount)
            {
                return ApiResponse<ExplorePrefectureDetailDto>.Fail("Mã tỉnh không hợp lệ.");
            }

            var prefecture = await _context.ExplorePrefectures
                .AsNoTracking()
                .Include(p => p.ChapterLink).ThenInclude(l => l!.Chapter)
                .Include(p => p.Word)
                .FirstOrDefaultAsync(p => p.Id == prefectureId);

            var word = prefecture?.Word is { Status: ExploreSpotStatus.Published } w
                ? new ExploreProvinceWordDto { Word = w.Word, Kana = w.Kana, Meaning = w.Meaning, Note = w.Note }
                : null;
            var dto = new ExplorePrefectureDetailDto
            {
                Id = prefectureId,
                IsOpen = prefecture?.IsOpen ?? false,
                ChapterId = prefecture?.ChapterLink?.Chapter is { IsActive: true } c ? c.Id : null,
                Word = word,
            };
            // Tỉnh đóng: người học không vào được, không trả nội dung
            if (!dto.IsOpen) return ApiResponse<ExplorePrefectureDetailDto>.Ok(dto, "Sẽ cập nhật trong tương lai.");

            var spots = await _context.ExploreSpots
                .AsNoTracking()
                .Where(s => s.PrefectureId == prefectureId && s.IsActive && s.Status == ExploreSpotStatus.Published)
                .Include(s => s.Lesson).ThenInclude(l => l!.Activities)
                .OrderBy(s => s.Id)
                .ToListAsync();

            dto.Spots = spots.Select(ToSpotDto).ToList();
            return ApiResponse<ExplorePrefectureDetailDto>.Ok(dto);
        }

        private static ExploreSpotDto ToSpotDto(ExploreSpot s) => new()
        {
            Id = s.Id,
            IconId = s.IconId,
            NameVi = s.NameVi,
            NameJp = s.NameJp,
            NameKana = s.NameKana,
            Latitude = s.Latitude,
            Longitude = s.Longitude,
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
                        .Select(a => new ExploreActivityDto { Type = a.ActivityType, ReferenceId = a.ReferenceId, PassThreshold = a.PassThreshold })
                        .ToList(),
                },
        };
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
