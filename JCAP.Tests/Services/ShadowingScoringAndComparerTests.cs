using JCAP.Services.Implementations;
using Xunit;

namespace JCAP.Tests.Services;

public class ShadowingScoringTests
{
    [Fact]
    public void Overall_EqualsContent_WhenFluencyIsNotMeasured()
    {
        Assert.Equal(73, ShadowingScoring.ComputeOverall(73, null));
        Assert.Equal(0, ShadowingScoring.ComputeOverall(0, null)); // 0 hợp lệ, không phải "thiếu"
    }

    [Fact]
    public void Overall_RenormalizesWeights_AndUsesFullFormulaWhenBothPresent()
    {
        Assert.Equal(80, ShadowingScoring.ComputeOverall(80, 80));
        Assert.Equal(88, ShadowingScoring.ComputeOverall(100, 70)); // 0.6*100 + 0.4*70
        Assert.Null(ShadowingScoring.ComputeOverall(null, null));
        Assert.Equal(60, ShadowingScoring.ComputeOverall(null, 60));
    }

    [Theory]
    [InlineData(100, "green")]
    [InlineData(80, "green")]
    [InlineData(79, "yellow")]
    [InlineData(65, "yellow")]
    [InlineData(64, "red")]
    [InlineData(0, "red")]
    public void Tier_UsesDocumentedThresholds(int score, string expected) =>
        Assert.Equal(expected, ShadowingScoring.TierFor(score));

    [Fact]
    public void Tier_IsEmpty_WhenThereIsNoScore() => Assert.Equal(string.Empty, ShadowingScoring.TierFor(null));
}

public class AudioFormatSnifferTests
{
    [Theory]
    [InlineData("audio/webm;codecs=opus", "audio/webm")]
    [InlineData("AUDIO/MP4", "audio/mp4")]
    [InlineData("  audio/ogg ; codecs=opus", "audio/ogg")]
    [InlineData(null, "")]
    public void NormalizeMime_StripsParametersAndCase(string? input, string expected) =>
        Assert.Equal(expected, AudioFormatSniffer.NormalizeMime(input));

    [Fact]
    public void DetectFamily_RecognisesCommonBrowserRecordings()
    {
        Assert.Equal("webm", AudioFormatSniffer.DetectFamily(new byte[] { 0x1A, 0x45, 0xDF, 0xA3, 0 }));
        Assert.Equal("ogg", AudioFormatSniffer.DetectFamily("OggS...."u8));
        Assert.Equal("mp4", AudioFormatSniffer.DetectFamily(new byte[] { 0, 0, 0, 0x20, (byte)'f', (byte)'t', (byte)'y', (byte)'p' }));
        Assert.Equal("unknown", AudioFormatSniffer.DetectFamily(new byte[] { 1, 2, 3, 4, 5, 6, 7, 8 }));
    }

    [Fact]
    public void MimeMatchesContent_RejectsMislabelledAndUnknownContent()
    {
        var webm = new byte[] { 0x1A, 0x45, 0xDF, 0xA3, 0 };
        Assert.True(AudioFormatSniffer.MimeMatchesContent("audio/webm", webm));
        Assert.False(AudioFormatSniffer.MimeMatchesContent("audio/mp4", webm));
        Assert.False(AudioFormatSniffer.MimeMatchesContent("audio/webm", new byte[] { 9, 9, 9, 9, 9 }));
        Assert.False(AudioFormatSniffer.MimeMatchesContent("audio/amr", webm));
    }
}

