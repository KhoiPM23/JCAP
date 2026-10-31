using System.Text.RegularExpressions;

namespace JCAP.Services.Implementations;

/// <summary>
/// Bộ điều phối gán giọng VOICEVOX thông minh dựa trên Persona, ngữ cảnh và vai trò trong kịch bản.
/// Hỗ trợ kịch bản đa vai (Multi-role) và gán giọng đọc mẫu chuẩn cho học viên.
/// </summary>
public static class VoiceVoxPersonaResolver
{
    public record PersonaVoiceResolution(
        int RecommendedAiVoiceId,
        string RecommendedAiVoiceName,
        int RecommendedLearnerVoiceId,
        string RecommendedLearnerVoiceName,
        Dictionary<string, int> RoleVoiceMappings
    );

    // Bảng cấu hình Voice ID chuẩn từ VoiceVox Engine
    public const int VoiceChibiShikiJii = 42;      // ちび式じい (Ông lão thông thái/cao tuổi)
    public const int VoiceNurseRoboTypeT = 47;     // ナースロボ＿タイプＴ (Giọng nhẹ nhàng, dịu dàng, y tế/chăm sóc)
    public const int VoiceSayo = 46;               // 小夜/SAYO (Phụ nữ trưởng thành, trầm tĩnh)
    public const int VoiceKenzakiMesuo = 11;       // 剣崎雌雄 (Bác sĩ nam điềm tĩnh, ấm áp)
    public const int VoiceAmehareHau = 10;         // 雨晴はう (Y tá nữ duyên hải Toyama, nhẹ nhàng)
    public const int VoiceAoyamaRyusei = 13;       // 青山龍星 (Nam phát thanh viên, cấp trên, phỏng vấn, đĩnh đạc)
    public const int VoiceNo7 = 29;                // No.7 (Nữ phát thanh viên chuyên nghiệp, doanh nghiệp)
    public const int VoiceShikokuMetan = 2;        // 四国めたん (Nữ sinh thanh lịch, nhân viên lịch sự, chuẩn Tokyo)
    public const int VoiceKuronoTakehiro = 5;      // 玄野武宏 (Nam thanh niên Tokyo, chuẩn mực, tự nhiên)
    public const int VoiceKasukabeTsumugi = 8;     // 春日部つむぎ (Nữ VTuber Saitama, trẻ trung, bạn bè)
    public const int VoiceZundamon = 3;            // ずんだもん (Linh vật dễ thương, thiếu nhi)
    public const int VoiceShirakamiKotaro = 28;    // 白上虎太郎 (Thiếu niên năng động)
    public const int VoiceTohokuKiritan = 59;      // 東北きりたん (Nữ sinh nhỏ tuổi)

