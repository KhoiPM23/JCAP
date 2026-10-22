using System.Text.RegularExpressions;
using JCAP.DTOs.Roleplay;
using JCAP.Models;

namespace JCAP.Services.Implementations;

public enum SocialRegisterType
{
    Elderly,          // Cụ già, người cao tuổi
    Interviewer,      // Phỏng vấn viên, nhà tuyển dụng, cấp trên
    ServiceStaff,     // AI là nhân viên quán/ga/khách sạn, học viên là khách hàng
    TeacherMentor,    // Thầy cô giáo, bác sĩ, chuyên gia
    PeerFriend,       // Bạn bè, đồng nghiệp, bạn cùng lớp
    GeneralPolite     // Bối cảnh giao tiếp lịch sự chuẩn mực chung
}

public sealed record RoleplaySocialRegister
{
    public SocialRegisterType RegisterType { get; init; } = SocialRegisterType.GeneralPolite;
    public string LearnerSelf { get; init; } = "tôi";
    public string LearnerAddressAi { get; init; } = "bạn";
    public string AiSelf { get; init; } = "tôi";
    public string AiAddressLearner { get; init; } = "bạn";
    public string RegisterDescription { get; init; } = string.Empty;
    public string CulturalTip { get; init; } = string.Empty;

    public static RoleplaySocialRegister Deduce(string? scenarioTitle, string? aiPersona, string? scenarioDescription)
    {
        var combined = $"{scenarioTitle} {aiPersona} {scenarioDescription}".ToLowerInvariant();

        // 1. Elderly / Người cao tuổi
        if (combined.Contains("cụ già") ||
            combined.Contains("người già") ||
            combined.Contains("ông lão") ||
            combined.Contains("bà lão") ||
            combined.Contains("băng qua đường") ||
            combined.Contains("sang đường") ||
            combined.Contains("cao tuổi") ||
            combined.Contains("lão") ||
            combined.Contains("お年寄り") ||
            combined.Contains("老人") ||
            combined.Contains("おじい") ||
            combined.Contains("おばあ") ||
            combined.Contains("高齢"))
        {
            return new RoleplaySocialRegister
            {
                RegisterType = SocialRegisterType.Elderly,
                LearnerSelf = "cháu",
                LearnerAddressAi = "cụ",
                AiSelf = "cụ",
                AiAddressLearner = "cháu",
                RegisterDescription = "Quan hệ tương trợ tôn kính với người lớn tuổi: Người học xưng là 'cháu' và gọi đối phương là 'cụ'. AI xưng là 'cụ' và gọi người học là 'cháu'. Tuyệt đối không dùng 'bạn' hay dấu xuyệt '/'.",
                CulturalTip = "Khi giao tiếp và hỗ trợ người lớn tuổi ở Nhật, dùng ngữ điệu ấm áp kèm các lời chúc như 'お気をつけて' (chúc đi cẩn thận) hoặc 'お大事に' (chúc giữ gìn sức khỏe) thể hiện tinh thần tương trợ và lòng hiếu lễ rất cao."
            };
        }

        // 2. Interviewer / Cấp trên / Tuyển dụng
        if (combined.Contains("phỏng vấn") ||
            combined.Contains("xin việc") ||
            combined.Contains("baito") ||
            combined.Contains("tuyển dụng") ||
            combined.Contains("sếp") ||
            combined.Contains("giám đốc") ||
            combined.Contains("quản lý") ||
            combined.Contains("tiền bối") ||
            combined.Contains("面接") ||
            combined.Contains("採用") ||
            combined.Contains("店長") ||
            combined.Contains("上司") ||
            combined.Contains("先輩"))
        {
            return new RoleplaySocialRegister
            {
                RegisterType = SocialRegisterType.Interviewer,
                LearnerSelf = "em",
                LearnerAddressAi = "anh",
                AiSelf = "tôi",
                AiAddressLearner = "em",
                RegisterDescription = "Quan hệ phỏng vấn tuyển dụng / cấp trên: Người học xưng là 'em' và gọi người phỏng vấn là 'anh'. AI xưng là 'tôi' và gọi ứng viên là 'em'. Tuyệt đối không dùng dấu xuyệt '/'.",
                CulturalTip = "Trong phỏng vấn xin việc ở Nhật, luôn dùng thể lịch sự desu/masu hoặc kính ngữ, duy trì ánh mắt tự tin, lưng thẳng và cúi chào đúng nghi thức."
            };
        }

        // 3. Teacher / Doctor / Chuyên gia
        if (combined.Contains("thầy") ||
            combined.Contains("cô giáo") ||
            combined.Contains("giáo viên") ||
            combined.Contains("bác sĩ") ||
            combined.Contains("khám bệnh") ||
            combined.Contains("bệnh viện") ||
            combined.Contains("先生") ||
            combined.Contains("医師") ||
            combined.Contains("医者"))
        {
            var isDoctor = combined.Contains("bác sĩ") || combined.Contains("khám") || combined.Contains("医師") || combined.Contains("医者");
            var aiTitle = isDoctor ? "bác sĩ" : "thầy";
            return new RoleplaySocialRegister
            {
                RegisterType = SocialRegisterType.TeacherMentor,
                LearnerSelf = "em",
                LearnerAddressAi = aiTitle,
                AiSelf = aiTitle,
                AiAddressLearner = "em",
                RegisterDescription = $"Quan hệ tôn sư trọng đạo / bác sĩ - bệnh nhân: Người học xưng là 'em' và gọi đối phương là '{aiTitle}'. AI xưng là '{aiTitle}' và gọi người học là 'em'. Tuyệt đối không dùng dấu xuyệt '/'.",
                CulturalTip = "Trong môi trường giáo dục hoặc y tế Nhật Bản, luôn sử dụng thể lịch sự trang trọng và chú ý lắng nghe lời dặn dò của người hướng dẫn."
            };
        }

        // 4. Service Staff / Nhân viên dịch vụ (AI là nhân viên quán/nhà ga/cửa hàng, Learner là khách)
        if (combined.Contains("quán") ||
            combined.Contains("nhà hàng") ||
            combined.Contains("tiệm") ||
            combined.Contains("ramen") ||
            combined.Contains("cà phê") ||
            combined.Contains("siêu thị") ||
            combined.Contains("cửa hàng") ||
            combined.Contains("khách sạn") ||
            combined.Contains("ga tàu") ||
            combined.Contains("nhân viên") ||
            combined.Contains("thu ngân") ||
            combined.Contains("bồi bàn") ||
            combined.Contains("店員") ||
            combined.Contains("駅員") ||
            combined.Contains("レジ") ||
            combined.Contains("注文"))
        {
            return new RoleplaySocialRegister
            {
                RegisterType = SocialRegisterType.ServiceStaff,
                LearnerSelf = "tôi",
                LearnerAddressAi = "bạn",
                AiSelf = "tôi",
                AiAddressLearner = "quý khách",
                RegisterDescription = "Quan hệ dịch vụ khách hàng: AI là nhân viên xưng là 'tôi' và gọi người học là 'quý khách'. Người học xưng là 'tôi' và gọi nhân viên là 'bạn'. Tuyệt đối không dùng dấu xuyệt '/'.",
                CulturalTip = "Tại các cửa hàng và nhà hàng Nhật Bản, văn hóa Omotenashi coi khách hàng là trọng tâm. Khi gọi món hoặc nhờ hỗ trợ, khách nên dùng ください hoặc お願いします để giữ phép lịch thiệp."
            };
        }

        // 5. Peer / Friend / Đồng nghiệp / Bạn cùng lớp
        if (combined.Contains("bạn bè") ||
            combined.Contains("bạn cùng lớp") ||
            combined.Contains("đồng nghiệp") ||
            combined.Contains("友達") ||
            combined.Contains("同僚") ||
            combined.Contains("クラスメイト"))
        {
            return new RoleplaySocialRegister
            {
                RegisterType = SocialRegisterType.PeerFriend,
                LearnerSelf = "mình",
                LearnerAddressAi = "cậu",
                AiSelf = "mình",
                AiAddressLearner = "cậu",
                RegisterDescription = "Quan hệ bạn bè / đồng cấp thân thiện: Người học xưng là 'mình' và gọi bạn là 'cậu'. AI xưng là 'mình' và gọi người học là 'cậu'. Tuyệt đối không dùng dấu xuyệt '/'.",
                CulturalTip = "Trong giao tiếp thân mật với bạn bè hoặc bạn đồng trang lứa, người Nhật thường dùng thể thân mật (tameguchi) và các câu cảm thán tự nhiên."
            };
        }

        // 6. Default / Lịch sự chuẩn mực
        return new RoleplaySocialRegister
        {
            RegisterType = SocialRegisterType.GeneralPolite,
            LearnerSelf = "tôi",
            LearnerAddressAi = "bạn",
            AiSelf = "tôi",
            AiAddressLearner = "bạn",
            RegisterDescription = "Quan hệ giao tiếp lịch sự chuẩn mực: Người học xưng là 'tôi' và gọi đối phương là 'bạn'. AI xưng là 'tôi' và gọi người học là 'bạn'. Tuyệt đối không dùng dấu xuyệt '/'.",
            CulturalTip = "Trong giao tiếp tiếng Nhật thường ngày, sử dụng câu ngắn gọn, rõ ràng và thể lịch sự です/ます sẽ giúp đối phương nắm bắt thông điệp dễ dàng nhất."
        };
    }

