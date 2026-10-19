using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace JCAP.Tests.Services;

public class JapaneseMoraTests
{
    private static string[] Canon(string kana) => JapaneseMora.FromKana(kana).Select(m => m.Canon).ToArray();

    [Fact]
    public void ObaaSan_HasFiveMoras_WithLongVowelAsItsOwnMora() =>
        Assert.Equal(new[] { "お", "ば", "ー", "さ", "ん" }, Canon("おばあさん"));

    [Fact]
    public void ObaSan_HasFourMoras() =>
        Assert.Equal(new[] { "お", "ば", "さ", "ん" }, Canon("おばさん"));

    [Fact]
    public void Gakkou_SokuonAndLongVowel() =>
        Assert.Equal(new[] { "が", "っ", "こ", "ー" }, Canon("がっこう"));

    [Fact]
    public void Gakou_WithoutSokuon() =>
        Assert.Equal(new[] { "が", "こ", "ー" }, Canon("がこう"));

    [Theory]
    [InlineData("きれい")]
    [InlineData("キレイ")]
    [InlineData("キレエ")] // cách VOICEVOX ghi れい
    public void E_Plus_I_And_Repeated_E_Are_The_Same_LongVowel(string kana) =>
        Assert.Equal(new[] { "き", "れ", "ー" }, Canon(kana));

    [Theory]
    [InlineData("おとうさん")]
    [InlineData("おとおさん")]
    [InlineData("オトーサン")]
    public void Different_Spellings_Of_The_Same_LongO_Are_Equal(string kana) =>
        Assert.Equal(new[] { "お", "と", "ー", "さ", "ん" }, Canon(kana));

    [Fact]
    public void Katakana_LongVowelMark() =>
        Assert.Equal(new[] { "こ", "ー", "ひ", "ー" }, Canon("コーヒー"));

    [Fact]
    public void SmallKana_AreCombinedWithPreviousKana() =>
        Assert.Equal(new[] { "しゃ", "し", "ん" }, Canon("しゃしん"));

    [Fact]
    public void Hatsuon_FollowedByVowel_IsNotALongVowel() =>
        Assert.Equal(new[] { "ほ", "ん", "い", "ん" }, Canon("ほんいん"));

    [Fact]
    public void Oishii_LongI_ButOiIsNotLong() =>
        Assert.Equal(new[] { "お", "い", "し", "ー" }, Canon("おいしい"));

    [Fact]
    public void Wo_IsReadAs_O_And_Dzu_As_Zu() =>
        Assert.Equal(new[] { "お", "ず" }, Canon("をづ"));

    [Fact]
    public void G2pPhoneticSpelling_IsDisplayedAsCommonKana_NotAsALongMark()
    {
        Assert.Equal("おばあさん", JapaneseMora.Join(JapaneseMora.FromKana("おばあさん")));
        Assert.Equal("おばあさん", JapaneseMora.Join(JapaneseMora.FromKana("オバアサン", preserveLongVowelSpelling: false)));
        Assert.Equal("がっこう", JapaneseMora.Join(JapaneseMora.FromKana("ガッコオ", preserveLongVowelSpelling: false)));
        Assert.Equal("きれい", JapaneseMora.Join(JapaneseMora.FromKana("キレエ", preserveLongVowelSpelling: false)));
        Assert.Equal("こーひー", JapaneseMora.Join(JapaneseMora.FromKana("コーヒー", preserveLongVowelSpelling: false))); // ー có sẵn giữ nguyên
    }

    [Fact]
    public void Kanji_BecomesUnresolvedMora()
    {
        var moras = JapaneseMora.FromKana("綺麗");
        Assert.All(moras, m => Assert.True(m.IsUnresolved));
    }

    [Fact]
    public void Normalize_StripsPunctuationAndSpaces_ButKeepsLongVowelMark() =>
        Assert.Equal("コーヒーです", JapaneseMora.Normalize("コーヒー です。 "));
}

public class KanaMoraComparerTests
{
    // Fixture chỉ dùng trong test (xem TestKanaReader/PhraseReader); production dùng VOICEVOX.
    private static KanaMoraComparer Offline() => new(new IKanaReader[] { new TestKanaReader() });

    /// <summary>Reader có ranh giới TỪ do test chỉ định ("a/b/c"), chữ viết giữ nguyên.</summary>
    private static KanaMoraComparer With(params (string Text, string Phrased)[] entries) =>
        new(new IKanaReader[] { new PhraseReader(entries) });

