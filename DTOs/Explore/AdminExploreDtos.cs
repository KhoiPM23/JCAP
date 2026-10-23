namespace JCAP.DTOs.Explore
{
    /// <summary>Toàn cảnh bản đồ Khám phá cho admin: trạng thái 47 tỉnh và các chương đang dùng.</summary>
    public class AdminExploreOverviewDto
    {
        public List<AdminExplorePrefectureDto> Prefectures { get; set; } = new();
        public List<AdminExploreChapterDto> Chapters { get; set; } = new();
    }

    public class AdminExplorePrefectureDto
    {
        /// <summary>Mã tỉnh JIS 1..47</summary>
        public int Id { get; set; }
        public bool IsOpen { get; set; }
        public DateTime? OpenedAt { get; set; }
        /// <summary>Chương đang chứa tỉnh (chỉ tính chương đang dùng)</summary>
        public int? ChapterId { get; set; }
        /// <summary>Số mốc người học thấy được (Published, IsActive)</summary>
        public int PublishedSpotCount { get; set; }
        /// <summary>Số mốc còn nháp (Draft, IsActive)</summary>
        public int DraftSpotCount { get; set; }
        /// <summary>Đã có "Một từ ở tỉnh" đang dùng</summary>
        public bool HasWord { get; set; }
    }

    public class AdminExploreChapterDto
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

    /// <summary>Tạo/sửa chương (thứ tự và danh sách tỉnh đổi bằng API riêng).</summary>
    public class SaveExploreChapterDto
    {
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string MinLevel { get; set; } = "N5";
        public string MaxLevel { get; set; } = "N5";
        public int UnlockThresholdPercent { get; set; } = 70;
    }

    /// <summary>Đưa một tỉnh vào chương (null = bỏ khỏi chương đang chứa nó).</summary>
    public class AssignPrefectureChapterDto
    {
        public int? ChapterId { get; set; }
    }

    /// <summary>Thứ tự mới của các chương đang dùng (đủ và không trùng).</summary>
    public class ReorderExploreChaptersDto
    {
        public List<int> ChapterIds { get; set; } = new();
    }
}
