using JCAP.Models;
using JCAP.Services.Implementations;
using Xunit;

namespace JCAP.Tests.Services;

public class RoleplaySocialRegisterTests
{
    [Theory]
    [InlineData("Giúp cụ già băng qua đường", "お年寄り", "Hỗ trợ người cao tuổi", SocialRegisterType.Elderly, "cháu", "cụ")]
    [InlineData("Phỏng vấn xin việc baito", "面接官", "Buổi phỏng vấn làm thêm", SocialRegisterType.Interviewer, "em", "anh")]
    [InlineData("Gọi món tại quán Ramen", "店員", "Thực khách và nhân viên quán", SocialRegisterType.ServiceStaff, "tôi", "quý khách")]
    [InlineData("Hỏi bài thầy giáo", "先生", "Trao đổi với giảng viên", SocialRegisterType.TeacherMentor, "em", "thầy")]
    [InlineData("Trò chuyện cùng bạn học", "友達", "Tán gẫu cùng đồng trang lứa", SocialRegisterType.PeerFriend, "mình", "cậu")]
    [InlineData("Hỏi thông tin tại quầy chung", "Người lạ", "Tình huống thông thường", SocialRegisterType.GeneralPolite, "tôi", "bạn")]
    public void Deduce_IdentifiesCorrectSocialRegisterAndPronouns(
        string title,
        string persona,
        string description,
        SocialRegisterType expectedType,
        string expectedLearnerSelf,
        string expectedPersonaAddress)
    {
        var reg = RoleplaySocialRegister.Deduce(title, persona, description);

        Assert.Equal(expectedType, reg.RegisterType);
        Assert.Equal(expectedLearnerSelf, reg.LearnerSelf);
        if (expectedType == SocialRegisterType.ServiceStaff)
        {
            Assert.Equal(expectedPersonaAddress, reg.AiAddressLearner);
        }
        else
        {
            Assert.Equal(expectedPersonaAddress, reg.LearnerAddressAi);
        }
    }

    [Fact]
    public void TranslateUserUtterance_ContainsNoSlashes_ForElderlyContext()
    {
        var reg = RoleplaySocialRegister.Deduce("Giúp cụ già băng qua đường", "お年寄り", "Người già cần giúp đỡ");

        var testUtterances = new[]
        {
            "どういたしまして。お気をつけてお大事に。",
            "どちらまで行かれますか。お手伝いしましょうか。",
            "はい、喜んでお手伝いします。一緒に渡りましょう。",
            "こんにちは。",
            "ありがとうございます。"
        };

        foreach (var utt in testUtterances)
        {
            var translation = RoleplaySocialRegister.TranslateUserUtterance(utt, reg);
            Assert.False(string.IsNullOrWhiteSpace(translation));
            Assert.DoesNotContain("/", translation);
            Assert.Contains("cụ", translation);
        }
    }

    [Fact]
    public void ProcessGenericTurn_AdvancesMissionAndEnforcesZeroSlashes()
    {
        var scenario = new Scenario { Title = "Giúp cụ già băng qua đường" };
        var levelConfig = new ScenarioLevelConfiguration
        {
            AiPersona = "お年寄り (nói chậm, lịch sự)",
            Description = "Người già cần hỗ trợ sang đường"
        };

        var missions = new List<Mission>
        {
            new() { Id = 1, Order = 1, Content = "Chào hỏi và chủ động đề nghị giúp đỡ", CompletionCriteriaJson = "{\"intent\":\"Help\",\"target\":\"Elderly\"}" },
            new() { Id = 2, Order = 2, Content = "Hỏi cụ về hướng đi", CompletionCriteriaJson = "{\"intent\":\"Direction\",\"target\":\"Hospital\"}" },
            new() { Id = 3, Order = 3, Content = "Chào tạm biệt cụ", CompletionCriteriaJson = "{\"intent\":\"Goodbye\",\"target\":\"Elderly\"}" }
        };

        // Turn 1: Offer help
        var turn1 = RoleplaySocialRegister.ProcessGenericTurn(scenario, levelConfig, "お手伝いしましょうか。一緒に渡りましょう。", missions);
        Assert.Contains(1, turn1.CompletedMissionIds);
        Assert.DoesNotContain("/", turn1.VietnameseMeaning);
        Assert.DoesNotContain("/", turn1.UserVietnameseMeaning ?? "");
        Assert.Contains("cháu", turn1.VietnameseMeaning);

        // Turn 2: Ask destination
        var remainingMissions2 = missions.Where(m => !turn1.CompletedMissionIds.Contains(m.Id)).ToList();
        var turn2 = RoleplaySocialRegister.ProcessGenericTurn(scenario, levelConfig, "どちらまで行かれますか。", remainingMissions2);
        Assert.Contains(2, turn2.CompletedMissionIds);
        Assert.DoesNotContain("/", turn2.VietnameseMeaning);
        Assert.Contains("cháu", turn2.VietnameseMeaning);

        // Turn 3: Farewell
        var remainingMissions3 = remainingMissions2.Where(m => !turn2.CompletedMissionIds.Contains(m.Id)).ToList();
        var turn3 = RoleplaySocialRegister.ProcessGenericTurn(scenario, levelConfig, "どういたしまして。お気をつけてお大事に。", remainingMissions3);
        Assert.Contains(3, turn3.CompletedMissionIds);
        Assert.True(turn3.IsNaturallyConcluded);
        Assert.DoesNotContain("/", turn3.VietnameseMeaning);
        Assert.DoesNotContain("/", turn3.UserVietnameseMeaning ?? "");
    }
}