    // ---- Chấm theo TỪ: từ sai không được tính điểm dù có vài mora trùng ngẫu nhiên ----

    [Fact]
    public async Task NoWordCorrect_ScoresZero_EvenWhenMostMorasCoincide()
    {
        // 4 từ, 14 mora. Người học không đọc đúng từ nào nhưng 10/14 mora trùng ngẫu nhiên:
        // chấm theo mora sẽ ra ~71, chấm theo từ phải ra 0.
        var comparer = With(
            ("あさがおくるまひこうきすいか", "あさがお/くるま/ひこうき/すいか"),
            ("あさひおくろまひこうぎすいみ", "あさひお/くろま/ひこうぎ/すいみ"));

        var r = await comparer.CompareAsync("あさがおくるまひこうきすいか", "あさひおくろまひこうぎすいみ");

        Assert.Equal(0, r.ContentMatchScore);
        Assert.Equal(4, r.Tokens.Count);
        Assert.All(r.Tokens, t => Assert.Equal("mismatched", t.Status));
        Assert.Equal(new[] { "あさがお", "くるま", "ひこうき", "すいか" }, r.Tokens.Select(t => t.Text));
        Assert.Contains("「あさがお」", r.Feedback);
    }

    [Fact]
    public async Task OnlyFullyCorrectWords_AreCredited_WeightedByTheirLength()
    {
        var comparer = With(
            ("あさがおくるまひこうきすいか", "あさがお/くるま/ひこうき/すいか"),
            ("あさがおくろまひこうきすいみ", "あさがお/くろま/ひこうき/すいみ"));

        var r = await comparer.CompareAsync("あさがおくるまひこうきすいか", "あさがおくろまひこうきすいみ");

        Assert.Equal(57, r.ContentMatchScore); // あさがお(4) + ひこうき(4) = 8 / 14 mora
        Assert.Equal(new[] { "correct", "mismatched", "correct", "mismatched" }, r.Tokens.Select(t => t.Status));
    }

    [Fact]
    public async Task AllWordsCorrect_ScoresFull_AndKeepsTheOriginalSentence()
    {
        var comparer = With(("あさがおくるま", "あさがお/くるま"));

        var r = await comparer.CompareAsync("あさがおくるま", "あさがおくるま");

        Assert.Equal(100, r.ContentMatchScore);
        var token = Assert.Single(r.Tokens);
        Assert.Equal("correct", token.Status);
        Assert.Equal("あさがおくるま", token.Text);
    }

    [Fact]
    public async Task OneMoraErrorMakesTheWholeWordWrong_ButNeighbouringWordsAreUnaffected()
    {
        var comparer = With(
            ("おばあさんがいます。", "おばあさん/がいます"),
            ("おばさんがいます", "おばさん/がいます"));

        var r = await comparer.CompareAsync("おばあさんがいます。", "おばさんがいます");

        Assert.Equal(44, r.ContentMatchScore); // chỉ "がいます" (4/9 mora) đúng hoàn toàn
        Assert.Equal(new[] { "mismatched", "correct" }, r.Tokens.Select(t => t.Status));
        Assert.Equal("おばあさん", r.Tokens[0].Text);
        Assert.Equal("おばあさん", r.Tokens[0].ExpectedReading);
        Assert.Equal("おばさん", r.Tokens[0].SpokenPart);
        Assert.Equal("chouon", r.Tokens[0].ErrorType); // vẫn nói rõ sai kiểu gì bên trong từ
        Assert.Contains("「おばあさん」", r.Feedback);
        Assert.Contains("trường âm", r.Feedback);
    }

    [Fact]
    public async Task MissingSokuon_MakesTheWordWrong_AndIsClassified()
    {
        var comparer = With(("がっこう", "がっこう"), ("がこう", "がこう"));
        var r = await comparer.CompareAsync("がっこう", "がこう");

        Assert.Equal(0, r.ContentMatchScore);
        var token = Assert.Single(r.Tokens);
        Assert.Equal("mismatched", token.Status);
        Assert.Equal("sokuon", token.ErrorType);
    }

