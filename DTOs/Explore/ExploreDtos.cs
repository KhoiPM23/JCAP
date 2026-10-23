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
    }

    /// <summary>Chi tiết một tỉnh. Tỉnh đang đóng: IsOpen = false và Spots rỗng.</summary>
    public class ExplorePrefectureDetailDto
    {
        public int Id { get; set; }
        public bool IsOpen { get; set; }
        public int? ChapterId { get; set; }
        public ExploreProvinceWordDto? Word { get; set; }
        public List<ExploreSpotDto> Spots { get; set; } = new();
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
        public ExploreLessonDto? Lesson { get; set; }
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
    }
}