    public static string TranslateUserUtterance(string userMessage, RoleplaySocialRegister reg)
    {
        if (string.IsNullOrWhiteSpace(userMessage)) return string.Empty;

        var lower = userMessage.Trim().ToLowerInvariant();

        // 1. Phản hồi cảm ơn + Chúc đi lại cẩn thận + Chúc sức khỏe
        if (lower.Contains("どういたしまして") && (lower.Contains("お気をつけて") || lower.Contains("気をつけて")) && (lower.Contains("お大事に") || lower.Contains("だいじに")))
        {
            return $"Dạ không có gì đâu ạ. Chúc {reg.LearnerAddressAi} đi lại cẩn thận và giữ gìn sức khỏe nhé ạ.";
        }

        // 2. Không có gì + Chúc đi cẩn thận
        if (lower.Contains("どういたしまして") && (lower.Contains("お気をつけて") || lower.Contains("気をつけて")))
        {
            return $"Dạ không có gì đâu ạ. Chúc {reg.LearnerAddressAi} đi lại cẩn thận nhé ạ.";
        }

        // 3. Chúc đi lại cẩn thận
        if (lower.Contains("お気をつけて") || lower.Contains("気をつけて"))
        {
            if (lower.Contains("お帰り") || lower.Contains("かえり"))
                return $"Chúc {reg.LearnerAddressAi} đi về cẩn thận nhé ạ.";
            if (lower.Contains("お大事に") || lower.Contains("だいじに"))
                return $"Chúc {reg.LearnerAddressAi} đi lại cẩn thận và giữ gìn sức khỏe nhé ạ.";
            return $"Chúc {reg.LearnerAddressAi} đi lại cẩn thận nhé ạ.";
        }

        // 4. Không có gì
        if (lower.Contains("どういたしまして"))
        {
            return "Dạ không có gì đâu ạ.";
        }

        // 5. Chúc giữ gìn sức khỏe / mau khỏe
        if (lower.Contains("お大事に") || lower.Contains("おだいじに"))
        {
            return $"Chúc {reg.LearnerAddressAi} mau khỏe và giữ gìn sức khỏe nhé ạ.";
        }

        // 6. Sẵn lòng giúp đỡ / Cùng đi
        if (lower.Contains("喜んで") && (lower.Contains("手伝") || lower.Contains("てつだ")))
        {
            if (lower.Contains("渡りましょう") || lower.Contains("わたりましょう"))
                return $"Vâng, {reg.LearnerSelf} rất sẵn lòng giúp đỡ ạ. Chúng ta cùng sang đường nhé {reg.LearnerAddressAi}.";
            return $"Vâng, {reg.LearnerSelf} rất sẵn lòng giúp {reg.LearnerAddressAi} một tay ạ.";
        }

        // 7. Hỏi điểm đến / hướng đi
        if (lower.Contains("どちらまで") && (lower.Contains("行かれ") || lower.Contains("いきます") || lower.Contains("いく")))
        {
            if (lower.Contains("手伝い") || lower.Contains("てつだい"))
                return $"{reg.LearnerAddressAi} định đi đến đâu vậy ạ? Để {reg.LearnerSelf} giúp {reg.LearnerAddressAi} nhé.";
            return $"{reg.LearnerAddressAi} định đi đến đâu vậy ạ?";
        }

        // 8. Đề nghị giúp đỡ
        if (lower.Contains("手伝いましょうか") || lower.Contains("てつだいましょうか"))
        {
            return $"Để {reg.LearnerSelf} giúp {reg.LearnerAddressAi} một tay nhé ạ?";
        }

        if (lower.Contains("手伝") || lower.Contains("てつだ") || lower.Contains("助け"))
        {
            return $"{reg.LearnerSelf} muốn giúp đỡ {reg.LearnerAddressAi} ạ.";
        }

        // 9. Chào hỏi ban đầu
        if (lower.Contains("こんにちは"))
        {
            return $"Xin chào {reg.LearnerAddressAi} ạ.";
        }

        if (lower.Contains("はじめまして"))
        {
            return $"Rất vui được gặp {reg.LearnerAddressAi} lần đầu ạ.";
        }

        if (lower.Contains("よろしくお願") || lower.Contains("よろしくおねがい") || lower.Contains("よろしくお願いします"))
        {
            return $"Rất mong nhận được sự giúp đỡ của {reg.LearnerAddressAi} ạ.";
        }

        // 10. Cảm ơn
        if (lower.Contains("ありがとうございます") || lower.Contains("ありがとう"))
        {
            return $"Cảm ơn {reg.LearnerAddressAi} rất nhiều ạ.";
        }

        // 11. Xin phép / Tạm biệt
        if (lower.Contains("失礼します") || lower.Contains("失礼いたします") || lower.Contains("しつれい"))
        {
            return $"{reg.LearnerSelf} xin phép chào {reg.LearnerAddressAi} ạ.";
        }

        if (lower.Contains("さようなら"))
        {
            return $"Tạm biệt {reg.LearnerAddressAi} ạ.";
        }

        // 12. Quán ăn / Dịch vụ
        if (lower.Contains("ごちそうさま"))
        {
            return "Cảm ơn vì bữa ăn rất ngon ạ.";
        }

        if (lower.Contains("ラーメン") && (lower.Contains("お願いします") || lower.Contains("ください") || lower.Contains("一杯")))
        {
            return $"Làm ơn cho {reg.LearnerSelf} một bát mì Ramen ạ.";
        }

        if (lower.Contains("いくら") || lower.Contains("値段"))
        {
            return "Món này giá bao nhiêu tiền vậy ạ?";
        }

        if (lower.Contains("会計") || lower.Contains("お会計"))
        {
            return $"Làm ơn cho {reg.LearnerSelf} thanh toán tiền ạ.";
        }

        // 13. Sang đường
        if (lower.Contains("渡") || lower.Contains("わた"))
        {
            return $"Chúng ta cùng sang đường nhé {reg.LearnerAddressAi}.";
        }

        return $"Câu đối thoại lịch sự bằng tiếng Nhật gửi đến {reg.LearnerAddressAi}.";
    }