    [Fact]
    public async Task Voicing_IsClassified()
    {
        var comparer = With(("がっこう", "がっこう"), ("かっこう", "かっこう"));
        var r = await comparer.CompareAsync("がっこう", "かっこう");

        Assert.Equal(0, r.ContentMatchScore);
        Assert.Equal("voicing", Assert.Single(r.Tokens).ErrorType);
    }

    [Fact]
    public async Task MissingWholeWord_IsShownAsMissing_AndOthersStayCorrect()
    {
        var comparer = With(("ほしですね", "ほし/です/ね"), ("ほしね", "ほし/ね"));
        var r = await comparer.CompareAsync("ほしですね", "ほしね");

        Assert.Equal(60, r.ContentMatchScore); // ほし(2) + ね(1) = 3/5
        Assert.Equal(new[] { "correct", "missing", "correct" }, r.Tokens.Select(t => t.Status));
        Assert.Equal("です", r.Tokens[1].Text);
        Assert.Contains("chưa nói 「です」", r.Feedback);
    }

    [Fact]
    public async Task ExtraSoundInsideAWord_MakesThatWordWrong_WithoutAnExtraPenalty()
    {
        var comparer = With(("ほしです", "ほし/です"), ("ほんしです", "ほんし/です"));
        var r = await comparer.CompareAsync("ほしです", "ほんしです");

        Assert.Equal(50, r.ContentMatchScore); // です(2) / 4; âm thừa nằm TRONG từ sai nên không trừ thêm
        Assert.Equal(new[] { "mismatched", "correct" }, r.Tokens.Select(t => t.Status));
        Assert.Equal("ほんし", r.Tokens[0].SpokenPart);
        Assert.Equal("extra", r.Tokens[0].ErrorType);
    }

    [Fact]
    public async Task ExtraSoundBetweenOrAfterWords_IsPenalisedAndShownAsItsOwnToken()
    {
        var comparer = With(("さくら", "さくら"), ("さくらら", "さくらら"));
        var r = await comparer.CompareAsync("さくら", "さくらら");

        Assert.Equal(67, r.ContentMatchScore); // (3 − 1 mora thừa) / 3
        var extra = Assert.Single(r.Tokens, t => t.ErrorType == "extra");
        Assert.Equal("ら", extra.Text);
        Assert.Equal("correct", r.Tokens[0].Status);
    }

    [Fact]
    public async Task EmptyTranscript_ScoresZero_AndTheWordIsMissing()
    {
        var comparer = With(("さくら", "さくら"), ("", ""));
        var r = await comparer.CompareAsync("さくら", "");

        Assert.Equal(0, r.ContentMatchScore);
        Assert.Equal("missing", Assert.Single(r.Tokens).Status);
    }

    [Fact]
    public async Task WordBoundaries_DoNotLeakLongVowelContext_FromThePreviousWord()
    {
        // 「どうぞ」の後の「おねがい」: お đầu từ không được bị coi là trường âm của ぞ.
        // Nếu bị coi là trường âm, người học chỉ nói 「おねがい」 sẽ bị chấm sai từ này dù đọc đúng.
        var comparer = With(("どうぞおねがい", "どうぞ/おねがい"), ("おねがい", "おねがい"));
        var r = await comparer.CompareAsync("どうぞおねがい", "おねがい");

        Assert.Equal(57, r.ContentMatchScore); // おねがい(4) / 7 mora
        Assert.Equal(new[] { "missing", "correct" }, r.Tokens.Select(t => t.Status));
    }

    [Fact]
    public async Task ParticleMistake_OnlyPenalisesTheParticle_NotTheContentWord()
    {
        var comparer = new KanaMoraComparer(new IKanaReader[]
        {
            new PhraseReader(new[] { ("写真を撮る", "シャシンオ/トル"), ("写真撮る", "シャシン/トル") }, g2pStyle: true)
        });

        var r = await comparer.CompareAsync("写真を撮る", "写真撮る");

        Assert.Equal(83, r.ContentMatchScore); // 写真(3) + 撮る(2) = 5/6
        Assert.Equal(new[] { "correct", "missing", "correct" }, r.Tokens.Select(t => t.Status));
        Assert.Equal(new[] { "写真", "を", "撮る" }, r.Tokens.Select(t => t.Text));
    }

