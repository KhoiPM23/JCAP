using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Xunit;

namespace JCAP.Tests.Services;

public class RegisterAnalyzerTests
{
    private readonly RegisterAnalyzer _analyzer = new();

    [Theory]
    [InlineData("いらっしゃいませ。何名様でございますか？")]
    [InlineData("かしこまりました、すぐにお持ちいたします。")]
    [InlineData("心より感謝申し上げます。")]
    [InlineData("部長がそのようにおっしゃいました。")]
    [InlineData("こちらをご覧になってください。")]
    [InlineData("ご存知でしょうか？")]
    [InlineData("わたくしが伺います。")]
    [InlineData("ありがとうございます。")]
    [InlineData("はい、承知しました。")]
    public void Analyze_DetectsKeigo_WhenHonorificOrHumbleExpressionsUsed(string utterance)
    {
        var result = _analyzer.Analyze(utterance, expectedRegister: 2); // Expected Keigo

        Assert.Equal(JapaneseRegister.Keigo, result.DetectedRegister);
        Assert.Equal(JapaneseRegister.Keigo, result.ExpectedRegister);
        Assert.True(result.IsMatch);
        Assert.Equal(0, result.RegisterDelta);
        Assert.Null(result.SumiInkIndicatorType);
    }

    [Theory]
    [InlineData("こんにちは、ラーメンを一つください。")]
    [InlineData("駅はどこですか？")]
    [InlineData("これでいいですよ。")]
    [InlineData("日本語を勉強しています。")]
    [InlineData("昨日映画を見に行きました。")]
    [InlineData("教えてくださいね。")]
    [InlineData("明日も行きますよ！")]
    [InlineData("よくわかりましたね。")]
    [InlineData("一緒に食べましょうか？")]
    [InlineData("昨日は食べませんでした。")]
    public void Analyze_DetectsTeineigo_WhenDesuMasuUsed(string utterance)
    {
        var result = _analyzer.Analyze(utterance, expectedRegister: 1); // Expected Teineigo

        Assert.Equal(JapaneseRegister.Teineigo, result.DetectedRegister);
        Assert.Equal(JapaneseRegister.Teineigo, result.ExpectedRegister);
        Assert.True(result.IsMatch);
        Assert.Equal(0, result.RegisterDelta);
        Assert.Null(result.SumiInkIndicatorType);
    }

    [Theory]
    [InlineData("これ、めっちゃうまいよ！")]
    [InlineData("今夜ラーメン食べに行くだろ？")]
    [InlineData("俺は行かない。")]
    [InlineData("そうなんだよね。")]
    [InlineData("じゃあ、また明日な。")]
    public void Analyze_DetectsTameguchi_WhenCasualEndingsOrPronounsUsed(string utterance)
    {
        var result = _analyzer.Analyze(utterance, expectedRegister: 0); // Expected Tameguchi

        Assert.Equal(JapaneseRegister.Tameguchi, result.DetectedRegister);
        Assert.Equal(JapaneseRegister.Tameguchi, result.ExpectedRegister);
        Assert.True(result.IsMatch);
        Assert.Equal(0, result.RegisterDelta);
        Assert.Null(result.SumiInkIndicatorType);
    }

    [Fact]
    public void Analyze_FlagsRegisterError_WhenLearnerUsesTameguchiToBossOrKeigoContext()
    {
        // Expected Keigo (2), Learner speaks Tameguchi (0)
        var result = _analyzer.Analyze("これ食べるよ。", expectedRegister: 2);

        Assert.Equal(JapaneseRegister.Tameguchi, result.DetectedRegister);
        Assert.Equal(JapaneseRegister.Keigo, result.ExpectedRegister);
        Assert.False(result.IsMatch);
        Assert.Equal(-2, result.RegisterDelta);
        Assert.Equal("RegisterError", result.SumiInkIndicatorType);
        Assert.NotNull(result.FeedbackTip);
        Assert.NotNull(result.SuggestedAlternative);
    }

    [Fact]
    public void Analyze_FlagsRegisterWarning_WhenLearnerUsesTameguchiInTeineigoContext()
    {
        // Expected Teineigo (1), Learner speaks Tameguchi (0)
        var result = _analyzer.Analyze("うん、わかった。", expectedRegister: 1);

        Assert.Equal(JapaneseRegister.Tameguchi, result.DetectedRegister);
        Assert.Equal(JapaneseRegister.Teineigo, result.ExpectedRegister);
        Assert.False(result.IsMatch);
        Assert.Equal(-1, result.RegisterDelta);
        Assert.Equal("RegisterWarning", result.SumiInkIndicatorType);
        Assert.NotNull(result.FeedbackTip);
    }

    [Theory]
    [InlineData("すみません、もう一度お願いします。")]
    [InlineData("もう少しゆっくり話してください。")]
    [InlineData("すみません、よく聞き取れませんでした。")]
    [InlineData("どういう意味ですか？")]
    [InlineData("すみません、よく聞こえませんでした。")]
    [InlineData("もう一回言ってください。")]
    [InlineData("ちょっと待ってください。")]
    [InlineData("すみません…")]
    [InlineData("ええと…")]
    public void IsSurvivalPhrase_ReturnsTrue_ForAizuchiAndRepetitionRequests(string utterance)
    {
        var isSurvival = _analyzer.IsSurvivalPhrase(utterance);
        var analysis = _analyzer.Analyze(utterance, expectedRegister: 1);

        Assert.True(isSurvival);
        Assert.True(analysis.IsSurvivalPhrase);
        Assert.Null(analysis.SumiInkIndicatorType); // Survival phrases never get penalized
    }

    [Theory]
    [InlineData("ラーメンをください。")]
    [InlineData("明日の会議は何時ですか？")]
    [InlineData("ありがとうございます。")]
    public void IsSurvivalPhrase_ReturnsFalse_ForStandardUtterances(string utterance)
    {
        var isSurvival = _analyzer.IsSurvivalPhrase(utterance);
        Assert.False(isSurvival);
    }

    [Fact]
    public void Analyze_GracefullyHandles_NullOrEmptyUtterances()
    {
        var resultNull = _analyzer.Analyze(null!, expectedRegister: 1);
        Assert.Equal(JapaneseRegister.Neutral, resultNull.DetectedRegister);
        Assert.True(resultNull.IsMatch);
        Assert.Equal(0, resultNull.RegisterDelta);
        Assert.False(resultNull.IsSurvivalPhrase);

        var resultEmpty = _analyzer.Analyze("   ", expectedRegister: 2);
        Assert.Equal(JapaneseRegister.Neutral, resultEmpty.DetectedRegister);
        Assert.True(resultEmpty.IsMatch);
        Assert.Equal(0, resultEmpty.RegisterDelta);
    }
}
