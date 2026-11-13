using System.Text.Json;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations;

public class EventDirector : IEventDirector
{
    private static readonly Dictionary<string, BranchingEventDefinition> EventsCatalog = new(StringComparer.OrdinalIgnoreCase)
    {
        ["EV_SOLD_OUT"] = new BranchingEventDefinition
        {
            EventCode = "EV_SOLD_OUT",
            Name = "Hết món / Hết hàng",
            CueJapanese = "あ、すみません！そちらのメニュー、ちょうど先ほど売り切れてしまいまして…他のものでもよろしいでしょうか？",
            CueVietnamese = "A, xin lỗi quý khách! Món đó vừa vặn hết hàng mất rồi... Quý khách đổi sang món khác có được không ạ?",
            TestedSkill = "Ứng biến đổi phương án (〜はありますか、じゃあ〜にします)",
            CompletionCriteria = "Đưa ra lựa chọn thay thế trong <= 2 lượt"
        },
        ["EV_DELAY"] = new BranchingEventDefinition
        {
            EventCode = "EV_DELAY",
            Name = "Đổi lịch / Chuyển sân ga",
            CueJapanese = "信号確認のため、発車ホームが3番線から5番線に変更となりました！ご注意ください。",
            CueVietnamese = "Do kiểm tra tín hiệu, sân ga khởi hành đã đổi từ số 3 sang số 5! Xin quý khách lưu ý.",
            TestedSkill = "Nghe hiểu dưới áp lực, xác nhận lại thông tin mới (5番線ですね？)",
            CompletionCriteria = "Dùng mẫu câu xác nhận và điều chỉnh hành động"
        },
        ["EV_SPEAK_FAST"] = new BranchingEventDefinition
        {
            EventCode = "EV_SPEAK_FAST",
            Name = "Nói nhanh + Khẩu ngữ",
            CueJapanese = "めっちゃ並んでっからさ、奥の席先取っといたほうがいいよ！",
            CueVietnamese = "Đông nghẹt luôn đó, mau vô trong giữ chỗ trước đi!",
            TestedSkill = "Nhận diện khẩu ngữ đời thực, chiến lược hỏi lại sinh tồn (すみません、もう少しゆっくり…)",
            CompletionCriteria = "Dùng cụm từ sinh tồn đề nghị nói chậm hoặc hỏi lại, được cộng điểm"
        },
        ["EV_MISHEARD"] = new BranchingEventDefinition
        {
            EventCode = "EV_MISHEARD",
            Name = "Xác nhận sai / Nghe nhầm",
            CueJapanese = "かしこまりました、ご注文はホットのほうでよろしかったでしょうか？",
            CueVietnamese = "Dạ vâng, quý khách dùng đồ uống nóng đúng không ạ?",
            TestedSkill = "Phản xạ sửa hiểu nhầm (いえ、アイスでお願いします)",
            CompletionCriteria = "Phát hiện và đính chính hiểu nhầm trong 1 lượt"
        },
        ["EV_INDIRECT_REFUSAL"] = new BranchingEventDefinition
        {
            EventCode = "EV_INDIRECT_REFUSAL",
            Name = "Lời nhờ vả khó từ chối",
            CueJapanese = "悪いんだけど、急に人が足りなくなって、今夜のシフト代わってもらえないかな？",
            CueVietnamese = "Ngại quá nhưng chỗ mình đột xuất thiếu người, tối nay bạn đổi ca trực giúp mình được không?",
            TestedSkill = "Ngữ dụng học: từ chối khéo léo gián tiếp (今夜はちょっと予定がありまして…)",
            CompletionCriteria = "Từ chối lịch sự, không dùng từ cộc lốc"
        }
    };

    public BranchingEventDefinition? GetEventByCode(string eventCode)
    {
        if (string.IsNullOrWhiteSpace(eventCode)) return null;
        return EventsCatalog.TryGetValue(eventCode, out var def) ? def : null;
    }