    [Fact]
    public async Task WhenTheWrittenFormCannotBeAlignedToTheReading_FallsBackToKanaWords()
    {
        // Cách đọc không khớp chữ kana của câu (nguồn bất thường): vẫn phải chấm theo từ, hiển thị từ bằng kana.
        var comparer = With(("さくらまる", "ほげ/ぴよ"), ("ほげぴゆ", "ほげ/ぴゆ"));
        var r = await comparer.CompareAsync("さくらまる", "ほげぴゆ");

        Assert.Equal(50, r.ContentMatchScore);
        Assert.Equal(new[] { "ほげ", "ぴよ" }, r.Tokens.Select(t => t.Text));
        Assert.Equal(new[] { "correct", "mismatched" }, r.Tokens.Select(t => t.Status));
        Assert.Equal("ぴゆ", r.Tokens[1].SpokenPart);
    }

    // ---- Tương đương chữ viết (chỉ ranh giới từ của CÂU MẪU được dùng) ----

    [Fact]
    public async Task EquivalentWritings_ScoreFull_InBothDirections()
    {
        var cases = new (string Target, string TargetWords, string Spoken, string SpokenWords)[]
        {
            ("綺麗ですね。", "きれい/です/ね", "きれいですね", "きれい/です/ね"),
            ("きれいですね。", "きれい/です/ね", "綺麗ですね", "きれい/です/ね"),
            ("学校に行きます。", "がっこう/に/いきます", "がっこうにいきます", "がっこう/に/いきます"),
            ("一人です。", "ひとり/です", "1人です", "ひとり/です"),
            ("おとうさん", "おとうさん", "おとおさん", "おとおさん"),
            ("今、何時ですか。", "いま/なんじ/ですか", "いまなんじですか", "いま/なんじ/ですか"),
        };

        foreach (var c in cases)
        {
            var r = await With((c.Target, c.TargetWords), (c.Spoken, c.SpokenWords)).CompareAsync(c.Target, c.Spoken);
            Assert.True(r.ContentMatchScore == 100, $"{c.Target} / {c.Spoken} → {r.ContentMatchScore}");
        }
    }

    [Fact]
    public async Task WhitespaceAndPunctuationInTranscript_AreIgnored()
    {
        // Gemini hay chèn khoảng trắng giữa các từ
        var comparer = With(
            ("一人です。カウンター席でお願いします。", "ひとりです/かうんたーせきで/おねがい/します"),
            ("1人 です 。 かうんたー 席 で お 願い し ます 。", "ひとり/です/かうんたー/せき/で/おねがい/します"));

        var r = await comparer.CompareAsync("一人です。カウンター席でお願いします。", "1人 です 。 かうんたー 席 で お 願い し ます 。");

        Assert.Equal(100, r.ContentMatchScore);
    }

    // ---- Không đọc được thì KHÔNG chấm (không đoán, không cho điểm thấp oan) ----

    [Fact]
    public async Task KanjiTheReaderCannotRead_IsNotScored_InsteadOfAGuessedLowScore()
    {
        var r = await Offline().CompareAsync("東京へ行きます。", "とうきょうへいきます");
        Assert.True(r.ReadingUnavailable);
    }

    [Fact]
    public async Task SameUnreadableKanjiOnBothSides_IsStillNotScored()
    {
        var r = await Offline().CompareAsync("東京へ行きます。", "東京へ行きます。");
        Assert.True(r.ReadingUnavailable);
    }

    [Fact]
    public async Task NoReaderAvailable_IsNotScored()
    {
        var r = await new KanaMoraComparer(new IKanaReader[] { new UnavailableKanaReader() })
            .CompareAsync("おばあさん", "おばさん");
        Assert.True(r.ReadingUnavailable);
        Assert.Equal(string.Empty, r.ReadingSource);
    }

    [Fact]
    public async Task FallsBackToTheNextReader_OnlyIfOneExists()
    {
        var r = await new KanaMoraComparer(new IKanaReader[] { new UnavailableKanaReader(), new TestKanaReader() })
            .CompareAsync("おばあさん", "おばさん");
        Assert.False(r.ReadingUnavailable);
        Assert.Equal("test", r.ReadingSource);
    }

    [Fact]
    public async Task ReadableSentences_AreNotMarkedUnavailable()
    {
        var r = await Offline().CompareAsync("綺麗ですね。", "きれいですね");
        Assert.False(r.ReadingUnavailable);
    }

