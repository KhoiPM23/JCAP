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

    [Fact]
    public void SanitizeJapaneseReply_StripsLeakedVietnamese_AndPreservesPureJapanese()
    {
        // Bug reported by user: Vietnamese appended to Japanese utterance
        var bugInput = "本当にありがとうございます。 cháu thật là một người tốt bụng. Cháu hãy đi cẩn thận nhé.";
        var sanitized = RoleplaySocialRegister.SanitizeJapaneseReply(bugInput);
        Assert.Equal("本当にありがとうございます。", sanitized);
        Assert.False(RoleplaySocialRegister.HasVietnameseLeak(sanitized));

        // Parenthesized Vietnamese translation leak
        var parenInput = "本当にありがとうございます。(Cụ cảm ơn cháu rất nhiều)";
        var parenSanitized = RoleplaySocialRegister.SanitizeJapaneseReply(parenInput);
        Assert.Equal("本当にありがとうございます。", parenSanitized);

        // Entire string is Vietnamese
        var pureViInput = "cháu thật là một người tốt bụng";
        var pureViSanitized = RoleplaySocialRegister.SanitizeJapaneseReply(pureViInput, "本当にありがとうございました。");
        Assert.Equal("本当にありがとうございました。", pureViSanitized);

        // Clean Japanese remains untouched
        var cleanJa = "とんこつラーメンですね。少々お待ちください。";
        var cleanSanitized = RoleplaySocialRegister.SanitizeJapaneseReply(cleanJa);
        Assert.Equal(cleanJa, cleanSanitized);
        Assert.False(RoleplaySocialRegister.HasVietnameseLeak(cleanSanitized));
    }

    [Fact]
    public void StripRubyTags_AndEnsureFuriganaParity_RejectsMismatchedTextAndKanjiInRt()
    {
        var validHtml = "<ruby>豚骨<rt>とんこつ</rt></ruby>ラーメンをください。";
        Assert.Equal("豚骨ラーメンをください。", RoleplaySocialRegister.StripRubyTags(validHtml));
        Assert.Equal(validHtml, RoleplaySocialRegister.EnsureFuriganaParity(validHtml, "豚骨ラーメンをください。"));

        // Mismatched plain text (hallucinated word in ruby) -> regenerated deterministically from plainJa
        var mismatched = "<ruby>味噌<rt>みそ</rt></ruby>ラーメンをください。";
        var fixedMismatch = RoleplaySocialRegister.EnsureFuriganaParity(mismatched, "豚骨ラーメンをください。");
        Assert.Equal("豚骨ラーメンをください。", RoleplaySocialRegister.StripRubyTags(fixedMismatch));
        Assert.Contains("<ruby>豚骨<rt>とんこつ</rt></ruby>", fixedMismatch);

        // Kanji inside <rt> -> rejected and regenerated
        var kanjiInRt = "<ruby>豚骨<rt>豚骨</rt></ruby>ラーメンをください。";
        var fixedKanjiRt = RoleplaySocialRegister.EnsureFuriganaParity(kanjiInRt, "豚骨ラーメンをください。");
        Assert.Equal("豚骨ラーメンをください。", RoleplaySocialRegister.StripRubyTags(fixedKanjiRt));
        Assert.Equal("<ruby>豚骨<rt>とんこつ</rt></ruby>ラーメンをください。", fixedKanjiRt);

        // Unbalanced <ruby> tag -> rejected and regenerated
        var unbalanced = "<ruby>豚骨<rt>とんこつ</rt>ラーメンをください。";
        var fixedUnbalanced = RoleplaySocialRegister.EnsureFuriganaParity(unbalanced, "豚骨ラーメンをください。");
        Assert.Equal("<ruby>豚骨<rt>とんこつ</rt></ruby>ラーメンをください。", fixedUnbalanced);
    }

    [Fact]
    public void EnsureFuriganaParity_AndCleanFuriganaHtml_HardensMalformedTagsRtLeaksAndHtml5Variants()
    {
        // 1. Swapped closing/opening ruby tags must be rejected and regenerated
        var swapped = "</ruby>私<ruby>";
        var fixedSwapped = RoleplaySocialRegister.EnsureFuriganaParity(swapped, "私");
        Assert.Equal("<ruby>私<rt>わたし</rt></ruby>", fixedSwapped);

        // 2. Nested <ruby> tags must be rejected and regenerated
        var nested = "<ruby>私<ruby>行<rt>い</rt></ruby><rt>わたし</rt></ruby>";
        var fixedNested = RoleplaySocialRegister.EnsureFuriganaParity(nested, "私行");
        Assert.DoesNotContain("<ruby>私<ruby>", fixedNested);
        Assert.Equal("私行", RoleplaySocialRegister.StripRubyTags(fixedNested));

        // 3. Kanji wrapped inside inner HTML tag in <rt> must be caught and regenerated
        var wrappedKanjiRt = "<ruby>私<rt><span>合</span></rt></ruby>";
        var fixedWrappedKanji = RoleplaySocialRegister.EnsureFuriganaParity(wrappedKanjiRt, "私");
        Assert.Equal("<ruby>私<rt>わたし</rt></ruby>", fixedWrappedKanji);

        // 4. Unaccented Vietnamese/ASCII Latin inside <rt> must be caught and regenerated
        var latinRt = "<ruby>私<rt>toi</rt></ruby>";
        var fixedLatinRt = RoleplaySocialRegister.EnsureFuriganaParity(latinRt, "私");
        Assert.Equal("<ruby>私<rt>わたし</rt></ruby>", fixedLatinRt);

        // 5. Kanji iteration mark inside <rt> must be rejected
        var iterationMarkRt = "<ruby>人々<rt>々</rt></ruby>";
        var fixedIteration = RoleplaySocialRegister.EnsureFuriganaParity(iterationMarkRt, "人々");
        Assert.Equal("人々", RoleplaySocialRegister.StripRubyTags(fixedIteration));
        Assert.DoesNotContain("<rt>々</rt>", fixedIteration);

        // 6. HTML5 unclosed </rt> with trailing kana must split okurigana cleanly
        var html5Unclosed = "<ruby>私です<rt>わたしです</ruby>";
        var fixedHtml5 = RoleplaySocialRegister.EnsureFuriganaParity(html5Unclosed, "私です");
        Assert.Equal("<ruby>私<rt>わたし</rt></ruby>です", fixedHtml5);

        // 7. <rp class="..."> with trailing okurigana must normalize cleanly
        var rpAttrTrailing = "<ruby>行きます<rp class=\"p\">（</rp><rt>いきます</rt><rp class=\"p\">）</rp></ruby>";
        var fixedRpAttr = RoleplaySocialRegister.EnsureFuriganaParity(rpAttrTrailing, "行きます");
        Assert.Equal("<ruby>行<rt>い</rt></ruby>きます", fixedRpAttr);
    }

    [Theory]
    [InlineData("私<rt onmouseover=\"alert(1)\">わたし</rt>")]
    [InlineData("私<rt><img src=x onerror=alert(1)>わたし</rt>")]
    [InlineData("<ruby>私<rt>わたし</rt></ruby><rt><svg onload=alert(1)>あ</rt>")]
    [InlineData("私<rp>(</rp>")]
    [InlineData("私</rt>")]
    [InlineData("私<rp onmouseover=\"alert(1)\">(</rp>")]
    [InlineData("<ruby>私<rt>わ<rt>たし</rt></rt></ruby>")]
    [InlineData("<ruby>私<rp>(</ruby>")]
    [InlineData("<ruby>私<rt>わたし</rt></ruby><img src=x onerror=alert(1)>")]
    [InlineData("<ruby>私<rt><img src=x onerror=alert(1)>わたし</rt></ruby>")]
    [InlineData("<ruby>私<img src=x onerror=alert(1)><rt>わたし</rt></ruby>")]
    [InlineData("<ruby>私<rt>ｔｏｉ</rt></ruby>")]
    [InlineData("<ruby>私<rt>ＡＢＣ</rt></ruby>")]
    [InlineData("<ruby>私<rt>&#21512;</rt></ruby>")]
    [InlineData("<ruby>私<rt>&#x5408;</rt></ruby>")]
    [InlineData("<ruby>私<rt>&#116;&#111;&#105;</rt></ruby>")]
    [InlineData("<ruby>私<rt>123</rt></ruby>")]
    [InlineData("<ruby>私<rt>   </rt></ruby>")]
    [InlineData("<ruby>私<rt></rt></ruby>")]
    public void EnsureFuriganaParity_BlocksOrphanTagsXssAndNonKanaRtBypassVectors(string maliciousHtml)
    {
        var result = RoleplaySocialRegister.EnsureFuriganaParity(maliciousHtml, "私");

        Assert.Equal("<ruby>私<rt>わたし</rt></ruby>", result);
        Assert.Equal("私", RoleplaySocialRegister.StripRubyTags(result));
    }

    [Theory]
    [InlineData("志望動機")]
    [InlineData("お会計をお願いします。")]
    [InlineData("少々お待ちください。")]
    [InlineData("行きます")]
    [InlineData("甲殻類のアレルギーがあります。")]
    public void GenerateFuriganaHtml_OutputsPassEnsureFuriganaParityCleanly(string plainJapanese)
    {
        var generated = RoleplaySocialRegister.GenerateFuriganaHtml(plainJapanese);
        var verified = RoleplaySocialRegister.EnsureFuriganaParity(generated, plainJapanese);

        Assert.Equal(generated, verified);
        Assert.Equal(plainJapanese, RoleplaySocialRegister.StripRubyTags(verified));
    }

    [Fact]
    public void GenerateFuriganaHtml_AndEnsureFuriganaParity_EncodeRawHtmlInPlainJapaneseText()
    {
        var imgPayload = "私<img src=x onerror=alert(1)>";
        var fromImg = RoleplaySocialRegister.EnsureFuriganaParity(null, imgPayload);
        Assert.Contains("<ruby>私<rt>わたし</rt></ruby>", fromImg);
        Assert.Contains("&lt;img src=x onerror=alert(1)&gt;", fromImg);
        Assert.DoesNotContain("<img", fromImg, StringComparison.OrdinalIgnoreCase);

        var rubyPlusImgPayload = "<ruby>私<rt>わたし</rt></ruby><img src=x onerror=alert(1)>";
        var fromRubyPlusImg = RoleplaySocialRegister.EnsureFuriganaParity(null, rubyPlusImgPayload);
        Assert.Contains("<ruby>私<rt>わたし</rt></ruby>", fromRubyPlusImg);
        Assert.Contains("&lt;img src=x onerror=alert(1)&gt;", fromRubyPlusImg);
        Assert.DoesNotContain("<img", fromRubyPlusImg, StringComparison.OrdinalIgnoreCase);

        var unclosedImgPayload = "<ruby>私<rt>わたし</rt></ruby><img src=x";
        var fromUnclosedImg = RoleplaySocialRegister.EnsureFuriganaParity(null, unclosedImgPayload);
        Assert.Contains("&lt;img src=x", fromUnclosedImg);
        Assert.DoesNotContain("<img", fromUnclosedImg, StringComparison.OrdinalIgnoreCase);

        var scriptSvgPayload = "私<script>alert(1)</script><svg onload=alert(1)>";
        var fromScriptSvg = RoleplaySocialRegister.EnsureFuriganaParity(null, scriptSvgPayload);
        Assert.DoesNotContain("<script", fromScriptSvg, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<svg", fromScriptSvg, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("&lt;script&gt;alert(1)&lt;/script&gt;&lt;svg onload=alert(1)&gt;", fromScriptSvg);

        var validCanonical = "<ruby>私<rt>わたし</rt></ruby>";
        Assert.Equal(validCanonical, RoleplaySocialRegister.GenerateFuriganaHtml(validCanonical));

        // Calling GenerateFuriganaHtml twice on encoded output remains idempotent
        Assert.Equal(fromImg, RoleplaySocialRegister.GenerateFuriganaHtml(fromImg));
    }
}