    public static AiOpeningMessageResult GenerateOpeningMessage(Scenario scenario, ScenarioLevelConfiguration levelConfig)
    {
        var reg = Deduce(scenario.Title, levelConfig.AiPersona, levelConfig.Description);

        switch (reg.RegisterType)
        {
            case SocialRegisterType.Elderly:
                return new AiOpeningMessageResult
                {
                    JapaneseText = "あのう、すみません。足が悪くて、向こう側まで渡りたいのですが、手伝っていただけないでしょうか。",
                    FuriganaHtml = "あのう、すみません。<ruby>足<rt>あし</rt></ruby>が<ruby>悪<rt>わる</rt></ruby>くて、<ruby>向<rt>む</rt></ruby>こう<ruby>側<rt>がわ</rt></ruby>まで<ruby>渡<rt>わた</rt></ruby>りたいのですが、<ruby>手伝<rt>てつだ</rt></ruby>っていただけないでしょうか。",
                    VietnameseMeaning = $"Xin lỗi, chân {reg.AiSelf} đau và {reg.AiSelf} muốn băng sang bên kia đường, {reg.AiAddressLearner} có thể giúp {reg.AiSelf} được không?"
                };

            case SocialRegisterType.ServiceStaff:
                return new AiOpeningMessageResult
                {
                    JapaneseText = "いらっしゃいませ！何名様ですか？",
                    FuriganaHtml = "いらっしゃいませ！<ruby>何名様<rt>なんめいさま</rt></ruby>ですか？",
                    VietnameseMeaning = $"Kính chào {reg.AiAddressLearner}! {reg.AiAddressLearner} đi mấy người ạ?"
                };

            case SocialRegisterType.Interviewer:
                return new AiOpeningMessageResult
                {
                    JapaneseText = "ご応募ありがとうございます。本日の面接を担当いたします。どうぞお座りください。",
                    FuriganaHtml = "ご<ruby>応募<rt>おうぼ</rt></ruby>ありがとうございます。<ruby>本日<rt>ほんじつ</rt></ruby>の<ruby>面接<rt>めんせつ</rt></ruby>を<ruby>担当<rt>たんとう</rt></ruby>いたします。どうぞお<ruby>座<rt>すわ</rt></ruby>りください。",
                    VietnameseMeaning = $"Cảm ơn {reg.AiAddressLearner} đã ứng tuyển. {reg.AiSelf} phụ trách buổi phỏng vấn hôm nay. Xin mời {reg.AiAddressLearner} ngồi."
                };

            case SocialRegisterType.TeacherMentor:
                return new AiOpeningMessageResult
                {
                    JapaneseText = "こんにちは。本日のレッスンを始めましょう。よろしくお願いします。",
                    FuriganaHtml = "こんにちは。<ruby>本日<rt>ほんじつ</rt></ruby>のレッスンを<ruby>始<rt>はじ</rt></ruby>めましょう。よろしくお<ruby>願<rt>ねが</rt></ruby>いします。",
                    VietnameseMeaning = $"Chào {reg.AiAddressLearner}. Chúng ta cùng bắt đầu buổi học hôm nay nhé."
                };

            case SocialRegisterType.PeerFriend:
                return new AiOpeningMessageResult
                {
                    JapaneseText = "あ、こんにちは！会えて嬉しいよ。調子はどう？",
                    FuriganaHtml = "あ、こんにちは！<ruby>会<rt>あ</rt></ruby>えて<ruby>嬉<rt>うれ</rt></ruby>しいよ。<ruby>調子<rt>ちょうし</rt></ruby>はどう？",
                    VietnameseMeaning = $"A, chào {reg.AiAddressLearner}! Gặp {reg.AiAddressLearner} vui quá. Dạo này thế nào rồi?"
                };

            default:
                return new AiOpeningMessageResult
                {
                    JapaneseText = $"こんにちは。本日の{scenario.Title}を始めましょう。よろしくお願いします。",
                    FuriganaHtml = $"こんにちは。<ruby>本日<rt>ほんじつ</rt></ruby>の{scenario.Title}を<ruby>始<rt>はじ</rt></ruby>めましょう。よろしくお<ruby>願<rt>ねが</rt></ruby>いします。",
                    VietnameseMeaning = $"Xin chào {reg.AiAddressLearner}. Chúng ta hãy bắt đầu bài luyện tập {scenario.Title}. Rất mong được đồng hành cùng {reg.AiAddressLearner}."
                };
        }
    }

