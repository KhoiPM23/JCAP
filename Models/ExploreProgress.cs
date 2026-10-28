namespace JCAP.Models
{
    /// <summary>
    /// Tiến độ của một người học ở một mốc. Con dấu và dấu son do server cấp từ bằng chứng có thật
    /// (phiên Shadowing, phiên Hội thoại AI), không lấy điểm client gửi lên. Đã cấp thì không bao giờ thu hồi.
    /// </summary>
    public class ExploreSpotProgress
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public int SpotId { get; set; }

        /// <summary>Người học bấm "Đã hiểu" ở phần câu mẫu của mốc.</summary>
        public DateTime? UnderstoodAt { get; set; }

        /// <summary>Con dấu: đã hiểu + có phiên Shadowing đạt ngưỡng của mốc.</summary>
        public DateTime? StampedAt { get; set; }

        /// <summary>Dấu son: đã có con dấu + có phiên Hội thoại AI kết thúc tự nhiên với kịch bản của mốc.</summary>
        public DateTime? RedStampedAt { get; set; }

        /// <summary>Phiên Shadowing làm bằng chứng cho con dấu.</summary>
        public Guid? ShadowingPracticeSessionId { get; set; }

        /// <summary>Phiên Hội thoại AI làm bằng chứng cho dấu son.</summary>
        public int? RoleplaySessionId { get; set; }

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public ExploreSpot Spot { get; set; } = null!;
    }

    /// <summary>Con dấu tỉnh của một người học: có khi mọi mốc đang dùng của tỉnh đều có con dấu. Không thu hồi.</summary>
    public class ExplorePrefectureStamp
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public int PrefectureId { get; set; }
        public DateTime StampedAt { get; set; } = DateTime.UtcNow;

        /// <summary>Thành dấu son khi mọi mốc có Hội thoại AI của tỉnh đều có dấu son.</summary>
        public DateTime? RedStampedAt { get; set; }

        public ExplorePrefecture Prefecture { get; set; } = null!;
    }

    /// <summary>
    /// Chương đã mở cho một người học. Lưu lại để chương đã mở thì mở mãi, kể cả khi admin thêm mốc làm tỷ lệ con dấu tụt.
    /// Chương đầu tiên luôn mở nên không cần bản ghi.
    /// </summary>
    public class ExploreChapterUnlock
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public int ChapterId { get; set; }
        public DateTime UnlockedAt { get; set; } = DateTime.UtcNow;

        public ExploreChapter Chapter { get; set; } = null!;
    }
}
