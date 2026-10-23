namespace JCAP.Models
{
    /// <summary>
    /// Trạng thái của một tỉnh trên bản đồ Khám phá. Id là mã tỉnh JIS (1 = Hokkaido ... 47 = Okinawa),
    /// không tự tăng. Hình dạng và tên tỉnh nằm ở dữ liệu tĩnh của frontend; bảng này chỉ giữ phần admin quản lý.
    /// </summary>
    public class ExplorePrefecture
    {
        public int Id { get; set; }

        /// <summary>Tỉnh đang mở cho người học. Tỉnh đóng: người học không vào được ("Sẽ cập nhật trong tương lai").</summary>
        public bool IsOpen { get; set; }

        public DateTime? OpenedAt { get; set; }
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public ExploreChapterPrefecture? ChapterLink { get; set; }
        public ICollection<ExploreSpot> Spots { get; set; } = new List<ExploreSpot>();
        public ExploreProvinceWord? Word { get; set; }
    }
}