    public static RoleplayHintDto GenerateHint(ScenarioLevelConfiguration levelConfig, List<Mission> pendingMissions)
    {
        var title = levelConfig?.Scenario?.Title ?? string.Empty;
        var persona = levelConfig?.AiPersona ?? string.Empty;
        var desc = levelConfig?.Description ?? string.Empty;
        var reg = Deduce(title, persona, desc);

        var nextMission = pendingMissions.OrderBy(m => m.Order).FirstOrDefault();
        if (nextMission != null)
        {
            var criteria = (nextMission.CompletionCriteriaJson + " " + nextMission.Content).ToLowerInvariant();

            if (criteria.Contains("giúp") || criteria.Contains("help") || criteria.Contains("đề nghị") || criteria.Contains("hỗ trợ"))
            {
                return new RoleplayHintDto
                {
                    JapaneseSuggestion = "はい、喜んでお手伝いします。一緒に渡りましょう。",
                    RomajiOrReading = "Hai, yorokonde otetsudai shimasu. Issho ni watarimashou.",
                    VietnameseMeaning = $"Vâng, {reg.LearnerSelf} rất sẵn lòng giúp đỡ ạ. Chúng ta cùng sang đường nhé {reg.LearnerAddressAi}.",
                    ContextExplanation = $"Cách đề nghị giúp đỡ nhiệt tình, lịch sự phù hợp với {reg.LearnerAddressAi}."
                };
            }

            if (criteria.Contains("hướng") || criteria.Contains("điểm đến") || criteria.Contains("direction") || criteria.Contains("đâu"))
            {
                return new RoleplayHintDto
                {
                    JapaneseSuggestion = "どちらまで行かれますか。お手伝いしましょうか。",
                    RomajiOrReading = "Dochira made ikaremasu ka. Otetsudai shimashou ka.",
                    VietnameseMeaning = $"{reg.LearnerAddressAi} định đi đến đâu vậy ạ? Để {reg.LearnerSelf} giúp {reg.LearnerAddressAi} nhé.",
                    ContextExplanation = "Hỏi điểm đến bằng kính ngữ tôn kính (ikaremasu ka)."
                };
            }

            if (criteria.Contains("chào") || criteria.Contains("greet") || criteria.Contains("giới thiệu") || criteria.Contains("intro"))
            {
                return new RoleplayHintDto
                {
                    JapaneseSuggestion = "はじめまして。よろしくお願いします。",
                    RomajiOrReading = "Hajimemashite. Yoroshiku onegaishimasu.",
                    VietnameseMeaning = $"Rất vui được gặp {reg.LearnerAddressAi} lần đầu. Rất mong được {reg.LearnerAddressAi} giúp đỡ ạ.",
                    ContextExplanation = "Chào hỏi chuẩn mực khi bắt đầu đối thoại."
                };
            }

            if (criteria.Contains("tạm biệt") || criteria.Contains("kết thúc") || criteria.Contains("cảm ơn") || criteria.Contains("bye"))
            {
                if (reg.RegisterType == SocialRegisterType.Elderly)
                {
                    return new RoleplayHintDto
                    {
                        JapaneseSuggestion = "いいえ、どういたしまして。お気をつけてお大事に。",
                        RomajiOrReading = "Iie, dou itashimashite. O ki wo tsukete odaiji ni.",
                        VietnameseMeaning = $"Dạ không có gì đâu ạ. Chúc {reg.LearnerAddressAi} đi lại cẩn thận và giữ gìn sức khỏe nhé ạ.",
                        ContextExplanation = "Lời đáp lại lời cảm ơn và lời chúc lễ phép, ấm áp dành cho người già."
                    };
                }

                return new RoleplayHintDto
                {
                    JapaneseSuggestion = "どうもありがとうございました。失礼いたします。",
                    RomajiOrReading = "Doumo arigatou gozaimashita. Shitsurei itashimasu.",
                    VietnameseMeaning = $"Cảm ơn {reg.LearnerAddressAi} rất nhiều. {reg.LearnerSelf} xin phép chào {reg.LearnerAddressAi} ạ.",
                    ContextExplanation = "Lời chào tạm biệt và cảm ơn chuẩn mực trong giao tiếp tiếng Nhật."
                };
            }

            if (criteria.Contains("price") || criteria.Contains("giá") || criteria.Contains("order") || criteria.Contains("gọi món"))
            {
                return new RoleplayHintDto
                {
                    JapaneseSuggestion = "すみません、これはいくらですか？",
                    RomajiOrReading = "Sumimasen, kore wa ikura desu ka?",
                    VietnameseMeaning = "Xin lỗi, món này bao nhiêu tiền vậy ạ?",
                    ContextExplanation = "Hỏi giá tiền một cách lịch sự bằng thể Desu ka."
                };
            }
        }

        return new RoleplayHintDto
        {
            JapaneseSuggestion = "はい、わかりました。よろしくお願いします。",
            RomajiOrReading = "Hai, wakarimashita. Yoroshiku onegaishimasu.",
            VietnameseMeaning = $"Vâng, {reg.LearnerSelf} đã hiểu rõ. Rất mong được {reg.LearnerAddressAi} giúp đỡ.",
            ContextExplanation = "Mẫu câu hồi đáp đồng ý và hợp tác lịch sự."
        };
    }