    [Fact]
    public async Task AReaderWithoutWordBoundaries_TreatsTheWholeSentenceAsOneWord()
    {
        // Không có ranh giới từ ⇒ một lỗi nhỏ làm sai cả câu (nghiêm nhất). VOICEVOX luôn cung cấp ranh giới từ.
        var r = await Offline().CompareAsync("おばあさんがいます。", "おばさんがいます");
        Assert.Equal(0, r.ContentMatchScore);
        Assert.Single(r.Tokens);
    }

    // ---- Chọn nguồn cách đọc ----

    private sealed class StubReader : IKanaReader
    {
        private readonly Func<string, KanaReading?> _read;
        public int Calls { get; private set; }
        public StubReader(string id, Func<string, KanaReading?> read) { SourceId = id; _read = read; }
        public string SourceId { get; }
        public Task<KanaReading?> TryReadAsync(string text, CancellationToken ct = default)
        {
            Calls++;
            return Task.FromResult(_read(text));
        }
    }

    private static KanaReading Reading(string kana, string source) =>
        new() { Moras = JapaneseMora.FromKana(kana), Source = source };

    [Fact]
    public async Task UsesPrimarySource_ForBothSides_WhenAvailable()
    {
        var primary = new StubReader("voicevox", _ => Reading("さくら", "voicevox"));
        var fallback = new StubReader("lexicon", _ => Reading("ぜんぜんちがう", "lexicon"));

        var r = await new KanaMoraComparer(new IKanaReader[] { primary, fallback }).CompareAsync("A", "B");

        Assert.Equal(100, r.ContentMatchScore);
        Assert.Equal("voicevox", r.ReadingSource);
        Assert.Equal(0, fallback.Calls);
    }

    [Fact]
    public async Task IfPrimaryFailsOnEitherSide_BothSidesMoveToTheFallbackSource()
    {
        // Nguồn chính đọc được câu mẫu nhưng không đọc được transcript → không được trộn hai nguồn.
        var primary = new StubReader("voicevox", t => t == "target" ? Reading("さくら", "voicevox") : null);
        var fallback = new StubReader("lexicon", _ => Reading("さくら", "lexicon"));

        var r = await new KanaMoraComparer(new IKanaReader[] { primary, fallback }).CompareAsync("target", "spoken");

        Assert.Equal("lexicon", r.ReadingSource);
        Assert.Equal(100, r.ContentMatchScore);
    }

    [Fact]
    public async Task SameInputs_GiveSameScore_AcrossInstances()
    {
        static KanaMoraComparer Make() => With(
            ("一人です。カウンター席でお願いします。", "ひとりです/かうんたーせきで/おねがい/します"),
            ("ひとりです。てーぶるせきでおねがいします。", "ひとりです/てーぶるせきで/おねがい/します"));

        var a = await Make().CompareAsync("一人です。カウンター席でお願いします。", "ひとりです。てーぶるせきでおねがいします。");
        var b = await Make().CompareAsync("一人です。カウンター席でお願いします。", "ひとりです。てーぶるせきでおねがいします。");
        Assert.Equal(a.ContentMatchScore, b.ContentMatchScore);
        // ひとりです(5) + で(1, trợ từ tách riêng sau 席) + おねがい(4) + します(3) = 13 / 20; カウンター席(7) là từ sai
        Assert.Equal(65, a.ContentMatchScore);
        Assert.Equal(a.TargetReading, b.TargetReading);
    }

    [Fact]
    public void RequiresAtLeastOneReader() =>
        Assert.Throws<ArgumentException>(() => new KanaMoraComparer(Array.Empty<IKanaReader>()));

    [Fact]
    public void MethodId_IdentifiesTheWordAlgorithm() => Assert.Equal("kana-word-v1", Offline().MethodId);
}

