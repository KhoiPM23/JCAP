using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using JCAP.DTOs.Roleplay;
using JCAP.Models;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations;

public partial class AiRoleplayService : IAiRoleplayService
{
    private static readonly Regex ForeignLanguagePatternRegex = new(
        @"[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]|\b(toi\s+muon|cho\s+toi|toi\s+la|em\s+la|xin\s+chao|cam\s+on|khong\s+co|co\s+the|lam\s+viec|thoi\s+gian|phuong\s+tien|di\s+lai|ca\s+dem|nghi\s+phep|muon\s+goi|mot\s+bat|1\s+bat|muon|goi|khong|duoc|tieng|viet|chao|ngay|tuan|phuong|phep|luong|hello|want|order|please|i\s+would\s+like)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex RomajiJapaneseRegex = new(
        @"\b(arigatou|arigato|konnichiwa|konbanwa|ohayou|ohayo|kore|sore|are|doko|ikura|desu|masu|kudasai|onegaishimasu|onegai|sumimasen|ramen|oishii|hai|iie|watashi|boku|ore|anata|mizu|ocha|gohan|sushi|tempura|chuumon|kaikei|ikaga|nanmei|hitori|futari)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static bool IsLikelyRomaji(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        bool hasJapaneseChar = Regex.IsMatch(text, @"[぀-ゟ゠-ヿ一-龯]");
        if (hasJapaneseChar) return false;
        return RomajiJapaneseRegex.IsMatch(text) || Regex.IsMatch(text, @"\b(kore\s+wa\s+ikura|ikura\s+desu\s+ka)\b", RegexOptions.IgnoreCase);
    }

    private static bool IsLikelyForeignOrVietnamese(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        return ForeignLanguagePatternRegex.IsMatch(text);
    }

