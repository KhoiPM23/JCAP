using System.Linq;
using JCAP.Services.Implementations;
using Xunit;

namespace JCAP.Tests.Services
{
    public class VietnameseLearnerErrorDetectorTests
    {
        private readonly VietnameseLearnerErrorDetector _detector = new();

        [Theory]
        [InlineData("学校を行きます", "E01_INTRANSITIVE_WO")]
        [InlineData("駅を入る", "E01_INTRANSITIVE_WO")]
        public void Detects_E01_IntransitiveWo(string input, string expectedCode)
        {
            var issues = _detector.DetectErrors(input);
            Assert.Contains(issues, i => i.Code == expectedCode);
        }

        [Theory]
        [InlineData("東京で住んでいます", "E02_PLACE_DE_NI")]
        public void Detects_E02_PlaceDeNi(string input, string expectedCode)
        {
            var issues = _detector.DetectErrors(input);
            Assert.Contains(issues, i => i.Code == expectedCode);
        }

        [Theory]
        [InlineData("あなたは誰ですか", "E03_ANATA_OVERUSE")]
        public void Detects_E03_AnataOveruse(string input, string expectedCode)
        {
            var issues = _detector.DetectErrors(input);
            Assert.Contains(issues, i => i.Code == expectedCode);
        }

        [Theory]
        [InlineData("猫があります", "E04_ANIMATE_ARU")]
        [InlineData("本がいます", "E04_INANIMATE_IRU")]
        public void Detects_E04_AruIru(string input, string expectedCode)
        {
            var issues = _detector.DetectErrors(input);
            Assert.Contains(issues, i => i.Code == expectedCode);
        }

        [Theory]
        [InlineData("日本語を知っています", "E05_SHITTEIRU_DEKIRU")]
        public void Detects_E05_ShitteiruDekiru(string input, string expectedCode)
        {
            var issues = _detector.DetectErrors(input);
            Assert.Contains(issues, i => i.Code == expectedCode);
        }

        [Theory]
        [InlineData("食べたでした", "E06_TA_DESHITA")]
        public void Detects_E06_TaDeshita(string input, string expectedCode)
        {
            var issues = _detector.DetectErrors(input);
            Assert.Contains(issues, i => i.Code == expectedCode);
        }

        [Theory]
        [InlineData("私にあげました", "E07_WATASHI_NI_AGEMASU")]
        public void Detects_E07_WatashiNiAgemasu(string input, string expectedCode)
        {
            var issues = _detector.DetectErrors(input);
            Assert.Contains(issues, i => i.Code == expectedCode);
        }

        [Theory]
        [InlineData("便利から", "E09_MISSING_DA_KARA")]
        public void Detects_E09_MissingDaKara(string input, string expectedCode)
        {
            var issues = _detector.DetectErrors(input);
            Assert.Contains(issues, i => i.Code == expectedCode);
        }

        [Fact]
        public void CleanJapanese_ReturnsNoIssues()
        {
            var issues = _detector.DetectErrors("すみません、とんこつラーメンを一つお願いします。");
            Assert.Empty(issues);
        }
    }
}
