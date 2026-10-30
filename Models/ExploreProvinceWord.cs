namespace JCAP.Models
{
    /// <summary>
    /// "Một từ ở tỉnh": một từ văn hoá gắn với cả tỉnh (vd. 鹿 ở Nara). Khoá chính là mã tỉnh.
    /// Hiện cả khi tỉnh đang đóng, để bản đồ không trống.
    /// </summary>
    public class ExploreProvinceWord
    {
        public int PrefectureId { get; set; }
        public string Word { get; set; } = string.Empty;
        public string Kana { get; set; } = string.Empty;
        public string Meaning { get; set; } = string.Empty;
        public string? Note { get; set; }
        public string Status { get; set; } = ExploreSpotStatus.Draft;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public ExplorePrefecture Prefecture { get; set; } = null!;
    }
}