public class VoiceVoxKanaReaderTests
{
    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _respond;
        public int Calls { get; private set; }
        public Uri? LastUri { get; private set; }
        public StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) => _respond = respond;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            LastUri = request.RequestUri;
            return Task.FromResult(_respond(request));
        }
    }

    private static string AudioQuery(params string[][] phrases) =>
        "{\"accent_phrases\":[" +
        string.Join(",", phrases.Select(p => "{\"moras\":[" + string.Join(",", p.Select(m => $"{{\"text\":\"{m}\"}}")) + "],\"pause_mora\":null}")) +
        "]}";

    private static VoiceVoxKanaReader Create(StubHandler handler, Dictionary<string, string?>? config = null) =>
        new(new HttpClient(handler),
            new ConfigurationBuilder().AddInMemoryCollection(config ?? new()).Build(),
            new Mock<ILogger<VoiceVoxKanaReader>>().Object);

    public VoiceVoxKanaReaderTests() => VoiceVoxKanaReader.ResetStateForTests();

    [Fact]
    public async Task ParsesMorasFromAudioQuery_AndNormalisesLongVowels()
    {
        var json = AudioQuery(new[] { "オ", "バ", "ア", "サ", "ン" }, new[] { "ガ", "イ", "マ", "ス" });
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") });

        var reading = await Create(handler).TryReadAsync("おばあさんがいます vv1");

        Assert.NotNull(reading);
        Assert.Equal("voicevox", reading!.Source);
        Assert.Equal(new[] { "お", "ば", "ー", "さ", "ん", "が", "い", "ま", "す" }, reading.Moras.Select(m => m.Canon));
        Assert.Equal("おばあさんがいます", JapaneseMora.Join(reading.Moras)); // phiên âm G2P hiển thị bằng kana thông dụng
        Assert.Equal(0, reading.UnresolvedCount);
        Assert.Contains("/audio_query", handler.LastUri!.AbsolutePath);
    }

    [Fact]
    public async Task EachAccentPhrase_BecomesAWord_AndLongVowelContextDoesNotCrossWordBoundaries()
    {
        // 「ドオゾ」+「オネガイ」: オ đầu từ KHÔNG được thành trường âm của ゾ.
        var json = AudioQuery(new[] { "ド", "オ", "ゾ" }, new[] { "オ", "ネ", "ガ", "イ" }, new[] { "シ", "マ", "ス" });
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json) });

        var reading = await Create(handler).TryReadAsync("どうぞおねがいします vv0");

        Assert.NotNull(reading);
        Assert.Equal(new[] { 0, 3, 7 }, reading!.WordStarts);
        Assert.Equal(new[] { "ど", "ー", "ぞ", "お", "ね", "が", "い", "し", "ま", "す" }, reading.Moras.Select(m => m.Canon));
    }

    [Fact]
    public async Task CachesByText_SoTheEngineIsCalledOnce()
    {
        var json = AudioQuery(new[] { "サ", "ク", "ラ" });
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json) });
        var reader = Create(handler);

        await reader.TryReadAsync("さくら vv2");
        await reader.TryReadAsync("さくら vv2");

        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task EngineError_ReturnsNull_SoTheComparerCanUseTheOfflineSource()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.InternalServerError));
        Assert.Null(await Create(handler).TryReadAsync("さくら vv3"));
    }

    [Fact]
    public async Task EngineDown_OpensTheBreaker_SoLaterCallsDoNotWait()
    {
        var down = new StubHandler(_ => throw new HttpRequestException("connection refused"));
        var reader = Create(down);

        Assert.Null(await reader.TryReadAsync("さくら vv4"));
        Assert.Null(await reader.TryReadAsync("さくら vv5"));

        Assert.Equal(1, down.Calls); // lần thứ hai bị ngắt mạch, không gọi engine
    }

    [Fact]
    public async Task SlowEngine_TimesOutWithoutOpeningTheBreaker_SoTheNextTurnIsStillTried()
    {
        // Engine bận TTS: chậm không đồng nghĩa với hỏng, lượt sau vẫn phải được thử.
        // Trễ bất đồng bộ và tôn trọng hủy (như HTTP thật); Thread.Sleep đồng bộ làm test phụ thuộc vào lịch luồng nên chập chờn.
        var slow = new SlowStubHandler(TimeSpan.FromSeconds(2));
        var reader = new VoiceVoxKanaReader(new HttpClient(slow),
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Shadowing:Reading:TimeoutMs"] = "50" }).Build(),
            new Mock<ILogger<VoiceVoxKanaReader>>().Object);

        Assert.Null(await reader.TryReadAsync("さ vv8"));
        Assert.Null(await reader.TryReadAsync("さ vv9"));

        Assert.Equal(2, slow.Calls); // cả hai đều thực sự gọi engine, không bị ngắt mạch
    }

    private sealed class SlowStubHandler(TimeSpan delay) : HttpMessageHandler
    {
        public int Calls;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref Calls);
            await Task.Delay(delay, ct);
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(AudioQuery(new[] { "サ" })) };
        }
    }

    private sealed class AsyncStubHandler : HttpMessageHandler
    {
        public int Calls;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref Calls);
            await Task.Delay(150, ct);
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(AudioQuery(new[] { "サ", "ク", "ラ" })) };
        }
    }

    [Fact]
    public async Task ConcurrentRequestsForTheSameText_ShareOneEngineCall()
    {
        // Nhiều yêu cầu cùng văn bản chạy đồng thời (vd. nhiều người học cùng một câu): chỉ gọi engine một lần.
        var handler = new AsyncStubHandler();
        var reader = new VoiceVoxKanaReader(new HttpClient(handler), new ConfigurationBuilder().Build(),
            new Mock<ILogger<VoiceVoxKanaReader>>().Object);

        var results = await Task.WhenAll(
            reader.TryReadAsync("さくら vv11"), reader.TryReadAsync("さくら vv11"), reader.TryReadAsync("さくら vv11"));

        Assert.All(results, r => Assert.NotNull(r));
        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task UsesTheDedicatedReadingEngine_WhenConfigured()
    {
        var json = AudioQuery(new[] { "サ", "ク", "ラ" });
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json) });
        var reader = Create(handler, new()
        {
            ["VoiceVox:BaseUrl"] = "http://tts-engine:50021",
            ["Shadowing:Reading:BaseUrl"] = "http://reading-engine:50022",
        });

        await reader.TryReadAsync("さくら vv10");

        Assert.Equal("reading-engine", handler.LastUri!.Host);
        Assert.Equal(50022, handler.LastUri.Port);
    }

    [Fact]
    public async Task CanBeDisabledByConfiguration()
    {
        var handler = new StubHandler(_ => throw new InvalidOperationException("must not call"));
        var reader = Create(handler, new() { ["Shadowing:Reading:UseVoiceVox"] = "false" });

        Assert.Null(await reader.TryReadAsync("さくら vv6"));
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task MalformedResponse_ReturnsNull()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("not json") });
        Assert.Null(await Create(handler).TryReadAsync("さくら vv7"));
    }
}

