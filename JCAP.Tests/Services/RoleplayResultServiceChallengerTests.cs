using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Roleplay;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace JCAP.Tests.Services
{
    public class RoleplayResultServiceChallengerTests
    {
        private static AppDbContext CreateInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase($"JCAP_RoleplayChallenger_Test_{Guid.NewGuid()}")
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

        private static string InvokeNormalizeGrammarPattern(string? pattern)
        {
            var method = typeof(RoleplayResultService).GetMethod(
                "NormalizeGrammarPattern",
                BindingFlags.NonPublic | BindingFlags.Static);
            Assert.NotNull(method);
            return (string)method.Invoke(null, [pattern])!;
        }

        #region 1. Pattern Normalization Empirical Tests

        [Theory]
        [InlineData("～をお願いします", "をお願いします")] // Fullwidth tilde U+FF5E
        [InlineData("〜をお願いします", "をお願いします")] // Wave dash U+301C
        [InlineData("~をお願いします", "をお願いします")] // ASCII tilde U+007E
        [InlineData("～てください。", "てください")]       // Punctuation period
        [InlineData("～ですか？", "ですか")]             // Fullwidth question mark
        [InlineData("～ですか?", "ですか")]              // ASCII question mark
        [InlineData("　～をお願いします　", "をお願いします")] // Japanese fullwidth space
        public void NormalizeGrammarPattern_HandlesTildesAndPunctuation(string input, string expected)
        {
            var result = InvokeNormalizeGrammarPattern(input);
            Assert.Equal(expected, result);
        }

        [Theory]
        [InlineData("[Verb]てから", "てから")]           // ASCII brackets
        [InlineData("［動詞］てから", "てから")]         // Fullwidth brackets
        [InlineData("(Vて)はいけません", "はいけません")] // ASCII parentheses
        [InlineData("（Vて）はいけません", "はいけません")] // Fullwidth parentheses
        [InlineData("［名詞］＋をお願いします", "をお願いします")] // Brackets plus sign
        public void NormalizeGrammarPattern_HandlesBracketsAndParentheses(string input, string expected)
        {
            var result = InvokeNormalizeGrammarPattern(input);
            Assert.Equal(expected, result);
        }

        [Theory]
        [InlineData(null, "")]
        [InlineData("", "")]
        [InlineData("   ", "")]
        [InlineData("～", "～")]                        // Fallback preserves pattern if cleaned is empty
        [InlineData("~", "~")]
        public void NormalizeGrammarPattern_HandlesNullEmptyAndTildeOnly(string? input, string expected)
        {
            var result = InvokeNormalizeGrammarPattern(input);
            Assert.Equal(expected, result);
        }

        [Fact]
        public void NormalizeGrammarPattern_DocumentsCompoundMiddleTildeLimitation()
        {
            // When grammar has tildes in the middle as slots: "自宅から～で～分ほどかかります"
            // Stripping all tildes collapses it to "自宅からで分ほどかかります"
            var result = InvokeNormalizeGrammarPattern("自宅から～で～分ほどかかります");
            Assert.Equal("自宅からで分ほどかかります", result);
        }

        #endregion

        #region 2. DetectWeakVocabularies Empirical Tests

        [Fact]
        public async Task DetectWeakVocabularies_CorrectlyIdentifiesUnattemptedWords()
        {
            using var dbContext = CreateInMemoryDbContext();

            var scenario = new Scenario { Id = 101, Title = "Test Vocab Unattempted", ScenarioCode = "TST_01", IsActive = true };
            var levelConfig = new ScenarioLevelConfiguration
            {
                Id = 101,
                ScenarioId = 101,
                JLPTLevel = "N5",
                Scenario = scenario,
                TargetVocabularies =
                [
                    new TargetVocabulary { Id = 1, Word = "ラーメン", Reading = "らーめん", Meaning = "Mì ramen" },
                    new TargetVocabulary { Id = 2, Word = "餃子", Reading = "ぎょうざ", Meaning = "Bánh gyoza" }
                ],
                TargetGrammars = []
            };
            dbContext.Scenarios.Add(scenario);
            dbContext.ScenarioLevelConfigurations.Add(levelConfig);

            var session = new RoleplaySession
            {
                Id = 301,
                UserId = "challenger-user-1",
                ScenarioLevelConfigurationId = 101,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages =
                [
                    new RoleplayMessage
                    {
                        Id = 1,
                        Sender = "User",
                        JapaneseText = "ラーメンをください。",
                        LinguisticFeedbackJson = """{"evaluationSource":"AI","status":"Good","summary":"OK","details":[]}"""
                    }
                ]
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 301,
                RoleplaySessionId = 301,
                UserId = "challenger-user-1",
                ScenarioTitle = "Test Vocab Unattempted",
                JLPTLevel = "N5",
                OverallScore = 80,
                GrammarScore = 80,
                VocabularyScore = 80,
                ImpressionScore = 80,
                PassStatus = true,
                GeneralFeedbackText = "Pass",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("challenger-user-1", 301);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);

            // "餃子" was never mentioned -> NotAttempted
            var unattempted = response.Data.WeakVocabularies.FirstOrDefault(v => v.Word == "餃子");
            Assert.NotNull(unattempted);
            Assert.Equal("NotAttempted", unattempted.Status);
            Assert.Equal(30, unattempted.MasteryScore);
            Assert.Contains("Chưa chủ động vận dụng", unattempted.Reason);

            // "ラーメン" was spoken cleanly -> Not in weak list
            Assert.DoesNotContain(response.Data.WeakVocabularies, v => v.Word == "ラーメン");
        }

        [Fact]
        public async Task DetectWeakVocabularies_MatchesReadingWhenKanjiNotUsed()
        {
            using var dbContext = CreateInMemoryDbContext();

            var scenario = new Scenario { Id = 102, Title = "Test Reading Match", ScenarioCode = "TST_02", IsActive = true };
            var levelConfig = new ScenarioLevelConfiguration
            {
                Id = 102,
                ScenarioId = 102,
                JLPTLevel = "N5",
                Scenario = scenario,
                TargetVocabularies =
                [
                    new TargetVocabulary { Id = 3, Word = "豚骨ラーメン", Reading = "とんこつらーめん", Meaning = "Mì Tonkotsu" }
                ],
                TargetGrammars = []
            };
            dbContext.Scenarios.Add(scenario);
            dbContext.ScenarioLevelConfigurations.Add(levelConfig);

            // User said hiragana reading "とんこつらーめん" instead of kanji "豚骨ラーメン"
            var session = new RoleplaySession
            {
                Id = 302,
                UserId = "challenger-user-2",
                ScenarioLevelConfigurationId = 102,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages =
                [
                    new RoleplayMessage
                    {
                        Id = 2,
                        Sender = "User",
                        JapaneseText = "とんこつらーめんを一つお願いします。",
                        LinguisticFeedbackJson = """{"evaluationSource":"AI","status":"Good","summary":"OK","details":[]}"""
                    }
                ]
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 302,
                RoleplaySessionId = 302,
                UserId = "challenger-user-2",
                ScenarioTitle = "Test Reading Match",
                JLPTLevel = "N5",
                OverallScore = 85,
                PassStatus = true,
                GeneralFeedbackText = "Pass",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("challenger-user-2", 302);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);

            // Reading matched, cleanly spoken -> Not in weak vocabularies
            Assert.DoesNotContain(response.Data.WeakVocabularies, v => v.Word == "豚骨ラーメン");
        }

        [Fact]
        public async Task DetectWeakVocabularies_FlagsNeedsPracticeOnWarningFeedback()
        {
            using var dbContext = CreateInMemoryDbContext();

            var scenario = new Scenario { Id = 103, Title = "Test Warning Feedback", ScenarioCode = "TST_03", IsActive = true };
            var levelConfig = new ScenarioLevelConfiguration
            {
                Id = 103,
                ScenarioId = 103,
                JLPTLevel = "N5",
                Scenario = scenario,
                TargetVocabularies =
                [
                    new TargetVocabulary { Id = 4, Word = "お会計", Reading = "おかいけい", Meaning = "Tính tiền" }
                ],
                TargetGrammars = []
            };
            dbContext.Scenarios.Add(scenario);
            dbContext.ScenarioLevelConfigurations.Add(levelConfig);

            var session = new RoleplaySession
            {
                Id = 303,
                UserId = "challenger-user-3",
                ScenarioLevelConfigurationId = 103,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages =
                [
                    new RoleplayMessage
                    {
                        Id = 3,
                        Sender = "User",
                        JapaneseText = "お会計。",
                        LinguisticFeedbackJson = """
                        {
                            "evaluationSource": "AI",
                            "status": "Warning",
                            "summary": "Nên dùng kính ngữ",
                            "details": [
                                { "type": "warning", "aspect": "Từ vựng và Văn phong", "comment": "Nên nói お会計をお願いします." }
                            ]
                        }
                        """
                    }
                ]
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 303,
                RoleplaySessionId = 303,
                UserId = "challenger-user-3",
                ScenarioTitle = "Test Warning Feedback",
                JLPTLevel = "N5",
                OverallScore = 70,
                PassStatus = true,
                GeneralFeedbackText = "OK",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("challenger-user-3", 303);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);

            var weak = response.Data.WeakVocabularies.FirstOrDefault(v => v.Word == "お会計");
            Assert.NotNull(weak);
            Assert.Equal("NeedsPractice", weak.Status);
            Assert.Equal(50, weak.MasteryScore);
            Assert.Contains("gặp lỗi", weak.Reason);
        }

        [Fact]
        public async Task DetectWeakVocabularies_FlagsNeedsPracticeOnHintLevelUsedSignal()
        {
            using var dbContext = CreateInMemoryDbContext();

            var scenario = new Scenario { Id = 104, Title = "Test Hint Signal", ScenarioCode = "TST_04", IsActive = true };
            var levelConfig = new ScenarioLevelConfiguration
            {
                Id = 104,
                ScenarioId = 104,
                JLPTLevel = "N5",
                Scenario = scenario,
                TargetVocabularies =
                [
                    new TargetVocabulary { Id = 5, Word = "山手線", Reading = "やまのてせん", Meaning = "Tuyến Yamanote" }
                ],
                TargetGrammars = []
            };
            dbContext.Scenarios.Add(scenario);
            dbContext.ScenarioLevelConfigurations.Add(levelConfig);

            var session = new RoleplaySession
            {
                Id = 304,
                UserId = "challenger-user-4",
                ScenarioLevelConfigurationId = 104,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages =
                [
                    new RoleplayMessage
                    {
                        Id = 4,
                        Sender = "User",
                        JapaneseText = "山手線はどこですか。",
                        LinguisticFeedbackJson = """{"evaluationSource":"AI","status":"Good","summary":"OK","details":[]}"""
                    }
                ]
            };
            dbContext.RoleplaySessions.Add(session);

            // LearnerBehaviorSignal with HintLevelUsed >= 2 (cloze or full model)
            dbContext.LearnerBehaviorSignals.Add(new LearnerBehaviorSignal
            {
                SessionId = 304,
                TurnIndex = 1,
                HintLevelUsed = 2,
                LatencyMs = 2500,
                TurnScore = 75
            });

            var result = new RoleplayResult
            {
                Id = 304,
                RoleplaySessionId = 304,
                UserId = "challenger-user-4",
                ScenarioTitle = "Test Hint Signal",
                JLPTLevel = "N5",
                OverallScore = 75,
                PassStatus = true,
                GeneralFeedbackText = "OK",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("challenger-user-4", 304);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);

            var weak = response.Data.WeakVocabularies.FirstOrDefault(v => v.Word == "山手線");
            Assert.NotNull(weak);
            Assert.Equal("NeedsPractice", weak.Status);
            Assert.Equal(50, weak.MasteryScore);
            Assert.Contains("phụ thuộc gợi ý", weak.Reason);
        }

        [Fact]
        public async Task DetectWeakVocabularies_FlagsNeedsPracticeOnLowAutonomyScore()
        {
            using var dbContext = CreateInMemoryDbContext();

            var scenario = new Scenario { Id = 105, Title = "Test Autonomy Score", ScenarioCode = "TST_05", IsActive = true };
            var levelConfig = new ScenarioLevelConfiguration
            {
                Id = 105,
                ScenarioId = 105,
                JLPTLevel = "N5",
                Scenario = scenario,
                TargetVocabularies =
                [
                    new TargetVocabulary { Id = 6, Word = "改札口", Reading = "かいさつぐち", Meaning = "Cửa soát vé" }
                ],
                TargetGrammars = []
            };
            dbContext.Scenarios.Add(scenario);
            dbContext.ScenarioLevelConfigurations.Add(levelConfig);

            var session = new RoleplaySession
            {
                Id = 305,
                UserId = "challenger-user-5",
                ScenarioLevelConfigurationId = 105,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages =
                [
                    new RoleplayMessage
                    {
                        Id = 5,
                        Sender = "User",
                        JapaneseText = "改札口はどちらですか。",
                        LinguisticFeedbackJson = """
                        {
                            "evaluationSource": "AI",
                            "status": "Good",
                            "summary": "OK",
                            "details": [],
                            "speechDelivery": {
                                "turnAutonomyScore": 55
                            }
                        }
                        """
                    }
                ]
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 305,
                RoleplaySessionId = 305,
                UserId = "challenger-user-5",
                ScenarioTitle = "Test Autonomy Score",
                JLPTLevel = "N5",
                OverallScore = 75,
                PassStatus = true,
                GeneralFeedbackText = "OK",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("challenger-user-5", 305);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);

            var weak = response.Data.WeakVocabularies.FirstOrDefault(v => v.Word == "改札口");
            Assert.NotNull(weak);
            Assert.Equal("NeedsPractice", weak.Status);
            Assert.Equal(50, weak.MasteryScore);
            Assert.Contains("phụ thuộc gợi ý", weak.Reason);
        }

        #endregion

        #region 3. DetectWeakGrammars Empirical Tests

        [Fact]
        public async Task DetectWeakGrammars_HandlesVariedPunctuationInPattern()
        {
            using var dbContext = CreateInMemoryDbContext();

            var scenario = new Scenario { Id = 106, Title = "Test Grammar Punctuation", ScenarioCode = "TST_06", IsActive = true };
            var levelConfig = new ScenarioLevelConfiguration
            {
                Id = 106,
                ScenarioId = 106,
                JLPTLevel = "N5",
                Scenario = scenario,
                TargetVocabularies = [],
                TargetGrammars =
                [
                    // Uses wave dash U+301C and fullwidth brackets
                    new TargetGrammar { Id = 21, Pattern = "〜［名詞］をお願いします", Meaning = "Làm ơn cho tôi...", ExampleSentence = "ラーメンをお願いします。" },
                    // Uses ASCII tilde
                    new TargetGrammar { Id = 22, Pattern = "~てください", Meaning = "Xin hãy...", ExampleSentence = "待ってください。" }
                ]
            };
            dbContext.Scenarios.Add(scenario);
            dbContext.ScenarioLevelConfigurations.Add(levelConfig);

            var session = new RoleplaySession
            {
                Id = 306,
                UserId = "challenger-user-6",
                ScenarioLevelConfigurationId = 106,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages =
                [
                    new RoleplayMessage
                    {
                        Id = 6,
                        Sender = "User",
                        JapaneseText = "お水をお願いします。",
                        LinguisticFeedbackJson = """{"evaluationSource":"AI","status":"Good","summary":"OK","details":[]}"""
                    }
                ]
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 306,
                RoleplaySessionId = 306,
                UserId = "challenger-user-6",
                ScenarioTitle = "Test Grammar Punctuation",
                JLPTLevel = "N5",
                OverallScore = 80,
                PassStatus = true,
                GeneralFeedbackText = "Pass",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("challenger-user-6", 306);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);

            // Pattern 21 core is "をお願いします", user said "お水をお願いします" -> matched and clean -> not weak!
            Assert.DoesNotContain(response.Data.WeakGrammars, g => g.Id == 21);

            // Pattern 22 "~てください" was not attempted -> NotAttempted
            var unattempted = response.Data.WeakGrammars.FirstOrDefault(g => g.Id == 22);
            Assert.NotNull(unattempted);
            Assert.Equal("NotAttempted", unattempted.Status);
            Assert.Equal(30, unattempted.MasteryScore);
        }

        [Fact]
        public async Task DetectWeakGrammars_FlagsNeedsPracticeOnDetectedRuleErrorCodesSignal()
        {
            using var dbContext = CreateInMemoryDbContext();

            var scenario = new Scenario { Id = 107, Title = "Test Rule Error Codes", ScenarioCode = "TST_07", IsActive = true };
            var levelConfig = new ScenarioLevelConfiguration
            {
                Id = 107,
                ScenarioId = 107,
                JLPTLevel = "N5",
                Scenario = scenario,
                TargetVocabularies = [],
                TargetGrammars =
                [
                    new TargetGrammar { Id = 31, Pattern = "～はどこですか", Meaning = "...ở đâu?", ExampleSentence = "トイレはどこですか。" }
                ]
            };
            dbContext.Scenarios.Add(scenario);
            dbContext.ScenarioLevelConfigurations.Add(levelConfig);

            var session = new RoleplaySession
            {
                Id = 307,
                UserId = "challenger-user-7",
                ScenarioLevelConfigurationId = 107,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages =
                [
                    new RoleplayMessage
                    {
                        Id = 7,
                        Sender = "User",
                        JapaneseText = "改札口はどこですか。",
                        LinguisticFeedbackJson = """{"evaluationSource":"AI","status":"Good","summary":"OK","details":[]}"""
                    }
                ]
            };
            dbContext.RoleplaySessions.Add(session);

            // Signal recorded grammar rule error "E01,E02"
            dbContext.LearnerBehaviorSignals.Add(new LearnerBehaviorSignal
            {
                SessionId = 307,
                TurnIndex = 1,
                DetectedRuleErrorCodes = "E01_PARTICLE_MISMATCH",
                LatencyMs = 1200,
                TurnScore = 60
            });

            var result = new RoleplayResult
            {
                Id = 307,
                RoleplaySessionId = 307,
                UserId = "challenger-user-7",
                ScenarioTitle = "Test Rule Error Codes",
                JLPTLevel = "N5",
                OverallScore = 70,
                PassStatus = true,
                GeneralFeedbackText = "OK",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("challenger-user-7", 307);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);

            var weak = response.Data.WeakGrammars.FirstOrDefault(g => g.Id == 31);
            Assert.NotNull(weak);
            Assert.Equal("NeedsPractice", weak.Status);
            Assert.Equal(50, weak.MasteryScore);
            Assert.Contains("sai sót", weak.Reason);
        }

        [Fact]
        public async Task DetectWeakGrammars_FlagsNeedsPracticeOnParticleWarningDetail()
        {
            using var dbContext = CreateInMemoryDbContext();

            var scenario = new Scenario { Id = 108, Title = "Test Particle Warning", ScenarioCode = "TST_08", IsActive = true };
            var levelConfig = new ScenarioLevelConfiguration
            {
                Id = 108,
                ScenarioId = 108,
                JLPTLevel = "N5",
                Scenario = scenario,
                TargetVocabularies = [],
                TargetGrammars =
                [
                    new TargetGrammar { Id = 41, Pattern = "～までいくらですか", Meaning = "Đến... bao nhiêu tiền?", ExampleSentence = "新宿までいくらですか。" }
                ]
            };
            dbContext.Scenarios.Add(scenario);
            dbContext.ScenarioLevelConfigurations.Add(levelConfig);

            var session = new RoleplaySession
            {
                Id = 308,
                UserId = "challenger-user-8",
                ScenarioLevelConfigurationId = 108,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages =
                [
                    new RoleplayMessage
                    {
                        Id = 8,
                        Sender = "User",
                        JapaneseText = "渋谷までいくらですか。",
                        LinguisticFeedbackJson = """
                        {
                            "evaluationSource": "AI",
                            "status": "Warning",
                            "summary": "Chú ý trợ từ",
                            "details": [
                                { "type": "warning", "aspect": "Trợ từ", "comment": "Dùng đúng trợ từ まで nhưng cần lưu ý ngữ điệu." }
                            ]
                        }
                        """
                    }
                ]
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 308,
                RoleplaySessionId = 308,
                UserId = "challenger-user-8",
                ScenarioTitle = "Test Particle Warning",
                JLPTLevel = "N5",
                OverallScore = 75,
                PassStatus = true,
                GeneralFeedbackText = "OK",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("challenger-user-8", 308);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);

            var weak = response.Data.WeakGrammars.FirstOrDefault(g => g.Id == 41);
            Assert.NotNull(weak);
            Assert.Equal("NeedsPractice", weak.Status);
            Assert.Equal(50, weak.MasteryScore);
            Assert.Contains("sai sót về trợ từ", weak.Reason);
        }

        #endregion

        #region 4. Empty/Null Edge Case Robustness Tests

        [Fact]
        public async Task GetDetailAsync_HandlesEmptyConfigurationsWithoutException()
        {
            using var dbContext = CreateInMemoryDbContext();

            var scenario = new Scenario { Id = 109, Title = "Test Empty Config", ScenarioCode = "TST_09", IsActive = true };
            var levelConfig = new ScenarioLevelConfiguration
            {
                Id = 109,
                ScenarioId = 109,
                JLPTLevel = "N5",
                Scenario = scenario,
                TargetVocabularies = [],
                TargetGrammars = []
            };
            dbContext.Scenarios.Add(scenario);
            dbContext.ScenarioLevelConfigurations.Add(levelConfig);

            var session = new RoleplaySession
            {
                Id = 309,
                UserId = "challenger-user-9",
                ScenarioLevelConfigurationId = 109,
                Status = "Completed",
                IsNaturallyConcluded = true,
                Messages = []
            };
            dbContext.RoleplaySessions.Add(session);

            var result = new RoleplayResult
            {
                Id = 309,
                RoleplaySessionId = 309,
                UserId = "challenger-user-9",
                ScenarioTitle = "Test Empty Config",
                JLPTLevel = "N5",
                OverallScore = 75,
                PassStatus = true,
                GeneralFeedbackText = "OK",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = DateTime.UtcNow
            };
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, new Mock<IRoleplaySessionSnapshotProvider>().Object);
            var response = await service.GetDetailAsync("challenger-user-9", 309);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);
            Assert.Empty(response.Data.WeakVocabularies);
            Assert.Empty(response.Data.WeakGrammars);
            Assert.NotNull(response.Data.RecommendedShadowingDialogues);
        }

        #endregion
    }
}
