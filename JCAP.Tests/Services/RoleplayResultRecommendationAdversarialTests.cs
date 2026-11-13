using JCAP.Data;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace JCAP.Tests.Services
{
    public class RoleplayResultRecommendationAdversarialTests
    {
        private static AppDbContext CreateInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase($"JCAP_Recommendation_Adversarial_{Guid.NewGuid()}")
                .Options;
            return new AppDbContext(options);
        }

        private static RoleplayResultService CreateService(
            AppDbContext dbContext,
            IRoleplaySessionSnapshotProvider provider)
        {
            return new RoleplayResultService(
                dbContext,
                provider,
                new RoleplayEvaluationService(),
                new Mock<ILogger<RoleplayResultService>>().Object);
        }

        private static (Scenario scenario, ScenarioLevelConfiguration levelConfig) SetupScenario(
            AppDbContext dbContext,
            int scenarioId,
            string jlptLevel,
            List<TargetVocabulary>? vocabularies = null,
            List<TargetGrammar>? grammars = null)
        {
            var scenario = new Scenario
            {
                Id = scenarioId,
                Title = $"Tình huống kiểm thử {scenarioId}",
                ScenarioCode = $"SCENARIO_{scenarioId}",
                IsActive = true
            };
            var levelConfig = new ScenarioLevelConfiguration
            {
                Id = scenarioId,
                ScenarioId = scenarioId,
                JLPTLevel = jlptLevel,
                Scenario = scenario,
                TargetVocabularies = vocabularies ?? [],
                TargetGrammars = grammars ?? []
            };
            dbContext.Scenarios.Add(scenario);
            dbContext.ScenarioLevelConfigurations.Add(levelConfig);
            return (scenario, levelConfig);
        }

        [Fact]
        public async Task RecommendShadowing_ScenarioScoring_DistinguishesSameVsDifferentVsNullScenario()
        {
            using var dbContext = CreateInMemoryDbContext();
            SetupScenario(dbContext, scenarioId: 10, jlptLevel: "N3");

            // Dialogue 1: Same Scenario (Id=10), Same Level (N3) -> Expected: 40 + 30 = 70
            var d1 = new ShadowingDialogue
            {
                Id = 1,
                ScenarioId = 10,
                Title = "Hội thoại cùng kịch bản",
                JLPTLevel = "N3",
                IsActive = true,
                Sentences = [new ShadowingSentence { Id = 1, OrderIndex = 1, JapaneseText = "こんにちは。" }]
            };

            // Dialogue 2: Different Scenario (Id=99), Same Level (N3) -> Expected: 0 + 30 = 30
            var d2 = new ShadowingDialogue
            {
                Id = 2,
                ScenarioId = 99,
                Title = "Hội thoại khác kịch bản",
                JLPTLevel = "N3",
                IsActive = true,
                Sentences = [new ShadowingSentence { Id = 2, OrderIndex = 1, JapaneseText = "こんにちは。" }]
            };

            // Dialogue 3: Null Scenario, Same Level (N3) -> Expected: 0 + 30 = 30
            var d3 = new ShadowingDialogue
            {
                Id = 3,
                ScenarioId = null,
                Title = "Hội thoại không gắn kịch bản",
                JLPTLevel = "N3",
                IsActive = true,
                Sentences = [new ShadowingSentence { Id = 3, OrderIndex = 1, JapaneseText = "こんにちは。" }]
            };

            dbContext.ShadowingDialogues.AddRange(d1, d2, d3);

            var session = new RoleplaySession
            {
                Id = 501,
                UserId = "user-scenario-test",
                ScenarioLevelConfigurationId = 10,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages = []
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 501,
                RoleplaySessionId = 501,
                UserId = "user-scenario-test",
                ScenarioTitle = "Tình huống kiểm thử 10",
                JLPTLevel = "N3",
                OverallScore = 80,
                GrammarScore = 80,
                VocabularyScore = 80,
                ImpressionScore = 80,
                PassStatus = true,
                GeneralFeedbackText = "Feedback",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("user-scenario-test", 501);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);
            Assert.Equal(2, response.Data.RecommendedShadowingDialogues.Count);

            // Dialogue 1 must be ranked #1 with exactly 70 score
            var top = response.Data.RecommendedShadowingDialogues[0];
            Assert.Equal(1, top.Id);
            Assert.Equal(70, top.Score);

            // Dialogue 2 and 3 both have score 30; by ThenBy(Id), Dialogue 2 (Id=2) should win over Dialogue 3 (Id=3)
            var second = response.Data.RecommendedShadowingDialogues[1];
            Assert.Equal(2, second.Id);
            Assert.Equal(30, second.Score);
        }

        [Fact]
        public async Task RecommendShadowing_JlptScoring_HandlesExactAdjacentAndFarLevels()
        {
            using var dbContext = CreateInMemoryDbContext();
            SetupScenario(dbContext, scenarioId: 20, jlptLevel: "N3");

            // Dialogue 1: Exact match N3 (levelScore = 30)
            var dExact = new ShadowingDialogue
            {
                Id = 1,
                ScenarioId = null,
                Title = "N3 Exact",
                JLPTLevel = "N3",
                IsActive = true,
                Sentences = [new ShadowingSentence { Id = 1, JapaneseText = "テスト" }]
            };

            // Dialogue 2: Adjacent distance 1: N2 (levelScore = 10)
            var dAdjN2 = new ShadowingDialogue
            {
                Id = 2,
                ScenarioId = null,
                Title = "N2 Adjacent",
                JLPTLevel = "N2",
                IsActive = true,
                Sentences = [new ShadowingSentence { Id = 2, JapaneseText = "テスト" }]
            };

            // Dialogue 3: Adjacent distance 1: N4 (levelScore = 10)
            var dAdjN4 = new ShadowingDialogue
            {
                Id = 3,
                ScenarioId = null,
                Title = "N4 Adjacent",
                JLPTLevel = "N4",
                IsActive = true,
                Sentences = [new ShadowingSentence { Id = 3, JapaneseText = "テスト" }]
            };

            // Dialogue 4: Far distance 2: N1 (levelScore = 0)
            var dFarN1 = new ShadowingDialogue
            {
                Id = 4,
                ScenarioId = null,
                Title = "N1 Far",
                JLPTLevel = "N1",
                IsActive = true,
                Sentences = [new ShadowingSentence { Id = 4, JapaneseText = "テスト" }]
            };

            // Dialogue 5: Far distance 2: N5 (levelScore = 0)
            var dFarN5 = new ShadowingDialogue
            {
                Id = 5,
                ScenarioId = null,
                Title = "N5 Far",
                JLPTLevel = "N5",
                IsActive = true,
                Sentences = [new ShadowingSentence { Id = 5, JapaneseText = "テスト" }]
            };

            dbContext.ShadowingDialogues.AddRange(dExact, dAdjN2, dAdjN4, dFarN1, dFarN5);

            var session = new RoleplaySession
            {
                Id = 502,
                UserId = "user-jlpt-test",
                ScenarioLevelConfigurationId = 20,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages = []
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 502,
                RoleplaySessionId = 502,
                UserId = "user-jlpt-test",
                ScenarioTitle = "Tình huống kiểm thử 20",
                JLPTLevel = "N3",
                OverallScore = 80,
                GrammarScore = 80,
                VocabularyScore = 80,
                ImpressionScore = 80,
                PassStatus = true,
                GeneralFeedbackText = "Feedback",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("user-jlpt-test", 502);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);

            // Top recommendation: Exact N3 with score 30
            var top = response.Data.RecommendedShadowingDialogues[0];
            Assert.Equal(1, top.Id);
            Assert.Equal(30, top.Score);

            // Second recommendation: Adjacent (Id=2 N2) with score 10
            var second = response.Data.RecommendedShadowingDialogues[1];
            Assert.Equal(2, second.Id);
            Assert.Equal(10, second.Score);
        }

        [Fact]
        public async Task RecommendShadowing_WeakItemScoring_CapsVocabAndGrammarPointsAndTotalWeakScore()
        {
            using var dbContext = CreateInMemoryDbContext();

            // Scenario with 4 vocabularies and 3 grammars, all unused (NotAttempted -> weak items)
            var vocabs = new List<TargetVocabulary>
            {
                new TargetVocabulary { Id = 1, Word = "単語一", Meaning = "Từ 1" },
                new TargetVocabulary { Id = 2, Word = "単語二", Meaning = "Từ 2" },
                new TargetVocabulary { Id = 3, Word = "単語三", Meaning = "Từ 3" },
                new TargetVocabulary { Id = 4, Word = "単語四", Meaning = "Từ 4" }
            };
            var grammars = new List<TargetGrammar>
            {
                new TargetGrammar { Id = 1, Pattern = "～文法一", Meaning = "Mẫu 1" },
                new TargetGrammar { Id = 2, Pattern = "～文法二", Meaning = "Mẫu 2" },
                new TargetGrammar { Id = 3, Pattern = "～文法三", Meaning = "Mẫu 3" }
            };

            SetupScenario(dbContext, scenarioId: 30, jlptLevel: "N2", vocabs, grammars);

            // Dialogue A contains all 4 weak vocabs and all 3 weak grammars
            // vocabPoints: min(4 * 10, 20) = 20
            // grammarPoints: min(3 * 10, 20) = 20
            // weakScore: min(20 + 20, 30) = 30
            // Same scenario (+40), Same level (+30) -> Total = 40 + 30 + 30 = 100 (capped at 100)
            var dialogueA = new ShadowingDialogue
            {
                Id = 10,
                ScenarioId = 30,
                Title = "Bài đối thoại toàn diện",
                JLPTLevel = "N2",
                IsActive = true,
                Sentences =
                [
                    new ShadowingSentence { Id = 1, JapaneseText = "単語一と単語二と単語三と単語四を使います。" },
                    new ShadowingSentence { Id = 2, JapaneseText = "文法一文法二文法三で練習しましょう。" }
                ]
            };

            // Dialogue B contains only 1 weak vocab:
            // vocabPoints: 10, grammarPoints: 0 -> weakScore = 10
            // Same scenario (+40), Same level (+30) -> Total = 80
            var dialogueB = new ShadowingDialogue
            {
                Id = 20,
                ScenarioId = 30,
                Title = "Bài đối thoại một phần",
                JLPTLevel = "N2",
                IsActive = true,
                Sentences =
                [
                    new ShadowingSentence { Id = 3, JapaneseText = "単語一だけあります。" }
                ]
            };

            dbContext.ShadowingDialogues.AddRange(dialogueA, dialogueB);

            var session = new RoleplaySession
            {
                Id = 503,
                UserId = "user-cap-test",
                ScenarioLevelConfigurationId = 30,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages = [] // No messages -> all target vocabs and grammars become NotAttempted
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 503,
                RoleplaySessionId = 503,
                UserId = "user-cap-test",
                ScenarioTitle = "Tình huống kiểm thử 30",
                JLPTLevel = "N2",
                OverallScore = 80,
                GrammarScore = 80,
                VocabularyScore = 80,
                ImpressionScore = 80,
                PassStatus = true,
                GeneralFeedbackText = "Feedback",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("user-cap-test", 503);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);

            var top = response.Data.RecommendedShadowingDialogues[0];
            Assert.Equal(10, top.Id);
            Assert.Equal(100, top.Score); // Verifies capped at 100 and weak capped at 30

            var second = response.Data.RecommendedShadowingDialogues[1];
            Assert.Equal(20, second.Id);
            Assert.Equal(80, second.Score); // 40 + 30 + 10 = 80
        }

        [Fact]
        public async Task RecommendShadowing_TieBreaking_OrdersDeterministicallyByIdWhenScoresEqual()
        {
            using var dbContext = CreateInMemoryDbContext();
            SetupScenario(dbContext, scenarioId: 40, jlptLevel: "N4");

            // 3 dialogues with IDENTICAL scores: same scenario (40) + same level (30) = 70 each
            var d99 = new ShadowingDialogue
            {
                Id = 99,
                ScenarioId = 40,
                Title = "Dialogue 99",
                JLPTLevel = "N4",
                IsActive = true,
                Sentences = []
            };
            var d12 = new ShadowingDialogue
            {
                Id = 12,
                ScenarioId = 40,
                Title = "Dialogue 12",
                JLPTLevel = "N4",
                IsActive = true,
                Sentences = []
            };
            var d55 = new ShadowingDialogue
            {
                Id = 55,
                ScenarioId = 40,
                Title = "Dialogue 55",
                JLPTLevel = "N4",
                IsActive = true,
                Sentences = []
            };

            dbContext.ShadowingDialogues.AddRange(d99, d12, d55);

            var session = new RoleplaySession
            {
                Id = 504,
                UserId = "user-tie-test",
                ScenarioLevelConfigurationId = 40,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages = []
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 504,
                RoleplaySessionId = 504,
                UserId = "user-tie-test",
                ScenarioTitle = "Tình huống kiểm thử 40",
                JLPTLevel = "N4",
                OverallScore = 80,
                GrammarScore = 80,
                VocabularyScore = 80,
                ImpressionScore = 80,
                PassStatus = true,
                GeneralFeedbackText = "Feedback",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("user-tie-test", 504);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);
            Assert.Equal(2, response.Data.RecommendedShadowingDialogues.Count);

            // Deterministic Tie-breaking: Ordered by Id ascending when Scores are equal
            Assert.Equal(12, response.Data.RecommendedShadowingDialogues[0].Id);
            Assert.Equal(55, response.Data.RecommendedShadowingDialogues[1].Id);
            Assert.Equal(70, response.Data.RecommendedShadowingDialogues[0].Score);
            Assert.Equal(70, response.Data.RecommendedShadowingDialogues[1].Score);
        }

        [Fact]
        public async Task RecommendShadowing_FiltersOutInactiveDialogues_EvenWithPerfectMatch()
        {
            using var dbContext = CreateInMemoryDbContext();
            SetupScenario(dbContext, scenarioId: 50, jlptLevel: "N1");

            // Dialogue 1: Inactive, but perfect match (Scenario + Level = 70)
            var dInactive = new ShadowingDialogue
            {
                Id = 1,
                ScenarioId = 50,
                Title = "Inactive Dialogue",
                JLPTLevel = "N1",
                IsActive = false,
                Sentences = []
            };

            // Dialogue 2: Active, lower score (only level = 30)
            var dActive = new ShadowingDialogue
            {
                Id = 2,
                ScenarioId = null,
                Title = "Active Dialogue",
                JLPTLevel = "N1",
                IsActive = true,
                Sentences = []
            };

            dbContext.ShadowingDialogues.AddRange(dInactive, dActive);

            var session = new RoleplaySession
            {
                Id = 505,
                UserId = "user-inactive-test",
                ScenarioLevelConfigurationId = 50,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages = []
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 505,
                RoleplaySessionId = 505,
                UserId = "user-inactive-test",
                ScenarioTitle = "Tình huống kiểm thử 50",
                JLPTLevel = "N1",
                OverallScore = 80,
                GrammarScore = 80,
                VocabularyScore = 80,
                ImpressionScore = 80,
                PassStatus = true,
                GeneralFeedbackText = "Feedback",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("user-inactive-test", 505);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);
            Assert.Single(response.Data.RecommendedShadowingDialogues);

            // Inactive dialogue must be completely omitted
            Assert.Equal(2, response.Data.RecommendedShadowingDialogues[0].Id);
            Assert.DoesNotContain(response.Data.RecommendedShadowingDialogues, d => d.Id == 1);
        }

        [Fact]
        public async Task RecommendShadowing_HandlesNullOrEmptySentencesAndCorpusSafely()
        {
            using var dbContext = CreateInMemoryDbContext();
            SetupScenario(dbContext, scenarioId: 60, jlptLevel: "N5");

            // Dialogue with empty Title and Sentences with empty strings
            var dEmptyText = new ShadowingDialogue
            {
                Id = 1,
                ScenarioId = 60,
                Title = "",
                JLPTLevel = "N5",
                IsActive = true,
                Sentences =
                [
                    new ShadowingSentence { Id = 1, JapaneseText = "" },
                    new ShadowingSentence { Id = 2, JapaneseText = "   " }
                ]
            };

            dbContext.ShadowingDialogues.Add(dEmptyText);

            var session = new RoleplaySession
            {
                Id = 506,
                UserId = "user-nullsafety-test",
                ScenarioLevelConfigurationId = 60,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages = []
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 506,
                RoleplaySessionId = 506,
                UserId = "user-nullsafety-test",
                ScenarioTitle = "",
                JLPTLevel = "N5",
                OverallScore = 80,
                GrammarScore = 80,
                VocabularyScore = 80,
                ImpressionScore = 80,
                PassStatus = true,
                GeneralFeedbackText = "Feedback",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            // Must not throw NullReferenceException
            var response = await service.GetDetailAsync("user-nullsafety-test", 506);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);
            Assert.Single(response.Data.RecommendedShadowingDialogues);
            Assert.Equal(70, response.Data.RecommendedShadowingDialogues[0].Score);
            Assert.Equal(2, response.Data.RecommendedShadowingDialogues[0].SentencesCount);
        }

        [Fact]
        public async Task RecommendShadowing_HandlesZeroActiveDialogues_ReturnsEmptyList()
        {
            using var dbContext = CreateInMemoryDbContext();
            SetupScenario(dbContext, scenarioId: 70, jlptLevel: "N5");

            // No ShadowingDialogue in DB
            var session = new RoleplaySession
            {
                Id = 507,
                UserId = "user-empty-db-test",
                ScenarioLevelConfigurationId = 70,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages = []
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 507,
                RoleplaySessionId = 507,
                UserId = "user-empty-db-test",
                ScenarioTitle = "Tình huống kiểm thử 70",
                JLPTLevel = "N5",
                OverallScore = 80,
                GrammarScore = 80,
                VocabularyScore = 80,
                ImpressionScore = 80,
                PassStatus = true,
                GeneralFeedbackText = "Feedback",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("user-empty-db-test", 507);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);
            Assert.NotNull(response.Data.RecommendedShadowingDialogues);
            Assert.Empty(response.Data.RecommendedShadowingDialogues);
        }

        [Fact]
        public async Task RecommendShadowing_DoesNotDoubleCountDuplicateWordsInSentences()
        {
            using var dbContext = CreateInMemoryDbContext();

            var vocabs = new List<TargetVocabulary>
            {
                new TargetVocabulary { Id = 1, Word = "すし", Meaning = "Sushi" }
            };

            SetupScenario(dbContext, scenarioId: 80, jlptLevel: "N5", vocabs);

            // Corpus contains "すし" 4 times across title and sentences
            var dialogue = new ShadowingDialogue
            {
                Id = 1,
                ScenarioId = 80,
                Title = "すし屋でランチ すし",
                JLPTLevel = "N5",
                IsActive = true,
                Sentences =
                [
                    new ShadowingSentence { Id = 1, JapaneseText = "すしを食べます。" },
                    new ShadowingSentence { Id = 2, JapaneseText = "美味しいすしですね。" }
                ]
            };
            dbContext.ShadowingDialogues.Add(dialogue);

            var session = new RoleplaySession
            {
                Id = 508,
                UserId = "user-double-count-test",
                ScenarioLevelConfigurationId = 80,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages = []
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 508,
                RoleplaySessionId = 508,
                UserId = "user-double-count-test",
                ScenarioTitle = "Quán Sushi",
                JLPTLevel = "N5",
                OverallScore = 80,
                GrammarScore = 80,
                VocabularyScore = 80,
                ImpressionScore = 80,
                PassStatus = true,
                GeneralFeedbackText = "Feedback",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("user-double-count-test", 508);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);
            Assert.Single(response.Data.RecommendedShadowingDialogues);

            // Score must be: Scenario (40) + Level (30) + 1 Weak Vocab (10) = 80
            // NOT double counted to 40 + 30 + 20 = 90
            var rec = response.Data.RecommendedShadowingDialogues[0];
            Assert.Equal(80, rec.Score);
        }
    }
}
