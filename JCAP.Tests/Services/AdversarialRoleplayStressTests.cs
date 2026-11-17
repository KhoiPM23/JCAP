using JCAP.DTOs.Roleplay;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace JCAP.Tests.Services;

/// <summary>
/// BỘ KIỂM THỬ KHẮC NGHIỆT ("TESTER ĐIÊN KHÙNG") CHO BACKEND AI ROLEPLAY.
/// Mô phỏng mọi kịch bản phá hoại, cộc lốc, lạc đề, tiếng bồi, sai lệch bối cảnh
/// qua các kịch bản thực tế: Ga tàu, Phỏng vấn Baito, Siêu thị/Combini, Quán Cafe, Phòng khám y tế, Người cao tuổi.
/// </summary>
public class AdversarialRoleplayStressTests
{
    private readonly Mock<IAiClient> _mockAiClient = new();
    private readonly Mock<ILogger<AiRoleplayService>> _mockLogger = new();

    private AiRoleplayService CreateService()
    {
        return new AiRoleplayService(_mockAiClient.Object, _mockLogger.Object);
    }

    [Fact]
    public async Task TrainStation_AmbiguousCounter_DemandsDestinationStation()
    {
        // KỊCH BẢN: Ga tàu điện Shinjuku - Khách nói cộc lốc "これ" hoặc "ひとつ"
        var service = CreateService();
        var scenario = new Scenario { Title = "Mua vé tàu tại ga Shinjuku" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Nhân viên nhà ga JR" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "いらっしゃいませ。どちらまで行かれますか？" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Nêu điểm đến và mua vé", CompletionCriteriaJson = "{\"destination\":\"shinjuku\"}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "これをお願いします。", missions);

        Assert.NotNull(result);
        Assert.Equal("Guardrail", result.LinguisticFeedback.EvaluationSource);
        Assert.Contains("切符", result.JapaneseReply);
        Assert.Contains("行き先", result.JapaneseReply);
        Assert.Contains("ga đến", result.LinguisticFeedback.Summary);
        Assert.Empty(result.CompletedMissionIds); // Phải chặn không cho qua nhiệm vụ khi nói mơ hồ
    }

    [Fact]
    public async Task JobInterview_OffTopicUtterance_RejectsWithPoliteReminding()
    {
        // KỊCH BẢN: Phỏng vấn xin việc (Baito) - Học viên nói cộc lốc "これ"
        var service = CreateService();
        var scenario = new Scenario { Title = "Phỏng vấn xin việc làm thêm (Baito) tại Tokyo" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N4", AiPersona = "Người quản lý phỏng vấn (Tencho)" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "本日は面接にお越しいただきありがとうございます。自己紹介をお願いできますか？" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Chào hỏi và tự giới thiệu bản thân", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "これをお願いします。", missions);

        Assert.NotNull(result);
        Assert.Equal("Guardrail", result.LinguisticFeedback.EvaluationSource);
        Assert.Contains("質問について", result.JapaneseReply);
        Assert.Empty(result.CompletedMissionIds);
    }

    [Fact]
    public async Task ConvenienceStore_BareCounter_DemandsSpecificItemName()
    {
        // KỊCH BẢN: Combini - Khách cộc lốc nói "ひとつ"
        var service = CreateService();
        var scenario = new Scenario { Title = "Mua hàng tại cửa hàng tiện lợi Combini Lawso" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Thu ngân cửa hàng tiện lợi" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "いらっしゃいませ！" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Hỏi mua cơm hộp hoặc nước uống", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "ひとつお願いします。", missions);

        Assert.NotNull(result);
        Assert.Equal("Guardrail", result.LinguisticFeedback.EvaluationSource);
        Assert.Contains("商品をお教えいただけますか", result.JapaneseReply);
        Assert.Contains("tên sản phẩm", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task CafeScenario_OrderingRamen_TriggersDomainBoundaryGuard()
    {
        // KỊCH BẢN PHÁ HOẠI: Vào quán Cafe Shibuya nhưng đòi ăn mì Ramen
        var service = CreateService();
        var scenario = new Scenario { Title = "Gặp gỡ bạn bè tại quán Cafe Shibuya" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N4", AiPersona = "Nhân viên pha chế Cafe" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "ご注文をどうぞ。" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Gọi đồ uống", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "とんこつラーメンを一杯ください。", missions);

        Assert.NotNull(result);
        Assert.Equal("Guardrail", result.LinguisticFeedback.EvaluationSource);
        Assert.Contains("カフェ", result.JapaneseReply);
        Assert.Contains("thực đơn quán cà phê", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task MedicalClinic_OrderingPizza_TriggersHospitalGuard()
    {
        // KỊCH BẢN PHÁ HOẠI: Đi khám bệnh nhưng bảo bác sĩ cho bánh pizza
        var service = CreateService();
        var scenario = new Scenario { Title = "Khám sức khỏe tại bệnh viện Shinjuku" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N3", AiPersona = "Bác sĩ phụ trách" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "どこが痛みますか？" }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Trình bày vị trí đau", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "ピザをお願いします。", missions);

        Assert.NotNull(result);
        Assert.Equal("Guardrail", result.LinguisticFeedback.EvaluationSource);
        Assert.Contains("医療機関", result.JapaneseReply);
        Assert.Contains("cơ sở y tế", result.LinguisticFeedback.Summary);
    }

    [Fact]
    public async Task ElderlyAssistance_LearnerSpeaksVietnamese_PreFlightGuardStopsInstantly()
    {
        // KỊCH BẢN TIẾNG BỒI / TIẾNG VIỆT: Nói tiếng Việt khi giúp người già sang đường
        var service = CreateService();
        var scenario = new Scenario { Title = "Hỗ trợ cụ già qua đường tại ngã tư Shibuya" };
        var levelConfig = new ScenarioLevelConfiguration { JLPTLevel = "N5", AiPersona = "Cụ bà cao tuổi qua đường" };
        var history = new List<RoleplayMessage>
        {
            new() { Sender = "Ai", JapaneseText = "足腰が痛くてのぅ..." }
        };
        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Chào hỏi và đề nghị dắt cụ sang đường", CompletionCriteriaJson = "{}" }
        };

        var result = await service.ProcessTurnAsync(scenario, levelConfig, history, "Cháu giúp cụ qua đường nhé", missions);

        Assert.NotNull(result);
        Assert.Equal("PreFlightGuard", result.LinguisticFeedback.EvaluationSource);
        Assert.Equal("Error", result.LinguisticFeedback.Status);
        Assert.Contains("日本語", result.JapaneseReply);
        Assert.Contains("cháu", result.VietnameseMeaning); // Kiểm tra xưng hô chuẩn xã hội Elderly
    }
}

