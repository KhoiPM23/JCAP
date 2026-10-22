namespace JCAP.Models
{
    /// <summary>
    /// Một chặng của hành trình Khám phá (ví dụ "Chương 1 · Tokyo"), gắn một khoảng cấp độ JLPT và một hoặc vài tỉnh.
    /// Lớp ngôn ngữ đi theo cấp độ của chương; tỉnh chỉ là bối cảnh. Không xóa cứng: ẩn bằng IsActive = false.
    /// </summary>
    public class ExploreChapter
    {
        public int Id { get; set; }

        /// <summary>Thứ tự trên hành trình, bắt đầu từ 0 (chương nhập môn).</summary>
        public int OrderIndex { get; set; }

        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }

        /// <summary>Khoảng cấp độ của chương: N5, N4 hoặc N3 (MinLevel dễ hơn hoặc bằng MaxLevel).</summary>
        public string MinLevel { get; set; } = "N5";
        public string MaxLevel { get; set; } = "N5";

        /// <summary>Tỷ lệ con dấu (%) của chương trước cần có để mở chương này.</summary>
        public int UnlockThresholdPercent { get; set; } = 70;

        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<ExploreChapterPrefecture> Prefectures { get; set; } = new List<ExploreChapterPrefecture>();
    }

    /// <summary>Tỉnh thuộc một chương. Một tỉnh chỉ thuộc tối đa một chương.</summary>
    public class ExploreChapterPrefecture
    {
        public int ChapterId { get; set; }
        public int PrefectureId { get; set; }

        public ExploreChapter Chapter { get; set; } = null!;
        public ExplorePrefecture Prefecture { get; set; } = null!;
    }
}
