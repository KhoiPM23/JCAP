using JCAP.Data;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace JCAP.Tests.Services;

/// <summary>
/// Dữ liệu câu mẫu tính sẵn (Decision 2): tạo bằng VOICEVOX một lần, lúc chấm đọc từ CSDL — không cần engine.
/// </summary>
public class ShadowingSentenceAssetServiceTests : IDisposable
{
    private readonly string _webRoot = Path.Combine(Path.GetTempPath(), "jcap-asset-test-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(_webRoot)) Directory.Delete(_webRoot, recursive: true);
    }

    /// <summary>VOICEVOX giả: đếm số lần gọi; Down = true giả lập engine tắt.</summary>
    private sealed class FakeSource : IShadowingAssetSource
    {
        public int Reads, Syntheses;
        public bool Down;
        private static readonly TestKanaReader Reader = new();

        public async Task<KanaReading?> ReadAsync(string text, CancellationToken cancellationToken)
        {
            if (Down) throw new HttpRequestException("engine down");
            Reads++;
            return await Reader.TryReadAsync(text, cancellationToken);
        }

        public Task<byte[]> SynthesizeAsync(string text, int speakerId, CancellationToken cancellationToken)
        {
            if (Down) throw new HttpRequestException("engine down");
            Syntheses++;
            return Task.FromResult(TestAudio.Wav(TestAudio.Sine(800)));
        }

        public Task<IReadOnlyList<MoraTiming>?> GetTimelineAsync(string text, int speakerId, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<MoraTiming>?>(new List<MoraTiming> { new("ガ", 0.1, 0.05, 0.1, false, "a") });
    }

    private static AppDbContext Context(string? name = null) => new(new DbContextOptionsBuilder<AppDbContext>()
        .UseInMemoryDatabase(name ?? "JCAP_Assets_" + Guid.NewGuid()).Options);

    private static async Task<AppDbContext> SeedAsync(string? name = null)
    {
        var c = Context(name);
        c.ShadowingDialogues.AddRange(
            new ShadowingDialogue { Id = 1, Title = "Trường", JLPTLevel = "N5", IsActive = true },
            new ShadowingDialogue { Id = 2, Title = "Ẩn", JLPTLevel = "N5", IsActive = false });
        c.ShadowingSentences.AddRange(
            new ShadowingSentence { Id = 1, ShadowingDialogueId = 1, OrderIndex = 0, SpeakerRole = "A", JapaneseText = "学校に行きます" },
            new ShadowingSentence { Id = 2, ShadowingDialogueId = 1, OrderIndex = 1, SpeakerRole = "B", JapaneseText = "一人です。カウンター席でお願いします。" },
            new ShadowingSentence { Id = 9, ShadowingDialogueId = 2, OrderIndex = 0, SpeakerRole = "A", JapaneseText = "学校" });
        await c.SaveChangesAsync();
        return c;
    }

    private ShadowingSentenceAssetService Service(AppDbContext c, FakeSource source) =>
        new(c, source, _webRoot, NullLogger<ShadowingSentenceAssetService>.Instance);

    [Fact]
    public async Task Generate_StoresReadingAndVoiceAudio_ThenScoringReadsThemWithoutTheEngine()
    {
        using var c = await SeedAsync();
        var source = new FakeSource();
        var service = Service(c, source);

        var report = await service.GenerateForDialogueAsync(1, new[] { 3 }, force: false);
        Assert.Equal(2, report.ReadingsCreated);
        Assert.Equal(2, report.AudiosCreated);

        source.Down = true; // lúc chấm bài, VOICEVOX tắt
        var reading = await service.FindReadingAsync("学校に行きます");
        var voice = await service.FindReferenceAsync("学校に行きます", 3);

        Assert.NotNull(reading);
        Assert.Equal("がっこうにいきます", JapaneseMora.Join(reading!.Moras));
        Assert.NotNull(voice);
        Assert.True(voice!.Wav.Length > 44);
        Assert.Single(voice.Timeline!);
        Assert.Null(await service.FindReferenceAsync("学校に行きます", 8)); // giọng chưa tạo
    }

