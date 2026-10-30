namespace JCAP.DTOs.Explore
{
    /// <summary>Toàn cảnh hành trình cho bản đồ toàn quốc: các chương và trạng thái 47 tỉnh.</summary>
    public class ExploreJourneyDto
    {
        public List<ExploreChapterDto> Chapters { get; set; } = new();
        public List<ExplorePrefectureSummaryDto> Prefectures { get; set; } = new();
    }

    public class ExploreChapterDto
    {
        public int Id { get; set; }
        public int OrderIndex { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string MinLevel { get; set; } = "N5";
        public string MaxLevel { get; set; } = "N5";
        public int UnlockThresholdPercent { get; set; }
        public List<int> PrefectureIds { get; set; } = new();

        /// <summary>Chương đã mở cho người học này (chương đầu luôn mở; đã mở thì mở mãi).</summary>
        public bool IsUnlocked { get; set; }
        /// <summary>Số mốc người học thấy được trong chương (tỉnh đang mở, mốc Published, IsActive)</summary>
        public int SpotCount { get; set; }
        /// <summary>Số mốc trong SpotCount mà người học đã có con dấu</summary>
        public int StampCount { get; set; }
    }

    public class ExplorePrefectureSummaryDto
    {
        /// <summary>Mã tỉnh JIS 1..47</summary>
        public int Id { get; set; }
        public bool IsOpen { get; set; }
        public int? ChapterId { get; set; }
        /// <summary>Số mốc người học thấy được (Published, IsActive)</summary>
        public int SpotCount { get; set; }
        public ExploreProvinceWordDto? Word { get; set; }

        /// <summary>Tỉnh thuộc một chương người học chưa mở</summary>
        public bool IsLocked { get; set; }
        /// <summary>Số mốc trong SpotCount mà người học đã có con dấu / dấu son</summary>
        public int StampCount { get; set; }
        public int RedStampCount { get; set; }
        public ExploreStampDto? Stamp { get; set; }
    }

    /// <summary>
    /// Chi tiết một tỉnh. Tỉnh đang đóng: IsOpen = false và Spots rỗng.
    /// Tỉnh thuộc chương chưa mở: IsLocked = true và Spots rỗng.
    /// </summary>
    public class ExplorePrefectureDetailDto
    {
        public int Id { get; set; }
        public bool IsOpen { get; set; }
        public int? ChapterId { get; set; }
        public bool IsLocked { get; set; }
        public ExploreProvinceWordDto? Word { get; set; }
        public List<ExploreSpotDto> Spots { get; set; } = new();
        /// <summary>Con dấu tỉnh của người học; null = chưa có</summary>
        public ExploreStampDto? Stamp { get; set; }
    }

    /// <summary>Một con dấu đã cấp. RedStampedAt có giá trị = đã thành dấu son.</summary>
    public class ExploreStampDto
    {
        public DateTime StampedAt { get; set; }
        public DateTime? RedStampedAt { get; set; }
    }

    /// <summary>Tiến độ của người học ở một mốc</summary>
    public class ExploreSpotProgressDto
    {
        public DateTime? UnderstoodAt { get; set; }
        public DateTime? StampedAt { get; set; }
        public DateTime? RedStampedAt { get; set; }
    }

    /// <summary>
    /// Kết quả đồng bộ tiến độ một tỉnh: dữ liệu tỉnh mới nhất và những gì vừa đạt trong lần này
    /// (để giao diện chỉ diễn hiệu ứng đóng dấu một lần).
    /// </summary>
    public class ExploreSyncResultDto
    {
        public ExplorePrefectureDetailDto Prefecture { get; set; } = new();
        public ExploreAwardsDto Awards { get; set; } = new();
    }

    public class ExploreAwardsDto
    {
        public List<int> StampSpotIds { get; set; } = new();
        public List<int> RedStampSpotIds { get; set; } = new();
        public bool PrefectureStamp { get; set; }
        public bool PrefectureRedStamp { get; set; }
        public List<int> UnlockedChapterIds { get; set; } = new();
    }

    public class ExploreProvinceWordDto
    {
        public string Word { get; set; } = string.Empty;
        public string Kana { get; set; } = string.Empty;
        public string Meaning { get; set; } = string.Empty;
        public string? Note { get; set; }
    }

    public class ExploreSpotDto
    {
        public int Id { get; set; }
        public string IconId { get; set; } = string.Empty;
        public string NameVi { get; set; } = string.Empty;
        public string NameJp { get; set; } = string.Empty;
        public string? NameKana { get; set; }
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public int PrefectureId { get; set; }
        public ExploreLessonDto? Lesson { get; set; }
        public ExploreSpotProgressDto Progress { get; set; } = new();
    }

    /// <summary>Sổ con dấu của người học: mọi mốc đã có con dấu (kể cả dấu son), để xem lại toàn hành trình.</summary>
    public class ExploreStampBookDto
    {
        public List<ExploreStampedSpotDto> Stamps { get; set; } = new();
    }

    /// <summary>Một mốc đã có con dấu. Chỉ gồm mốc người học còn thấy được (đang dùng, tỉnh đã mở); tên mốc chưa công khai không lộ ra.</summary>
    public class ExploreStampedSpotDto
    {
        public int SpotId { get; set; }
        public int PrefectureId { get; set; }
        public string IconId { get; set; } = string.Empty;
        public string NameVi { get; set; } = string.Empty;
        public string NameJp { get; set; } = string.Empty;
        public DateTime? UnderstoodAt { get; set; }
        public DateTime StampedAt { get; set; }
        public DateTime? RedStampedAt { get; set; }
    }

    public class ExploreLessonDto
    {
        public string JLPTLevel { get; set; } = "N5";
        public string Situation { get; set; } = string.Empty;
        public string RealUse { get; set; } = string.Empty;
        public List<FuriganaSegmentDto> Sentence { get; set; } = new();
        public string Meaning { get; set; } = string.Empty;
        public string? GrammarNote { get; set; }
        public int EstimatedMinutes { get; set; }
        public List<ExploreActivityDto> Activities { get; set; } = new();
    }

    /// <summary>Một đoạn của câu: Reading có giá trị = chữ có furigana.</summary>
    public class FuriganaSegmentDto
    {
        public string Text { get; set; } = string.Empty;
        public string? Reading { get; set; }
    }

    public class ExploreActivityDto
    {
        /// <summary>Shadowing | Roleplay | Quiz | Flashcard</summary>
        public string Type { get; set; } = string.Empty;
        public int? ReferenceId { get; set; }
        public int? PassThreshold { get; set; }
        /// <summary>Tên bài Shadowing / kịch bản Hội thoại AI</summary>
        public string? Title { get; set; }
        /// <summary>Hội thoại AI: kịch bản gốc để mở trang kịch bản, cấp độ và số Credit của cấu hình</summary>
        public int? ScenarioId { get; set; }
        public string? JLPTLevel { get; set; }
        public int? CreditCost { get; set; }
    }
}