    private string BuildSystemInstruction(Scenario scenario, ScenarioLevelConfiguration levelConfig)
    {
        var reg = RoleplaySocialRegister.Deduce(scenario.Title, levelConfig.AiPersona, levelConfig.Description);

        var sb = new StringBuilder();
        sb.AppendLine("You are an authentic Japanese roleplay conversational partner in the JCAP platform.");
        sb.AppendLine("[SCENARIO CONTEXT]");
        sb.AppendLine($"- Title: {scenario.Title}");
        sb.AppendLine($"- Role/Persona: {levelConfig.AiPersona}");
        sb.AppendLine($"- Context: {levelConfig.Description}");
        sb.AppendLine($"- Target JLPT Level: {levelConfig.JLPTLevel}");
        sb.AppendLine("[STRICT ROLE BOUNDARY & ANTI-ROLE-REVERSAL]");
        sb.AppendLine($"- YOUR ROLE ONLY: You are exclusively '{levelConfig.AiPersona}'. The human user is the LEARNER playing the counterpart role.");
        sb.AppendLine("- NEVER reverse roles or speak/ask questions that belong to the learner's role (e.g., if you are shop/station/cafe staff, NEVER ask the customer 'いくらですか？', 'メニューを見せてください', 'お会計をお願いします', or 'ごちそうさまでした').");
        sb.AppendLine("- NEVER break the 4th wall: Stay 100% inside the fictional scene. Do NOT say '練習しましょう' (let's practice) or mention lessons/missions unless your persona is explicitly a teacher/mentor.");
        sb.AppendLine("- NEVER hallucinate or pre-assume orders: NEVER assume the learner ordered an item from the target vocabulary list (e.g., never assume 'アイスカフェラテ' when they only said 'コーヒー' or asked for the menu).");
        sb.AppendLine("- ALWAYS answer the learner's direct question FIRST (price, restroom location, menu, Suica purchase steps, etc.) before politely moving the conversation forward.");
        sb.AppendLine("[VIETNAMESE PRONOUN & SOCIAL REGISTER (VAI VẾ XƯNG HÔ) - STRICT ZERO-SLASH & ADAPTIVE RULES]");
        sb.AppendLine($"- Baseline Register Suggestion: {reg.RegisterDescription}");
        sb.AppendLine($"- Suggested Baseline: Learner = '{reg.LearnerSelf}' addressing '{reg.LearnerAddressAi}'; AI Persona = '{reg.AiSelf}' addressing '{reg.AiAddressLearner}'.");
        sb.AppendLine("- ADAPTIVE NUANCE: Deeply understand the real interpersonal relationship and tone from the scenario context. If the context reflects a specific relationship (e.g., close friends/buddies -> mày/tao or cậu/tớ; school/work seniors -> anh/chị - em; family -> bố/mẹ - con; service encounter -> tôi - quý khách; elderly -> cháu - cụ), adopt the single most culturally natural Vietnamese pronoun pair.");
        sb.AppendLine("- ZERO-SLASH ENFORCEMENT: STRICTLY FORBIDDEN to use slash alternatives (NEVER write 'mày/cậu', 'cụ/bạn', 'cháu/em', 'ông/bà', 'tôi/mình') in ANY Vietnamese output. Pick and use ONLY ONE single, definitive, culturally authentic pronoun pair.");
        sb.AppendLine("- CONSISTENCY: Maintain that chosen pronoun pair consistently across all Vietnamese fields (userVietnameseMeaning, replyVietnamese, and linguisticFeedback).");
        if (levelConfig.TargetVocabularies?.Count > 0)
        {
            sb.AppendLine("[LEARNER TARGET VOCABULARIES (FOR EVALUATING LEARNER ONLY — NEVER ASSUME UNORDERED ITEMS FROM THIS LIST)]");
            foreach (var v in levelConfig.TargetVocabularies)
            {
                sb.AppendLine($"- {v.Word}{(string.IsNullOrWhiteSpace(v.Reading) ? "" : $" ({v.Reading})")}: {v.Meaning}");
            }
        }
        if (levelConfig.TargetGrammars?.Count > 0)
        {
            sb.AppendLine("[LEARNER TARGET GRAMMAR PATTERNS (FOR EVALUATING LEARNER ONLY — NEVER SPEAK LEARNER QUESTIONS AS AI)]");
            foreach (var g in levelConfig.TargetGrammars)
            {
                sb.AppendLine($"- {g.Pattern}: {g.Meaning}{(string.IsNullOrWhiteSpace(g.ExampleSentence) ? "" : $" (VD: {g.ExampleSentence})")}");
            }
        }
        sb.AppendLine("[CORE GUARDRAILS]");
        sb.AppendLine($"- Roleplay fidelity: Stay in character naturally; never break persona.");
        sb.AppendLine($"- STRICT MONOLINGUAL PERSONA: You are a native Japanese resident who speaks and understands ONLY Japanese. You have ZERO comprehension of Vietnamese (both accented and unaccented), English, or any foreign language.");
        sb.AppendLine($"  * replyJapanese MUST contain 100% Japanese text ONLY (Kanji, Hiragana, Katakana, and Japanese punctuation).");
        sb.AppendLine($"  * ABSOLUTELY NEVER include, leak, append, or interpolate ANY Vietnamese words, Roman letters, English words, or translations inside replyJapanese (e.g. NEVER write 'cháu...', 'cảm ơn...', or '(dịch nghĩa...)').");
        sb.AppendLine($"  * All Vietnamese meanings and translations belong EXCLUSIVELY in replyVietnamese.");
        sb.AppendLine($"  * If the learner uses ANY non-Japanese words, Vietnamese text, or foreign language (e.g., 'toi muon', 'cho toi', 'hello', 'want', 'order'):");
        sb.AppendLine($"  * NEVER try to guess, deduce, infer, echo, or confirm ANY partial keywords or intent.");
        sb.AppendLine($"  * Even if the learner mentions a faint keyword like 'tonkotsu ramen' or 'ramen' inside non-Japanese text, act as if you did not recognize it at all.");
        sb.AppendLine($"  * STRICTLY FORBIDDEN: NEVER say '...ですね', '...ですか', or 'かしこまりました' when foreign/mixed language is used.");
        sb.AppendLine($"  * Your ONLY allowed response is polite native Japanese incomprehension requesting them to speak Japanese (e.g., '恐れ入りますが、外国語は分かりませんので、日本語でお話しいただけますでしょうか。').");
        sb.AppendLine($"  * CRITICAL EXCEPTION: If the learner wrote in Japanese characters (Kanji/Hiragana/Katakana) with NO foreign/Vietnamese words — even with grammar errors or symbols like '～' — DO NOT treat it as foreign language; engage naturally in roleplay and gently fix their phrasing in linguisticFeedback.");
        sb.AppendLine($"- Strict Language Requirement: The learner MUST speak in Japanese (Kanji, Kana, or standard Japanese Romaji). If the learner uses Vietnamese, English, or non-Japanese text, NEVER mark any missions completed (completedMissionIds: []), mark linguisticFeedback status as \"Error\", and do not advance the scenario.");
        sb.AppendLine("[ACTIVE LISTENING & HUMAN CONVERSATIONAL FOUNDATION]");
        sb.AppendLine("- ALWAYS acknowledge, react to, or validate what the learner just expressed FIRST (even if imperfect, brief, unexpected, or slightly off-script), so the learner genuinely feels heard by a real human.");
        sb.AppendLine("- Handle unexpected learner questions, hesitations, topic shifts, or changes of mind gracefully in-character (1 empathetic beat), then smoothly steer back toward the scenario goal without robotic repetition.");
        sb.AppendLine("- Keep replyJapanese concise and natural (1-2 spoken sentences maximum).");
        var level = (levelConfig.JLPTLevel ?? "N5").ToUpperInvariant().Trim();
        sb.AppendLine($"[PEDAGOGICAL DIFFICULTY ADAPTATION FOR JLPT {level}]");
        if (level == "N5")
        {
            sb.AppendLine("- TARGET AUDIENCE: Absolute beginner Japanese learner (JLPT N5, Minna no Nihongo Lesson 1-25).");
            sb.AppendLine("- SENTENCE STRUCTURE & BREVITY: STRICTLY 1-2 very short, simple sentences (target 12-28 Japanese characters total, max ~35 characters). Never write long multi-clause replies.");
            sb.AppendLine("- GRAMMAR BOUNDARIES: Strictly limit grammar to basic polite form (~です / ~ます / ~ました / ~ません), basic questions (~ですか), and simple requests (~をください, ~お願いします, ~ましょうか). NEVER use Sonkeigo/Kenjougo ('～いたします', '～いただけますでしょうか', '恐れ入りますが', '～でございます', '～いらっしゃる', '～申す').");
            sb.AppendLine("- VOCABULARY RESTRICTIONS: Use elementary daily vocabulary. Avoid technical or Sino-Japanese (Kango) compound words (e.g., say 'えび・かに' instead of '甲殻類'; say 'やさい' instead of '植物性原料').");
            sb.AppendLine("- CONVERSATIONAL TONE: Warm, natural, patient, and flexible. React genuinely to what the learner actually said, then ask one clear, easy question (e.g., 'スープはどうしますか？', 'ラーメンはどれにしますか？').");
        }
        else if (level == "N4")
        {
            sb.AppendLine("- TARGET AUDIENCE: Elementary Japanese learner (JLPT N4, Minna no Nihongo Lesson 26-50).");
            sb.AppendLine("- SENTENCE STRUCTURE: Natural spoken Japanese (1-2 sentences, target 25-48 Japanese characters) with moderate compounding (~てください, ~てもいいですか, ~てから, ~たら, ~ので, ~と思います).");
            sb.AppendLine("- GRAMMAR BOUNDARIES: Use standard Teinei form with mild polite expressions. Avoid heavy business/hotel Keigo.");
            sb.AppendLine("- VOCABULARY: Common conversational service and daily life vocabulary (approx 1,500 common words).");
            sb.AppendLine("- CONVERSATIONAL TONE: Friendly, natural, responsive. Acknowledge learner nuance first, then guide smoothly.");
        }
        else
        {
            sb.AppendLine("- TARGET AUDIENCE: Intermediate Japanese learner (JLPT N3+).");
            sb.AppendLine("- SENTENCE STRUCTURE: Natural authentic native pace (1-2 sentences, ~35-70 Japanese characters), idioms, and compound sentences.");
            sb.AppendLine("- GRAMMAR BOUNDARIES: Standard business/service keigo (~でございます, ~ていただけますか), passive (~られる), causative (~させる), natural transitions.");
            sb.AppendLine("- VOCABULARY: Rich authentic terminology and nuanced vocabulary.");
            sb.AppendLine("- CONVERSATIONAL TONE: Authentic native Japanese dialogue reflecting realistic societal scenarios.");
        }
        sb.AppendLine($"- Brevity: Keep responses concise (1-2 sentences) simulating real-world spoken Japanese.");
        sb.AppendLine($"- Non-preemption: NEVER mention, answer, or complete pending missions for the learner; wait for them to initiate.");
        sb.AppendLine($"- Conversational cueing: Respond only to the current turn with open-ended cues, leaving space for the learner to drive the next mission.");
        sb.AppendLine($"- Output format: Always return valid, pure JSON matching the requested schema.");
        return sb.ToString();
    }

