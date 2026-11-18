using JCAP.Services.Implementations;
using Microsoft.Extensions.Logging.Abstractions;

namespace JCAP.Tests.Services;

public class PhonemeKanaTests
{
    private static string K(string phonemes) => PhonemeKana.ToKana(phonemes.Split(' ', StringSplitOptions.RemoveEmptyEntries));

    [Theory]
    [InlineData("sh i N b u N", "しんぶん")]
    [InlineData("g a cl k o o", "がっこお")]          // trường âm giữ dạng nguyên âm lặp như VOICEVOX, JapaneseMora chuẩn hoá thành ー
    [InlineData("o b a a s a N", "おばあさん")]
    [InlineData("d e s U", "です")]                   // nguyên âm vô thanh vẫn là một mora
    [InlineData("ky o o", "きょお")]
    [InlineData("ch u u m o N", "ちゅうもん")]
    [InlineData("ts u k u e", "つくえ")]
    [InlineData("f u j i", "ふじ")]
    [InlineData("j a cl sh i", "じゃっし")]
    [InlineData("w a t a sh i", "わたし")]
    public void PhonemeSequence_BecomesKana(string phonemes, string kana) => Assert.Equal(kana, K(phonemes));

    [Fact]
    public void SilenceAndPauses_AreDropped_AndBreakAPendingConsonant()
    {
        Assert.Equal("こにちわ", K("sil k o pau n i ch i w a sil"));
        Assert.Equal("さ", K("k pau s a")); // phụ âm bị ngắt không thành mora
    }

    [Fact]
    public void OrphanConsonant_IsNotAMora() => Assert.Equal("さ", K("k s a"));

    [Fact]
    public void Kana_IsReadByTheMoraNormaliserLikeVoiceVoxReadings()
    {
        // Cùng một từ, cách đọc từ âm vị và cách đọc chuẩn phải ra cùng chuỗi mora (trường âm → ー).
        var fromPhonemes = JapaneseMora.FromKana(K("g a cl k o o"));
        var reference = JapaneseMora.FromKana("がっこう");
        Assert.Equal(reference.Select(m => m.Canon), fromPhonemes.Select(m => m.Canon));
    }
}

public class OnnxPhonemeRecognizerTests
{
    [Fact]
    public void MissingModel_IsUnavailable_AndRecognizeReturnsNull()
    {
        var recognizer = new OnnxPhonemeRecognizer("khong-co/model.onnx", "khong-co/vocab.json", NullLogger<OnnxPhonemeRecognizer>.Instance);
        Assert.False(recognizer.IsAvailable);
        Assert.Null(recognizer.Recognize(new float[16000]));
    }

    /// <summary>Chỉ chạy khi đã tải mô hình bằng scripts/download-speech-models.* (không có thì bỏ qua).</summary>
    [ModelFact]
    public void WithModel_Silence_ProducesNoSpeech_AndRunsQuickly()
    {
        using var recognizer = ModelFactAttribute.CreateRecognizer();
        Assert.True(recognizer.IsAvailable);

        var result = recognizer.Recognize(new float[16000 * 2])!; // 2 giây im lặng số
        Assert.Equal(string.Empty, result.Kana);                  // không bịa chữ với im lặng
        Assert.Equal(OnnxPhonemeRecognizer.FrameMs, result.FrameMs);
        Assert.True(result.ElapsedMs < 5000);
    }

    [ModelFact]
    public void WithModel_TooShortAudio_ReturnsEmptyResult()
    {
        using var recognizer = ModelFactAttribute.CreateRecognizer();
        var result = recognizer.Recognize(new float[800])!;
        Assert.Empty(result.Phonemes);
    }
}

/// <summary>Test cần mô hình âm vị thật: tự bỏ qua khi chưa tải mô hình (máy CI, máy chưa chạy script).</summary>
public sealed class ModelFactAttribute : FactAttribute
{
    public ModelFactAttribute()
    {
        if (ModelDirectory() == null) Skip = "Chưa có mô hình âm vị (chạy scripts/download-speech-models.ps1).";
    }

    public static string? ModelDirectory()
    {
        var root = RepoRoot();
        if (root == null) return null;
        var models = Path.Combine(root, "models", "phoneme");
        return File.Exists(Path.Combine(models, "model_quantized.onnx")) && File.Exists(Path.Combine(models, "vocab.json")) ? models : null;
    }

    /// <summary>Thư mục gốc repo: biến JCAP_REPO_ROOT (khi build ra thư mục khác), không thì đi ngược lên tìm JCAP.csproj.</summary>
    public static string? RepoRoot()
    {
        var fromEnv = Environment.GetEnvironmentVariable("JCAP_REPO_ROOT");
        if (!string.IsNullOrEmpty(fromEnv) && File.Exists(Path.Combine(fromEnv, "JCAP.csproj"))) return fromEnv;
        foreach (var start in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
        {
            var dir = new DirectoryInfo(start);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "JCAP.csproj"))) dir = dir.Parent;
            if (dir != null) return dir.FullName;
        }
        return null;
    }

    public static OnnxPhonemeRecognizer CreateRecognizer()
    {
        var dir = ModelDirectory() ?? throw new InvalidOperationException("Chưa có mô hình âm vị.");
        return new OnnxPhonemeRecognizer(
            Path.Combine(dir, "model_quantized.onnx"), Path.Combine(dir, "vocab.json"), NullLogger<OnnxPhonemeRecognizer>.Instance);
    }
}
