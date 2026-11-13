using System.Text.RegularExpressions;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations;

public class RegisterAnalyzer : IRegisterAnalyzer
{
    private static readonly Regex SurvivalPhrasesRegex = new(
        @"(もう一度|もう一回|もういっかい|ゆっくり|聞き取れ|聞こえ|よく聞こえ|意味が|どういう意味|分かりません|わかりません|理解でき|もういちど|教えてください|ちょっと待って|恐れ入ります)|^[\s　]*(すみません|すいません|ちょっと|ええと|あのー|あのう)[…\.\s　]*$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex KeigoRegex = new(
        @"(ございます|でございます|かしこまりました|承知いたしました|承知しました|存じます|存じ上げ|存じており|申し上げます|お願いいたします|お願い致します|いらっしゃる|いらっしゃい|おっしゃる|おっしゃい|おっしゃいました|なさる|なさって|ご覧にな|ご存知|お召し上がり|お越し|参りま|申します|いたします|いただきました|いただきたい|拝見|伺いま|お伺い|お目にかか|わたくし|恐れ入り|頂戴|お[^\s]{1,4}になる|お[^\s]{1,4}ください|ご[^\s]{1,6}いただく|ご[^\s]{1,6}いたす)",
        RegexOptions.Compiled);

    private static readonly Regex TeineigoEndingRegex = new(
        @"(です|ます|でした|ました|ません|ませんでした|でしょうか|ですか|ますか|でしたか|ませんでしたか|ですね|ますね|でしたね|ましたね|ですよ|ますよ|でしたよ|ましたよ|ですよね|ますよね|ください|くださる|いただけ|いただき|ましょう|ましょうか|はい|ええ|いいえ|お願い|ありがとう)([ねよかなさの]?)$",
        RegexOptions.Compiled);

    private static readonly Regex TameguchiCasualPronounsRegex = new(
        @"(^|[\s、。])(俺|お前|あんた|こいつ|あいつ)|(俺|お前|あんた|こいつ|あいつ)",
        RegexOptions.Compiled);

    private static readonly Regex TameguchiEndingRegex = new(
        @"(だよ|だね|だな|だろ|じゃん|じゃない|だ|ね|よ|さ|ぜ|ぞ|わ|うん|ううん|嫌|いや|うまい|おいしい|いい|すごい|やばい|する|した|いる|いた|ある|あった|行く|いく|行った|いった|食べる|食べた|飲む|飲んだ|ない|なかった|わかった|分かった|な)$",
        RegexOptions.Compiled);

    public bool IsSurvivalPhrase(string utterance)
    {
        if (string.IsNullOrWhiteSpace(utterance)) return false;
        var clean = utterance.Trim();
        return SurvivalPhrasesRegex.IsMatch(clean);
    }

