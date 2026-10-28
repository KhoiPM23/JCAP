using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations
{
    public partial class VietnameseLearnerErrorDetector : IVietnameseLearnerErrorDetector
    {
        // E01: Tự động từ đi với を (Intransitive verbs with を: 行く, 来る, 入る, 着く, 乗る, 会う)
        [GeneratedRegex(@"(?:(?:学校|駅|店|家|会社|部屋|ここ|そこ|どこ|あそこ)[\s]*を[\s]*(?:行[くきっ]|来[るき]|入[るりっ]|着[いく]|乗[るりっ]|会[ういっ]))", RegexOptions.Compiled)]
        private static partial Regex E01IntransitiveWoRegex();

        // E02: Nơi chốn tồn tại dùng で thay vì に (VD: 東京で住む, 部屋である)
        [GeneratedRegex(@"(?:(?:東京|大阪|日本|ベトナム|部屋|家|学校|ホテル|会社|店)[\s]*で[\s]*(?:住[むみん]|あ[るりっ]|居[るり]|い[るり]))", RegexOptions.Compiled)]
        private static partial Regex E02PlaceDeNiRegex();

        // E03: Lạm dụng あなた trong giao tiếp thông thường
        [GeneratedRegex(@"(?:あなた(?:は|が|の|に|を)?)", RegexOptions.Compiled)]
        private static partial Regex E03AnataOveruseRegex();

        // E04: Nhầm あります (vật) và います (sinh vật)
        [GeneratedRegex(@"(?:(?:猫|犬|人|子供|先生|友達|魚|鳥|学生|店員)[\s]*が[\s]*(?:あ[るりっ]|あった|ない|なかった))", RegexOptions.Compiled)]
        private static partial Regex E04AnimateAruRegex();

        [GeneratedRegex(@"(?:(?:本|車|机|ペン|お金|パソコン|傘|時計|電話|鞄)[\s]*が[\s]*(?:い[るりま]|いた|いない|いなかった))", RegexOptions.Compiled)]
        private static partial Regex E04InanimateIruRegex();

        // E05: Nhầm 知っています vs できます khi nói về kỹ năng/ngôn ngữ
        [GeneratedRegex(@"(?:(?:日本語|英語|ベトナム語|料理|運転|ピアノ)[\s]*(?:を|が)[\s]*知っ(?:てい|てま))", RegexOptions.Compiled)]
        private static partial Regex E05ShitteiruDekiruRegex();

        // E06: Sai đuôi quá khứ / tính từ (VD: 行ったでした, 高かったでした, 好きでした)
        [GeneratedRegex(@"(?:[ぁ-んァ-ヶ一-龯]+(?:た|だ)でした)", RegexOptions.Compiled)]
        private static partial Regex E06TaDeshitaRegex();

        // E07: Nhầm あげます khi chủ ngữ là người khác đưa cho mình (*田中さんが私にあげました)
        [GeneratedRegex(@"(?:(?:私|わたし|僕|ぼく)[\s]*に[\s]*[ぁ-んァ-ヶ一-龯]*あげ(?:る|ます|た|ました))", RegexOptions.Compiled)]
        private static partial Regex E07WatashiNiAgemasuRegex();

        // E08: Nhầm Tôn kính / Khiêm nhường (VD: 私がいらっしゃいました, 先生が参りました)
        [GeneratedRegex(@"(?:(?:私|わたし|僕|ぼく)[\s]*(?:は|が)[\s]*[ぁ-んァ-ヶ一-龯]*(?:いらっしゃ|おっしゃ|なさ|召し上が))", RegexOptions.Compiled)]
        private static partial Regex E08SonkeigoSelfRegex();

        [GeneratedRegex(@"(?:(?:先生|社長|部長|お客様|田中さん)[\s]*(?:は|が)[\s]*[ぁ-んァ-ヶ一-龯]*(?:参り|申し|いたし|いただき))", RegexOptions.Compiled)]
        private static partial Regex E08KenjougoOtherRegex();

        // E09: Thiếu だ/である trước から với danh từ hoặc tính từ đuôi な (VD: 便利から, 雨から, 暇から)
        [GeneratedRegex(@"(?:(?:便利|有名|暇|静か|元気|好き|嫌い|雨|日曜日|休み)[\s]*から)", RegexOptions.Compiled)]
        private static partial Regex E09MissingDaKaraRegex();

        public IReadOnlyList<DetectedGrammarIssue> DetectErrors(string japaneseText)
        {
            var issues = new List<DetectedGrammarIssue>();
            if (string.IsNullOrWhiteSpace(japaneseText)) return issues;

            // E01 Check
            var m1 = E01IntransitiveWoRegex().Match(japaneseText);
            if (m1.Success)
            {
                issues.Add(new DetectedGrammarIssue
                {
                    Code = "E01_INTRANSITIVE_WO",
                    Title = "Nhầm trợ từ を với tự động từ",
                    Severity = "error",
                    MatchedSnippet = m1.Value,
                    SuggestedFix = m1.Value.Replace("を", "に"),
                    ExplanationVi = "Người Việt hay dịch 'đi/đến trường' thành 'trường + を + 行く/来る'. Nhưng các động từ chuyển động/tồn tại (行く, 来る, 入る, 着く, 乗る) phải dùng trợ từ に hoặc へ để chỉ đích đến."
                });
            }

            // E02 Check
            var m2 = E02PlaceDeNiRegex().Match(japaneseText);
            if (m2.Success)
            {
                issues.Add(new DetectedGrammarIssue
                {
                    Code = "E02_PLACE_DE_NI",
                    Title = "Nhầm trợ từ で và に cho nơi chốn",
                    Severity = "error",
                    MatchedSnippet = m2.Value,
                    SuggestedFix = m2.Value.Replace("で", "に"),
                    ExplanationVi = "Người Việt hay dịch từ 'ở' thành で. Tuy nhiên, nơi chốn sinh sống (住む) hoặc nơi chốn tồn tại (ある, いる) phải đi với trợ từ に. Trợ từ で chỉ nơi diễn ra hành động."
                });
            }

            // E03 Check
            var m3 = E03AnataOveruseRegex().Match(japaneseText);
            if (m3.Success)
            {
                issues.Add(new DetectedGrammarIssue
                {
                    Code = "E03_ANATA_OVERUSE",
                    Title = "Lạm dụng đại từ 'あなた' (Bạn/Mày)",
                    Severity = "warning",
                    MatchedSnippet = m3.Value,
                    SuggestedFix = "Nên gọi tên đối phương kèm 〜さん, hoặc lược bỏ chủ ngữ",
                    ExplanationVi = "Trong tiếng Nhật giao tiếp, gọi 'あなた' với người mới quen hoặc nhân viên dịch vụ tạo cảm giác xa cách, bề trên hoặc thất lễ. Hãy lược bỏ chủ ngữ hoặc gọi theo chức danh (店員さん, 先生)."
                });
            }

            // E04 Check
            var m4a = E04AnimateAruRegex().Match(japaneseText);
            if (m4a.Success)
            {
                issues.Add(new DetectedGrammarIssue
                {
                    Code = "E04_ANIMATE_ARU",
                    Title = "Dùng ある cho sinh vật sống (người, động vật)",
                    Severity = "error",
                    MatchedSnippet = m4a.Value,
                    SuggestedFix = m4a.Value.Replace("ある", "いる").Replace("あります", "います").Replace("あった", "いた"),
                    ExplanationVi = "Người và động vật di chuyển được phải dùng động từ tồn tại います (いる), không dùng あります (ある - chỉ đồ vật vô tri)."
                });
            }

            var m4b = E04InanimateIruRegex().Match(japaneseText);
            if (m4b.Success)
            {
                issues.Add(new DetectedGrammarIssue
                {
                    Code = "E04_INANIMATE_IRU",
                    Title = "Dùng いる cho đồ vật vô tri",
                    Severity = "error",
                    MatchedSnippet = m4b.Value,
                    SuggestedFix = m4b.Value.Replace("いる", "ある").Replace("います", "あります").Replace("いた", "あった"),
                    ExplanationVi = "Đồ vật vô tri (sách, xe, bút, bàn, tiền...) phải dùng động từ あります (ある), không dùng います."
                });
            }

            // E05 Check
            var m5 = E05ShitteiruDekiruRegex().Match(japaneseText);
            if (m5.Success)
            {
                issues.Add(new DetectedGrammarIssue
                {
                    Code = "E05_SHITTEIRU_DEKIRU",
                    Title = "Dùng 知っています thay vì できます cho khả năng/kỹ năng",
                    Severity = "warning",
                    MatchedSnippet = m5.Value,
                    SuggestedFix = m5.Value.Contains("日本語") ? "日本語が話せます / 日本語ができます" : "〜ができます",
                    ExplanationVi = "Trong tiếng Việt 'Tôi biết tiếng Nhật' có nghĩa là 'nói được tiếng Nhật'. Trong tiếng Nhật, 知っています chỉ có nghĩa biết sự tồn tại của thông tin đó. Để nói về kỹ năng/khả năng, hãy dùng できます hoặc thể khả năng."
                });
            }

            // E06 Check
            var m6 = E06TaDeshitaRegex().Match(japaneseText);
            if (m6.Success)
            {
                issues.Add(new DetectedGrammarIssue
                {
                    Code = "E06_TA_DESHITA",
                    Title = "Lỗi chồng thì quá khứ (*〜たでした)",
                    Severity = "error",
                    MatchedSnippet = m6.Value,
                    SuggestedFix = m6.Value.Replace("たでした", "ました").Replace("だでした", "でした"),
                    ExplanationVi = "Không dùng '〜たでした' sau động từ hoặc tính từ. Động từ quá khứ lịch sự là '〜ました' (VD: 行きました, không phải 行ったでした)."
                });
            }

            // E07 Check
            var m7 = E07WatashiNiAgemasuRegex().Match(japaneseText);
            if (m7.Success)
            {
                issues.Add(new DetectedGrammarIssue
                {
                    Code = "E07_WATASHI_NI_AGEMASU",
                    Title = "Nhầm あげます khi người khác tặng/cho mình",
                    Severity = "error",
                    MatchedSnippet = m7.Value,
                    SuggestedFix = m7.Value.Replace("あげ", "くれ"),
                    ExplanationVi = "Khi người khác cho hoặc tặng đồ cho bản thân mình (私に), bắt buộc phải dùng くれます (くれる), không dùng あげます (chỉ dùng khi mình tặng người khác)."
                });
            }

            // E08 Check
            var m8a = E08SonkeigoSelfRegex().Match(japaneseText);
            if (m8a.Success)
            {
                issues.Add(new DetectedGrammarIssue
                {
                    Code = "E08_SONKEIGO_SELF",
                    Title = "Dùng Tôn kính ngữ (Sonkeigo) cho chính bản thân mình",
                    Severity = "error",
                    MatchedSnippet = m8a.Value,
                    SuggestedFix = "Dùng Khiêm nhường ngữ (Kenjougo) như 参る, 申す, いたす",
                    ExplanationVi = "Tôn kính ngữ (いらっしゃる, おっしゃる, なさる...) chỉ dùng để tôn vinh hành động của đối phương, tuyệt đối không dùng cho hành động của bản thân mình."
                });
            }

            var m8b = E08KenjougoOtherRegex().Match(japaneseText);
            if (m8b.Success)
            {
                issues.Add(new DetectedGrammarIssue
                {
                    Code = "E08_KENJOUGO_OTHER",
                    Title = "Dùng Khiêm nhường ngữ (Kenjougo) cho đối phương bề trên",
                    Severity = "error",
                    MatchedSnippet = m8b.Value,
                    SuggestedFix = "Dùng Tôn kính ngữ (Sonkeigo) như いらっしゃる, おっしゃる",
                    ExplanationVi = "Khiêm nhường ngữ (参る, 申す, いただく...) chỉ dùng để hạ mình. Dùng cho khách hàng, giáo viên hay cấp trên sẽ bị coi là hạ thấp họ."
                });
            }

            // E09 Check
            var m9 = E09MissingDaKaraRegex().Match(japaneseText);
            if (m9.Success)
            {
                issues.Add(new DetectedGrammarIssue
                {
                    Code = "E09_MISSING_DA_KARA",
                    Title = "Thiếu だ / です trước から chỉ nguyên nhân",
                    Severity = "warning",
                    MatchedSnippet = m9.Value,
                    SuggestedFix = m9.Value.Replace("から", "だから / ですから"),
                    ExplanationVi = "Sau Danh từ và Tính từ đuôi な (như 便利, 暇, 静か, 雨...), khi nối với から chỉ lý do bắt buộc phải có だ (thể ngắn) hoặc です (thể lịch sự): 便利だから, 雨だから."
                });
            }

            return issues;
        }
    }
}