    public IReadOnlyList<BranchingEventDefinition> GetAllEvents()
    {
        return EventsCatalog.Values.ToList();
    }

    public EventDirectorDecision EvaluateEventTrigger(
        string jlptLevel,
        int currentTurnIndex,
        int turnsSinceLastEvent,
        int totalEventsTriggeredSoFar,
        int remainingMissionsCount,
        string? compatibleEventsJson,
        string? lastUserUtterance = null)
    {
        var level = (jlptLevel ?? "N5").Trim().ToUpperInvariant();

        // 1. Timing Guard: Không kích hoạt ở lượt 1 hoặc 2, hoặc khi kịch bản đã hoàn thành hết nhiệm vụ
        if (currentTurnIndex <= 2 || remainingMissionsCount <= 0)
        {
            return new EventDirectorDecision { ShouldTriggerEvent = false };
        }

        // 2. Level Gating: Số lượng biến cố tối đa theo trình độ
        var maxEventsAllowed = level switch
        {
            "N5" => 1,
            "N4" => 2,
            "N3" => 2,
            _ => 1
        };

        if (totalEventsTriggeredSoFar >= maxEventsAllowed)
        {
            return new EventDirectorDecision { ShouldTriggerEvent = false };
        }

        // 3. Cooldown Guard: Giữa 2 biến cố phải cách nhau ít nhất 3 lượt thoại bình thường
        if (totalEventsTriggeredSoFar > 0 && turnsSinceLastEvent < 3)
        {
            return new EventDirectorDecision { ShouldTriggerEvent = false };
        }

        // 4. Compatible Pool Filtering
        List<string> candidateCodes = new();
        if (!string.IsNullOrWhiteSpace(compatibleEventsJson))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<List<string>>(compatibleEventsJson);
                if (parsed != null && parsed.Count > 0)
                {
                    candidateCodes = parsed.Where(code => EventsCatalog.ContainsKey(code)).ToList();
                }
            }
            catch {}
        }

        if (candidateCodes.Count == 0)
        {
            // Default pool theo trình độ nếu scenario không cấu hình riêng
            candidateCodes = level switch
            {
                "N5" => new List<string> { "EV_SOLD_OUT", "EV_MISHEARD" },
                "N4" => new List<string> { "EV_SOLD_OUT", "EV_MISHEARD", "EV_DELAY", "EV_SPEAK_FAST" },
                _ => new List<string> { "EV_SOLD_OUT", "EV_MISHEARD", "EV_DELAY", "EV_SPEAK_FAST", "EV_INDIRECT_REFUSAL" }
            };
        }

        if (candidateCodes.Count == 0)
        {
            return new EventDirectorDecision { ShouldTriggerEvent = false };
        }

        // Lựa chọn biến cố xác định theo turn index
        var selectedCode = candidateCodes[currentTurnIndex % candidateCodes.Count];
        var triggeredDef = EventsCatalog[selectedCode];

        var directive = $"[BRANCHING EVENT: {triggeredDef.EventCode} - {triggeredDef.Name}]\n" +
                        $"Tình huống bất ngờ kích hoạt: Người học cần ứng phó với: \"{triggeredDef.CueJapanese}\" ({triggeredDef.CueVietnamese}).\n" +
                        $"Kỹ năng kiểm tra: {triggeredDef.TestedSkill}. Yêu cầu: lồng ghép tự nhiên vào lời thoại của bạn.\n" +
                        $"[SOFT LANDING SAFEGUARD: Nếu học viên bối rối hoặc ngập ngừng, hãy từ tốn giải thích và tạo bậc thang giàn giáo mềm mại.]";

        return new EventDirectorDecision
        {
            ShouldTriggerEvent = true,
            TriggeredEvent = triggeredDef,
            EventCode = triggeredDef.EventCode,
            DirectiveForAiPrompt = directive
        };
    }
}
