using JCAP.Data;
using JCAP.DTOs.Scenario;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace JCAP.Tests.Services;

public class ScenarioServiceKnowledgeTests
{
    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private sealed class StubAiClient : IAiClient
    {
        private readonly string _jsonResponse;
        public StubAiClient(string jsonResponse) => _jsonResponse = jsonResponse;

        public Task<AiResponse> GenerateAsync(AiRequest request, CancellationToken cancellationToken = default)
            => Task.FromResult(AiResponse.Ok(_jsonResponse));
    }

    private static void SeedRepository(AppDbContext db)
    {
        db.Vocabularies.AddRange(
            new Vocabulary { Id = 101, Word = "切符", Reading = "きっぷ", Meaning = "Vé tàu / Vé xe", JLPTLevel = "N5", IsActive = true },
            new Vocabulary { Id = 102, Word = "改札口", Reading = "かいさつぐち", Meaning = "Cửa soát vé", JLPTLevel = "N4", IsActive = true },
            new Vocabulary { Id = 103, Word = "注文", Reading = "ちゅうもん", Meaning = "Gọi món / Đặt hàng", JLPTLevel = "N5", IsActive = true },
            new Vocabulary { Id = 104, Word = "領収書", Reading = "りょうしゅうしょ", Meaning = "Hóa đơn biên nhận", JLPTLevel = "N4", IsActive = true },
            new Vocabulary { Id = 105, Word = "旧単語", Reading = "きゅうたんご", Meaning = "Từ đã tắt", JLPTLevel = "N5", IsActive = false }
        );
        db.Grammars.AddRange(
            new Grammar { Id = 201, Pattern = "～をください", Reading = "をください", Meaning = "Cho tôi ~ (gọi món / mua đồ)", ExampleSentence = "切符をください。", JLPTLevel = "N5", IsActive = true },
            new Grammar { Id = 202, Pattern = "～てもいいですか", Reading = "てもいいですか", Meaning = "Làm ~ có được không ạ?", ExampleSentence = "写真を撮ってもいいですか。", JLPTLevel = "N4", IsActive = true },
            new Grammar { Id = 203, Pattern = "～はどこですか", Reading = "はどこですか", Meaning = "~ ở đâu vậy ạ?", ExampleSentence = "改札口はどこですか。", JLPTLevel = "N5", IsActive = true }
        );
        db.SaveChanges();
    }

    [Fact]
    public async Task CreateScenarioAsync_RejectsFreeTextWithoutValidRepoIds()
    {
        using var db = CreateInMemoryDbContext();
        SeedRepository(db);
        var service = new ScenarioService(db);

        var dto = new CreateScenarioDto
        {
            Title = "Test kịch bản",
            Description = "Mô tả",
            LevelConfigurations =
            [
                new CreateScenarioLevelConfigDto
                {
                    JLPTLevel = "N5",
                    Title = "N5",
                    TargetVocabularies = [new CreateVocabularyDto { Word = "BiaTuDo", Reading = "びあ", Meaning = "Tự bịa" }],
                    TargetGrammars = [new CreateGrammarDto { GrammarId = 201 }]
                }
            ]
        };

        var res = await service.CreateScenarioAsync(dto);

        Assert.False(res.Success);
        Assert.Contains("Kho học liệu", res.Message);
    }

    [Fact]
    public async Task CreateAndUpdateScenarioAsync_RejectsInactiveRepoId_AndHydratesCanonicalDbText()
    {
        using var db = CreateInMemoryDbContext();
        SeedRepository(db);
        var service = new ScenarioService(db);

        // Reject inactive vocab ID 105
        var badRes = await service.CreateScenarioAsync(new CreateScenarioDto
        {
            Title = "Mua vé tàu",
            Description = "Tại ga",
            LevelConfigurations =
            [
                new CreateScenarioLevelConfigDto
                {
                    JLPTLevel = "N5",
                    TargetVocabularies = [new CreateVocabularyDto { VocabularyId = 105 }],
                    TargetGrammars = [new CreateGrammarDto { GrammarId = 201 }]
                }
            ]
        });
        Assert.False(badRes.Success);

        // Tampered client text must be overwritten by DB repository canonical values
        var okRes = await service.CreateScenarioAsync(new CreateScenarioDto
        {
            Title = "Mua vé tàu",
            Description = "Tại ga",
            LevelConfigurations =
            [
                new CreateScenarioLevelConfigDto
                {
                    JLPTLevel = "N5",
                    TargetVocabularies =
                    [
                        new CreateVocabularyDto { VocabularyId = 101, Word = "FAKE_WORD", Reading = "fake", Meaning = "Fake" }
                    ],
                    TargetGrammars =
                    [
                        new CreateGrammarDto { GrammarId = 201, Pattern = "FAKE_PAT", Meaning = "Fake" }
                    ]
                }
            ]
        });

        Assert.True(okRes.Success);
        var createdLvl = Assert.Single(okRes.Data!.LevelConfigurations);
        var vocab = Assert.Single(createdLvl.TargetVocabularies);
        Assert.Equal(101, vocab.VocabularyId);
        Assert.Equal("切符", vocab.Word);
        Assert.Equal("Vé tàu / Vé xe", vocab.Meaning);

        var grammar = Assert.Single(createdLvl.TargetGrammars);
        Assert.Equal(201, grammar.GrammarId);
        Assert.Equal("～をください", grammar.Pattern);

        // Update rejects free-text grammar as well
        var badUpdate = await service.UpdateScenarioAsync(okRes.Data.Id, new UpdateScenarioDto
        {
            Title = "Mua vé tàu",
            Description = "Tại ga",
            LevelConfigurations =
            [
                new CreateScenarioLevelConfigDto
                {
                    JLPTLevel = "N5",
                    TargetVocabularies = [new CreateVocabularyDto { VocabularyId = 101 }],
                    TargetGrammars = [new CreateGrammarDto { Pattern = "～てばいい" }]
                }
            ]
        });
        Assert.False(badUpdate.Success);
    }

