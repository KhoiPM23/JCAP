using System.Text.Json;
using JCAP.DTOs.Explore;

namespace JCAP.Data.Seeds
{
    /// <summary>
    /// Gói nội dung Khám phá do admin soạn trên máy dev (mốc, bài học, "Một từ ở tỉnh", chương bổ sung), lưu ở
    /// Data/Seeds/ExploreContent/explore-content.json để cả nhóm đọc và theo dõi thay đổi qua git.
    /// Liên kết sang module khác dùng khoá nội dung (tiêu đề bài Shadowing, mã kịch bản + cấp độ, mẫu ngữ pháp, từ vựng)
    /// thay vì ID, vì ID khác nhau giữa các máy.
    /// </summary>
    public record ExploreContentPack(
        ExploreContentPack.ChapterEntry[] Chapters,
        ExploreContentPack.SpotEntry[] Spots,
        ExploreContentPack.WordEntry[] ProvinceWords)
    {
        public record ChapterEntry(int OrderIndex, string Title, string? Description, string MinLevel, string MaxLevel, int[] PrefectureIds);

        public record SpotEntry(
            int PrefectureId, string IconId, string NameVi, string NameJp, string? NameKana,
            double Latitude, double Longitude, string Status, bool IsActive, LessonEntry Lesson);

        public record LessonEntry(
            string Level, string Situation, string RealUse, FuriganaSegmentDto[] Sentence, string Meaning,
            string? GrammarNote, int EstimatedMinutes, string[] Grammars, string[] Vocabularies, ActivityEntry[] Activities);

        /// <summary>Shadowing trỏ bằng DialogueTitle; Roleplay trỏ bằng ScenarioCode + ScenarioLevel.</summary>
        public record ActivityEntry(string Type, string? DialogueTitle, string? ScenarioCode, string? ScenarioLevel, int? PassThreshold, int Order);

        public record WordEntry(int PrefectureId, string Word, string Kana, string Meaning, string Note, string Status);

        private static readonly JsonSerializerOptions Options = new() { PropertyNameCaseInsensitive = true };

        public static ExploreContentPack Load()
        {
            using var stream = typeof(ExploreContentPack).Assembly.GetManifestResourceStream(
                "JCAP.Data.Seeds.ExploreContent.explore-content.json")
                ?? throw new InvalidOperationException("Explore content pack resource is missing.");
            return JsonSerializer.Deserialize<ExploreContentPack>(stream, Options)
                ?? throw new InvalidOperationException("Explore content pack is empty.");
        }
    }
}
