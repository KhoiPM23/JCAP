namespace JCAP.Data.Seeds;

/// <summary>Level-specific topics, backed by the same shared content records.</summary>
public static class LearningTopicSeedData
{
    private static readonly LearningTopicSeed[] BaseTopics =
    [
        new("DAILY_LIFE", "Sinh hoạt hằng ngày", "Hoạt động, nhu cầu và môi trường sống thường ngày.",
            ["大きい", "食べる", "飲む", "準備", "必要", "環境", "管理"],
            ["te-kudasai", "temo-ii", "koto-ga-aru", "you-ni-naru", "wake-dewa-nai"]),
        new("DINING", "Ăn uống", "Ăn uống, xin phép và đặt chỗ tại nhà hàng.",
            ["食べる", "飲む", "予約", "必要", "大きい"],
            ["te-kudasai", "temo-ii", "wake-dewa-nai"]),
        new("SHOPPING", "Mua sắm", "Lựa chọn kích cỡ, đặt trước và xác nhận nhu cầu.",
            ["大きい", "予約", "確認", "必要"],
            ["te-kudasai", "temo-ii", "ni-taishite"]),
        new("TRANSPORT", "Di chuyển", "Đi tàu, giờ giấc, đặt chỗ và xác nhận chuyến đi.",
            ["電車", "遅れる", "予約", "確認"],
            ["te-kudasai", "temo-ii", "koto-ga-aru"]),
        new("STUDY_WORK", "Học tập và công việc", "Học tập, họp, chuẩn bị và hợp tác trong công việc.",
            ["学校", "準備", "会議", "協力", "管理", "参加", "確認", "環境"],
            ["te-kudasai", "temo-ii", "koto-ga-aru", "you-ni-naru", "ni-taishite", "wake-dewa-nai"])
    ];

    private static readonly LearningTopicSeed[] GrammarTopics =
    [
        new("GRAMMAR_REQUEST_N5", "Yêu cầu", "Nhờ hoặc hướng dẫn người nghe thực hiện một hành động.", [], ["te-kudasai"]),
        new("GRAMMAR_PERMISSION_N5", "Xin phép và cho phép", "Hỏi xin phép hoặc cho biết một hành động được phép.", [], ["temo-ii"]),
        new("GRAMMAR_FREQUENCY_N4", "Tần suất", "Diễn đạt sự việc đôi khi xảy ra.", [], ["koto-ga-aru"]) { JLPTLevel = "N4" },
        new("GRAMMAR_CHANGE_N4", "Thay đổi theo thời gian", "Nói về khả năng hoặc thói quen mới hình thành.", [], ["you-ni-naru"]) { JLPTLevel = "N4" },
        new("GRAMMAR_CONTRAST_N3", "Đối chiếu", "Đặt hai sự vật hoặc tình trạng tương phản cạnh nhau.", [], ["ni-taishite"]) { JLPTLevel = "N3" },
        new("GRAMMAR_CLARIFY_N3", "Đính chính nhận định", "Làm rõ giới hạn của một nhận định hoặc đính chính suy luận.", [], ["wake-dewa-nai"]) { JLPTLevel = "N3" }
    ];

    private static readonly LearningTopicSeed[] SituationTopics = CreateLevelTopics();

    // Keep contextual links for Flashcards and old URLs. Learner grammar discovery uses functional topics.
    public static string[] SituationCodes { get; } = SituationTopics.Select(topic => topic.Code).ToArray();
    public static IReadOnlyList<LearningTopicSeed> Topics { get; } = [.. SituationTopics, .. GrammarTopics];

    private static LearningTopicSeed[] CreateLevelTopics()
    {
        var data = LearningContentSampleData.Load();
        return BaseTopics.SelectMany(topic => new[] { "N5", "N4", "N3" }.Select(level => topic with
        {
            Code = level == "N5" ? topic.Code : $"{topic.Code}_{level}",
            JLPTLevel = level,
            VocabularyWords = topic.VocabularyWords.Where(word => data.Vocabularies.Single(v => v.Word == word).JLPTLevel == level).ToArray(),
            GrammarExternalIds = topic.GrammarExternalIds.Where(id => data.Grammars.Single(g => g.ExternalId == id).JLPTLevel == level).ToArray()
        })).Where(topic => topic.VocabularyWords.Length + topic.GrammarExternalIds.Length > 0).ToArray();
    }
}

public sealed record LearningTopicSeed(string Code, string Name, string Description,
    string[] VocabularyWords, string[] GrammarExternalIds)
{
    public string JLPTLevel { get; init; } = "N5";
}
