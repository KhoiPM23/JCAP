using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.Data.Seeds;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace JCAP.Tests.Services
{
    public class TelemetryEvaluatorServiceTests
    {
        private static AppDbContext CreateInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase($"JCAP_Telemetry_Test_{Guid.NewGuid()}")
                .Options;
            return new AppDbContext(options);
        }

        [Fact]
        public async Task FinalizeSessionTelemetryAsync_UpdatesFsrsMastery_OnDetectedErrors()
        {
            using var dbContext = CreateInMemoryDbContext();
            var errorDetector = new VietnameseLearnerErrorDetector();
            var service = new TelemetryEvaluatorService(dbContext, errorDetector);

            var session = new RoleplaySession
            {
                Id = 200,
                UserId = "user-fsrs-1",
                Status = "Completed",
                ScenarioLevelConfiguration = new ScenarioLevelConfiguration
                {
                    JLPTLevel = "N5",
                    TargetVocabularies = new List<TargetVocabulary>(),
                    TargetGrammars = new List<TargetGrammar>()
                }
            };
            dbContext.RoleplaySessions.Add(session);

            // Add turn telemetry signal with detected errors E01 and E02
            dbContext.LearnerBehaviorSignals.Add(new LearnerBehaviorSignal
            {
                SessionId = 200,
                TurnIndex = 1,
                LatencyMs = 2500,
                TurnScore = 80,
                DetectedRuleErrorCodes = "E01_INTRANSITIVE_WO,E02_PLACE_DE_NI",
                CreatedAtUtc = DateTime.UtcNow
            });

            await dbContext.SaveChangesAsync();

            await service.FinalizeSessionTelemetryAsync(200, "user-fsrs-1");

            var masteries = await dbContext.LearnerSkillMasteries
                .Where(m => m.UserId == "user-fsrs-1")
                .ToListAsync();

            Assert.Equal(2, masteries.Count);
            var e01 = masteries.FirstOrDefault(m => m.SkillCode == "E01_INTRANSITIVE_WO");
            Assert.NotNull(e01);
            Assert.Equal(1, e01.Lapses);
            Assert.Equal(1, e01.Repetitions);
            Assert.Equal(6.0, e01.Difficulty);
            Assert.Equal(0.8, e01.Stability);
            Assert.Equal("Grammar", e01.Category);
        }

        [Fact]
        public async Task FinalizeSessionTelemetryAsync_ReinforcesFsrsMastery_OnTargetVocabAndGrammarUsage()
        {
            using var dbContext = CreateInMemoryDbContext();
            var errorDetector = new VietnameseLearnerErrorDetector();
            var service = new TelemetryEvaluatorService(dbContext, errorDetector);

            var session = new RoleplaySession
            {
                Id = 300,
                UserId = "user-fsrs-2",
                Status = "Completed",
                ScenarioLevelConfiguration = new ScenarioLevelConfiguration
                {
                    JLPTLevel = "N5",
                    TargetVocabularies = new List<TargetVocabulary>
                    {
                        new TargetVocabulary { Id = 10, Word = "ラーメン", Reading = "らーめん", Meaning = "Mì Ramen" }
                    },
                    TargetGrammars = new List<TargetGrammar>
                    {
                        new TargetGrammar { Id = 20, Pattern = "～をお願いします", Meaning = "Cho tôi xin..." }
                    }
                }
            };
            dbContext.RoleplaySessions.Add(session);

            dbContext.RoleplayMessages.Add(new RoleplayMessage
            {
                RoleplaySessionId = 300,
                Sender = "User",
                JapaneseText = "ラーメンをお願いします。"
            });

            dbContext.LearnerBehaviorSignals.Add(new LearnerBehaviorSignal
            {
                SessionId = 300,
                TurnIndex = 1,
                LatencyMs = 1500,
                TurnScore = 95,
                CreatedAtUtc = DateTime.UtcNow
            });

            await dbContext.SaveChangesAsync();

            await service.FinalizeSessionTelemetryAsync(300, "user-fsrs-2");

            var vocabMastery = await dbContext.LearnerSkillMasteries
                .FirstOrDefaultAsync(m => m.UserId == "user-fsrs-2" && m.SkillCode == "VOCAB_ラーメン");
            Assert.NotNull(vocabMastery);
            Assert.Equal(0, vocabMastery.Lapses);
            Assert.Equal(1, vocabMastery.Repetitions);
            Assert.Equal("Vocabulary", vocabMastery.Category);

            var grammarMastery = await dbContext.LearnerSkillMasteries
                .FirstOrDefaultAsync(m => m.UserId == "user-fsrs-2" && m.SkillCode == "GRAMMAR_20");
            Assert.NotNull(grammarMastery);
            Assert.Equal(0, grammarMastery.Lapses);
            Assert.Equal("Grammar", grammarMastery.Category);
        }

        [Fact]
        public async Task FinalizeSessionTelemetryAsync_DoesNotRecordMastery_WhenGrammarPatternIsEmptyOrWhitespace()
        {
            using var dbContext = CreateInMemoryDbContext();
            var errorDetector = new VietnameseLearnerErrorDetector();
            var service = new TelemetryEvaluatorService(dbContext, errorDetector);

            var session = new RoleplaySession
            {
                Id = 400,
                UserId = "user-fsrs-empty",
                Status = "Completed",
                ScenarioLevelConfiguration = new ScenarioLevelConfiguration
                {
                    JLPTLevel = "N5",
                    TargetVocabularies = new List<TargetVocabulary>(),
                    TargetGrammars = new List<TargetGrammar>
                    {
                        new TargetGrammar { Id = 99, Pattern = "～", Meaning = "Invalid pattern" },
                        new TargetGrammar { Id = 100, Pattern = "", Meaning = "Empty pattern" }
                    }
                }
            };
            dbContext.RoleplaySessions.Add(session);

            dbContext.RoleplayMessages.Add(new RoleplayMessage
            {
                RoleplaySessionId = 400,
                Sender = "User",
                JapaneseText = "こんにちは。"
            });

            dbContext.LearnerBehaviorSignals.Add(new LearnerBehaviorSignal
            {
                SessionId = 400,
                TurnIndex = 1,
                LatencyMs = 1200,
                TurnScore = 90,
                CreatedAtUtc = DateTime.UtcNow
            });

            await dbContext.SaveChangesAsync();

            await service.FinalizeSessionTelemetryAsync(400, "user-fsrs-empty");

            var masteries = await dbContext.LearnerSkillMasteries
                .Where(m => m.UserId == "user-fsrs-empty")
                .ToListAsync();

            // Không được tạo bản ghi mastery cho pattern rỗng
            Assert.Empty(masteries);
        }

        [Fact]
        public void ScenarioSeedData_ContainsAllRequiredScenariosWithLevels()
        {
            var scenarios = ScenarioSeedData.GetInitialScenarios();
            Assert.Contains(scenarios, s => s.ScenarioCode == "SCN_RAMEN_01");
            Assert.Contains(scenarios, s => s.ScenarioCode == "SCN_BAITO_01");
            Assert.Contains(scenarios, s => s.ScenarioCode == "SCN_TRANSIT_01");
            Assert.Contains(scenarios, s => s.ScenarioCode == "SCN_KONBINI_01");
            Assert.Contains(scenarios, s => s.ScenarioCode == "SCN_OFFICE_01");
            Assert.Contains(scenarios, s => s.ScenarioCode == "SCN_CAFE_01");

            foreach (var scenario in scenarios)
            {
                Assert.NotEmpty(scenario.Title);
                Assert.NotEmpty(scenario.Description);
                Assert.NotEmpty(scenario.LevelConfigurations);
                foreach (var level in scenario.LevelConfigurations)
                {
                    Assert.NotEmpty(level.JLPTLevel);
                    Assert.NotEmpty(level.Missions);
                    Assert.NotEmpty(level.TargetVocabularies);
                    Assert.NotEmpty(level.TargetGrammars);
                    foreach (var mission in level.Missions)
                    {
                        Assert.NotEmpty(mission.Content);
                        Assert.NotEmpty(mission.CompletionCriteriaJson);
                    }
                }
            }
        }
    }
}