    // ==========================================
    // MOCK SIMULATOR (Dự phòng khi offline / hết quota / chưa nhập Key)
    // Tự động suy luận vai vế xưng hô & tiến trình nhiệm vụ linh hoạt
    // ==========================================
    private static AiOpeningMessageResult GenerateSimulatorOpeningMessage(Scenario scenario, ScenarioLevelConfiguration levelConfig)
    {
        return RoleplaySocialRegister.GenerateOpeningMessage(scenario, levelConfig);
    }

    private static AiTurnResult ProcessSimulatorTurn(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        string userMessage,
        List<Mission> pendingMissions)
    {
        return RoleplaySocialRegister.ProcessGenericTurn(scenario, levelConfig, userMessage, pendingMissions);
    }

    private static RoleplayHintDto GenerateSimulatorHint(
        ScenarioLevelConfiguration levelConfig,
        List<Mission> pendingMissions)
    {
        return RoleplaySocialRegister.GenerateHint(levelConfig, pendingMissions);
    }

    internal static string BuildContextFallbackAlternative(
        Scenario scenario,
        ScenarioLevelConfiguration levelConfig,
        List<Mission> pendingMissions)
    {
        var ctx = $"{scenario.Title} {scenario.ScenarioCode} {levelConfig.AiPersona} {levelConfig.Description}".ToLowerInvariant();
        if (ctx.Contains("ramen") || ctx.Contains("mì")) return "とんこつラーメンをお願いします。";
        if (ctx.Contains("cafe") || ctx.Contains("cà phê")) return "アイスコーヒーをお願いします。";
        if (ctx.Contains("ga") || ctx.Contains("tàu") || ctx.Contains("駅")) return "新宿駅までの切符をお願いします。";
        if (ctx.Contains("phỏng vấn") || ctx.Contains("baito") || ctx.Contains("công sở")) return "よろしくお願いいたします。";
        if (ctx.Contains("bệnh viện") || ctx.Contains("khám")) return "すみません、診察をお願いします。";
        if (ctx.Contains("tiện lợi") || ctx.Contains("konbini")) return "お弁当をひとつお願いします。";

        var sampleWord = levelConfig.TargetVocabularies?.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v.Word))?.Word?.Trim();
        if (!string.IsNullOrWhiteSpace(sampleWord))
        {
            return $"{sampleWord}をお願いします。";
        }
        return "すみません、もう一度お願いします。";
    }

    internal static LinguisticFeedbackDto NormalizeLinguisticFeedback(LinguisticFeedbackDto feedback)
    {
        static string CleanJargon(string text)
        {
            var cleaned = Regex.Replace(text, @"\s*\((Desu/Masu|Teineigo|Futsuukei|Sonkeigo|Kenjougo|Keigo)\)", "", RegexOptions.IgnoreCase);
            cleaned = cleaned.Replace("Desu/Masu", "thể lịch sự", StringComparison.OrdinalIgnoreCase);
            return Regex.Replace(cleaned, @"\s{2,}", " ").Trim();
        }

        static string CapSentence(string text, int maxLen)
        {
            var clean = CleanJargon(text);
            if (clean.Length <= maxLen) return clean;
            var slice = clean[..(maxLen - 1)];
            var lastStop = slice.LastIndexOfAny(['.', '!', '?', ' ']);
            if (lastStop >= maxLen / 2)
            {
                slice = slice[..lastStop];
            }
            return slice.TrimEnd(',', ';', ' ') + "…";
        }

        if (!string.IsNullOrWhiteSpace(feedback.Summary))
        {
            feedback.Summary = CapSentence(feedback.Summary, 90);
        }

        if (feedback.Details != null && feedback.Details.Count > 0)
        {
            var seenComments = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var normalizedDetails = feedback.Details
                .Where(d => d != null && !string.IsNullOrWhiteSpace(d.Comment))
                .Select(d => new LinguisticDetailItemDto
                {
                    Type = string.IsNullOrWhiteSpace(d.Type) ? "warning" : d.Type.Trim().ToLowerInvariant(),
                    Aspect = string.IsNullOrWhiteSpace(d.Aspect) ? "Giao tiếp" : CleanJargon(d.Aspect),
                    Comment = CapSentence(d.Comment, 160)
                })
                .Where(d => seenComments.Add(d.Comment))
                .OrderBy(d => d.Type == "error" ? 0 : d.Type == "warning" ? 1 : 2)
                .Take(2)
                .ToList();

            feedback.Details = normalizedDetails;
        }

        if (!string.IsNullOrWhiteSpace(feedback.CulturalTip))
        {
            feedback.CulturalTip = CapSentence(feedback.CulturalTip, 140);
        }
        else
        {
            feedback.CulturalTip = null;
        }

        return feedback;
    }

    private static (string ja, string? fHtml, string vi) ApplyAiReplyGuards(
        string ja,
        string? fHtml,
        string vi,
        RoleplaySocialRegister reg,
        int scenarioId,
        string? jlptLevel,
        ILogger logger)
    {
        if (string.IsNullOrWhiteSpace(ja))
        {
            return (ja, fHtml, vi);
        }

        // 1. Khử chú thích cách đọc trong ngoặc đơn (VD: "お手洗い（おてあらい）" hoặc "ひとつ（一枚）")
        var cleanedJa = Regex.Replace(ja, @"（[ぁ-んァ-ヶー]{1,12}）", string.Empty);
        cleanedJa = Regex.Replace(cleanedJa, @"ひとつ（一枚）", "一枚");
        if (!string.Equals(cleanedJa, ja, StringComparison.Ordinal))
        {
            ja = cleanedJa;
            fHtml = null;
        }

        // 2. Chống đảo vai cho nhân vật nhân viên dịch vụ (không hỏi ngược khách giá tiền, gọi thanh toán hoặc cảm ơn ăn xong)
        if (reg.RegisterType == SocialRegisterType.ServiceStaff)
        {
            var unquoted = Regex.Replace(ja, @"「[^」]*」", string.Empty);
            if (Regex.IsMatch(unquoted, @"(いくらですか|いくらでしょうか|値段はいくら|お会計をお願い|ごちそうさまでした)"))
            {
                logger.LogWarning(
                    "Post-LLM Role-Reversal Guard triggered for Scenario {ScenarioId} ({Level}): {RawReply}",
                    scenarioId,
                    jlptLevel,
                    ja);
                ja = PickByJlpt(
                    jlptLevel,
                    "わかりました！他に何かありますか？",
                    "わかりました。他にご注文やご質問はありますか？",
                    "かしこまりました。他にご注文やご不明な点はございますか？");
                fHtml = RoleplaySocialRegister.GenerateFuriganaHtml(ja);
                vi = $"Dạ vâng, {reg.AiSelf} đã rõ. {reg.AiAddressLearner} còn muốn hỏi hoặc gọi thêm gì nữa không ạ?";
                return (ja, fHtml, vi);
            }
        }

        // 3. Làm mềm kính ngữ N3-N1 nếu kịch bản đang ở cấp độ N5 (và kính ngữ N1/N2 quá nặng ở N4)
        var normLevel = (jlptLevel ?? "N5").Trim().ToUpperInvariant();
        if (normLevel == "N5")
        {
            var softened = SoftenN5Keigo(ja);
            if (!string.Equals(softened, ja, StringComparison.Ordinal))
            {
                ja = softened;
                fHtml = null;
            }
        }
        else if (normLevel == "N4")
        {
            var softenedN4 = ja
                .Replace("恐れ入りますが、", "すみません、", StringComparison.Ordinal)
                .Replace("恐れ入りますが", "すみません、", StringComparison.Ordinal)
                .Replace("販売はしておりません", "販売していません", StringComparison.Ordinal)
                .Replace("ご案内いたします", "ご案内します", StringComparison.Ordinal);
            if (!string.Equals(softenedN4, ja, StringComparison.Ordinal))
            {
                ja = softenedN4;
                fHtml = null;
            }
        }

        return (ja, fHtml, vi);
    }

    private static string SoftenN5Keigo(string ja)
    {
        var replacements = new (string From, string To)[]
        {
            ("大変申し訳ございません。", "すみません。"),
            ("大変申し訳ございません、", "すみません、"),
            ("大変申し訳ございません", "すみません"),
            ("申し訳ございません。", "すみません。"),
            ("申し訳ございません、", "すみません、"),
            ("申し訳ございません", "すみません"),
            ("恐れ入りますが、", "すみません、"),
            ("恐れ入りますが", "すみません、"),
            ("恐れ入ります、", "すみません、"),
            ("失礼いたしました。", "すみません。"),
            ("失礼いたしました", "すみません"),
            ("承知いたしました", "わかりました"),
            ("ご案内いたしますので、", "席へ案内します。"),
            ("ご案内いたします", "案内します"),
            ("教えていただけますでしょうか", "教えてください"),
            ("お話しいただけますでしょうか", "話してください"),
            ("お選びいただけますでしょうか", "選んでください"),
            ("お聞かせいただけますでしょうか", "教えてください"),
            ("またお越しくださいませ", "また来てくださいね"),
            ("どうぞご利用ください", "どうぞ使ってください"),
            ("何のサイズになさいますか", "サイズはどれにしますか"),
            ("いかがなさいますか", "どうしますか"),
            ("どうなさいますか", "どうしますか"),
            ("になさいますか", "にしますか"),
            ("お伺いします", "聞きます"),
            ("お作りします", "作ります"),
            ("店内でのお召し上がり", "店内"),
            ("お召し上がり", "食べます"),
            ("ご用意もございます", "もあります"),
            ("もございます", "もあります"),
            ("でございます", "です"),
            ("ございます", "あります"),
            ("かしこまりました", "わかりました")
        };

        var result = ja;
        foreach (var (from, to) in replacements)
        {
            result = result.Replace(from, to, StringComparison.Ordinal);
        }
        return result;
    }

    private static string PickByJlpt(string? jlptLevel, string n5, string n4, string n3)
    {
        return (jlptLevel ?? "N5").Trim().ToUpperInvariant() switch
        {
            "N5" => n5,
            "N4" => n4,
            _ => n3
        };
    }
}