    [Fact]
    public async Task StoredReading_GivesTheSameScoreAsReadingFromTheEngine()
    {
        using var c = await SeedAsync();
        var service = Service(c, new FakeSource());
        await service.GenerateForDialogueAsync(1, Array.Empty<int>(), force: false);

        var stored = new KanaMoraComparer(new IKanaReader[] { new StoredKanaReader(service) });
        var engine = new KanaMoraComparer(new IKanaReader[] { new TestKanaReader() });
        const string target = "一人です。カウンター席でお願いします。";

        foreach (var heard in new[] { "ひとりです。かうんたーせきでおねがいします。", "ひとりです。てーぶるせきでおねがいします。" })
        {
            var a = await stored.CompareWithReadingAsync(target, heard);
            var b = await engine.CompareWithReadingAsync(target, heard);
            Assert.Equal(b.ContentMatchScore, a.ContentMatchScore);
            Assert.Equal(b.Tokens.Select(t => (t.Text, t.Status)), a.Tokens.Select(t => (t.Text, t.Status)));
        }
    }

    [Fact]
    public async Task UpToDateData_IsNotRegenerated_ButChangedTextIs()
    {
        using var c = await SeedAsync();
        var source = new FakeSource();
        var service = Service(c, source);
        await service.GenerateForDialogueAsync(1, new[] { 3 }, force: false);
        var (reads, syntheses) = (source.Reads, source.Syntheses);

        var again = await service.GenerateForDialogueAsync(1, new[] { 3 }, force: false);
        Assert.Equal(2, again.UpToDate);
        Assert.Equal((reads, syntheses), (source.Reads, source.Syntheses));

        // Admin sửa chữ câu 1: dữ liệu cũ không còn dùng để chấm, lần tạo sau cập nhật đúng dòng cũ (không tạo dòng trùng)
        c.ShadowingSentences.Single(s => s.Id == 1).JapaneseText = "学校へ行きます";
        await c.SaveChangesAsync();
        Assert.Null(await service.FindReadingAsync("学校へ行きます"));
        var status = await service.GetStatusAsync(1, new[] { 3 });
        Assert.True(status.Sentences.Single(s => s.SentenceId == 1).IsStale);

        await service.GenerateForDialogueAsync(1, new[] { 3 }, force: false);
        Assert.NotNull(await service.FindReadingAsync("学校へ行きます"));
        Assert.Equal(4, c.ShadowingSentenceAssets.Count());
    }

    [Fact]
    public async Task EngineDown_StopsTheBatch_WithoutMarkingAnythingBroken()
    {
        using var c = await SeedAsync();
        var service = Service(c, new FakeSource { Down = true });

        var report = await service.GenerateMissingAsync(new[] { 3 }, 50);

        Assert.True(report.EngineUnavailable);
        Assert.Equal(0, report.Failed);
        Assert.Empty(c.ShadowingSentenceAssets);
    }

    [Fact]
    public async Task GenerateMissing_SkipsInactiveDialogues_AndCompletesMissingVoices()
    {
        using var c = await SeedAsync();
        var source = new FakeSource();
        var service = Service(c, source);

        var first = await service.GenerateMissingAsync(new[] { 3 }, 50);
        Assert.Equal(2, first.ReadingsCreated); // bài 2 không hoạt động: bỏ qua
        Assert.DoesNotContain(c.ShadowingSentenceAssets, a => a.ShadowingSentenceId == 9);

        var withNewVoice = await service.GenerateMissingAsync(new[] { 3, 8 }, 50);
        Assert.Equal(0, withNewVoice.ReadingsCreated);
        Assert.Equal(2, withNewVoice.AudiosCreated);
        Assert.Equal(0, (await service.GenerateMissingAsync(new[] { 3, 8 }, 50)).SentencesChecked);
    }

