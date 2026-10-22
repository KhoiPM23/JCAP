using JCAP.Services.Implementations;
using Xunit;

namespace JCAP.Tests.Services;

public class VoiceVoxPersonaResolverTests
{
    [Fact]
    public void Resolve_ElderlyPersona_ReturnsChibiShikiJii()
    {
        // Scenario: Giúp cụ già băng qua đường
        var res = VoiceVoxPersonaResolver.Resolve(
            aiPersona: "Cụ già cần giúp đỡ - お年寄り (nói chậm, lịch sự)",
            scenarioTitle: "Giúp cụ già băng qua đường",
            scenarioContext: "Bạn gặp một cụ già đang đứng ở ngã tư chờ sang đường.");

        Assert.Equal(VoiceVoxPersonaResolver.VoiceChibiShikiJii, res.RecommendedAiVoiceId);
        Assert.Contains("Chibi Shiki-jii", res.RecommendedAiVoiceName);
        Assert.Equal(VoiceVoxPersonaResolver.VoiceShikokuMetan, res.RecommendedLearnerVoiceId);
        Assert.True(res.RoleVoiceMappings.ContainsKey("Cụ già"));
    }

    [Fact]
    public void Resolve_ElderlyFemalePersona_ReturnsSayo()
    {
        var res = VoiceVoxPersonaResolver.Resolve(
            aiPersona: "Cụ bà lớn tuổi đi chợ",
            scenarioTitle: "Hỏi thăm bà lão hàng xóm",
            scenarioContext: "Bà lão hàng xóm đang xách giỏ đi chợ.");

        Assert.Equal(VoiceVoxPersonaResolver.VoiceSayo, res.RecommendedAiVoiceId);
        Assert.Contains("Sayo", res.RecommendedAiVoiceName);
    }

    [Fact]
    public void Resolve_DoctorPersona_ReturnsKenzakiMesuo()
    {
        var res = VoiceVoxPersonaResolver.Resolve(
            aiPersona: "Bác sĩ khoa nội",
            scenarioTitle: "Khám bệnh tại phòng khám",
            scenarioContext: "Học viên đến gặp bác sĩ để mô tả triệu chứng đau họng.");

        Assert.Equal(VoiceVoxPersonaResolver.VoiceKenzakiMesuo, res.RecommendedAiVoiceId);
        Assert.Contains("Kenzaki Mesuo", res.RecommendedAiVoiceName);
        Assert.True(res.RoleVoiceMappings.ContainsKey("Bác sĩ"));
        Assert.True(res.RoleVoiceMappings.ContainsKey("Y tá"));
    }

    [Fact]
    public void Resolve_InterviewPersona_ReturnsAoyamaRyusei()
    {
        var res = VoiceVoxPersonaResolver.Resolve(
            aiPersona: "Người phỏng vấn tuyển dụng",
            scenarioTitle: "Phỏng vấn xin việc bán thời gian",
            scenarioContext: "Nhà tuyển dụng phỏng vấn ứng viên.");

        Assert.Equal(VoiceVoxPersonaResolver.VoiceAoyamaRyusei, res.RecommendedAiVoiceId);
        Assert.Contains("Aoyama Ryusei", res.RecommendedAiVoiceName);
        Assert.True(res.RoleVoiceMappings.ContainsKey("Người phỏng vấn"));
    }

    [Fact]
    public void Resolve_FriendPersona_ReturnsKasukabeTsumugi()
    {
        var res = VoiceVoxPersonaResolver.Resolve(
            aiPersona: "Bạn cùng lớp đại học",
            scenarioTitle: "Rủ bạn đi ăn cuối tuần",
            scenarioContext: "Hai người bạn thân đang trò chuyện.");

        Assert.Equal(VoiceVoxPersonaResolver.VoiceKasukabeTsumugi, res.RecommendedAiVoiceId);
        Assert.Contains("Kasukabe Tsumugi", res.RecommendedAiVoiceName);
    }

    [Fact]
    public void Resolve_ServiceClerkPersona_ReturnsShikokuMetan()
    {
        var res = VoiceVoxPersonaResolver.Resolve(
            aiPersona: "Nhân viên quán ăn",
            scenarioTitle: "Gọi món tại nhà hàng Nhật",
            scenarioContext: "Nhân viên phục vụ đón khách tại quầy.");

        Assert.Equal(VoiceVoxPersonaResolver.VoiceShikokuMetan, res.RecommendedAiVoiceId);
        Assert.Contains("Shikoku Metan", res.RecommendedAiVoiceName);
    }

    [Fact]
    public void GenerateFuriganaHtml_KanjiInLearnerUtterance_CreatesRubyTags()
    {
        var input = "大丈夫ですか。手伝いましょうか。";
        var furigana = RoleplaySocialRegister.GenerateFuriganaHtml(input);

        Assert.Contains("<ruby>大丈夫<rt>だいじょうぶ</rt></ruby>", furigana);
        Assert.Contains("<ruby>手伝<rt>てつだ</rt></ruby>", furigana);
    }

    [Fact]
    public void GenerateFuriganaHtml_PureKana_RemainsIntact()
    {
        var input = "こんにちは、どうぞ。";
        var furigana = RoleplaySocialRegister.GenerateFuriganaHtml(input);

        Assert.Equal("こんにちは、どうぞ。", furigana);
    }
}
