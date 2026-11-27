using System.Net;
using System.Text;
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

        // 2. Interviewer / Cấp trên / Tuyển dụng (Chỉ khớp khi thực sự là phỏng vấn xin việc/baito hoặc cấp trên)
        // Lưu ý: "店長" (Chủ quán Ramen/nhà hàng/tiệm) tuyệt đối không được tự suy ra là Interviewer!
        var isInterview = combined.Contains("phỏng vấn") ||
            combined.Contains("xin việc") ||
            combined.Contains("baito") ||
            combined.Contains("tuyển dụng") ||
            combined.Contains("面接") ||
            combined.Contains("採用") ||
            combined.Contains("応募");

        var isOfficeHierarchy = combined.Contains("sếp") ||
            combined.Contains("giám đốc") ||
            combined.Contains("tiền bối") ||
            combined.Contains("上司") ||
            combined.Contains("先輩");

        if (isInterview || isOfficeHierarchy)
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

    public static string GetContextualRelationshipTitle(SocialRegisterType registerType, int affinityScore)
    {
        return registerType switch
        {
            SocialRegisterType.Interviewer => affinityScore switch
            {
                >= 80 => "Ứng viên sáng giá (Đánh giá xuất sắc)",
                >= 50 => "Tạo được ấn tượng tốt",
                >= 30 => "Có thiện cảm ban đầu",
                >= 20 => "Đã tiếp xúc sơ bộ",
                _ => "Mới tiếp xúc phỏng vấn"
            },
            SocialRegisterType.ServiceStaff => affinityScore switch
            {
                >= 80 => "Khách quen thân thiết (常連さん)",
                >= 50 => "Khách hàng quen mặt",
                >= 30 => "Khách hàng quen thuộc",
                >= 20 => "Khách từng ghé thăm",
                _ => "Khách mới lần đầu"
            },
            SocialRegisterType.Elderly => affinityScore switch
            {
                >= 80 => "Cháu ngoan hiếu lễ (Thân tình sâu sắc)",
                >= 50 => "Người tương trợ tin cậy",
                >= 30 => "Người quen qua đường tốt bụng",
                >= 20 => "Đã từng trò chuyện",
                _ => "Lần đầu tương trợ"
            },
            SocialRegisterType.TeacherMentor => affinityScore switch
            {
                >= 80 => "Học trò xuất sắc / Thân tín",
                >= 50 => "Tiến bộ rõ rệt",
                >= 30 => "Người học chăm chỉ",
                >= 20 => "Đã tiếp nhận hướng dẫn",
                _ => "Mới tiếp nhận"
            },
            SocialRegisterType.PeerFriend => affinityScore switch
            {
                >= 80 => "Bạn thân chí cốt (親友)",
                >= 50 => "Bạn bè tâm đầu ý hợp",
                >= 30 => "Bạn bè thân thiết",
                >= 20 => "Bạn quen biết",
                _ => "Mới làm quen"
            },
            _ => affinityScore switch
            {
                >= 80 => "Mối quan hệ tin cậy bền chặt",
                >= 50 => "Giao tiếp hòa hợp sâu sắc",
                >= 30 => "Người quen thân thuộc",
                >= 20 => "Đã từng trò chuyện",
                _ => "Lần đầu gặp gỡ"
            }
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

        if (lower.Contains("甘さ") || lower.Contains("甘い"))
        {
            return $"Yêu cầu về độ ngọt của {reg.LearnerSelf} gửi đến {reg.LearnerAddressAi}.";
        }

        if (lower.Contains("おすすめ"))
        {
            return "Món gợi ý của quán là gì vậy ạ?";
        }

        if (lower.Contains("メニュー"))
        {
            return "Cho tôi xem thực đơn được không ạ?";
        }

        if (Regex.IsMatch(lower, @"^(すみません[、,\s]*|あの[、,\s]*)?(これ|それ|あれ)(を)?(ください|おねがいします|お願いします)?[\.!?。！？\s]*$"))
        {
            return $"Cho {reg.LearnerSelf} cái này ạ.";
        }

        if (Regex.IsMatch(lower, @"^(すみません[、,\s]*|あの[、,\s]*)?(ひとつ|1つ)(を)?(ください|おねがいします|お願いします)?[\.!?。！？\s]*$"))
        {
            return $"Cho {reg.LearnerSelf} một phần ạ.";
        }

        if (Regex.IsMatch(lower, @"^(はい|ええ|うん)[\.!?。！？\s]*$"))
        {
            return "Vâng ạ.";
        }

        if (lower.Contains("ラーメン"))
        {
            return $"Cho {reg.LearnerSelf} gọi mì ramen ạ.";
        }

        return $"Lời thoại của bạn gửi đến {reg.LearnerAddressAi}.";
    }

    public static AiOpeningMessageResult GenerateOpeningMessage(Scenario scenario, ScenarioLevelConfiguration levelConfig)
    {
        var reg = Deduce(scenario.Title, levelConfig.AiPersona, levelConfig.Description);
        var jlpt = (levelConfig.JLPTLevel ?? "N5").Trim().ToUpperInvariant();

        switch (reg.RegisterType)
        {
            case SocialRegisterType.Elderly:
            {
                string ja = jlpt == "N5"
                    ? "すみません。向こうまで渡りたいです。手伝ってください。"
                    : jlpt == "N4"
                        ? "あのう、すみません。足が悪くて渡りたいのですが、手伝ってくれませんか？"
                        : "あのう、すみません。足が悪くて、向こう側まで渡りたいのですが、手伝っていただけないでしょうか。";
                return new AiOpeningMessageResult
                {
                    JapaneseText = ja,
                    FuriganaHtml = GenerateFuriganaHtml(ja),
                    VietnameseMeaning = $"Xin lỗi, {reg.AiSelf} muốn băng sang bên kia đường, {reg.AiAddressLearner} có thể giúp {reg.AiSelf} được không?"
                };
            }

            case SocialRegisterType.ServiceStaff:
            {
                var ctx = $"{scenario.Title} {levelConfig.AiPersona} {levelConfig.Description}".ToLowerInvariant();
                if (ctx.Contains("ga") || ctx.Contains("tàu") || ctx.Contains("station") || ctx.Contains("駅") || ctx.Contains("切符") || ctx.Contains("案内係") || ctx.Contains("駅長"))
                {
                    string ja = jlpt == "N5"
                        ? "こんにちは！何かお手伝いしましょうか？"
                        : "こんにちは。何かお手伝いしましょうか？";
                    var aiSelfCap = string.IsNullOrEmpty(reg.AiSelf) ? "Tôi" : char.ToUpper(reg.AiSelf[0]) + reg.AiSelf[1..];
                    return new AiOpeningMessageResult
                    {
                        JapaneseText = ja,
                        FuriganaHtml = GenerateFuriganaHtml(ja),
                        VietnameseMeaning = $"Xin chào {reg.AiAddressLearner}! {aiSelfCap} có thể giúp gì cho {reg.AiAddressLearner} ạ?"
                    };
                }
                if (ctx.Contains("tiện lợi") || ctx.Contains("konbini") || ctx.Contains("コンビニ") || ctx.Contains("siêu thị"))
                {
                    return new AiOpeningMessageResult
                    {
                        JapaneseText = "いらっしゃいませ！",
                        FuriganaHtml = "いらっしゃいませ！",
                        VietnameseMeaning = $"Kính chào {reg.AiAddressLearner}!"
                    };
                }
                if (ctx.Contains("cafe") || ctx.Contains("cà phê") || ctx.Contains("カフェ") || ctx.Contains("đồ uống"))
                {
                    string ja = jlpt == "N5"
                        ? "いらっしゃいませ！ご注文は何にしますか？"
                        : "いらっしゃいませ！ご注文はお決まりですか？";
                    return new AiOpeningMessageResult
                    {
                        JapaneseText = ja,
                        FuriganaHtml = GenerateFuriganaHtml(ja),
                        VietnameseMeaning = $"Kính chào {reg.AiAddressLearner}! {reg.AiAddressLearner} muốn gọi món gì ạ?"
                    };
                }
                return new AiOpeningMessageResult
                {
                    JapaneseText = "いらっしゃいませ！何名様ですか？",
                    FuriganaHtml = "いらっしゃいませ！<ruby>何名様<rt>なんめいさま</rt></ruby>ですか？",
                    VietnameseMeaning = $"Kính chào {reg.AiAddressLearner}! {reg.AiAddressLearner} đi mấy người ạ?"
                };
            }

            case SocialRegisterType.Interviewer:
            {
                string ja = jlpt == "N5"
                    ? "こんにちは。面接を始めます。どうぞ座ってください。"
                    : jlpt == "N4"
                        ? "今日はありがとうございます。面接を始めましょう。どうぞお座りください。"
                        : "ご応募ありがとうございます。本日の面接を担当いたします。どうぞお座りください。";
                return new AiOpeningMessageResult
                {
                    JapaneseText = ja,
                    FuriganaHtml = GenerateFuriganaHtml(ja),
                    VietnameseMeaning = jlpt == "N5"
                        ? $"Xin chào {reg.AiAddressLearner}. Chúng ta bắt đầu buổi phỏng vấn nhé. Mời {reg.AiAddressLearner} ngồi."
                        : $"Cảm ơn {reg.AiAddressLearner} đã ứng tuyển. {reg.AiSelf} phụ trách buổi phỏng vấn hôm nay. Xin mời {reg.AiAddressLearner} ngồi."
                };
            }

            case SocialRegisterType.TeacherMentor:
            {
                string ja = jlpt == "N5"
                    ? "こんにちは！今日のレッスンを始めましょう。"
                    : "こんにちは。本日のレッスンを始めましょう。よろしくお願いします。";
                return new AiOpeningMessageResult
                {
                    JapaneseText = ja,
                    FuriganaHtml = GenerateFuriganaHtml(ja),
                    VietnameseMeaning = $"Chào {reg.AiAddressLearner}. Chúng ta cùng bắt đầu buổi học hôm nay nhé."
                };
            }

            case SocialRegisterType.PeerFriend:
                return new AiOpeningMessageResult
                {
                    JapaneseText = "あ、こんにちは！会えて嬉しいよ。調子はどう？",
                    FuriganaHtml = "あ、こんにちは！<ruby>会<rt>あ</rt></ruby>えて<ruby>嬉<rt>うれ</rt></ruby>しいよ。<ruby>調子<rt>ちょうし</rt></ruby>はどう？",
                    VietnameseMeaning = $"A, chào {reg.AiAddressLearner}! Gặp {reg.AiAddressLearner} vui quá. Dạo này thế nào rồi?"
                };

            default:
            {
                string ja = jlpt == "N5"
                    ? "こんにちは！これから練習を始めましょう。"
                    : $"こんにちは。本日の{scenario.Title}を始めましょう。よろしくお願いします。";
                return new AiOpeningMessageResult
                {
                    JapaneseText = ja,
                    FuriganaHtml = GenerateFuriganaHtml(ja),
                    VietnameseMeaning = $"Xin chào {reg.AiAddressLearner}. Chúng ta hãy bắt đầu bài luyện tập {scenario.Title}."
                };
            }
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
                return EnrichScaffolding(new RoleplayHintDto
                {
                    JapaneseSuggestion = "はい、喜んでお手伝いします。一緒に渡りましょう。",
                    RomajiOrReading = "Hai, yorokonde otetsudai shimasu. Issho ni watarimashou.",
                    VietnameseMeaning = $"Vâng, {reg.LearnerSelf} rất sẵn lòng giúp đỡ ạ. Chúng ta cùng sang đường nhé {reg.LearnerAddressAi}.",
                    ContextExplanation = $"Cách đề nghị giúp đỡ nhiệt tình, lịch sự phù hợp với {reg.LearnerAddressAi}."
                });
            }

            if (criteria.Contains("hướng") || criteria.Contains("điểm đến") || criteria.Contains("direction") || criteria.Contains("đâu"))
            {
                return EnrichScaffolding(new RoleplayHintDto
                {
                    JapaneseSuggestion = "どちらまで行かれますか。お手伝いしましょうか。",
                    RomajiOrReading = "Dochira made ikaremasu ka. Otetsudai shimashou ka.",
                    VietnameseMeaning = $"{reg.LearnerAddressAi} định đi đến đâu vậy ạ? Để {reg.LearnerSelf} giúp {reg.LearnerAddressAi} nhé.",
                    ContextExplanation = "Hỏi điểm đến bằng kính ngữ tôn kính (ikaremasu ka)."
                });
            }

            if (criteria.Contains("chào") || criteria.Contains("greet") || criteria.Contains("giới thiệu") || criteria.Contains("intro"))
            {
                return EnrichScaffolding(new RoleplayHintDto
                {
                    JapaneseSuggestion = "はじめまして。よろしくお願いします。",
                    RomajiOrReading = "Hajimemashite. Yoroshiku onegaishimasu.",
                    VietnameseMeaning = $"Rất vui được gặp {reg.LearnerAddressAi} lần đầu. Rất mong được {reg.LearnerAddressAi} giúp đỡ ạ.",
                    ContextExplanation = "Chào hỏi chuẩn mực khi bắt đầu đối thoại."
                });
            }

            if (criteria.Contains("tạm biệt") || criteria.Contains("kết thúc") || criteria.Contains("cảm ơn") || criteria.Contains("bye"))
            {
                if (reg.RegisterType == SocialRegisterType.Elderly)
                {
                    return EnrichScaffolding(new RoleplayHintDto
                    {
                        JapaneseSuggestion = "いいえ、どういたしまして。お気をつけてお大事に。",
                        RomajiOrReading = "Iie, dou itashimashite. O ki wo tsukete odaiji ni.",
                        VietnameseMeaning = $"Dạ không có gì đâu ạ. Chúc {reg.LearnerAddressAi} đi lại cẩn thận và giữ gìn sức khỏe nhé ạ.",
                        ContextExplanation = "Lời đáp lại lời cảm ơn và lời chúc lễ phép, ấm áp dành cho người già."
                    });
                }

                return EnrichScaffolding(new RoleplayHintDto
                {
                    JapaneseSuggestion = "どうもありがとうございました。失礼いたします。",
                    RomajiOrReading = "Doumo arigatou gozaimashita. Shitsurei itashimasu.",
                    VietnameseMeaning = $"Cảm ơn {reg.LearnerAddressAi} rất nhiều. {reg.LearnerSelf} xin phép chào {reg.LearnerAddressAi} ạ.",
                    ContextExplanation = "Lời chào tạm biệt và cảm ơn chuẩn mực trong giao tiếp tiếng Nhật."
                });
            }

            if (criteria.Contains("price") || criteria.Contains("giá"))
            {
                return EnrichScaffolding(new RoleplayHintDto
                {
                    JapaneseSuggestion = "すみません、これはいくらですか？",
                    RomajiOrReading = "Sumimasen, kore wa ikura desu ka?",
                    VietnameseMeaning = "Xin lỗi, món này bao nhiêu tiền vậy ạ?",
                    ContextExplanation = "Hỏi giá tiền một cách lịch sự bằng thể Desu ka."
                });
            }

            if (criteria.Contains("order") || criteria.Contains("gọi món") || criteria.Contains("gọi "))
            {
                var ctx = $"{title} {persona} {desc}".ToLowerInvariant();
                if (ctx.Contains("ramen") || ctx.Contains("mì"))
                {
                    return EnrichScaffolding(new RoleplayHintDto
                    {
                        JapaneseSuggestion = "すみません、豚骨ラーメンをお願いします。",
                        RomajiOrReading = "Sumimasen, tonkotsu raamen wo onegaishimasu.",
                        VietnameseMeaning = "Xin lỗi, cho tôi gọi một bát mì Tonkotsu Ramen ạ.",
                        ContextExplanation = "Gọi món ăn cụ thể bằng mẫu ～をお願いします."
                    });
                }
                if (ctx.Contains("cafe") || ctx.Contains("cà phê"))
                {
                    return EnrichScaffolding(new RoleplayHintDto
                    {
                        JapaneseSuggestion = "すみません、アイスコーヒーをお願いします。",
                        RomajiOrReading = "Sumimasen, aisu koohii wo onegaishimasu.",
                        VietnameseMeaning = "Xin lỗi, cho tôi một ly cà phê đá ạ.",
                        ContextExplanation = "Gọi đồ uống lịch sự bằng mẫu ～をお願いします."
                    });
                }
                return EnrichScaffolding(new RoleplayHintDto
                {
                    JapaneseSuggestion = "すみません、これをお願いします。",
                    RomajiOrReading = "Sumimasen, kore wo onegaishimasu.",
                    VietnameseMeaning = "Xin lỗi, cho tôi cái này ạ.",
                    ContextExplanation = "Yêu cầu gọi món hoặc chọn sản phẩm lịch sự."
                });
            }
        }

        var defaultHint = new RoleplayHintDto
        {
            JapaneseSuggestion = "はい、わかりました。よろしくお願いします。",
            RomajiOrReading = "Hai, wakarimashita. Yoroshiku onegaishimasu.",
            VietnameseMeaning = $"Vâng, {reg.LearnerSelf} đã hiểu rõ. Rất mong được {reg.LearnerAddressAi} giúp đỡ.",
            ContextExplanation = "Mẫu câu hồi đáp đồng ý và hợp tác lịch sự."
        };
        return EnrichScaffolding(defaultHint);
    }

    private static readonly HashSet<string> ProtectedHintPhrases = new(StringComparer.Ordinal)
    {
        "すみません", "お願いします", "おねがいします", "ありがとうございます", "ありがとうございました",
        "ごちそうさま", "ごちそうさまでした", "ください", "美味しかった", "おいしかった", "美味しい", "おいしい", "大丈夫"
    };

    /// <summary>
    /// Bổ sung tự động danh sách từ khóa (Tier 1) và mẫu câu điền khuyết (Tier 2) cho giàn giáo thích ứng
    /// </summary>
    public static string StripJapaneseEndings(string? word)
    {
        if (string.IsNullOrWhiteSpace(word)) return string.Empty;
        var clean = word.Trim();
        if (ProtectedHintPhrases.Contains(clean))
        {
            return clean;
        }
        clean = Regex.Replace(clean, @"(ですか|でしょうか|でした|ました|ません|ます|です|だ|か|ね|よ|を|に|は|が|で|と|の)$", "").Trim();
        return clean;
    }

    public static RoleplayHintDto EnrichScaffolding(RoleplayHintDto dto)
    {
        if (dto == null) return new RoleplayHintDto();
        var text = dto.JapaneseSuggestion ?? string.Empty;

        if (dto.Keywords == null || dto.Keywords.Count == 0)
        {
            var detectedKeywords = new List<string>();

            // 1. Khớp từ vựng cụm cố định chuẩn (Standard lexical match - longest first)
            var standardLexicon = new[]
            {
                "豚骨ラーメン", "とんこつラーメン", "ラーメン", "カウンター席", "テーブル席",
                "ごちそうさまでした", "ごちそうさま", "ありがとうございます", "ありがとうございました",
                "味濃いめ", "濃いめ", "辛め", "かため", "美味しかった", "おいしかった", "美味しい", "おいしい",
                "おすすめ", "いくら", "お水", "水", "メニュー",
                "一つ", "二つ", "三つ", "1つ", "2つ", "一人", "二人", "1人", "2人", "何名", "何人",
                "お願いします", "おねがいします", "ください", "すみません"
            };

            var maskedText = text;
            foreach (var lex in standardLexicon)
            {
                if (maskedText.Contains(lex))
                {
                    detectedKeywords.Add(lex);
                    maskedText = maskedText.Replace(lex, " ");
                }
            }

            // 2. Với phần văn bản còn lại, khớp từ Katakana (>= 2 ký tự) hoặc Kanji
            var kanjiMatches = Regex.Matches(maskedText, @"[゠-ヿ]{2,}|[一-龯]{1,4}(?:[぀-ゟ]{1,2})?")
                .Cast<Match>().Select(m => m.Value);

            var list = detectedKeywords.Concat(kanjiMatches)
                .Select(w => StripJapaneseEndings(w))
                .Where(w => w.Length >= 1 && w != "お" && w != "し")
                .Distinct()
                .Take(4)
                .ToList();

            dto.Keywords = list;
            if (dto.Keywords.Count == 0 && !string.IsNullOrWhiteSpace(text))
            {
                var clean = StripJapaneseEndings(text);
                dto.Keywords.Add(clean.Length > 5 ? clean.Substring(0, 5) : clean);
            }
        }
        else
        {
            dto.Keywords = dto.Keywords
                .Select(w => StripJapaneseEndings(w))
                .Where(w => !string.IsNullOrWhiteSpace(w) && w != "お" && w != "し")
                .Distinct()
                .ToList();
        }

        for (int i = 0; i < dto.Keywords.Count; i++)
        {
            if (dto.Keywords[i].EndsWith("です") && dto.Keywords[i].Length > 2)
            {
                dto.Keywords[i] = dto.Keywords[i].Substring(0, dto.Keywords[i].Length - 2);
            }
        }

        if (string.IsNullOrWhiteSpace(dto.ClozeSentence) && !string.IsNullOrWhiteSpace(text))
        {
            if (text.Contains("いくら") || text.Contains("値段"))
            {
                dto.ClozeSentence = "これは [ ______ ] ですか。";
            }
            else if (text.Contains("おすすめ"))
            {
                dto.ClozeSentence = "[ ______ ] は何ですか。";
            }
            else if (text.Contains("何名") || text.Contains("1人") || text.Contains("一人") || text.Contains("2人") || text.Contains("二人"))
            {
                dto.ClozeSentence = "[ ______ ] 人です。";
            }
            else if (text.Contains("お願いします") || text.Contains("おねがいします") || text.Contains("ください"))
            {
                if (text.Contains("ラーメン"))
                {
                    dto.ClozeSentence = "[ ______ ] を一つお願いします。";
                }
                else
                {
                    dto.ClozeSentence = "[ ______ ] をお願いします。";
                }
            }
            else
            {
                var mainWord = dto.Keywords.FirstOrDefault(w => w != "すみません" && w != "はい" && w != "ありがとう" && w != "お願いします") ?? dto.Keywords.FirstOrDefault();
                if (!string.IsNullOrWhiteSpace(mainWord) && text.Contains(mainWord))
                {
                    dto.ClozeSentence = text.Replace(mainWord, " [ ______ ] ");
                }
                else if (text.Length > 6)
                {
                    int mid = text.Length / 2;
                    dto.ClozeSentence = text.Substring(0, Math.Max(2, mid - 2)) + " [ ______ ] " + text.Substring(Math.Min(text.Length, mid + 2));
                }
                else
                {
                    dto.ClozeSentence = "これは [ ______ ] ですか。";
                }
            }
        }

        if (string.IsNullOrWhiteSpace(dto.FuriganaHtml) && !string.IsNullOrWhiteSpace(text))
        {
            dto.FuriganaHtml = GenerateFuriganaHtml(text);
        }

        return dto;
    }

    /// <summary>
    /// Kiểm tra xem học viên có nói hoàn toàn bằng tiếng Việt hoặc tiếng Anh không (không có chữ Kana/Kanji nào).
    /// </summary>
    public static bool IsPureForeignOrVietnamese(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        var trimmed = text.Trim();
        // Có chữ Hiragana, Katakana hoặc Kanji không?
        bool hasJapanese = Regex.IsMatch(trimmed, @"[぀-ゟ゠-ヿ一-龯]");
        if (hasJapanese) return false;

        // Nếu hoàn toàn không có tiếng Nhật và có chữ cái Latin/dấu tiếng Việt
        bool hasLatin = Regex.IsMatch(trimmed, @"[a-zA-ZÀ-ỹ]");
        return hasLatin;
    }

    /// <summary>
    /// Xử lý tất định 0ms không tốn token LLM khi học viên nói nhầm tiếng Việt/ngoại ngữ.
    /// Nhắc nhở lịch sự và nhập vai theo đúng Persona.
    /// </summary>
    public static AiTurnResult ProcessForeignLanguageTurn(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        string userMessage)
    {
        var reg = Deduce(scenario?.Title, levelConfig?.AiPersona, levelConfig?.Description);
        var jlpt = (levelConfig?.JLPTLevel ?? "N5").Trim().ToUpperInvariant();
        string jaText = jlpt == "N5"
            ? "すみません、日本語で話してください。"
            : jlpt == "N4"
                ? "すみません、日本語でお話しください。"
                : "すみません、ここは日本ですので、日本語でお話しいただけますか？";
        string viMeaning = $"Xin lỗi, {reg.AiSelf} không hiểu tiếng nước ngoài. {reg.AiAddressLearner} có thể nói lại bằng tiếng Nhật được không ạ?";

        if (reg.RegisterType == SocialRegisterType.ServiceStaff)
        {
            jaText = jlpt == "N5"
                ? "すみません、日本語で話してください。注文は何ですか？"
                : jlpt == "N4"
                    ? "すみません、日本語でお話しください。ご注文は何ですか？"
                    : "恐れ入ります、日本語でお話しいただけますでしょうか。ご注文やご用件をお伺いします。";
            viMeaning = $"Kính xin {reg.AiAddressLearner} vui lòng dùng tiếng Nhật ạ. {reg.AiSelf} xin phép được lắng nghe yêu cầu của {reg.AiAddressLearner}.";
        }
        else if (reg.RegisterType == SocialRegisterType.Elderly)
        {
            jaText = "おや、日本語で話してくれるかい？ わしには外国語はちと難しくてねぇ。";
            viMeaning = $"Ôi, {reg.AiAddressLearner} có thể nói tiếng Nhật được không? Già này tiếng nước ngoài khó hiểu quá à.";
        }

        return new AiTurnResult
        {
            JapaneseReply = jaText,
            VietnameseMeaning = viMeaning,
            FuriganaHtml = GenerateFuriganaHtml(jaText),
            UserVietnameseMeaning = userMessage,
            UserFuriganaHtml = userMessage,
            CompletedMissionIds = new List<int>(),
            IsNaturallyConcluded = false,
            LinguisticFeedback = new LinguisticFeedbackDto
            {
                Status = "Error",
                Summary = "Vui lòng sử dụng tiếng Nhật",
                EvaluationSource = "PreFlightGuard",
                Details = new List<LinguisticDetailItemDto>
                {
                    new()
                    {
                        Type = "error",
                        Aspect = "Ngôn ngữ",
                        Comment = "Hệ thống chỉ hỗ trợ luyện tập bằng tiếng Nhật. Vui lòng nói lại bằng tiếng Nhật."
                    }
                },
                NaturalAlternative = "すみません、日本語で話します。",
                CulturalTip = "Tại các cửa hàng hoặc môi trường làm việc ở Nhật Bản, giao tiếp bằng tiếng Nhật là yêu cầu cơ bản."
            }
        };
    }

    public static AiTurnResult ProcessGenericTurn(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        string userMessage,
        List<Mission> pendingMissions)
    {
        var reg = Deduce(scenario?.Title, levelConfig?.AiPersona, levelConfig?.Description);
        // Guard: Ambiguous counter/demonstrative in simulator (Universal Context-Aware)
        if (Regex.IsMatch(userMessage.Trim(), @"^(すみません[、,\s]*|あの[、,\s]*)?(これ|それ|あれ|ひとつ|1つ)(を)?(おねがい|お願い|ください)?(します)?[\.!?。！？\s]*$"))
        {
            var combinedContext = $"{scenario?.Title} {levelConfig?.AiPersona} {levelConfig?.Description}".ToLowerInvariant();
            string jaNotice;
            string viNotice;
            string summary;
            string ambigNaturalAlt;

            if (combinedContext.Contains("ga") || combinedContext.Contains("tàu") || combinedContext.Contains("station") || combinedContext.Contains("駅") || combinedContext.Contains("切符"))
            {
                jaNotice = "恐れ入ります、どの切符をひとつ（一枚）ご希望でしょうか？行き先の駅名をお聞かせください。";
                viNotice = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiAddressLearner} muốn mua một vé đi đâu ạ? Xin cho {reg.AiSelf} biết ga đến nhé.";
                summary = "Yêu cầu chưa cụ thể • Cần nói rõ ga đến";
                ambigNaturalAlt = "新宿駅までの切符を一枚お願いします。";
            }
            else if (combinedContext.Contains("phỏng vấn") || combinedContext.Contains("xin việc") || combinedContext.Contains("baito") || combinedContext.Contains("面接"))
            {
                jaNotice = "恐れ入ります、どの質問についてお答えでしょうか？具体的にお聞かせください。";
                viNotice = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiAddressLearner} muốn trả lời về phần nào ạ? Xin cho {reg.AiSelf} biết cụ thể.";
                summary = "Yêu cầu chưa cụ thể • Cần nói rõ nội dung";
                ambigNaturalAlt = "自己紹介についてお話しいたします。";
            }
            else if (combinedContext.Contains("tiện lợi") || combinedContext.Contains("siêu thị") || combinedContext.Contains("cửa hàng") || combinedContext.Contains("mua sắm") || combinedContext.Contains("コンビニ"))
            {
                jaNotice = "恐れ入ります、どの商品をおひとつご希望でしょうか？商品をお教えいただけますか？";
                viNotice = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiAddressLearner} muốn lấy sản phẩm nào ạ? Xin cho {reg.AiSelf} biết tên sản phẩm nhé.";
                summary = "Yêu cầu chưa cụ thể • Cần nói rõ tên sản phẩm";
                ambigNaturalAlt = "お弁当をひとつお願いします。";
            }
            else if (combinedContext.Contains("cafe") || combinedContext.Contains("cà phê") || combinedContext.Contains("đồ uống"))
            {
                jaNotice = "恐れ入ります、どのお飲み物をおひとつご希望でしょうか？メニュー名をお聞かせください。";
                viNotice = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiAddressLearner} muốn dùng đồ uống nào ạ? Xin cho {reg.AiSelf} biết tên món nhé.";
                summary = "Yêu cầu chưa cụ thể • Cần nói rõ tên đồ uống";
                ambigNaturalAlt = "アイスコーヒーをひとつお願いします。";
            }
            else if (combinedContext.Contains("ramen") || combinedContext.Contains("mì") || combinedContext.Contains("ラーメン") || combinedContext.Contains("quán") || combinedContext.Contains("nhà hàng") || combinedContext.Contains("ẩm thực") || combinedContext.Contains("ăn"))
            {
                jaNotice = "恐れ入ります、どの料理をひとつご希望でしょうか？メニュー名をお聞かせください。";
                viNotice = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiAddressLearner} muốn lấy 1 phần món ăn nào ạ? Xin cho {reg.AiSelf} biết tên món nhé.";
                summary = "Yêu cầu chưa cụ thể • Cần nói rõ tên món";
                ambigNaturalAlt = "豚骨ラーメンをひとつお願いします。";
            }
            else
            {
                jaNotice = "恐れ入ります、具体的にどちらをおひとつご希望でしょうか？詳しくお聞かせください。";
                viNotice = $"Xin lỗi {reg.AiAddressLearner}, {reg.AiAddressLearner} muốn yêu cầu đối tượng hoặc nội dung nào ạ? Xin nói rõ giúp {reg.AiSelf} nhé.";
                summary = "Yêu cầu chưa cụ thể • Cần nêu rõ đối tượng";
                ambigNaturalAlt = "これをお願いします。";
            }

            return new AiTurnResult
            {
                JapaneseReply = jaNotice,
                FuriganaHtml = GenerateFuriganaHtml(jaNotice),
                VietnameseMeaning = viNotice,
                UserVietnameseMeaning = userMessage,
                UserFuriganaHtml = GenerateFuriganaHtml(userMessage),
                CompletedMissionIds = new List<int>(),
                IsNaturallyConcluded = false,
                LinguisticFeedback = new LinguisticFeedbackDto
                {
                    Status = "Warning",
                    Summary = summary,
                    EvaluationSource = "Guardrail",
                    Details = new List<LinguisticDetailItemDto>
                    {
                        new() { Type = "warning", Aspect = "Độ rõ ràng", Comment = "Cần nói kèm tên đối tượng hoặc nội dung trước từ chỉ số lượng." }
                    },
                    NaturalAlternative = ambigNaturalAlt
                }
            };
        }
        var trimmedMsg = userMessage.Trim();
        var lowerMsg = trimmedMsg.ToLowerInvariant();
        var completedIds = new List<int>();

        bool isGibberishOrRude = Regex.IsMatch(trimmedMsg, @"(.)\1{4,}") ||
                                 Regex.IsMatch(trimmedMsg, @"(お前|てめえ|持ってこい|しろよ|くれよ|出せよ|おい、)");
        bool hasJapaneseChars = Regex.IsMatch(trimmedMsg, @"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]");
        var cleanMsgNoPunct = Regex.Replace(trimmedMsg, @"[\s\.,?!。、？！]", "");
        bool hasPoliteEnding = Regex.IsMatch(trimmedMsg, @"(です|ます|でした|ました|ません|ください|おねがい|お願い|いただけ|でしょうか|ですか|たいです|ましょう|ありがとう|ごちそう|ご馳走|すみません|こんにちは|こんばんは|おはよう|失礼|どういたしまして)");
        bool isBareFragment = cleanMsgNoPunct.Length <= 12 && !hasPoliteEnding && !Regex.IsMatch(cleanMsgNoPunct, @"^(はい|いいえ|ええ|うん|ううん)$");

        var orderedPending = pendingMissions.OrderBy(m => m.Order).ToList();

        // Semantic matching against pending missions (only when utterance is valid Japanese and not gibberish/rude)
        if (!isGibberishOrRude && hasJapaneseChars)
        {
            foreach (var candidate in orderedPending)
            {
                var criteria = (candidate.CompletionCriteriaJson + " " + candidate.Content).ToLowerInvariant();
                var isMatched = false;

                if (criteria.Contains("tạm biệt") || criteria.Contains("kết thúc") || criteria.Contains("cảm ơn") || criteria.Contains("ra về") || criteria.Contains("bye") || criteria.Contains("goodbye") || criteria.Contains("rời") || criteria.Contains("thanh toán"))
                {
                    isMatched = lowerMsg.Contains("ありがとう") || lowerMsg.Contains("どういたしまして") || lowerMsg.Contains("お気をつけて") || lowerMsg.Contains("気をつけて") || lowerMsg.Contains("お大事に") || lowerMsg.Contains("失礼") || lowerMsg.Contains("さようなら") || lowerMsg.Contains("会計") || lowerMsg.Contains("勘定") || lowerMsg.Contains("ごちそう") || lowerMsg.Contains("ご馳走") || lowerMsg.Contains("また来ます");
                }
                else if (criteria.Contains("chào") || criteria.Contains("số người") || criteria.Contains("chỗ ngồi") || criteria.Contains("greet") || criteria.Contains("intro") || criteria.Contains("giới thiệu"))
                {
                    isMatched = lowerMsg.Contains("こんにちは") || lowerMsg.Contains("はじめまして") || lowerMsg.Contains("よろしく") || lowerMsg.Contains("1人") || lowerMsg.Contains("一人") || lowerMsg.Contains("2人") || lowerMsg.Contains("二人") || lowerMsg.Contains("ひとり") || lowerMsg.Contains("名") || lowerMsg.Contains("席") || lowerMsg.Contains("カウンター") || lowerMsg.Contains("申します") || lowerMsg.Contains("手伝") || lowerMsg.Contains("てつだ") || lowerMsg.Contains("大丈夫");
                }
                else if (criteria.Contains("giúp") || criteria.Contains("help") || criteria.Contains("hỗ trợ") || criteria.Contains("đề nghị"))
                {
                    isMatched = lowerMsg.Contains("手伝") || lowerMsg.Contains("てつだ") || lowerMsg.Contains("助け") || lowerMsg.Contains("一緒") || lowerMsg.Contains("渡") || lowerMsg.Contains("大丈夫") || lowerMsg.Contains("喜んで");
                }
                else if (criteria.Contains("price") || criteria.Contains("giá") || criteria.Contains("tiền"))
                {
                    isMatched = lowerMsg.Contains("いくら") || lowerMsg.Contains("円") || lowerMsg.Contains("値段");
                }
                else if (criteria.Contains("hướng") || criteria.Contains("điểm đến") || criteria.Contains("direction") || criteria.Contains("đâu"))
                {
                    isMatched = lowerMsg.Contains("どちら") || lowerMsg.Contains("どこ") || lowerMsg.Contains("行") || lowerMsg.Contains("向こう") || lowerMsg.Contains("病院") || lowerMsg.Contains("駅") || lowerMsg.Contains("方向") || lowerMsg.Contains("ですか") || lowerMsg.Contains("なん");
                }
                else if (criteria.Contains("order") || criteria.Contains("gọi món") || criteria.Contains("gọi ") || criteria.Contains("món"))
                {
                    isMatched = !criteria.Contains("giá") && !criteria.Contains("price") && !criteria.Contains("thanh toán")
                        && (lowerMsg.Contains("ラーメン") || lowerMsg.Contains("とんこつ") || lowerMsg.Contains("豚骨") || lowerMsg.Contains("おねがい") || lowerMsg.Contains("お願い") || lowerMsg.Contains("ください") || lowerMsg.Contains("一杯") || lowerMsg.Contains("注文") || lowerMsg.Contains("にします"));
                }
                else if (criteria.Contains("độ cứng") || criteria.Contains("khẩu vị") || criteria.Contains("nước dùng") || criteria.Contains("hardness") || criteria.Contains("flavor"))
                {
                    isMatched = lowerMsg.Contains("硬め") || lowerMsg.Contains("かため") || lowerMsg.Contains("固め") || lowerMsg.Contains("濃いめ") || lowerMsg.Contains("こいめ") || lowerMsg.Contains("普通") || lowerMsg.Contains("ふつう") || lowerMsg.Contains("薄め") || lowerMsg.Contains("辛め");
                }
                else if (criteria.Contains("ngày") || criteria.Contains("tuần") || criteria.Contains("ca") || criteria.Contains("shift") || criteria.Contains("thời gian"))
                {
                    isMatched = lowerMsg.Contains("日") || lowerMsg.Contains("週") || lowerMsg.Contains("曜日") || lowerMsg.Contains("シフト") || lowerMsg.Contains("午後") || lowerMsg.Contains("午前") || lowerMsg.Contains("時間");
                }
                else if (completedIds.Count == 0 && candidate == orderedPending.FirstOrDefault())
                {
                    // Fallback: chỉ chấp nhận khi câu tiếng Nhật lịch sự hoàn chỉnh (>= 4 ký tự, có vị ngữ lịch sự)
                    isMatched = hasPoliteEnding && cleanMsgNoPunct.Length >= 4;
                }

                if (isMatched && !completedIds.Contains(candidate.Id))
                {
                    completedIds.Add(candidate.Id);
                }
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
                var simJlpt = (levelConfig?.JLPTLevel ?? "N5").Trim().ToUpperInvariant();
                if (lowerMsg.Contains("いくら") || lowerMsg.Contains("値段"))
                {
                    jaReply = simJlpt == "N5"
                        ? "ラーメンは850円です。"
                        : "こちらは一杯850円でございます。";
                    fHtmlReply = GenerateFuriganaHtml(jaReply);
                    viMeaning = $"Dạ món này có giá là 850 yên ạ.";
                }
                else if (lowerMsg.Contains("ラーメン") || lowerMsg.Contains("注文") || lowerMsg.Contains("おねがい") || lowerMsg.Contains("ください"))
                {
                    jaReply = simJlpt == "N5"
                        ? "わかりました！少々お待ちください。"
                        : simJlpt == "N4"
                            ? "わかりました！少々お待ちください。他にご注文はありますか？"
                            : "かしこまりました！ご注文内容を確かに承りました。少々お待ちくださいませ。他にご注文はございますか？";
                    fHtmlReply = GenerateFuriganaHtml(jaReply);
                    viMeaning = $"Dạ {reg.AiSelf} đã ghi nhận yêu cầu của {reg.AiAddressLearner}. Xin {reg.AiAddressLearner} vui lòng đợi một lát.";
                }
                else
                {
                    jaReply = simJlpt == "N5"
                        ? "はい、わかりました。他に何かありますか？"
                        : simJlpt == "N4"
                            ? "はい、わかりました。他に何かご質問はありますか？"
                            : "はい、かしこまりました。他にご要望がございましたらお申し付けください。";
                    fHtmlReply = GenerateFuriganaHtml(jaReply);
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

        LinguisticFeedbackDto feedback;
        if (isGibberishOrRude)
        {
            feedback = new LinguisticFeedbackDto
            {
                EvaluationSource = "Simulator",
                Status = "Warning",
                Summary = "Nội dung chưa phù hợp • Cần diễn đạt lịch sự, rõ ràng",
                Details = new List<LinguisticDetailItemDto>
                {
                    new() { Type = "warning", Aspect = "Văn phong", Comment = "Vui lòng sử dụng câu tiếng Nhật lịch sự (Desu/Masu/Onegaishimasu) phù hợp với ngữ cảnh." }
                },
                NaturalAlternative = "すみません、お願いします。",
                CulturalTip = reg.CulturalTip
            };
        }
        else if (isBareFragment)
        {
            feedback = new LinguisticFeedbackDto
            {
                EvaluationSource = "Simulator",
                Status = "Warning",
                Summary = "Chưa thành câu hoàn chỉnh • Cần thêm vị ngữ hoặc đuôi câu lịch sự",
                Details = new List<LinguisticDetailItemDto>
                {
                    new() { Type = "warning", Aspect = "Cấu trúc & Văn phong", Comment = "Chỉ nói từ đơn lẻ sẽ cộc lốc trong giao tiếp tiếng Nhật. Nên mở rộng thành câu hoàn chỉnh kèm です / をお願いします." }
                },
                NaturalAlternative = $"{trimmedMsg}をお願いします。",
                CulturalTip = reg.CulturalTip
            };
        }
        else
        {
            feedback = new LinguisticFeedbackDto
            {
                EvaluationSource = "Simulator",
                Status = "Good",
                Summary = "Phản xạ tự nhiên • Đúng ngữ cảnh",
                Details = new List<LinguisticDetailItemDto>
                {
                    new() { Type = "success", Aspect = "Ngữ cảnh", Comment = $"Câu trả lời tự nhiên và phù hợp với vai vế giao tiếp cùng {reg.LearnerAddressAi}." },
                    new() { Type = "success", Aspect = "Văn phong", Comment = "Sử dụng thể lịch sự chuẩn mực, thể hiện thái độ chu đáo và lễ phép." }
                },
                NaturalAlternative = naturalAlt,
                CulturalTip = reg.CulturalTip
            };
        }

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
    /// Tạo Furigana HTML cho các từ vựng chữ Hán thông dụng trong câu của người học và AI
    /// </summary>
    public static string GenerateFuriganaHtml(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return text;
        if (text.Contains("<ruby>", StringComparison.Ordinal)
            && HasValidRubyMarkupStructure(text, canonicalOnly: true)
            && !HasInvalidRtContent(text))
        {
            return text;
        }

        var furiganaDictionary = new (string Word, string Ruby)[]
        {
            // Cụm 4-5 chữ Hán
            ("志望動機", "<ruby>志望動機<rt>しぼうどうき</rt></ruby>"),
            ("自己紹介", "<ruby>自己紹介<rt>じこしょうかい</rt></ruby>"),
            ("電話番号", "<ruby>電話番号<rt>でんわばんごう</rt></ruby>"),
            ("営業時間", "<ruby>営業時間<rt>えいぎょうじかん</rt></ruby>"),
            
            // Cụm 3 chữ Hán
            ("何名様", "<ruby>何名様<rt>なんめいさま</rt></ruby>"),
            ("領収書", "<ruby>領収書<rt>りょうしゅうしょ</rt></ruby>"),
            ("改札口", "<ruby>改札口<rt>かいさつぐち</rt></ruby>"),
            ("地下鉄", "<ruby>地下鉄<rt>ちかてつ</rt></ruby>"),
            ("新幹線", "<ruby>新幹線<rt>しんかんせん</rt></ruby>"),
            ("留学生", "<ruby>留学生<rt>りゅうがくせい</rt></ruby>"),
            ("履歴書", "<ruby>履歴書<rt>りれきしょ</rt></ruby>"),
            ("交差点", "<ruby>交差点<rt>こうさてん</rt></ruby>"),
            ("処方箋", "<ruby>処方箋<rt>しょほうせん</rt></ruby>"),
            ("向こう側", "<ruby>向<rt>む</rt></ruby>こう<ruby>側<rt>がわ</rt></ruby>"),
            ("少々お待ち", "<ruby>少々<rt>しょうしょう</rt></ruby>お<ruby>待<rt>ま</rt></ruby>ち"),
            ("乗り換え", "<ruby>乗<rt>の</rt></ruby>り<ruby>換<rt>か</rt></ruby>え"),
            ("真っ直ぐ", "<ruby>真<rt>ま</rt></ruby>っ<ruby>直<rt>す</rt></ruby>ぐ"),
            
            // Cụm 2 chữ Hán thông dụng
            ("来ました", "<ruby>来<rt>き</rt></ruby>ました"),
            ("来ます", "<ruby>来<rt>き</rt></ruby>ます"),
            ("行きます", "<ruby>行<rt>い</rt></ruby>きます"),
            ("大丈夫", "<ruby>大丈夫<rt>だいじょうぶ</rt></ruby>"),
            ("恐れ入ります", "<ruby>恐<rt>おそ</rt></ruby>れ<ruby>入<rt>い</rt></ruby>ります"),
            ("恐れ入り", "<ruby>恐<rt>おそ</rt></ruby>れ<ruby>入<rt>い</rt></ruby>り"),
            ("ご案内", "ご<ruby>案内<rt>あんない</rt></ruby>"),
            ("案内", "<ruby>案内<rt>あんない</rt></ruby>"),
            ("ご利用", "ご<ruby>利用<rt>りよう</rt></ruby>"),
            ("利用", "<ruby>利用<rt>りよう</rt></ruby>"),
            ("ご購入", "ご<ruby>購入<rt>こうにゅう</rt></ruby>"),
            ("購入", "<ruby>購入<rt>こうにゅう</rt></ruby>"),
            ("ご希望", "ご<ruby>希望<rt>きぼう</rt></ruby>"),
            ("希望", "<ruby>希望<rt>きぼう</rt></ruby>"),
            ("お決まり", "お<ruby>決<rt>き</rt></ruby>まり"),
            ("決まり", "<ruby>決<rt>き</rt></ruby>まり"),
            ("お回り", "お<ruby>回<rt>まわ</rt></ruby>り"),
            ("回り", "<ruby>回<rt>まわ</rt></ruby>り"),
            ("美味しい", "<ruby>美味<rt>おい</rt></ruby>しい"),
            ("美味", "<ruby>美味<rt>おい</rt></ruby>"),
            ("当店", "<ruby>当店<rt>とうてん</rt></ruby>"),
            ("特製", "<ruby>特製<rt>とくせい</rt></ruby>"),
            ("一枚", "<ruby>一枚<rt>いちまい</rt></ruby>"),
            ("行き先", "<ruby>行<rt>い</rt></ruby>き<ruby>先<rt>さき</rt></ruby>"),
            ("駅名", "<ruby>駅名<rt>えきめい</rt></ruby>"),
            ("上がって", "<ruby>上<rt>あ</rt></ruby>がって"),
            ("番号", "<ruby>番号<rt>ばんごう</rt></ruby>"),
            ("番ホーム", "<ruby>番<rt>ばん</rt></ruby>ホーム"),
            ("店内", "<ruby>店内<rt>てんない</rt></ruby>"),
            ("持ち帰り", "<ruby>持<rt>も</rt></ruby>ち<ruby>帰<rt>かえ</rt></ruby>り"),
            ("少々", "<ruby>少々<rt>しょうしょう</rt></ruby>"),
            ("教えて", "<ruby>教<rt>おし</rt></ruby>えて"),
            ("教え", "<ruby>教<rt>おし</rt></ruby>え"),
            ("失礼", "<ruby>失礼<rt>しつれい</rt></ruby>"),
            ("お越し", "お<ruby>越<rt>こ</rt></ruby>し"),
            ("ご用意", "ご<ruby>用意<rt>ようい</rt></ruby>"),
            ("用意", "<ruby>用意<rt>ようい</rt></ruby>"),
            ("緑茶", "<ruby>緑茶<rt>りょくちゃ</rt></ruby>"),
            ("お会計", "お<ruby>会計<rt>かいけい</rt></ruby>"),
            ("お勘定", "お<ruby>勘定<rt>かんじょう</rt></ruby>"),
            ("お待ち", "お<ruby>待<rt>ま</rt></ruby>ち"),
            ("お願い", "お<ruby>願<rt>ねが</rt></ruby>い"),
            ("お手伝い", "お<ruby>手伝<rt>てつだ</rt></ruby>い"),
            ("手伝", "<ruby>手伝<rt>てつだ</rt></ruby>"),
            ("注文", "<ruby>注文<rt>ちゅうもん</rt></ruby>"),
            ("会計", "<ruby>会計<rt>かいけい</rt></ruby>"),
            ("豚骨", "<ruby>豚骨<rt>とんこつ</rt></ruby>"),
            ("醤油", "<ruby>醤油<rt>しょうゆ</rt></ruby>"),
            ("一杯", "<ruby>一杯<rt>いっぱい</rt></ruby>"),
            ("大盛", "<ruby>大盛<rt>おおも</rt></ruby>り"),
            ("定食", "<ruby>定食<rt>ていしょく</rt></ruby>"),
            ("店員", "<ruby>店員<rt>てんいん</rt></ruby>"),
            ("切符", "<ruby>切符<rt>きっぷ</rt></ruby>"),
            ("電車", "<ruby>電車<rt>でんしゃ</rt></ruby>"),
            ("時間", "<ruby>時間<rt>じかん</rt></ruby>"),
            ("場所", "<ruby>場所<rt>ばしょ</rt></ruby>"),
            ("面接", "<ruby>面接<rt>めんせつ</rt></ruby>"),
            ("担当", "<ruby>担当<rt>たんとう</rt></ruby>"),
            ("応募", "<ruby>応募<rt>おうぼ</rt></ruby>"),
            ("長所", "<ruby>長所<rt>ちょうしょ</rt></ruby>"),
            ("短所", "<ruby>短所<rt>たんしょ</rt></ruby>"),
            ("日本語", "<ruby>日本語<rt>にほんご</rt></ruby>"),
            ("英語", "<ruby>英語<rt>えいご</rt></ruby>"),
            ("大学", "<ruby>大学<rt>だいがく</rt></ruby>"),
            ("学生", "<ruby>学生<rt>がくせい</rt></ruby>"),
            ("先生", "<ruby>先生<rt>せんせい</rt></ruby>"),
            ("友達", "<ruby>友達<rt>ともだち</rt></ruby>"),
            ("会社", "<ruby>会社<rt>かいしゃ</rt></ruby>"),
            ("仕事", "<ruby>仕事<rt>しごと</rt></ruby>"),
            ("住所", "<ruby>住所<rt>じゅうしょ</rt></ruby>"),
            ("確認", "<ruby>確認<rt>かくにん</rt></ruby>"),
            ("病院", "<ruby>病院<rt>びょういん</rt></ruby>"),
            ("薬局", "<ruby>薬局<rt>やっきょく</rt></ruby>"),
            ("症状", "<ruby>症状<rt>しょうじょう</rt></ruby>"),
            ("診察", "<ruby>診察<rt>しんさつ</rt></ruby>"),
            ("風邪", "<ruby>風邪<rt>かぜ</rt></ruby>"),
            ("頭痛", "<ruby>頭痛<rt>ずつう</rt></ruby>"),
            ("腹痛", "<ruby>腹痛<rt>ふくつう</rt></ruby>"),
            ("食前", "<ruby>食前<rt>しょくぜん</rt></ruby>"),
            ("食後", "<ruby>食後<rt>しょくご</rt></ruby>"),
            ("毎日", "<ruby>毎日<rt>まいにち</rt></ruby>"),
            ("一日", "<ruby>一日<rt>いちにち</rt></ruby>"),
            ("一回", "<ruby>一回<rt>いっかい</rt></ruby>"),
            ("二回", "<ruby>二回<rt>にかい</rt></ruby>"),
            ("三回", "<ruby>三回<rt>さんかい</rt></ruby>"),
            ("一人", "<ruby>一人<rt>ひとり</rt></ruby>"),
            ("二人", "<ruby>二人<rt>ふたり</rt></ruby>"),
            ("三人", "<ruby>三人<rt>さんにん</rt></ruby>"),
            ("四人", "<ruby>四人<rt>よにん</rt></ruby>"),
            ("交差点", "<ruby>交差点<rt>こうさてん</rt></ruby>"),
            ("信号", "<ruby>信号<rt>しんごう</rt></ruby>"),
            ("本日", "<ruby>本日<rt>ほんじつ</rt></ruby>"),
            ("今日", "<ruby>今日<rt>きょう</rt></ruby>"),
            ("明日", "<ruby>明日<rt>あした</rt></ruby>"),
            ("昨日", "<ruby>昨日<rt>きのう</rt></ruby>"),
            ("来週", "<ruby>来週<rt>らいしゅう</rt></ruby>"),
            ("来月", "<ruby>来月<rt>らいげつ</rt></ruby>"),
            ("今月", "<ruby>今月<rt>こんげつ</rt></ruby>"),
            ("今年", "<ruby>今年<rt>ことし</rt></ruby>"),
            ("現金", "<ruby>現金<rt>げんきん</rt></ruby>"),
            ("値段", "<ruby>値段<rt>ねだん</rt></ruby>"),
            ("質問", "<ruby>質問<rt>しつもん</rt></ruby>"),
            ("練習", "<ruby>練習<rt>れんしゅう</rt></ruby>"),
            ("勉強", "<ruby>勉強<rt>べんきょう</rt></ruby>"),
            ("元気", "<ruby>元気<rt>げんき</rt></ruby>"),
            
            // Chữ đơn lẻ / động từ căn bản
            ("甲殻類", "<ruby>甲殻類<rt>こうかくるい</rt></ruby>"),
            ("海鮮", "<ruby>海鮮<rt>かいせん</rt></ruby>"),
            ("出汁", "<ruby>出汁<rt>だし</rt></ruby>"),
            ("海老", "<ruby>海老<rt>えび</rt></ruby>"),
            ("蟹", "<ruby>蟹<rt>かに</rt></ruby>"),
            ("使われ", "<ruby>使<rt>つか</rt></ruby>われ"),
            ("実", "<ruby>実<rt>じつ</rt></ruby>"),
            ("私", "<ruby>私<rt>わたし</rt></ruby>"),
            ("僕", "<ruby>僕<rt>ぼく</rt></ruby>"),
            ("駅", "<ruby>駅<rt>えき</rt></ruby>"),
            ("道", "<ruby>道<rt>みち</rt></ruby>"),
            ("熱", "<ruby>熱<rt>ねつ</rt></ruby>"),
            ("薬", "<ruby>薬<rt>くすり</rt></ruby>"),
            ("頭", "<ruby>頭<rt>あたま</rt></ruby>"),
            ("喉", "<ruby>喉<rt>のど</rt></ruby>"),
            ("足", "<ruby>足<rt>あし</rt></ruby>"),
            ("痛", "<ruby>痛<rt>いた</rt></ruby>"),
            ("渡", "<ruby>渡<rt>わた</rt></ruby>"),
            ("何", "<ruby>何<rt>なに</rt></ruby>"),
            ("行", "<ruby>行<rt>い</rt></ruby>"),
            ("来", "<ruby>来<rt>き</rt></ruby>"),
            ("帰", "<ruby>帰<rt>かえ</rt></ruby>"),
            ("見", "<ruby>見<rt>み</rt></ruby>"),
            ("聞", "<ruby>聞<rt>き</rt></ruby>"),
            ("話", "<ruby>話<rt>はな</rt></ruby>"),
            ("読", "<ruby>読<rt>よ</rt></ruby>"),
            ("書", "<ruby>書<rt>か</rt></ruby>"),
            ("買", "<ruby>買<rt>か</rt></ruby>"),
            ("食", "<ruby>食<rt>た</rt></ruby>"),
            ("飲", "<ruby>飲<rt>の</rt></ruby>"),
            ("座", "<ruby>座<rt>すわ</rt></ruby>"),
            ("始", "<ruby>始<rt>はじ</rt></ruby>"),
            ("終", "<ruby>終<rt>お</rt></ruby>"),
            ("願", "<ruby>願<rt>ねが</rt></ruby>"),
            ("右", "<ruby>右<rt>みぎ</rt></ruby>"),
            ("左", "<ruby>左<rt>ひだり</rt></ruby>"),
            ("角", "<ruby>角<rt>かど</rt></ruby>"),
            ("朝", "<ruby>朝<rt>あさ</rt></ruby>"),
            ("昼", "<ruby>昼<rt>ひる</rt></ruby>"),
            ("夜", "<ruby>夜<rt>よる</rt></ruby>"),
            ("円", "<ruby>円<rt>えん</rt></ruby>"),
            ("気", "<ruby>気<rt>き</rt></ruby>")
        };

        // Sắp xếp theo chiều dài từ giảm dần để ưu tiên ghép từ ghép trước
        var orderedMap = furiganaDictionary.OrderByDescending(f => f.Word.Length).ToList();
        var placeholders = new Dictionary<string, string>();
        var result = text
            .Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;");

        for (int i = 0; i < orderedMap.Count; i++)
        {
            var item = orderedMap[i];
            if (result.Contains(item.Word))
            {
                var token = $"__RUBY_{i}__";
                placeholders[token] = item.Ruby;
                result = result.Replace(item.Word, token);
            }
        }

        foreach (var kvp in placeholders)
        {
            result = result.Replace(kvp.Key, kvp.Value);
        }

        return CleanFuriganaHtml(result);
    }

    private static readonly Regex RubyTagRegex = new(
        @"<ruby[^>]*>(?:\s*<rp[^>]*>.*?</rp>\s*)?(.*?)(?:\s*<rp[^>]*>.*?</rp>\s*)?<rt[^>]*>(.*?)(?:</rt>|(?=(?:\s*<rp[^>]*>.*?</rp>)*\s*</ruby>))(?:\s*<rp[^>]*>.*?</rp>\s*)?</ruby>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline);

    private static readonly Regex JapaneseSpaceRegex = new(
        @"(?<=[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3001\u3002\uFF01\uFF1F!?,>\uFF09\)])[\s\u3000]+(?=[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3001\u3002\uFF01\uFF1F!?,<\uFF08\(])",
        RegexOptions.Compiled);

    private static readonly Regex RpTagRegex = new(
        @"<rp[^>]*>.*?</rp>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline);

    private static readonly Regex RtTagRegex = new(
        @"<rt[^>]*>.*?(?:</rt>|(?=</ruby>))",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline);

    private static readonly Regex RtInnerContentRegex = new(
        @"<rt[^>]*>(.*?)(?:</rt>|(?=<rp[^>]*>|</ruby>|$))",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline);

    private static readonly Regex AnyHtmlTagRegex = new(
        @"<[^>]*>",
        RegexOptions.Compiled);

    private static readonly Regex AnyRubyMarkupTagRegex = new(
        @"</?(?:ruby|rt|rp)[^>]*>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex RubyStructureTagRegex = new(
        @"^<(/?)(ruby|rt|rp)(?:\s[^<>]*)?>$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex CanonicalRubyTagRegex = new(
        @"^<(/?)(ruby|rt)>$",
        RegexOptions.Compiled);

    private static readonly Regex ValidRtKanaWhitelistRegex = new(
        @"^[\u3040-\u309F\u30A0-\u30FF\u30FC\u309D\u309E\u30FD\u30FE\s]+$",
        RegexOptions.Compiled);

    private static readonly Regex WhitespaceNormRegex = new(
        @"[\s\u3000]+",
        RegexOptions.Compiled);

    private static bool HasValidRubyMarkupStructure(string html, bool canonicalOnly = false)
    {
        int rubyDepth = 0;
        bool inRt = false;
        bool inRp = false;
        bool hasRtInCurrentRuby = false;
        int cursor = 0;

        foreach (Match tagMatch in AnyHtmlTagRegex.Matches(html))
        {
            if (tagMatch.Index > cursor)
            {
                var between = html.AsSpan(cursor, tagMatch.Index - cursor);
                if (between.IndexOfAny('<', '>') >= 0)
                {
                    return false;
                }
            }

            cursor = tagMatch.Index + tagMatch.Length;
            var tag = tagMatch.Value;

            if (canonicalOnly)
            {
                var canonicalMatch = CanonicalRubyTagRegex.Match(tag);
                if (!canonicalMatch.Success)
                {
                    return false;
                }

                bool isClosing = canonicalMatch.Groups[1].Value.Length > 0;
                var name = canonicalMatch.Groups[2].Value;
                if (name == "ruby")
                {
                    if (!isClosing)
                    {
                        if (rubyDepth != 0 || inRt) return false;
                        rubyDepth = 1;
                        hasRtInCurrentRuby = false;
                    }
                    else
                    {
                        if (rubyDepth != 1 || inRt || !hasRtInCurrentRuby) return false;
                        rubyDepth = 0;
                        hasRtInCurrentRuby = false;
                    }
                }
                else
                {
                    if (!isClosing)
                    {
                        if (rubyDepth != 1 || inRt) return false;
                        inRt = true;
                        hasRtInCurrentRuby = true;
                    }
                    else
                    {
                        if (rubyDepth != 1 || !inRt) return false;
                        inRt = false;
                    }
                }
                continue;
            }

            var structMatch = RubyStructureTagRegex.Match(tag);
            if (!structMatch.Success)
            {
                return false;
            }

            bool closing = structMatch.Groups[1].Value.Length > 0;
            var tagName = structMatch.Groups[2].Value.ToLowerInvariant();

            switch (tagName)
            {
                case "ruby":
                    if (!closing)
                    {
                        if (rubyDepth != 0 || inRt || inRp) return false;
                        rubyDepth = 1;
                        hasRtInCurrentRuby = false;
                    }
                    else
                    {
                        if (rubyDepth != 1 || inRp || !hasRtInCurrentRuby) return false;
                        rubyDepth = 0;
                        inRt = false;
                        hasRtInCurrentRuby = false;
                    }
                    break;

                case "rt":
                    if (!closing)
                    {
                        if (rubyDepth != 1 || inRt || inRp) return false;
                        inRt = true;
                        hasRtInCurrentRuby = true;
                    }
                    else
                    {
                        if (rubyDepth != 1 || !inRt || inRp) return false;
                        inRt = false;
                    }
                    break;

                case "rp":
                    if (!closing)
                    {
                        if (rubyDepth != 1 || inRp) return false;
                        inRt = false;
                        inRp = true;
                    }
                    else
                    {
                        if (rubyDepth != 1 || !inRp) return false;
                        inRp = false;
                    }
                    break;

                default:
                    return false;
            }
        }

        if (cursor < html.Length)
        {
            var trailing = html.AsSpan(cursor);
            if (trailing.IndexOfAny('<', '>') >= 0)
            {
                return false;
            }
        }

        return rubyDepth == 0 && !inRt && !inRp;
    }

    private static bool HasInvalidRtContent(string html)
    {
        foreach (Match match in RtInnerContentRegex.Matches(html))
        {
            var stripped = AnyHtmlTagRegex.Replace(match.Groups[1].Value, string.Empty);
            var normalized = WebUtility.HtmlDecode(stripped).Normalize(NormalizationForm.FormKC);
            if (string.IsNullOrWhiteSpace(normalized)
                || !ValidRtKanaWhitelistRegex.IsMatch(normalized)
                || HasVietnameseLeak(normalized))
            {
                return true;
            }
        }
        return false;
    }

    public static string StripRubyTags(string? html)
    {
        if (string.IsNullOrWhiteSpace(html)) return string.Empty;
        var stripped = RpTagRegex.Replace(html, string.Empty);
        stripped = RtTagRegex.Replace(stripped, string.Empty);
        stripped = AnyRubyMarkupTagRegex.Replace(stripped, string.Empty);
        return stripped.Trim();
    }

    public static string EnsureFuriganaParity(string? candidateFuriganaHtml, string? plainJapaneseText)
    {
        var plainJa = (plainJapaneseText ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(plainJa)) return string.Empty;

        if (string.IsNullOrWhiteSpace(candidateFuriganaHtml)
            || HasVietnameseLeak(candidateFuriganaHtml)
            || !HasValidRubyMarkupStructure(candidateFuriganaHtml, canonicalOnly: false)
            || HasInvalidRtContent(candidateFuriganaHtml))
        {
            return GenerateFuriganaHtml(plainJa);
        }

        var cleaned = CleanFuriganaHtml(candidateFuriganaHtml);
        if (string.IsNullOrWhiteSpace(cleaned)
            || HasVietnameseLeak(cleaned)
            || !HasValidRubyMarkupStructure(cleaned, canonicalOnly: true)
            || HasInvalidRtContent(cleaned))
        {
            return GenerateFuriganaHtml(plainJa);
        }

        static string NormalizeForParity(string s) =>
            WhitespaceNormRegex.Replace(s.Normalize(NormalizationForm.FormKC), string.Empty);

        var stripped = StripRubyTags(cleaned);
        if (!string.Equals(NormalizeForParity(stripped), NormalizeForParity(plainJa), StringComparison.Ordinal))
        {
            return GenerateFuriganaHtml(plainJa);
        }

        return cleaned;
    }

    /// <summary>
    /// Làm sạch thẻ ruby phát sinh từ AI:
    /// - Đưa trợ từ, hiragana, dấu câu ra ngoài thẻ ruby (vd: ruby は海老 rt えび /ruby -> は ruby 海老 rt えび /ruby)
    /// - Đưa okurigana ra ngoài thẻ ruby (vd: ruby 使われ rt つかわれ /ruby -> ruby 使 rt つか /ruby われ)
    /// - Gỡ thẻ ruby nếu chữ gốc hoàn toàn là kana
    /// - Loại bỏ khoảng trắng thừa giữa các ký tự tiếng Nhật và thẻ ruby
    /// </summary>
    public static string CleanFuriganaHtml(string? html)
    {
        if (string.IsNullOrWhiteSpace(html)) return string.Empty;

        // 1. Loại bỏ khoảng trắng thừa giữa chữ Nhật và thẻ ruby
        var cleaned = JapaneseSpaceRegex.Replace(html, "");

        // 2. Chuẩn hóa từng thẻ ruby
        cleaned = RubyTagRegex.Replace(cleaned, match =>
        {
            var baseText = match.Groups[1].Value.Trim();
            var rtText = AnyHtmlTagRegex.Replace(match.Groups[2].Value, string.Empty).Trim();

            if (string.IsNullOrEmpty(baseText)) return string.Empty;
            if (string.IsNullOrEmpty(rtText)) return baseText;

            // Nếu baseText hoàn toàn không chứa chữ Hán
            if (!Regex.IsMatch(baseText, @"[\u4E00-\u9FAF\u3400-\u4DBF\uF900-\uFAFF\u3005]"))
            {
                return baseText;
            }

            // Tách các ký tự non-kanji ở đầu (vd: お, ご, カウンター) và đồng bộ cắt phần đọc tương ứng ở đầu rtText
            var leadingNonKanjiMatch = Regex.Match(baseText, @"^([^\u4E00-\u9FAF\u3400-\u4DBF\uF900-\uFAFF\u3005]+)([\u4E00-\u9FAF\u3400-\u4DBF\uF900-\uFAFF\u3005].*)$");
            string prefix = string.Empty;
            if (leadingNonKanjiMatch.Success)
            {
                prefix = leadingNonKanjiMatch.Groups[1].Value;
                baseText = leadingNonKanjiMatch.Groups[2].Value;

                static string ToHiragana(string s)
                {
                    var sb = new StringBuilder(s.Length);
                    foreach (var c in s)
                    {
                        if (c >= '\u30A1' && c <= '\u30F6')
                            sb.Append((char)(c - 0x60));
                        else
                            sb.Append(c);
                    }
                    return sb.ToString();
                }

                var prefixHira = ToHiragana(prefix);
                var rtHira = ToHiragana(rtText);
                if (prefixHira.Length > 0 && rtText.Length > prefixHira.Length && rtHira.StartsWith(prefixHira, StringComparison.Ordinal))
                {
                    rtText = rtText[prefixHira.Length..];
                }
            }

            // Tách các ký tự kana trùng lặp ở đuôi giữa baseText và rtText
            string suffix = string.Empty;
            while (baseText.Length > 0 && rtText.Length > 0 &&
                   !Regex.IsMatch(baseText[^1].ToString(), @"[\u4E00-\u9FAF\u3400-\u4DBF\uF900-\uFAFF\u3005]") &&
                   baseText[^1] == rtText[^1])
            {
                suffix = baseText[^1] + suffix;
                baseText = baseText[..^1];
                rtText = rtText[..^1];
            }

            // Tách các ký tự non-kanji còn sót ở cuối baseText nếu rtText không kết thúc bằng nó
            var trailingNonKanjiMatch = Regex.Match(baseText, @"^(.*?[\u4E00-\u9FAF\u3400-\u4DBF\uF900-\uFAFF\u3005])([^\u4E00-\u9FAF\u3400-\u4DBF\uF900-\uFAFF\u3005]+)$");
            if (trailingNonKanjiMatch.Success)
            {
                baseText = trailingNonKanjiMatch.Groups[1].Value;
                suffix = trailingNonKanjiMatch.Groups[2].Value + suffix;
            }

            return $"{prefix}<ruby>{baseText}<rt>{rtText}</rt></ruby>{suffix}";
        });

        // 3. Quét lại loại bỏ khoảng trắng phát sinh xung quanh thẻ ruby và sửa các cụm tách ruby hỏng thường gặp
        cleaned = cleaned
            .Replace("<ruby>大丈<rt>だいじょう</rt></ruby>夫", "<ruby>大丈夫<rt>だいじょうぶ</rt></ruby>", StringComparison.Ordinal)
            .Replace("<ruby>少<rt>しょう</rt></ruby>々", "<ruby>少々<rt>しょうしょう</rt></ruby>", StringComparison.Ordinal);
        cleaned = JapaneseSpaceRegex.Replace(cleaned, "");
        return cleaned;
    }

    private static readonly Regex VietnameseCharOrWordRegex = new(
        @"[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]|\b(cháu|cụ|bác|ông|bà|anh|chi|chị|em|bạn|tôi|mình|thật|tốt|bụng|cẩn|thận|nhé|đi|về|nhiều|lắm|người|cảm|ơn|xin|chào|dịch|nghĩa|rất|hãy)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex JapaneseCharacterRegex = new(
        @"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]",
        RegexOptions.Compiled);

    /// <summary>
    /// Kiểm tra xem chuỗi có bị rò rỉ ký tự hoặc từ ngữ tiếng Việt hay không.
    /// </summary>
    public static bool HasVietnameseLeak(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        return VietnameseCharOrWordRegex.IsMatch(text);
    }

    /// <summary>
    /// Khử sạch hoàn toàn tiếng Việt bị rò rỉ vào câu thoại tiếng Nhật (Japanese Utterance),
    /// bảo đảm câu thoại AI luôn 100% tiếng Nhật chuẩn mực.
    /// </summary>
    public static string SanitizeJapaneseReply(string? jaText, string? fallbackJa = null)
    {
        if (string.IsNullOrWhiteSpace(jaText))
        {
            return fallbackJa ?? "本当にありがとうございました。";
        }

        var text = jaText.Trim();

        // 1. Loại bỏ các phần chú thích trong ngoặc đơn nếu có chữ Latin/tiếng Việt
        // ví dụ: "本当にありがとうございます。(Cháu đi cẩn thận nhé)" -> "本当にありがとうございます。"
        text = Regex.Replace(text, @"[\(（][^\)）]*[a-zA-ZàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ][^\)）]*[\)）]", "").Trim();

        // 2. Nếu phát hiện tiếng Việt bị nối sau câu tiếng Nhật (VD: "本当にありがとうございます。 cháu thật là một người tốt bụng...")
        var match = VietnameseCharOrWordRegex.Match(text);
        if (match.Success)
        {
            // Cắt lấy phần câu tiếng Nhật trước vị trí rò rỉ tiếng Việt
            var cutIndex = match.Index;
            var cleanPrefix = text.Substring(0, cutIndex).Trim();

            // Nếu phần prefix có chứa chữ Hán/Hiragana/Katakana hợp lệ, giữ lại phần đó
            if (JapaneseCharacterRegex.IsMatch(cleanPrefix))
            {
                cleanPrefix = cleanPrefix.TrimEnd(' ', '　', ',', '、');
                if (!cleanPrefix.EndsWith("。") && !cleanPrefix.EndsWith("！") && !cleanPrefix.EndsWith("？") && !cleanPrefix.EndsWith("!"))
                {
                    cleanPrefix += "。";
                }
                return JapaneseSpaceRegex.Replace(cleanPrefix, "");
            }

            // Nếu toàn bộ chuỗi đều là tiếng Việt, trả về câu tiếng Nhật chuẩn dự phòng
            return fallbackJa ?? "本当にありがとうございました。気をつけてお帰りください。";
        }

        return JapaneseSpaceRegex.Replace(text, "");
    }
}
