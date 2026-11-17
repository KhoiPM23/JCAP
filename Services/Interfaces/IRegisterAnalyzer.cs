namespace JCAP.Services.Interfaces;

public enum JapaneseRegister
{
    Tameguchi = 0, // Thể ngắn, suồng sã, bạn bè thân thiết
    Teineigo = 1,  // Thể lịch sự desu/masu chuẩn mực
    Keigo = 2,     // Kính ngữ, Khiêm nhường ngữ trang trọng
    Neutral = -1   // Chưa xác định rõ hoặc câu quá ngắn/danh từ đơn
}

public sealed record RegisterAnalysisResult
{
    public JapaneseRegister DetectedRegister { get; init; } = JapaneseRegister.Neutral;
    public JapaneseRegister ExpectedRegister { get; init; } = JapaneseRegister.Teineigo;
    public bool IsMatch { get; init; }
    public int RegisterDelta { get; init; } // -2: quá suồng sã, -1: thiếu kính ngữ, 0: phù hợp, +1: trang trọng hơn
    public bool IsSurvivalPhrase { get; init; } // Cụm từ sinh tồn: hỏi lại/nhờ nói chậm
    public string? SuggestedAlternative { get; init; }
    public string? FeedbackTip { get; init; }
    public string? SumiInkIndicatorType { get; init; } // null, "RegisterWarning", "RegisterError", "PraiseKeigo"
}

public interface IRegisterAnalyzer
{
    RegisterAnalysisResult Analyze(string utterance, int expectedRegister);
    bool IsSurvivalPhrase(string utterance);
}
