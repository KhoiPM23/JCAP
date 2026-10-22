namespace JCAP.Models
{
    /// <summary>
    /// Một mốc học trên bản đồ tỉnh (một địa điểm thật). Status = Draft (chỉ admin thấy) hoặc Published (người học thấy).
    /// Không xóa cứng: ngừng dùng bằng IsActive = false.
    /// </summary>
    public class ExploreSpot
    {
        public int Id { get; set; }
        public int PrefectureId { get; set; }

        /// <summary>
        /// Biểu tượng của mốc: id trong bộ EXPERIENCE JAPAN PICTOGRAMS (vd. "P_nara-park"), hoặc biểu tượng riêng
        /// của JCAP có tiền tố "X_" (vd. "X_airport") cho địa điểm bộ NDC không có.
        /// </summary>
        public string IconId { get; set; } = string.Empty;

        public string NameVi { get; set; } = string.Empty;
        public string NameJp { get; set; } = string.Empty;

        /// <summary>Cách đọc tên tiếng Nhật (furigana trên nhãn bản đồ), tuỳ chọn.</summary>
        public string? NameKana { get; set; }

        public double Latitude { get; set; }
        public double Longitude { get; set; }

        public string Status { get; set; } = ExploreSpotStatus.Draft;
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public ExplorePrefecture Prefecture { get; set; } = null!;
        public ExploreSpotLesson? Lesson { get; set; }
    }

    public static class ExploreSpotStatus
    {
        public const string Draft = "Draft";
        public const string Published = "Published";
    }
}
