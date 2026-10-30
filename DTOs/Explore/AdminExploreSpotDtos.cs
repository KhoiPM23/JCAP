namespace JCAP.DTOs.Explore
{
    /// <summary>
    /// Các mục kiểm tra trước khi chuyển mốc sang "Đang dùng". Trả về danh sách khoá còn thiếu (Missing).
    /// </summary>
    public static class ExploreSpotCheck
    {
        /// <summary>Tên Việt/Nhật, biểu tượng, vị trí</summary>
        public const string Place = "place";
        /// <summary>Câu mẫu và nghĩa tiếng Việt</summary>
        public const string Sentence = "sentence";
        /// <summary>Ít nhất một ngữ pháp hoặc từ vựng mục tiêu</summary>
        public const string Target = "target";
        /// <summary>Tình huống tại địa điểm</summary>
        public const string Situation = "situation";
        /// <summary>Người học dùng câu này thật khi nào</summary>
        public const string RealUse = "realUse";
        /// <summary>Đã gắn bài Shadowing đang dùng</summary>
        public const string Shadowing = "shadowing";

        /// <summary>Mốc đang dùng không được để trống những mục người học đang thấy.</summary>
        public static readonly string[] VisibleToLearner = { Place, Sentence, Situation, RealUse };
    }

    /// <summary>Nội dung một tỉnh phía admin: mọi mốc (nháp và đang dùng) và "Một từ ở tỉnh".</summary>
    public class AdminExplorePrefectureContentDto
    {
        public int Id { get; set; }
        public bool IsOpen { get; set; }
        public int? ChapterId { get; set; }
        public AdminExploreWordDto? Word { get; set; }
        public List<AdminExploreSpotSummaryDto> Spots { get; set; } = new();
    }

    /// <summary>"Một từ ở tỉnh" (đọc và lưu dùng chung).</summary>
    public class AdminExploreWordDto
    {
        public string Word { get; set; } = string.Empty;
        public string Kana { get; set; } = string.Empty;
        public string Meaning { get; set; } = string.Empty;
        public string? Note { get; set; }
        /// <summary>Draft | Published</summary>
        public string Status { get; set; } = "Draft";
    }

    public class AdminExploreSpotSummaryDto
    {
        public int Id { get; set; }
        public string IconId { get; set; } = string.Empty;
        public string NameVi { get; set; } = string.Empty;
        public string NameJp { get; set; } = string.Empty;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public string Status { get; set; } = "Draft";
        public string JLPTLevel { get; set; } = "N5";
        public bool HasRoleplay { get; set; }
        public DateTime UpdatedAt { get; set; }
        /// <summary>Các mục kiểm tra còn thiếu (xem ExploreSpotCheck)</summary>
        public List<string> Missing { get; set; } = new();
    }

    /// <summary>Toàn bộ một mốc để mở trong trình soạn.</summary>
    public class AdminExploreSpotDto
    {
        public int Id { get; set; }
        public int PrefectureId { get; set; }
        public bool PrefectureIsOpen { get; set; }
        public string IconId { get; set; } = string.Empty;
        public string NameVi { get; set; } = string.Empty;
        public string NameJp { get; set; } = string.Empty;
        public string? NameKana { get; set; }
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public string Status { get; set; } = "Draft";
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        public string JLPTLevel { get; set; } = "N5";
        public string Situation { get; set; } = string.Empty;
        public string RealUse { get; set; } = string.Empty;
        public List<FuriganaSegmentDto> Sentence { get; set; } = new();
        public string Meaning { get; set; } = string.Empty;
        public string? GrammarNote { get; set; }
        public int EstimatedMinutes { get; set; } = 5;

        public List<ExploreLookupItemDto> Grammars { get; set; } = new();
        public List<ExploreLookupItemDto> Vocabularies { get; set; } = new();
        public List<AdminExploreActivityDto> Activities { get; set; } = new();

        public List<string> Missing { get; set; } = new();
    }

    public class AdminExploreActivityDto
    {
        /// <summary>Shadowing | Roleplay</summary>
        public string Type { get; set; } = string.Empty;
        public int? ReferenceId { get; set; }
        public int? PassThreshold { get; set; }
        /// <summary>Nội dung được gắn (tên bài Shadowing / kịch bản), để hiện trong trình soạn</summary>
        public ExploreLookupItemDto? Reference { get; set; }
    }

    /// <summary>Tạo/lưu mốc kèm bài học. Mốc mới luôn ở trạng thái Nháp; đổi trạng thái bằng API riêng.</summary>
    public class SaveExploreSpotDto
    {
        public string IconId { get; set; } = string.Empty;
        public string NameVi { get; set; } = string.Empty;
        public string NameJp { get; set; } = string.Empty;
        public string? NameKana { get; set; }
        public double Latitude { get; set; }
        public double Longitude { get; set; }

        public string JLPTLevel { get; set; } = "N5";
        public string Situation { get; set; } = string.Empty;
        public string RealUse { get; set; } = string.Empty;
        public List<FuriganaSegmentDto> Sentence { get; set; } = new();
        public string Meaning { get; set; } = string.Empty;
        public string? GrammarNote { get; set; }
        public int EstimatedMinutes { get; set; } = 5;

        public List<int> GrammarIds { get; set; } = new();
        public List<int> VocabularyIds { get; set; } = new();
        public List<SaveExploreActivityDto> Activities { get; set; } = new();
    }

    public class SaveExploreActivityDto
    {
        public string Type { get; set; } = string.Empty;
        public int? ReferenceId { get; set; }
        public int? PassThreshold { get; set; }
    }

    public class SetExploreSpotStatusDto
    {
        /// <summary>Draft | Published</summary>
        public string Status { get; set; } = string.Empty;
    }

    /// <summary>Một lựa chọn trong ô tìm (ngữ pháp, từ vựng, bài Shadowing, kịch bản Hội thoại AI).</summary>
    public class ExploreLookupItemDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Subtitle { get; set; }
        public string? JLPTLevel { get; set; }
        /// <summary>false = nội dung đã ngừng dùng hoặc bị lưu trữ (vẫn hiện để admin biết mà thay)</summary>
        public bool Available { get; set; } = true;
        /// <summary>Các mốc (chưa ngừng dùng) đang gắn nội dung này</summary>
        public List<ExploreSpotRefDto> UsedBy { get; set; } = new();
    }

    /// <summary>Tham chiếu ngắn tới một mốc (để biết nội dung đang được gắn ở đâu).</summary>
    public class ExploreSpotRefDto
    {
        public int SpotId { get; set; }
        public int PrefectureId { get; set; }
        public string NameVi { get; set; } = string.Empty;
        /// <summary>Draft | Published</summary>
        public string Status { get; set; } = "Draft";
    }

    /// <summary>Một dòng trong bảng "Nội dung các mốc" (mọi tỉnh).</summary>
    public class AdminExploreSpotRowDto
    {
        public int Id { get; set; }
        public int PrefectureId { get; set; }
        public string IconId { get; set; } = string.Empty;
        public string NameVi { get; set; } = string.Empty;
        public string NameJp { get; set; } = string.Empty;
        public string Status { get; set; } = "Draft";
        public string JLPTLevel { get; set; } = "N5";
        public ExploreLookupItemDto? Shadowing { get; set; }
        public ExploreLookupItemDto? Roleplay { get; set; }
        public int GrammarCount { get; set; }
        public int VocabularyCount { get; set; }
        /// <summary>Có nội dung đã gắn nhưng bị ngừng dùng/lưu trữ (Shadowing, Hội thoại AI, ngữ pháp, từ vựng)</summary>
        public bool HasUnavailableContent { get; set; }
        public DateTime UpdatedAt { get; set; }
        public List<string> Missing { get; set; } = new();
    }
}