    public RegisterAnalysisResult Analyze(string utterance, int expectedRegister)
    {
        var targetRegister = expectedRegister switch
        {
            0 => JapaneseRegister.Tameguchi,
            2 => JapaneseRegister.Keigo,
            _ => JapaneseRegister.Teineigo
        };

        if (string.IsNullOrWhiteSpace(utterance))
        {
            return new RegisterAnalysisResult
            {
                DetectedRegister = JapaneseRegister.Neutral,
                ExpectedRegister = targetRegister,
                IsMatch = true,
                RegisterDelta = 0,
                IsSurvivalPhrase = false
            };
        }

        var trimmed = utterance.Trim().TrimEnd('。', '！', '？', '!', '?', '…', '.', ' ', '　');
        var isSurvival = IsSurvivalPhrase(trimmed);

        // Phát hiện cấp bậc thể văn thực tế của học viên
        var detected = DetectRegister(trimmed);

        // So sánh với cấp bậc kỳ vọng
        var delta = 0;
        var isMatch = true;
        string? tip = null;
        string? alternative = null;
        string? sumiStain = null;

        if (targetRegister == JapaneseRegister.Keigo)
        {
            if (detected == JapaneseRegister.Keigo)
            {
                delta = 0;
                isMatch = true;
            }
            else if (detected == JapaneseRegister.Teineigo)
            {
                delta = -1;
                isMatch = true; // Chấp nhận được trong hội thoại cơ bản
                tip = "Gợi ý: Trong tình huống trang trọng hoặc với cấp trên, bạn có thể nâng cấp từ です/ます lên Kính ngữ (Keigo) để chuyên nghiệp hơn.";
                alternative = "Ví dụ: dùng 'でございます' hoặc các cấu trúc kính ngữ 'お〜になります / いたします'.";
            }
            else if (detected == JapaneseRegister.Tameguchi)
            {
                delta = -2;
                isMatch = false;
                sumiStain = "RegisterError";
                tip = "Cảnh báo vai vế: Với cấp trên hoặc đối tác, không dùng thể thường (Tameguchi). Cần sử dụng Kính ngữ hoặc tối thiểu là です/ます.";
                alternative = "Đổi đuôi câu sang 〜でございます hoặc 〜ます/です.";
            }
        }
        else if (targetRegister == JapaneseRegister.Teineigo)
        {
            if (detected == JapaneseRegister.Keigo)
            {
                delta = +1;
                isMatch = true; // Kính ngữ cao cấp hơn lịch sự thông thường, rất tốt
            }
            else if (detected == JapaneseRegister.Teineigo)
            {
                delta = 0;
                isMatch = true;
            }
            else if (detected == JapaneseRegister.Tameguchi)
            {
                delta = -1;
                isMatch = false;
                sumiStain = "RegisterWarning";
                tip = "Gợi ý: Trong bối cảnh này, nên dùng thể lịch sự (〜です/〜ます) thay vì thể ngắn.";
                alternative = "Thêm 〜です vào sau tính từ/danh từ, hoặc chuyển động từ sang đuôi 〜ます.";
            }
        }
        else // Tameguchi (bạn bè, người thân, ngang hàng)
        {
            if (detected == JapaneseRegister.Tameguchi)
            {
                delta = 0;
                isMatch = true;
            }
            else if (detected == JapaneseRegister.Teineigo || detected == JapaneseRegister.Keigo)
            {
                delta = +1;
                isMatch = true; // Nói lịch sự không bị tính là lỗi ngữ pháp nhưng hơi khách sáo
                tip = "Gợi ý: Với bạn bè thân thiết, dùng thể ngắn (Tameguchi) sẽ gần gũi và tự nhiên hơn.";
                alternative = "Bỏ 〜です/ます và dùng thể từ điển hoặc đuôi câu thân mật như 〜だよ/〜ね.";
            }
        }

        return new RegisterAnalysisResult
        {
            DetectedRegister = detected,
            ExpectedRegister = targetRegister,
            IsMatch = isMatch,
            RegisterDelta = delta,
            IsSurvivalPhrase = isSurvival,
            SuggestedAlternative = alternative,
            FeedbackTip = tip,
            SumiInkIndicatorType = sumiStain
        };
    }

    private static JapaneseRegister DetectRegister(string text)
    {
        // 1. Đại từ thô lỗ hoặc suồng sã (俺, お前, あんた) luôn khiến câu bị tính là Tameguchi/lệch vai vế
        if (TameguchiCasualPronounsRegex.IsMatch(text))
        {
            return JapaneseRegister.Tameguchi;
        }

        // 2. Kính ngữ chuẩn (Sonkeigo, Kenjougo, Bikago)
        if (KeigoRegex.IsMatch(text))
        {
            return JapaneseRegister.Keigo;
        }

        // 3. Đuôi câu lịch sự chuẩn (Teineigo)
        if (TeineigoEndingRegex.IsMatch(text))
        {
            return JapaneseRegister.Teineigo;
        }

        // 4. Đuôi câu hoặc từ ngữ suồng sã / ngắn (Tameguchi)
        if (TameguchiEndingRegex.IsMatch(text))
        {
            return JapaneseRegister.Tameguchi;
        }

        // 5. Fallback kiểm tra trợ từ lịch sự lửng lơ hoặc ngắn
        if (text.EndsWith("です") || text.EndsWith("ます") || text.EndsWith("でした") || text.EndsWith("ました") || text.EndsWith("ません"))
        {
            return JapaneseRegister.Teineigo;
        }

        return JapaneseRegister.Neutral;
    }
}