    [Fact]
    public async Task SearchKnowledgeAsync_MatchesVietnameseWithoutDiacritics_Japanese_AndJlptFilter()
    {
        using var db = CreateInMemoryDbContext();
        SeedRepository(db);
        var service = new ScenarioService(db);

        // Diacritic-less Vietnamese search
        var viSearch = await service.SearchKnowledgeAsync("vocab", "ve tau", "ALL");
        Assert.True(viSearch.Success);
        Assert.Contains(viSearch.Data!, x => x.Id == 101 && x.PrimaryText == "切符");

        // Inactive vocab must never appear
        var inactiveSearch = await service.SearchKnowledgeAsync("vocab", "từ đã tắt", "ALL");
        Assert.DoesNotContain(inactiveSearch.Data!, x => x.Id == 105);

        // JLPT filter N4 excludes N5-only items
        var n4GrammarSearch = await service.SearchKnowledgeAsync("grammar", "", "N4");
        Assert.Single(n4GrammarSearch.Data!);
        Assert.Equal(202, n4GrammarSearch.Data![0].Id);
    }

    [Fact]
    public async Task GenerateLevelContentAsync_NeverEmitsFakeItems_AndOnlyReturnsDbIds()
    {
        using var db = CreateInMemoryDbContext();
        SeedRepository(db);

        // AI hallucinates one non-existent vocab ID (9999) + one valid repo ID (103)
        var fakeAiJson = """
        {
          "title": "Gọi món (N5)",
          "description": "Tại quán",
          "aiPersona": "Nhân viên - 店員",
          "missions": [
            { "id": null, "order": 1, "content": "Chào hỏi", "target": "Chào" },
            { "id": null, "order": 2, "content": "Gọi món", "target": "Gọi" },
            { "id": null, "order": 3, "content": "Cảm ơn", "target": "Cảm ơn" }
          ],
          "targetVocabularies": [
            { "id": null, "vocabularyId": 9999, "word": "表現 1", "reading": "ひょうげん", "meaning": "Fake" },
            { "id": null, "vocabularyId": 103, "word": "注文", "reading": "ちゅうもん", "meaning": "Gọi món" }
          ],
          "targetGrammars": [
            { "id": null, "grammarId": 8888, "pattern": "～表現パターン(1)", "meaning": "Fake", "exampleSentence": "Fake" },
            { "id": null, "grammarId": 201, "pattern": "～をください", "meaning": "Cho tôi", "exampleSentence": "水をください。" }
          ]
        }
        """;

        var service = new ScenarioService(db, new StubAiClient(fakeAiJson));
        var res = await service.GenerateLevelContentAsync(new GenerateScenarioLevelContentRequest
        {
            ScenarioTitle = "Gọi món Ramen",
            ScenarioDescription = "Quán ăn",
            JLPTLevel = "N5",
            MissionCount = 3,
            VocabularyCount = 3,
            GrammarCount = 3
        });

        Assert.True(res.Success);
        Assert.NotNull(res.Data);
        Assert.Equal(3, res.Data!.TargetVocabularies.Count);
        Assert.Equal(3, res.Data.TargetGrammars.Count);
        Assert.All(res.Data.TargetVocabularies, v => Assert.True(v.VocabularyId is > 0 && v.VocabularyId != 9999 && !v.Word.StartsWith("表現")));
        Assert.All(res.Data.TargetGrammars, g => Assert.True(g.GrammarId is > 0 && g.GrammarId != 8888 && !g.Pattern.Contains("表現パターン")));
        Assert.Contains(res.Data.TargetVocabularies, v => v.VocabularyId == 103);
        Assert.Contains(res.Data.TargetGrammars, g => g.GrammarId == 201);
    }

    [Fact]
    public async Task SuggestKnowledgeAsync_FiltersOnlyValidCandidateDbIds()
    {
        using var db = CreateInMemoryDbContext();
        SeedRepository(db);

        var ai = new StubAiClient("""{ "selectedIds": [99999, 102, 101] }""");
        var service = new ScenarioService(db, ai);

        var res = await service.SuggestKnowledgeAsync(new SuggestScenarioKnowledgeRequest
        {
            ScenarioTitle = "Mua vé tàu tại ga",
            JlptLevel = "N5",
            Type = "vocab",
            Limit = 2,
            ExcludeIds = [103]
        });

        Assert.True(res.Success);
        Assert.True(res.Data!.UsedAi);
        Assert.Equal(2, res.Data.Items.Count);
        Assert.DoesNotContain(res.Data.Items, x => x.Id == 99999 || x.Id == 103);
        Assert.Contains(res.Data.Items, x => x.Id == 102);
        Assert.Contains(res.Data.Items, x => x.Id == 101);
    }
}