    /// <summary>
    /// Phân tích bối cảnh để tự động chọn cặp giọng (AI persona voice, Learner sample voice, Multi-role mappings)
    /// </summary>
    public static PersonaVoiceResolution Resolve(
        string? aiPersona,
        string? scenarioTitle,
        string? scenarioContext,
        string? jlptLevel = null)
    {
        var combinedText = $"{aiPersona} {scenarioTitle} {scenarioContext}".ToLowerInvariant();

        int aiVoiceId;
        string aiVoiceName;
        var roleMappings = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        // 1. Nhóm Người cao tuổi (Elderly: cụ già, ông lão, bà lão, お年寄り)
        if (Regex.IsMatch(combinedText, @"(cụ già|người già|ông lão|bà lão|bác lớn tuổi|cao tuổi|hưu trí|お年寄り|高齢者|おじい|おばあ|elderly|grandpa|grandma)"))
        {
            if (Regex.IsMatch(combinedText, @"(bà|cụ bà|nữ|woman|lady|おばあ)"))
            {
                aiVoiceId = VoiceSayo;
                aiVoiceName = "Sayo (Bà lão / Phụ nữ lớn tuổi điềm đạm)";
            }
            else
            {
                aiVoiceId = VoiceChibiShikiJii;
                aiVoiceName = "Chibi Shiki-jii (Cụ già / Ông lão trầm ấm)";
            }
            roleMappings["Cụ già"] = aiVoiceId;
            roleMappings["Người già"] = aiVoiceId;
        }
        // 2. Nhóm Y tế, Bệnh viện, Bác sĩ (Medical / Doctor / Clinic)
        else if (Regex.IsMatch(combinedText, @"(bác sĩ|bác sỹ|khám bệnh|phòng khám|bệnh viện|y tế|toa thuốc|bệnh nhân|医師|医者|病院|clinic|doctor|hospital)"))
        {
            if (Regex.IsMatch(combinedText, @"(y tá|điều dưỡng|nữ|nurse)"))
            {
                aiVoiceId = VoiceAmehareHau;
                aiVoiceName = "Amehare Hau (Y tá nữ ân cần)";
            }
            else
            {
                aiVoiceId = VoiceKenzakiMesuo;
                aiVoiceName = "Kenzaki Mesuo (Bác sĩ nam điềm tĩnh, ấm áp)";
            }
            roleMappings["Bác sĩ"] = VoiceKenzakiMesuo;
            roleMappings["Y tá"] = VoiceAmehareHau;
        }
        // 3. Nhóm Công sở, Phỏng vấn xin việc, Cấp trên (Business / Corporate / Interview)
        else if (Regex.IsMatch(combinedText, @"(phỏng vấn|xin việc|nhà tuyển dụng|giám đốc|trưởng phòng|cấp trên|sếp|doanh nghiệp|họp|báo cáo|面接|上司|部長|社長|面接官|interview|boss|manager)"))
        {
            if (Regex.IsMatch(combinedText, @"(nữ|chị|cô|woman|female)"))
            {
                aiVoiceId = VoiceNo7;
                aiVoiceName = "No.7 (Phát thanh viên / Nhà tuyển dụng nữ chuyên nghiệp)";
            }
            else
            {
                aiVoiceId = VoiceAoyamaRyusei;
                aiVoiceName = "Aoyama Ryusei (Cấp trên / Phỏng vấn viên nam đĩnh đạc)";
            }
            roleMappings["Người phỏng vấn"] = aiVoiceId;
            roleMappings["Cấp trên"] = aiVoiceId;
        }
        // 4. Nhóm Dịch vụ, Quán ăn, Cửa hàng, Nhà ga (Service / Retail / Hospitality)
        else if (Regex.IsMatch(combinedText, @"(nhân viên|phục vụ|bán hàng|quán ăn|nhà hàng|tiệm|siêu thị|combini|konbini|quầy vé|khách sạn|thu ngân|quán cafe|cà phê|cafe|barista|バリスタ|店員|接客|レジ|waiter|staff|clerk)"))
        {
            if (Regex.IsMatch(combinedText, @"(nam|anh|male)"))
            {
                aiVoiceId = VoiceKuronoTakehiro;
                aiVoiceName = "Kurono Takehiro (Nhân viên nam lịch sự)";
            }
            else
            {
                aiVoiceId = VoiceShikokuMetan;
                aiVoiceName = "Shikoku Metan (Nhân viên nữ thanh lịch, lịch sự)";
            }
            roleMappings["Nhân viên"] = aiVoiceId;
            roleMappings["Phục vụ"] = aiVoiceId;
            roleMappings["Barista"] = aiVoiceId;
            roleMappings["バリスタ"] = aiVoiceId;
        }
        // 5. Nhóm Bạn bè, Đồng nghiệp ngang hàng, Bạn cùng lớp (Friends / Casual)
        else if (Regex.IsMatch(combinedText, @"(bạn bè|bạn thân|đồng nghiệp|bạn cùng lớp|bạn học|rủ rê|tiệc tùng|hẹn hò|友達|同僚|クラスメイト|friend|classmate|coworker)"))
        {
            if (Regex.IsMatch(combinedText, @"(nam|cậu|ông bạn|anh bạn|male)"))
            {
                aiVoiceId = VoiceKuronoTakehiro;
                aiVoiceName = "Kurono Takehiro (Bạn nam thân thiện)";
            }
            else
            {
                aiVoiceId = VoiceKasukabeTsumugi;
                aiVoiceName = "Kasukabe Tsumugi (Bạn nữ năng động, vui vẻ)";
            }
            roleMappings["Bạn bè"] = aiVoiceId;
            roleMappings["Đồng nghiệp"] = aiVoiceId;
        }
        // 6. Nhóm Thiếu nhi / Linh vật hoạt hình (Mascot / Anime / Kids)
        else if (Regex.IsMatch(combinedText, @"(linh vật|đậu nành|hoạt hình|trẻ em|bé|bé gái|zundamon|mascot|kid|child)"))
        {
            aiVoiceId = VoiceZundamon;
            aiVoiceName = "Zundamon (Linh vật đậu nành đáng yêu)";
            roleMappings["Linh vật"] = aiVoiceId;
        }
        // 7. Nhóm Mặc định (Default Neutral fallback theo giới tính persona)
        else
        {
            if (Regex.IsMatch(combinedText, @"(nam|ông|anh|bác trai|chú|male|mr)"))
            {
                aiVoiceId = VoiceKuronoTakehiro;
                aiVoiceName = "Kurono Takehiro (Giọng nam chuẩn Tokyo)";
            }
            else
            {
                aiVoiceId = VoiceShikokuMetan;
                aiVoiceName = "Shikoku Metan (Giọng nữ chuẩn mực, lịch sự)";
            }
            roleMappings["Nhân vật chính"] = aiVoiceId;
        }

        // Giọng đọc phát âm mẫu chuẩn cho Người học:
        // Sử dụng Shikoku Metan (ID 2 - Chuẩn Tokyo, phát âm rõ từng âm tiết tiếng Nhật)
        const int learnerVoiceId = VoiceShikokuMetan;
        const string learnerVoiceName = "Shikoku Metan (Phát âm mẫu chuẩn Tokyo)";

        roleMappings["Học viên (Đọc mẫu)"] = learnerVoiceId;

        return new PersonaVoiceResolution(
            aiVoiceId,
            aiVoiceName,
            learnerVoiceId,
            learnerVoiceName,
            roleMappings
        );
    }
}