public class SurfaceDiffTests
{
    // Reader giả lập cách VOICEVOX ghi cách đọc: を → オ, いい → イイ, trường âm bằng nguyên âm lặp lại; "/" là ranh giới từ.
    private static KanaMoraComparer G2p(params (string Text, string Phrased)[] entries) =>
        new(new IKanaReader[] { new PhraseReader(entries, g2pStyle: true) });

    private const string Target = "助かります。飲み物を頼んでもいいですか。";
    private const string Spoken = "貸し借ります。飲み物を飲んでもいいですか。";

    private static KanaMoraComparer ScreenshotCase() => G2p(
        (Target, "タスカリマス/ノミモノオ/タノンデモ/イイデスカ"),
        (Spoken, "カシカリマス/ノミモノオ/ノンデモ/イイデスカ"));

    [Fact]
    public async Task Diff_IsShownPerWord_OnTheOriginalSentence()
    {
        var r = await ScreenshotCase().CompareAsync(Target, Spoken);

        // 助かります(6) sai, 飲み物(4)+を(1) đúng, 頼んでも(5) sai, いいですか(5) đúng → 10/21
        Assert.Equal(48, r.ContentMatchScore);
        Assert.Equal(new[] { "助かります。", "飲み物を", "頼んでも", "いいですか。" }, r.Tokens.Select(t => t.Text));
        Assert.Equal(new[] { "mismatched", "correct", "mismatched", "correct" }, r.Tokens.Select(t => t.Status));
        Assert.DoesNotContain(r.Tokens, t => t.Text.Contains('ー'));
    }

    [Fact]
    public async Task WrongWords_CarryTheExpectedAndSpokenReading()
    {
        var r = await ScreenshotCase().CompareAsync(Target, Spoken);

        Assert.Equal("たすかります", r.Tokens[0].ExpectedReading);
        Assert.Equal("かしかります", r.Tokens[0].SpokenPart);
        Assert.Equal("たのんでも", r.Tokens[2].ExpectedReading);
        Assert.Equal("のんでも", r.Tokens[2].SpokenPart);
        Assert.Contains("「助かります」", r.Feedback);
    }