    [Fact]
    public void Furigana_TwoKanjiRunsSplitByPunctuation_UsePhraseBoundaries()
    {
        // Bản ghi thật: trước đây 十時四十分発 chỉ nhận "じゅ", còn 七号車 nhận phần còn lại
        const string text = "十時四十分発、七号車の十二番です。";
        var moras = JapaneseMora.FromKanaPhrases(new[] { "じゅうじ", "よんじゅっぷんはつ", "ななごうしゃの", "じゅう", "にばんです" },
            preserveLongVowelSpelling: true, out var starts);

        var furigana = ShadowingSentenceAssetService.BuildFurigana(text, moras, starts)!;

        Assert.Equal("じゅうじよんじゅっぷんはつ", furigana.Single(x => x.Text == "十時四十分発").Reading!.Replace("ー", "う"));
        Assert.Equal("ななごうしゃ", furigana.Single(x => x.Text == "七号車").Reading!.Replace("ー", "う"));
    }

    [Fact]
    public void Furigana_ReadingMergesAcrossPunctuation_StillAligns()
    {
        // Nguồn cách đọc gộp hai bên dấu câu vào một cụm: không có ranh giới ở dấu câu nhưng vẫn gióng được
        var moras = JapaneseMora.FromKanaPhrases(new[] { "がっこうに", "いきます" }, preserveLongVowelSpelling: true, out _);
        var furigana = ShadowingSentenceAssetService.BuildFurigana("学校、に行きます", moras, new[] { 0, 5 });
        Assert.NotNull(furigana);
        Assert.Contains(furigana!, x => x.Text == "学校" && x.Reading!.StartsWith("がっこ"));
    }

    [Fact]
    public async Task Furigana_GoesOnKanjiOnly_AndIsReturnedPerSentence()
    {
        using var c = await SeedAsync();
        var service = Service(c, new FakeSource());
        await service.GenerateForDialogueAsync(1, Array.Empty<int>(), force: false);

        var furigana = await service.FindFuriganaAsync(new[] { 1, 2 });

        var s1 = furigana[1];
        Assert.Equal("学校", s1[0].Text);
        Assert.Equal("がっこう", s1[0].Reading);
        Assert.Contains(s1, x => x.Text.StartsWith("に") && x.Reading == null);
        Assert.Contains(s1, x => x.Text == "行" && x.Reading == "い");
        Assert.Contains(furigana[2], x => x.Text == "席" && x.Reading == "せき");
        Assert.DoesNotContain(furigana[2], x => x.Text.Contains("カウンター") && x.Reading != null); // katakana không có furigana
    }

    [Fact]
    public async Task StoredReferenceProvider_UsesStoredAudio_AndCanBeForbiddenFromCallingTheEngine()
    {
        using var c = await SeedAsync();
        var service = Service(c, new FakeSource());
        await service.GenerateForDialogueAsync(1, new[] { 3 }, force: false);

        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Shadowing:Fluency:UseVoiceVoxAtRuntime"] = "false",
        }).Build();
        var voiceVox = new VoiceVoxReferenceProvider(new Moq.Mock<IVoiceVoxService>(Moq.MockBehavior.Strict).Object, config,
            NullLogger<VoiceVoxReferenceProvider>.Instance);
        var provider = new StoredReferenceVoiceProvider(service, voiceVox, config, NullLogger<StoredReferenceVoiceProvider>.Instance);

        Assert.NotNull(await provider.GetAsync("学校に行きます", 3));
        Assert.Null(await provider.GetAsync("学校に行きます", 8)); // không có bản lưu và không được gọi engine (Strict mock)
    }

    [Fact]
    public async Task StoredAudioUrl_CannotPointOutsideTheAssetFolder()
    {
        using var c = await SeedAsync();
        var service = Service(c, new FakeSource());
        await service.GenerateForDialogueAsync(1, new[] { 3 }, force: false);
        var row = c.ShadowingSentenceAssets.First(a => a.VoiceId == 3);
        row.SampleAudioUrl = "/audio-cache/shadowing-assets/../../appsettings.json";
        await c.SaveChangesAsync();

        Assert.Null(await service.FindReferenceAsync(row.SourceText, 3));
    }
}