    public static AiTurnResult ProcessGenericTurn(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        string userMessage,
        List<Mission> pendingMissions)
    {
        var reg = Deduce(scenario?.Title, levelConfig?.AiPersona, levelConfig?.Description);
        var lowerMsg = userMessage.Trim().ToLowerInvariant();
        var completedIds = new List<int>();

        var orderedPending = pendingMissions.OrderBy(m => m.Order).ToList();
        var nextMission = orderedPending.FirstOrDefault();

        // Semantic matching against active pending mission
        if (nextMission != null)
        {
            var criteria = (nextMission.CompletionCriteriaJson + " " + nextMission.Content).ToLowerInvariant();
            var isMatched = false;

            if (criteria.Contains("tạm biệt") || criteria.Contains("kết thúc") || criteria.Contains("cảm ơn") || criteria.Contains("bye") || criteria.Contains("goodbye") || criteria.Contains("rời") || criteria.Contains("thanh toán"))
            {
                isMatched = lowerMsg.Contains("ありがとう") || lowerMsg.Contains("どういたしまして") || lowerMsg.Contains("お気をつけて") || lowerMsg.Contains("気をつけて") || lowerMsg.Contains("お大事に") || lowerMsg.Contains("失礼") || lowerMsg.Contains("さようなら") || lowerMsg.Contains("会計") || lowerMsg.Contains("ごちそう") || lowerMsg.Contains("では");
            }
            else if (criteria.Contains("chào") || criteria.Contains("greet") || criteria.Contains("intro") || criteria.Contains("giới thiệu"))
            {
                isMatched = lowerMsg.Contains("こんにちは") || lowerMsg.Contains("はじめまして") || lowerMsg.Contains("よろしく") || lowerMsg.Contains("です") || lowerMsg.Contains("申します") || lowerMsg.Contains("手伝") || lowerMsg.Contains("てつだ") || lowerMsg.Contains("大丈夫");
            }
            else if (criteria.Contains("giúp") || criteria.Contains("help") || criteria.Contains("hỗ trợ") || criteria.Contains("đề nghị"))
            {
                isMatched = lowerMsg.Contains("手伝") || lowerMsg.Contains("てつだ") || lowerMsg.Contains("助け") || lowerMsg.Contains("一緒") || lowerMsg.Contains("渡") || lowerMsg.Contains("大丈夫") || lowerMsg.Contains("喜んで");
            }
            else if (criteria.Contains("hướng") || criteria.Contains("điểm đến") || criteria.Contains("direction") || criteria.Contains("đâu") || criteria.Contains("hỏi"))
            {
                isMatched = lowerMsg.Contains("どちら") || lowerMsg.Contains("どこ") || lowerMsg.Contains("行") || lowerMsg.Contains("向こう") || lowerMsg.Contains("病院") || lowerMsg.Contains("駅") || lowerMsg.Contains("方向") || lowerMsg.Contains("ですか") || lowerMsg.Contains("なん");
            }
            else if (criteria.Contains("order") || criteria.Contains("ramen") || criteria.Contains("gọi món") || criteria.Contains("món"))
            {
                isMatched = lowerMsg.Contains("ラーメン") || lowerMsg.Contains("とんこつ") || lowerMsg.Contains("おねがい") || lowerMsg.Contains("ください") || lowerMsg.Contains("一杯") || lowerMsg.Contains("注文");
            }
            else if (criteria.Contains("price") || criteria.Contains("giá") || criteria.Contains("tiền"))
            {
                isMatched = lowerMsg.Contains("いくら") || lowerMsg.Contains("円") || lowerMsg.Contains("値段");
            }
            else if (criteria.Contains("ngày") || criteria.Contains("tuần") || criteria.Contains("ca") || criteria.Contains("shift") || criteria.Contains("thời gian"))
            {
                isMatched = lowerMsg.Contains("日") || lowerMsg.Contains("週") || lowerMsg.Contains("曜日") || lowerMsg.Contains("シフト") || lowerMsg.Contains("午後") || lowerMsg.Contains("午前") || lowerMsg.Contains("時間");
            }
            else
            {
                // Fallback Japanese utterance check (>= 3 chars)
                isMatched = Regex.IsMatch(userMessage, @"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]") && userMessage.Trim().Length >= 3;
            }

            if (isMatched)
            {
                completedIds.Add(nextMission.Id);
            }
        }

        var isNaturallyConcluded = false;
        string jaReply;
        string fHtmlReply;
        string viMeaning;

        var remainingCount = pendingMissions.Count - completedIds.Count;

        if (remainingCount <= 0 && completedIds.Count > 0)
        {
            isNaturallyConcluded = true;

            switch (reg.RegisterType)
            {
                case SocialRegisterType.Elderly:
                    jaReply = "本当にありがとうね。あなたのような親切な人に出会えて嬉しいよ。気をつけて帰ってね。";
                    fHtmlReply = "<ruby>本当<rt>ほんとう</rt></ruby>にありがとうね。あなたのような<ruby>親切<rt>しんせつ</rt></ruby>な<ruby>人<rt>ひと</rt></ruby>に<ruby>出会<rt>であ</rt></ruby>えて<ruby>嬉<rt>うれ</rt></ruby>しいよ。<ruby>気<rt>き</rt></ruby>をつけて<ruby>帰<rt>かえ</rt></ruby>ってね。";
                    viMeaning = $"{reg.AiSelf} thực sự cảm ơn {reg.AiAddressLearner} nhiều lắm. Rất vui vì gặp được người tốt bụng như {reg.AiAddressLearner}. {reg.AiAddressLearner} đi về cẩn thận nhé.";
                    break;

                case SocialRegisterType.ServiceStaff:
                    jaReply = "ありがとうございました！またのお越しを心よりお待ちしております。";
                    fHtmlReply = "ありがとうございました！またのお<ruby>越<rt>こ</rt></ruby>しを<ruby>心<rt>こころ</rt></ruby>よりお<ruby>待<rt>ま</rt></ruby>ちしております。";
                    viMeaning = $"Cảm ơn {reg.AiAddressLearner} rất nhiều! Hẹn gặp lại {reg.AiAddressLearner} lần sau ạ.";
                    break;

                case SocialRegisterType.Interviewer:
                    jaReply = "本日の面接は終了となります。お疲れ様でした。選考結果は後日ご連絡いたします。";
                    fHtmlReply = "<ruby>本日<rt>ほんじつ</rt></ruby>の<ruby>面接<rt>めんせつ</rt></ruby>は<ruby>終了<rt>しゅうりょう</rt></ruby>となります。お<ruby>疲<rt>つか</rt></ruby>れ<ruby>様<rt>さま</rt></ruby>でした。<ruby>選考結果<rt>せんこうけっか</rt></ruby>は<ruby>後日<rt>ごじつ</rt></ruby>ご<ruby>連絡<rt>れんらく</rt></ruby>いたします。";
                    viMeaning = $"Buổi phỏng vấn hôm nay đến đây là kết thúc. Cảm ơn {reg.AiAddressLearner} rất nhiều. Kết quả sẽ được thông báo sớm nhất đến {reg.AiAddressLearner}.";
                    break;

                default:
                    jaReply = "丁寧にご対応いただき、誠にありがとうございました。本日の練習はこれで終了です。大変よくできました！";
                    fHtmlReply = "<ruby>丁寧<rt>ていねい</rt></ruby>にご<ruby>対応<rt>たいおう</rt></ruby>いただき、<ruby>誠<rt>まこと</rt></ruby>にありがとうございました。<ruby>本日<rt>ほんじつ</rt></ruby>の<ruby>練習<rt>れんしゅう</rt></ruby>はこれで<ruby>終了<rt>しゅうりょう</rt></ruby>です。<ruby>大変<rt>たいへん</rt></ruby>よくできました！";
                    viMeaning = $"Cảm ơn {reg.AiAddressLearner} rất nhiều vì đã trao đổi rất chu đáo và lịch sự. Bài luyện tập hôm nay đến đây là hoàn thành xuất sắc!";
                    break;
            }
        }
        else
        {
            // Conversation is still progressing
            var nextPendingAfterTurn = orderedPending.FirstOrDefault(m => !completedIds.Contains(m.Id));
            var nextCriteria = nextPendingAfterTurn != null
                ? (nextPendingAfterTurn.CompletionCriteriaJson + " " + nextPendingAfterTurn.Content).ToLowerInvariant()
                : string.Empty;

            if (reg.RegisterType == SocialRegisterType.Elderly)
            {
                if (nextCriteria.Contains("hướng") || nextCriteria.Contains("điểm đến") || nextCriteria.Contains("đâu"))
                {
                    jaReply = "ありがとうございます。目の前にある病院まで行きたいんです。本当に助かります。";
                    fHtmlReply = "ありがとうございます。<ruby>目<rt>め</rt></ruby>の<ruby>前<rt>まえ</rt></ruby>にある<ruby>病院<rt>びょういん</rt></ruby>まで<ruby>行<rt>い</rt></ruby>きたいんです。<ruby>本当<rt>ほんとう</rt></ruby>に<ruby>助<rt>たす</rt></ruby>かります。";
                    viMeaning = $"Cảm ơn {reg.AiAddressLearner}. {reg.AiSelf} muốn đến bệnh viện ngay trước mặt kia. {reg.AiSelf} thực sự rất biết ơn {reg.AiAddressLearner}.";
                }
                else
                {
                    jaReply = "ありがとうございます。では、あちらの横断歩道まで、ゆっくりお願いしますね。";
                    fHtmlReply = "ありがとうございます。では、あちらの<ruby>横断歩道<rt>おうだんほどう</rt></ruby>まで、ゆっくりお<ruby>願<rt>ねが</rt></ruby>いしますね。";
                    viMeaning = $"Cảm ơn {reg.AiAddressLearner} rất nhiều. Vậy nhờ {reg.AiAddressLearner} đi chậm chậm đến vạch sang đường đằng kia cùng {reg.AiSelf} nhé.";
                }
            }
            else if (reg.RegisterType == SocialRegisterType.ServiceStaff)
            {
                if (lowerMsg.Contains("いくら") || lowerMsg.Contains("値段"))
                {
                    jaReply = "こちらは一杯850円でございます。";
                    fHtmlReply = "こちらは<ruby>一杯<rt>いっぱい</rt></ruby>850<ruby>円<rt>えん</rt></ruby>でございます。";
                    viMeaning = $"Dạ món này có giá là 850 yên ạ.";
                }
                else if (lowerMsg.Contains("ラーメン") || lowerMsg.Contains("注文") || lowerMsg.Contains("おねがい") || lowerMsg.Contains("ください"))
                {
                    jaReply = "かしこまりました！ご注文内容を確かに承りました。少々お待ちくださいませ。他にご注文はございますか？";
                    fHtmlReply = "かしこまりました！ご<ruby>注文内容<rt>ちゅうもんないよう</rt></ruby>を<ruby>確<rt>たし</rt></ruby>かに<ruby>承<rt>うけたまわ</rt></ruby>りました。<ruby>少々<rt>しょうしょう</rt></ruby>お<ruby>待<rt>ま</rt></ruby>ちくださいませ。<ruby>他<rt>ほか</rt></ruby>にご<ruby>注文<rt>ちゅうもん</rt></ruby>はございますか？";
                    viMeaning = $"Dạ {reg.AiSelf} đã ghi nhận yêu cầu của {reg.AiAddressLearner}. Xin {reg.AiAddressLearner} vui lòng đợi một lát. {reg.AiAddressLearner} còn muốn gọi thêm gì nữa không ạ?";
                }
                else
                {
                    jaReply = "はい、かしこまりました。他にご要望がございましたらお申し付けください。";
                    fHtmlReply = "はい、かしこまりました。<ruby>他<rt>ほか</rt></ruby>にご<ruby>要望<rt>ようぼう</rt></ruby>がございましたらお<ruby>申<rt>もう</rt></ruby>し<ruby>付<rt>つ</rt></ruby>けください。";
                    viMeaning = $"Dạ vâng {reg.AiSelf} đã hiểu rõ. Nếu {reg.AiAddressLearner} có thêm yêu cầu gì xin vui lòng cứ bảo {reg.AiSelf} nhé.";
                }
            }
            else if (reg.RegisterType == SocialRegisterType.Interviewer)
            {
                if (nextCriteria.Contains("ngày") || nextCriteria.Contains("ca") || nextCriteria.Contains("tuần") || nextCriteria.Contains("thời gian"))
                {
                    jaReply = "ご応募ありがとうございます。早速ですが、週に何日くらい、何曜日にシフトに入れますか？";
                    fHtmlReply = "ご<ruby>応募<rt>おうぼ</rt></ruby>ありがとうございます。<ruby>早速<rt>さっそく</rt></ruby>ですが、<ruby>週<rt>しゅう</rt></ruby>に<ruby>何日<rt>なんにち</rt></ruby>くらい、<ruby>何曜日<rt>なんようび</rt></ruby>にシフトに<ruby>入<rt>はい</rt></ruby>れますか？";
                    viMeaning = $"Cảm ơn {reg.AiAddressLearner} đã ứng tuyển. {reg.AiSelf} bắt đầu nhé, một tuần {reg.AiAddressLearner} có thể làm việc khoảng mấy ngày và vào những thứ mấy?";
                }
                else
                {
                    jaReply = "承知いたしました。シフトの希望はよくわかりました。最後に、志望動機をお聞かせいただけますか？";
                    fHtmlReply = "<ruby>承知<rt>しょうち</rt></ruby>いたしました。シフトの<ruby>希望<rt>きぼう</rt></ruby>はよくわかりました。<ruby>最後<rt>さいご</rt></ruby>に、<ruby>志望動機<rt>しぼうどうき</rt></ruby>をお<ruby>聞<rt>き</rt></ruby>かせいただけますか？";
                    viMeaning = $"{reg.AiSelf} hiểu rồi. Nguyện vọng ca làm việc rất rõ ràng. Cuối cùng, {reg.AiAddressLearner} có thể chia sẻ lý do ứng tuyển được không?";
                }
            }
            else
            {
                jaReply = "はい、承知いたしました。続けて会話を進めましょう。";
                fHtmlReply = "はい、<ruby>承知<rt>しょうち</rt></ruby>いたしました。<ruby>続<rt>つづ</rt></ruby>けて<ruby>会話<rt>かいわ</rt></ruby>を<ruby>進<rt>すす</rt></ruby>めましょう。";
                viMeaning = $"Vâng, {reg.AiSelf} đã hiểu rõ. Chúng ta cùng tiếp tục câu chuyện nhé {reg.AiAddressLearner}.";
            }
        }

        var userViMeaning = TranslateUserUtterance(userMessage, reg);
        var userFuriganaHtml = GenerateFuriganaHtml(userMessage);

        var naturalAlt = userMessage;
        if (reg.RegisterType == SocialRegisterType.Elderly && lowerMsg.Contains("いいえ") && lowerMsg.Contains("どういたしまして"))
        {
            naturalAlt = "いえいえ、どういたしまして。お気をつけてお帰りくださいね。";
        }

        var feedback = new LinguisticFeedbackDto
        {
            EvaluationSource = "Simulator",
            Status = "Good",
            Summary = "Phản xạ tự nhiên • Đúng ngữ cảnh",
            Details = new List<LinguisticDetailItemDto>
            {
                new() { Type = "success", Aspect = "Ngữ cảnh", Comment = $"Câu trả lời rất tự nhiên và phù hợp với vai vế giao tiếp cùng {reg.LearnerAddressAi}." },
                new() { Type = "success", Aspect = "Văn phong", Comment = "Sử dụng thể lịch sự chuẩn mực, thể hiện thái độ chu đáo và lễ phép." },
                new() { Type = "success", Aspect = "Từ vựng & Trợ từ", Comment = "Sử dụng từ vựng chính xác, cấu trúc câu gãy gọn rõ ràng." }
            },
            NaturalAlternative = naturalAlt,
            CulturalTip = reg.CulturalTip
        };

        return new AiTurnResult
        {
            JapaneseReply = jaReply,
            FuriganaHtml = fHtmlReply,
            VietnameseMeaning = viMeaning,
            UserVietnameseMeaning = userViMeaning,
            UserFuriganaHtml = userFuriganaHtml,
            CompletedMissionIds = completedIds,
            IsNaturallyConcluded = isNaturallyConcluded,
            LinguisticFeedback = feedback
        };
    }

