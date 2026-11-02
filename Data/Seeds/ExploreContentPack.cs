using System.Text.Json;
using JCAP.DTOs.Explore;

namespace JCAP.Data.Seeds
{
    /// <summary>
    /// Dữ liệu roadmap (Khám phá) xuất từ database của người soạn bằng tools/explore-content/export.mjs, lưu ở
    /// Data/Seeds/ExploreContent/explore-content.json để cả nhóm đọc và theo dõi thay đổi qua git. Gồm mốc, bài học, chương,
    /// "Một từ ở tỉnh" và phần ngữ pháp, từ vựng, kịch bản, bài Shadowing mà các mốc tham chiếu.
    /// Liên kết dùng khoá nội dung (tiêu đề bài Shadowing, tiêu đề kịch bản + cấp độ, mẫu ngữ pháp, từ vựng) thay vì ID hay mã
    /// kịch bản, vì hai thứ đó khác nhau giữa các máy.
    /// </summary>
    public record ExploreContentPack(
        ExploreContentPack.GrammarEntry[] Grammars,
        ExploreContentPack.VocabularyEntry[] Vocabularies,
        ExploreContentPack.ScenarioEntry[] Scenarios,
        ExploreContentPack.DialogueEntry[] Dialogues,
        ExploreContentPack.ChapterEntry[] Chapters,
        int[] OpenPrefectures,
        ExploreContentPack.SpotEntry[] Spots,
        ExploreContentPack.WordEntry[] ProvinceWords)
    {
        public record GrammarEntry(
            string Pattern, string? Reading, string Meaning, string? Formation, string? Explanation,
            string? UsageNotes, string? ExampleSentence, string? JlptLevel);

        public record VocabularyEntry(
            string Word, string? Reading, string Meaning, string? PartOfSpeech, string? JlptLevel, string? Explanation, string? UsageNotes);

        public record ScenarioEntry(string Title, string Description, string? Thumbnail, ScenarioLevelEntry[] Levels);

        public record ScenarioLevelEntry(
            string JlptLevel, string Title, string Description, string AiPersona, int CreditCost, string Status,
            MissionEntry[] Missions, TargetVocabularyEntry[] TargetVocabularies, TargetGrammarEntry[] TargetGrammars);

        public record MissionEntry(string Content, int Order, string CompletionCriteriaJson, bool IsActive);

        public record TargetVocabularyEntry(string Word, string? Reading, string Meaning);

        public record TargetGrammarEntry(string Pattern, string Meaning, string? ExampleSentence);

        public record DialogueEntry(
            string Title, string ScenarioTitle, string JlptLevel, string? SourceDescription,
            string SpeakerRoleA_Name, string SpeakerRoleB_Name, string? SpeakerRolesJson,
            SentenceEntry[] Sentences, DialogueWordEntry[] Vocabularies, DialoguePatternEntry[] Grammars);

        public record SentenceEntry(int OrderIndex, string SpeakerRole, string JapaneseText, string? RomajiText, string VietnameseTranslation, int? AudioDurationMs);

        public record DialogueWordEntry(string Word, int OrderIndex, string? Note);

        public record DialoguePatternEntry(string Pattern, int OrderIndex, string? Note);

        public record ChapterEntry(int OrderIndex, string Title, string? Description, string MinLevel, string MaxLevel, int[] PrefectureIds);

        /// <summary>Key ổn định qua các lần xuất (theo ID trên máy người soạn), dùng để tra lịch sử khi tên hay vị trí đổi.</summary>
        public record SpotEntry(
            string? Key, int PrefectureId, string IconId, string NameVi, string NameJp, string? NameKana,
            double Latitude, double Longitude, string Status, bool IsActive, LessonEntry Lesson);

        public record LessonEntry(
            string Level, string Situation, string RealUse, FuriganaSegmentDto[] Sentence, string Meaning,
            string? GrammarNote, int EstimatedMinutes, string[] Grammars, string[] Vocabularies, ActivityEntry[] Activities);

        /// <summary>Shadowing trỏ bằng DialogueTitle; Roleplay trỏ bằng ScenarioTitle + ScenarioLevel.</summary>
        public record ActivityEntry(string Type, string? DialogueTitle, string? ScenarioTitle, string? ScenarioLevel, int? PassThreshold, int Order);

        public record WordEntry(int PrefectureId, string Word, string Kana, string Meaning, string Note, string Status);

        private static readonly JsonSerializerOptions Options = new() { PropertyNameCaseInsensitive = true };

        internal static T LoadResource<T>(string fileName)
        {
            using var stream = typeof(ExploreContentPack).Assembly.GetManifestResourceStream($"JCAP.Data.Seeds.ExploreContent.{fileName}")
                ?? throw new InvalidOperationException($"Explore content resource {fileName} is missing.");
            return JsonSerializer.Deserialize<T>(stream, Options)
                ?? throw new InvalidOperationException($"Explore content resource {fileName} is empty.");
        }

        public static ExploreContentPack Load() => LoadResource<ExploreContentPack>("explore-content.json");
    }

    /// <summary>
    /// Các phiên bản đã từng xuất của từng mục (explore-content.history.json). Một dòng trong database trùng phiên bản cũ
    /// nghĩa là chưa ai sửa trên máy đó nên được cập nhật theo bản mới; khác mọi phiên bản thì là chỉnh sửa riêng, giữ nguyên.
    /// Prefectures: các tỉnh người soạn đã từng đổi trạng thái đóng/mở.
    /// </summary>
    public record ExploreContentHistory(
        Dictionary<string, ExploreContentPack.SpotEntry[]> Spots,
        Dictionary<string, ExploreContentPack.ChapterEntry[]> Chapters,
        Dictionary<string, ExploreContentPack.WordEntry[]> Words,
        Dictionary<string, bool> Prefectures)
    {
        public static readonly ExploreContentHistory Empty = new(new(), new(), new(), new());

        public static ExploreContentHistory Load() => ExploreContentPack.LoadResource<ExploreContentHistory>("explore-content.history.json");
    }
}
