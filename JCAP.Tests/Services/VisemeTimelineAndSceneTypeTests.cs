using System.Collections.Generic;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Xunit;

namespace JCAP.Tests.Services;

public class VisemeTimelineAndSceneTypeTests
{
    [Fact]
    public void ConvertTimelineToVisemes_StandardTimeline_GeneratesExpectedVisemeSequence()
    {
        // Giả lập chuỗi mora: こ (o), ん (N), に (i), ち (i), は (a)
        var timeline = new List<MoraTiming>
        {
            new MoraTiming("コ", 0.05, 0.08, 0.12, false, "O"),
            new MoraTiming("ン", 0.25, 0.00, 0.10, false, "N"),
            new MoraTiming("ニ", 0.35, 0.04, 0.08, false, "I"),
            new MoraTiming("チ", 0.47, 0.06, 0.09, false, "I"),
            new MoraTiming("ワ", 0.62, 0.05, 0.15, false, "A"),
            new MoraTiming("", 0.82, 0.00, 0.20, true, "closed") // pause
        };

        var visemes = VoiceVoxService.ConvertTimelineToVisemes(timeline);

        Assert.NotEmpty(visemes);
        Assert.Equal("O", visemes[0].v);
        Assert.Equal("N", visemes[1].v);
        Assert.Equal("I", visemes[2].v);
        Assert.Equal("I", visemes[3].v);
        Assert.Equal("A", visemes[4].v);
        Assert.Equal("closed", visemes[5].v);
        Assert.Equal("closed", visemes[^1].v); // Luôn kết thúc bằng khẩu hình đóng
    }

    [Theory]
    [InlineData("SCN_TRANSIT_01", "Ga Shinjuku", "train")]
    [InlineData("SCN_KONBINI_01", "Mua sắm tiện lợi", "konbini")]
    [InlineData("SCN_OFFICE_01", "Phỏng vấn công sở", "office")]
    [InlineData("SCN_CAFE_01", "Tiệm cafe Harajuku", "cafe")]
    [InlineData("SCN_RAMEN_01", "Quán Ramen Ichiraku", "ramen")]
    [InlineData(null, "Khám bệnh tại phòng khám", "medical")]
    [InlineData(null, "Trà đạo tại chùa thanh tịnh", "zen")]
    public void ResolveSceneType_VariousScenarios_ReturnsExactArchetype(string? scenarioCode, string title, string expectedScene)
    {
        var scene = RoleplaySessionService.ResolveSceneType(scenarioCode, title, "Nhân vật AI");
        Assert.Equal(expectedScene, scene);
    }
}

