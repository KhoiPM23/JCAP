namespace JCAP.Models
{
    /// <summary>
    /// Bài học tại một mốc: một tình huống thật ở đúng địa điểm đó, dạy một điểm ngữ pháp/từ vựng theo cấp độ.
    /// Giai đoạn hiện tại admin sửa trực tiếp (chưa có phiên bản); bảng tách riêng khỏi ExploreSpot để sau này
    /// thêm phiên bản mà không phải đổi mốc.
    /// </summary>
    public class ExploreSpotLesson
    {
        public int Id { get; set; }
        public int SpotId { get; set; }

        public string JLPTLevel { get; set; } = "N5";

        /// <summary>Tình huống: chuyện gì xảy ra, ở đâu, khi nào tại địa điểm này.</summary>
        public string Situation { get; set; } = string.Empty;

        /// <summary>Người học dùng câu này thật trong hoàn cảnh nào.</summary>
        public string RealUse { get; set; } = string.Empty;

        /// <summary>
        /// Câu mẫu chia đoạn để vẽ furigana, lưu dạng JSON: [{"text":"鹿","reading":"しか"},{"text":"せんべいを"}].
        /// </summary>
        public string SentenceJson { get; set; } = "[]";

        /// <summary>Nghĩa tiếng Việt của câu mẫu.</summary>
        public string Meaning { get; set; } = string.Empty;

        /// <summary>Giải thích ngắn điểm ngữ pháp của câu (vd. "N を ください: xin/mua cái gì").</summary>
        public string? GrammarNote { get; set; }

        public int EstimatedMinutes { get; set; } = 5;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public ExploreSpot Spot { get; set; } = null!;
        public ICollection<ExploreSpotActivity> Activities { get; set; } = new List<ExploreSpotActivity>();
        public ICollection<ExploreSpotLessonGrammar> LessonGrammars { get; set; } = new List<ExploreSpotLessonGrammar>();
        public ICollection<ExploreSpotLessonVocabulary> LessonVocabularies { get; set; } = new List<ExploreSpotLessonVocabulary>();
    }

    /// <summary>Điểm ngữ pháp mục tiêu của bài (liên kết bảng Grammar dùng chung).</summary>
    public class ExploreSpotLessonGrammar
    {
        public int LessonId { get; set; }
        public int GrammarId { get; set; }

        public ExploreSpotLesson Lesson { get; set; } = null!;
        public Grammar Grammar { get; set; } = null!;
    }

    /// <summary>Từ vựng mục tiêu của bài (liên kết bảng Vocabulary dùng chung).</summary>
    public class ExploreSpotLessonVocabulary
    {
        public int LessonId { get; set; }
        public int VocabularyId { get; set; }

        public ExploreSpotLesson Lesson { get; set; } = null!;
        public Vocabulary Vocabulary { get; set; } = null!;
    }

    /// <summary>
    /// Hoạt động luyện tập gắn với bài: Shadowing, Hội thoại AI, Kiểm tra, Flashcard.
    /// ReferenceId trỏ tới nội dung của module tương ứng (ShadowingDialogue.Id, ScenarioLevelConfiguration.Id...);
    /// Quiz và Flashcard chưa có module nên chưa được gắn (giao diện hiện "Sắp có").
    /// </summary>
    public class ExploreSpotActivity
    {
        public int Id { get; set; }
        public int LessonId { get; set; }
        public string ActivityType { get; set; } = ExploreActivityType.Shadowing;
        public int? ReferenceId { get; set; }

        /// <summary>Ngưỡng hoàn thành (điểm Shadowing, % đúng của Kiểm tra...); null = dùng mặc định của loại.</summary>
        public int? PassThreshold { get; set; }

        public int OrderIndex { get; set; }

        public ExploreSpotLesson Lesson { get; set; } = null!;
    }

    public static class ExploreActivityType
    {
        public const string Shadowing = "Shadowing";
        public const string Roleplay = "Roleplay";
        public const string Quiz = "Quiz";
        public const string Flashcard = "Flashcard";
    }
}
