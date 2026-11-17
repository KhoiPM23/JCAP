using System.IO;
using JCAP.Services.Implementations;
using Xunit;

namespace JCAP.Tests.Services;

public class ShadowingAsrDevLauncherTests
{
    [Theory]
    [InlineData("http://127.0.0.1:50023", true, 50023)]
    [InlineData("http://localhost:50099", true, 50099)]
    [InlineData("http://asr.example.com:50023", false, 50023)]
    public void IsLocalUrl_OnlyStartsServiceOnThisMachine(string url, bool expected, int expectedPort)
    {
        Assert.Equal(expected, ShadowingAsrDevLauncher.IsLocalUrl(url, out var port));
        Assert.Equal(expectedPort, port);
    }

    [Fact]
    public void IsLocalUrl_InvalidUrl_IsNotLocal()
    {
        Assert.False(ShadowingAsrDevLauncher.IsLocalUrl("không phải url", out _));
    }

    [Fact]
    public void ResolvePython_PrefersConfiguredPath()
    {
        var python = ShadowingAsrDevLauncher.ResolvePython(@"C:\py\python.exe", "asr", isWindows: true, _ => true);
        Assert.Equal(@"C:\py\python.exe", python);
    }

    [Fact]
    public void ResolvePython_UsesVenvWhenSetupScriptCreatedIt()
    {
        var expected = Path.Combine("asr", ".venv", "Scripts", "python.exe");
        var python = ShadowingAsrDevLauncher.ResolvePython(null, "asr", isWindows: true, p => p == expected);
        Assert.Equal(expected, python);
    }

    [Theory]
    [InlineData(true, "python")]
    [InlineData(false, "python3")]
    public void ResolvePython_FallsBackToPythonOnPath(bool isWindows, string expected)
    {
        Assert.Equal(expected, ShadowingAsrDevLauncher.ResolvePython("", "asr", isWindows, _ => false));
    }
}
