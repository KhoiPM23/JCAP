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

    /// <summary>Thống kê Khám phá cho admin: tổng quan, theo chương và phễu từng mốc đang dùng.</summary>
    public class AdminExploreStatsDto
    {
        /// <summary>Số người học đã bắt đầu (có ít nhất một dòng tiến độ ở một mốc)</summary>
        public int Learners { get; set; }
        /// <summary>Tổng con dấu / dấu son mốc đã cấp (đã cấp thì không thu hồi, nên gồm cả mốc nay đã ngừng dùng)</summary>
        public int Stamps { get; set; }
        public int RedStamps { get; set; }
        public int PrefectureStamps { get; set; }
        public int PrefectureRedStamps { get; set; }
        public List<AdminExploreChapterStatsDto> Chapters { get; set; } = new();
        public List<AdminExploreSpotStatsDto> Spots { get; set; } = new();
    }

    public class AdminExploreChapterStatsDto
    {
        public int ChapterId { get; set; }
        public int OrderIndex { get; set; }
        public string Title { get; set; } = string.Empty;
        /// <summary>Số mốc người học thấy được trong chương (mốc đang dùng của tỉnh đã mở)</summary>
        public int SpotCount { get; set; }
        /// <summary>Số người học đã mở chương (chương đầu = mọi người đã bắt đầu)</summary>
        public int UnlockedLearners { get; set; }
        /// <summary>Trung bình % mốc có con dấu của chương, tính trên những người đã mở chương; null khi chưa có số liệu</summary>
        public double? AvgStampPercent { get; set; }
    }

    public class AdminExploreSpotStatsDto
    {
        public int SpotId { get; set; }
        public string NameVi { get; set; } = string.Empty;
        public int PrefectureId { get; set; }
        public bool PrefectureIsOpen { get; set; }
        /// <summary>Chương đang chứa tỉnh của mốc (chỉ tính chương đang dùng)</summary>
        public int? ChapterId { get; set; }
        /// <summary>Mốc có Hội thoại AI (kịch bản còn dùng) nên mới có dấu son</summary>
        public bool HasRoleplay { get; set; }
        public int Understood { get; set; }
        public int Stamped { get; set; }
        /// <summary>null khi mốc không có Hội thoại AI (không có dấu son để đạt)</summary>
        public int? RedStamped { get; set; }
        /// <summary>Đã hiểu nhưng chưa có con dấu: người học kẹt ở Shadowing</summary>
        public int StuckAtShadowing { get; set; }
    }
}