    [Fact]
    public async Task ParticleWo_AfterAnO_IsMatched_AndNeverShownAsALongVowelMark()
    {
        var r = await ScreenshotCase().CompareAsync(Target, Spoken);

        var correct = r.Tokens[1];
        Assert.Equal("correct", correct.Status);
        Assert.Contains("を", correct.Text);
    }

    [Fact]
    public async Task ScreenshotSentence_WrongWordsAreWholeWords_NotScatteredCharacters()
    {
        // Câu trong ảnh người dùng: いいです / いつでも sai, どうぞ / おねがい / します đúng.
        var comparer = G2p(
            ("いいです、いつでもどうぞ。おねがいします。", "イイデス/イツデモ/ドオゾ/オネガイ/シマス"),
            ("ですね。いつよりもどうぞお願いします。", "デス/ネ/イツ/ヨリモ/ドオゾ/オネガイ/シマス"));

        var r = await comparer.CompareAsync("いいです、いつでもどうぞ。おねがいします。", "ですね。いつよりもどうぞお願いします。");

        // 10 mora thuộc từ đúng, 1 âm thừa đứng riêng (ね) → 9/18. Chấm theo mora sẽ cao hơn nhiều (67).
        Assert.Equal(50, r.ContentMatchScore);

        var wrong = r.Tokens.Where(t => t.Status == "mismatched" && t.ErrorType != "extra").Select(t => t.Text).ToList();
        Assert.Equal(new[] { "いいです、", "いつでも" }, wrong);
        Assert.Equal("ね", Assert.Single(r.Tokens, t => t.ErrorType == "extra").Text);
        Assert.Equal("どうぞ。おねがいします。", r.Tokens[^1].Text);
        Assert.Equal("correct", r.Tokens[^1].Status);
    }

    [Fact]
    public async Task ExtraPhraseAtTheEnd_IsShownWithTheSpokenSpelling_AndIsPenalised()
    {
        var comparer = G2p(
            ("すみません。", "スミマセン"),
            ("すみません。ありがとうございます。", "スミマセン/アリガトオ/ゴザイマス"));

        var r = await comparer.CompareAsync("すみません。", "すみません。ありがとうございます。");

        var extra = Assert.Single(r.Tokens, t => t.ErrorType == "extra");
        Assert.Equal("ありがとうございます", extra.Text);
        Assert.DoesNotContain(r.Tokens, t => t.Text.Contains('ー'));
        Assert.Equal(0, r.ContentMatchScore); // 5 mora đúng nhưng 10 mora thừa
        Assert.Equal("correct", r.Tokens[0].Status);
    }

    [Fact]
    public async Task ExtraSoundBetweenWords_IsShownAsItsOwnToken()
    {
        var comparer = G2p(
            ("東京へ", "トオキョオエ"),
            ("とうきょうんへ", "トオキョオンエ"));

        var r = await comparer.CompareAsync("東京へ", "とうきょうんへ");

        var extra = Assert.Single(r.Tokens, t => t.ErrorType == "extra");
        Assert.Equal("ん", extra.Text);
        Assert.Equal("東京", r.Tokens[0].Text);
        Assert.Equal("correct", r.Tokens[0].Status);
        Assert.Equal(80, r.ContentMatchScore); // (5 − 1 mora thừa) / 5
    }

    [Fact]
    public async Task ParticlesHaAndHe_AreSeparateWords_AndMatchTheirSpokenReadings()
    {
        var comparer = G2p(
            ("私は東京へ行きます", "ワタシワ/トオキョオエ/イキマス"),
            ("私は大阪へ行きます", "ワタシワ/オオサカエ/イキマス"));

        var r = await comparer.CompareAsync("私は東京へ行きます", "私は大阪へ行きます");

        Assert.Equal(69, r.ContentMatchScore); // 私(3)+は(1)+へ(1)+行きます(4) = 9/13
        var wrong = Assert.Single(r.Tokens, t => t.Status != "correct");
        Assert.Equal("東京", wrong.Text);
    }

    [Fact]
    public async Task KanjiWithOkurigana_UsesTheKanaAfterItAsAnAnchor()
    {
        var comparer = G2p(("撮って", "トッテ"), ("取って", "トッテ"));
        var r = await comparer.CompareAsync("撮って", "取って");

        Assert.Equal(100, r.ContentMatchScore); // đọc giống hệt: khác chữ Hán nhưng cùng cách đọc
    }
}