    /// <summary>
    /// Tạo Furigana HTML cho các từ vựng chữ Hán thông dụng trong câu của người học
    /// </summary>
    public static string GenerateFuriganaHtml(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return text;

        var furiganaMap = new (string Word, string Ruby)[]
        {
            ("大丈夫", "<ruby>大丈夫<rt>だいじょうぶ</rt></ruby>"),
            ("手伝", "<ruby>手伝<rt>てつだ</rt></ruby>"),
            ("渡", "<ruby>渡<rt>わた</rt></ruby>"),
            ("道", "<ruby>道<rt>みち</rt></ruby>"),
            ("元気", "<ruby>元気<rt>げんき</rt></ruby>"),
            ("私", "<ruby>私<rt>わたし</rt></ruby>"),
            ("僕", "<ruby>僕<rt>ぼく</rt></ruby>"),
            ("駅", "<ruby>駅<rt>えき</rt></ruby>"),
            ("病院", "<ruby>病院<rt>びょういん</rt></ruby>"),
            ("痛", "<ruby>痛<rt>いた</rt></ruby>"),
            ("薬", "<ruby>薬<rt>くすり</rt></ruby>"),
            ("頭", "<ruby>頭<rt>あたま</rt></ruby>"),
            ("喉", "<ruby>喉<rt>のど</rt></ruby>"),
            ("熱", "<ruby>熱<rt>ねつ</rt></ruby>"),
            ("何", "<ruby>何<rt>なに</rt></ruby>"),
            ("行", "<ruby>行<rt>い</rt></ruby>"),
            ("来", "<ruby>来<rt>き</rt></ruby>"),
            ("見", "<ruby>見<rt>み</rt></ruby>"),
            ("聞", "<ruby>聞<rt>き</rt></ruby>"),
            ("話", "<ruby>話<rt>はな</rt></ruby>"),
            ("買", "<ruby>買<rt>か</rt></ruby>"),
            ("食", "<ruby>食<rt>た</rt></ruby>"),
            ("飲", "<ruby>飲<rt>の</rt></ruby>"),
            ("先生", "<ruby>先生<rt>せんせい</rt></ruby>"),
            ("友達", "<ruby>友達<rt>ともだち</rt></ruby>"),
            ("会社", "<ruby>会社<rt>かいしゃ</rt></ruby>"),
            ("仕事", "<ruby>仕事<rt>しごと</rt></ruby>"),
            ("今日", "<ruby>今日<rt>きょう</rt></ruby>"),
            ("明日", "<ruby>明日<rt>あした</rt></ruby>"),
            ("信号", "<ruby>信号<rt>しんごう</rt></ruby>"),
            ("気", "<ruby>気<rt>き</rt></ruby>")
        };

        var result = text;
        foreach (var (word, ruby) in furiganaMap)
        {
            if (result.Contains(word) && !result.Contains($"<ruby>{word}"))
            {
                result = result.Replace(word, ruby);
            }
        }
        return result;
    }
}
