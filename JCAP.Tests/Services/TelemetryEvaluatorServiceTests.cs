using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.Data.Seeds;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
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
        public async Task FinalizeSessionTelemetryAsync_DoesNotThrowDuplicateKey_WhenDuplicateVocabOrGrammarConfigured()
        {
            using var dbContext = CreateInMemoryDbContext();
            var errorDetector = new VietnameseLearnerErrorDetector();
            var service = new TelemetryEvaluatorService(dbContext, errorDetector);

            var session = new RoleplaySession
            {
                Id = 500,
                UserId = "user-fsrs-dup",
                Status = "Completed",
                ScenarioLevelConfiguration = new ScenarioLevelConfiguration
                {
                    JLPTLevel = "N4",
                    TargetVocabularies = new List<TargetVocabulary>
                    {
                        new TargetVocabulary { Id = 1, Word = "ラーメン", Meaning = "Mì Ramen" },
                        new TargetVocabulary { Id = 2, Word = "ラーメン", Meaning = "Mì Ramen bản trùng" },
                        new TargetVocabulary { Id = 3, Word = " ラーメン ", Meaning = "Mì Ramen có khoảng trắng" }
                    },
                    TargetGrammars = new List<TargetGrammar>
                    {
                        new TargetGrammar { Id = 0, Pattern = "～てください", Meaning = "Hãy làm gì" },
                        new TargetGrammar { Id = 0, Pattern = "～てください", Meaning = "Bản trùng pattern" }
                    }
                }
            };
            dbContext.RoleplaySessions.Add(session);

            dbContext.RoleplayMessages.Add(new RoleplayMessage
            {
                RoleplaySessionId = 500,
                Sender = "User",
                JapaneseText = "ラーメンをください。"
            });

            dbContext.LearnerBehaviorSignals.Add(new LearnerBehaviorSignal
            {
                SessionId = 500,
                TurnIndex = 1,
                LatencyMs = 1500,
                TurnScore = 95,
                DetectedRuleErrorCodes = "E01,E01_INTRANSITIVE_WO,E01", // Duplicate mapped error codes
                CreatedAtUtc = DateTime.UtcNow
            });

            await dbContext.SaveChangesAsync();

            // Phải chạy trơn tru mà không văng Exception hay duplicate key
            var exception = await Record.ExceptionAsync(() => service.FinalizeSessionTelemetryAsync(500, "user-fsrs-dup"));
            Assert.Null(exception);

            var masteries = await dbContext.LearnerSkillMasteries
                .Where(m => m.UserId == "user-fsrs-dup")
                .ToListAsync();

            // Phải có đúng 3 bản ghi duy nhất: 1 VOCAB_ラーメン, 1 GRAMMAR_..., 1 E01_INTRANSITIVE_WO
            Assert.True(masteries.Count == 3, $"Actual count: {masteries.Count}. Codes: {string.Join(", ", masteries.Select(m => m.SkillCode))}");
            Assert.Single(masteries, m => m.SkillCode == "VOCAB_ラーメン");
            Assert.Single(masteries, m => m.SkillCode.StartsWith("GRAMMAR_"));
            Assert.Single(masteries, m => m.SkillCode == "E01_INTRANSITIVE_WO");
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

        [Fact]
        public async Task FinalizeSessionTelemetryAsync_WhenNoSignalsExist_SynthesizesFromResultAndMessages()
        {
            using var dbContext = CreateInMemoryDbContext();
            var errorDetector = new VietnameseLearnerErrorDetector();
            var service = new TelemetryEvaluatorService(dbContext, errorDetector);

            var scenario = new Scenario { Id = 88, ScenarioCode = "SCN_SYNTH_88", Title = "Phỏng vấn", IsActive = true };
            var cfg = new ScenarioLevelConfiguration
            {
                Id = 88,
                ScenarioId = 88,
                JLPTLevel = "N4",
                Scenario = scenario,
                TargetVocabularies = new List<TargetVocabulary>(),
                TargetGrammars = new List<TargetGrammar>()
            };
            dbContext.Scenarios.Add(scenario);
            dbContext.ScenarioLevelConfigurations.Add(cfg);

            var session = new RoleplaySession
            {
                Id = 880,
                UserId = "user-synth-1",
                Status = "Completed",
                ScenarioLevelConfigurationId = 88,
                ScenarioLevelConfiguration = cfg,
                Messages = new List<RoleplayMessage>
                {
                    new()
                    {
                        Sender = "User",
                        JapaneseText = "どうぞよろしくお願いいたします。",
                        LinguisticFeedbackJson = """
                        {
                          "evaluationSource": "AI",
                          "status": "Good",
                          "summary": "Lịch sự",
                          "details": [],
                          "speechDelivery": {
                            "isTextInput": true,
                            "speechConfidence": null,
                            "turnAutonomyScore": 100
                          }
                        }
                        """
                    }
                }
            };
            dbContext.RoleplaySessions.Add(session);
            dbContext.RoleplayResults.Add(new RoleplayResult
            {
                Id = 880,
                RoleplaySessionId = 880,
                UserId = "user-synth-1",
                ScenarioTitle = "Phỏng vấn",
                JLPTLevel = "N4",
                OverallScore = 92,
                GrammarScore = 90,
                VocabularyScore = 88,
                ImpressionScore = 90,
                PassStatus = true,
                GeneralFeedbackText = "Tốt",
                CompletedMissionsSummaryJson = "[]"
            });
            await dbContext.SaveChangesAsync();

            var profileBefore = await service.GetOrCreateProfileAsync("user-synth-1");
            double baselineMora = profileBefore.AverageMoraRate;
            double baselineKeigo = profileBefore.KeigoCommandScore;
            double baselineProf = profileBefore.CommunicativeProficiencyIndex;

            await service.FinalizeSessionTelemetryAsync(880, "user-synth-1");

            var profileAfter = await dbContext.LearnerIntelligenceProfiles
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == "user-synth-1");
            Assert.NotNull(profileAfter);
            Assert.True(profileAfter!.KeigoCommandScore > baselineKeigo);
            Assert.True(profileAfter.CommunicativeProficiencyIndex > baselineProf);
            Assert.Equal(baselineMora, profileAfter.AverageMoraRate);
        }

        [Fact]
        public async Task FinalizeSessionTelemetryAsync_RecoversFsrsMasteryAndUsesFairN5ReflexCurve()
        {
            using var dbContext = CreateInMemoryDbContext();
            var errorDetector = new VietnameseLearnerErrorDetector();
            var service = new TelemetryEvaluatorService(dbContext, errorDetector);

            var cfg = new ScenarioLevelConfiguration
            {
                Id = 990,
                JLPTLevel = "N5",
                TargetVocabularies = new List<TargetVocabulary>
                {
                    new() { Id = 1, Word = "お冷", Reading = "おひや", Meaning = "Nước lọc" }
                },
                TargetGrammars = new List<TargetGrammar>()
            };
            dbContext.ScenarioLevelConfigurations.Add(cfg);
            dbContext.RoleplaySessions.Add(new RoleplaySession
            {
                Id = 990,
                UserId = "user-recover-1",
                Status = "Completed",
                ScenarioLevelConfigurationId = 990,
                ScenarioLevelConfiguration = cfg,
                Messages = new List<RoleplayMessage>
                {
                    new() { Sender = "User", JapaneseText = "お冷をお願いします。" }
                }
            });
            dbContext.LearnerSkillMasteries.Add(new LearnerSkillMastery
            {
                UserId = "user-recover-1",
                SkillCode = "VOCAB_お冷",
                SkillName = "Từ vựng: お冷 (Nước lọc)",
                Category = "Vocabulary",
                Stability = 1.0,
                Difficulty = 4.5,
                Repetitions = 1,
                Lapses = 1,
                NextRecommendedReviewUtc = DateTime.UtcNow.AddHours(-2)
            });
            dbContext.LearnerBehaviorSignals.Add(new LearnerBehaviorSignal
            {
                SessionId = 990,
                TurnIndex = 1,
                LatencyMs = 4500, // Chuẩn N5 <= 5.0s phải đạt điểm phản xạ cao (>= 60), không tụt xuống 20
                TurnScore = 90
            });
            await dbContext.SaveChangesAsync();

            await service.FinalizeSessionTelemetryAsync(990, "user-recover-1");

            var profile = await dbContext.LearnerIntelligenceProfiles.FirstAsync(p => p.UserId == "user-recover-1");
            var mastery = await dbContext.LearnerSkillMasteries.FirstAsync(m => m.UserId == "user-recover-1" && m.SkillCode == "VOCAB_お冷");

            Assert.True(profile.SpeakingReflexIndex >= 60.0);
            Assert.Equal(0, mastery.Lapses);
            Assert.True(mastery.Stability >= 2.5);
            Assert.True(mastery.NextRecommendedReviewUtc > DateTime.UtcNow.AddDays(1));
        }

        [Fact]
        public async Task FinalizeSessionTelemetryAsync_IgnoresZeroLatencyAndZeroTurnScoreSignals()
        {
            using var dbContext = CreateInMemoryDbContext();
            var errorDetector = new VietnameseLearnerErrorDetector();
            var service = new TelemetryEvaluatorService(dbContext, errorDetector);

            dbContext.LearnerIntelligenceProfiles.Add(new LearnerIntelligenceProfile
            {
                UserId = "user-zero-signals",
                SpeakingReflexIndex = 62.5,
                KeigoCommandScore = 60.0,
                ParticleAccuracyRate = 75.0,
                AverageMoraRate = 4.1,
                HintDependencyRate = 10.0,
                CommunicativeConfidenceScore = 70.0,
                CommunicativeProficiencyIndex = 65.0
            });

            var cfg = new ScenarioLevelConfiguration
            {
                Id = 995,
                JLPTLevel = "N5",
                TargetVocabularies = new List<TargetVocabulary>(),
                TargetGrammars = new List<TargetGrammar>()
            };
            dbContext.ScenarioLevelConfigurations.Add(cfg);

            dbContext.RoleplaySessions.Add(new RoleplaySession
            {
                Id = 995,
                UserId = "user-zero-signals",
                Status = "Completed",
                ScenarioLevelConfigurationId = 995,
                ScenarioLevelConfiguration = cfg
            });

            dbContext.RoleplayResults.Add(new RoleplayResult
            {
                Id = 995,
                RoleplaySessionId = 995,
                UserId = "user-zero-signals",
                ScenarioTitle = "Gọi món Ramen",
                JLPTLevel = "N5",
                OverallScore = 88,
                GrammarScore = 85,
                VocabularyScore = 86,
                ImpressionScore = 88,
                PassStatus = true,
                GeneralFeedbackText = "Tốt",
                CompletedMissionsSummaryJson = "[]"
            });

            dbContext.LearnerBehaviorSignals.Add(new LearnerBehaviorSignal
            {
                SessionId = 995,
                TurnIndex = 1,
                LatencyMs = 0,
                TurnScore = 0,
                FallbackToTextInput = true,
                MoraRate = 0.0,
                CreatedAtUtc = DateTime.UtcNow
            });
            await dbContext.SaveChangesAsync();

            await service.FinalizeSessionTelemetryAsync(995, "user-zero-signals");

            var profile = await dbContext.LearnerIntelligenceProfiles
                .AsNoTracking()
                .FirstAsync(p => p.UserId == "user-zero-signals");

            Assert.Equal(62.5, profile.SpeakingReflexIndex);
            Assert.True(profile.CommunicativeProficiencyIndex > 65.0);
            Assert.Contains("\"hesitationRate\":null", profile.InferredTraitsJson);
            Assert.Contains("\"averageHesitationSeconds\":null", profile.InferredTraitsJson);
        }

        [Fact]
        public async Task FinalizeSessionTelemetryAsync_DoesNotFabricateLatency_WhenLatencyMissingOrZeroUserMessages()
        {
            using var dbContext = CreateInMemoryDbContext();
            var errorDetector = new VietnameseLearnerErrorDetector();
            var service = new TelemetryEvaluatorService(dbContext, errorDetector);

            dbContext.LearnerIntelligenceProfiles.Add(new LearnerIntelligenceProfile
            {
                UserId = "user-no-fab",
                SpeakingReflexIndex = 64.0,
                KeigoCommandScore = 58.0,
                ParticleAccuracyRate = 72.0,
                AverageMoraRate = 4.0,
                HintDependencyRate = 15.0,
                CommunicativeConfidenceScore = 66.0,
                CommunicativeProficiencyIndex = 63.0
            });

            var cfg = new ScenarioLevelConfiguration
            {
                Id = 996,
                JLPTLevel = "N5",
                TargetVocabularies = new List<TargetVocabulary>(),
                TargetGrammars = new List<TargetGrammar>()
            };
            dbContext.ScenarioLevelConfigurations.Add(cfg);

            // Case 1: 0 signals & 0 user messages, even with a RoleplayResult (early-exit) -> returns early without fabricating
            dbContext.RoleplaySessions.Add(new RoleplaySession
            {
                Id = 996,
                UserId = "user-no-fab",
                Status = "Completed",
                ScenarioLevelConfigurationId = 996,
                ScenarioLevelConfiguration = cfg
            });
            dbContext.RoleplayResults.Add(new RoleplayResult
            {
                Id = 996,
                RoleplaySessionId = 996,
                UserId = "user-no-fab",
                ScenarioTitle = "Early Exit",
                JLPTLevel = "N5",
                OverallScore = 0,
                PassStatus = false,
                CompletedMissionsSummaryJson = "[]"
            });

            // Case 2: 0 signals, 1 user message WITHOUT ResponseLatencySeconds
            dbContext.RoleplaySessions.Add(new RoleplaySession
            {
                Id = 997,
                UserId = "user-no-fab",
                Status = "Completed",
                ScenarioLevelConfigurationId = 996,
                ScenarioLevelConfiguration = cfg,
                Messages = new List<RoleplayMessage>
                {
                    new()
                    {
                        Sender = "User",
                        JapaneseText = "ラーメンをください。",
                        LinguisticFeedbackJson = """
                        {
                          "evaluationSource": "AI",
                          "status": "Good",
                          "summary": "Tot",
                          "speechDelivery": { "isTextInput": true, "responseLatencySeconds": null }
                        }
                        """
                    }
                }
            });
            await dbContext.SaveChangesAsync();

            await service.FinalizeSessionTelemetryAsync(996, "user-no-fab");
            var profileAfterEarlyExit = await dbContext.LearnerIntelligenceProfiles
                .AsNoTracking()
                .FirstAsync(p => p.UserId == "user-no-fab");
            Assert.Equal(64.0, profileAfterEarlyExit.SpeakingReflexIndex);
            Assert.Equal(63.0, profileAfterEarlyExit.CommunicativeProficiencyIndex);

            await service.FinalizeSessionTelemetryAsync(997, "user-no-fab");
            var profileAfterMsgNoLatency = await dbContext.LearnerIntelligenceProfiles
                .AsNoTracking()
                .FirstAsync(p => p.UserId == "user-no-fab");
            Assert.Equal(64.0, profileAfterMsgNoLatency.SpeakingReflexIndex);
            Assert.Contains("\"hesitationRate\":null", profileAfterMsgNoLatency.InferredTraitsJson);
            Assert.Contains("\"averageHesitationSeconds\":null", profileAfterMsgNoLatency.InferredTraitsJson);
        }

        [Fact]
        public void DeriveDynamicJlptLevel_MatchesProfileThresholds()
        {
            Assert.Equal(("N3", "N3 (Thành thạo)"), TelemetryEvaluatorService.DeriveDynamicJlptDetails(1.3, 82.0, 0));
            Assert.Equal(("N4", "N4 (Vững)"), TelemetryEvaluatorService.DeriveDynamicJlptDetails(0.6, 74.0, 0));
            Assert.Equal(("N4", "N4 (Cơ bản)"), TelemetryEvaluatorService.DeriveDynamicJlptDetails(0.1, 64.0, 1));
            Assert.Equal(("N5", "N5 (Vững)"), TelemetryEvaluatorService.DeriveDynamicJlptDetails(-0.2, 56.0, 0));
            // 2+ consecutive fails demotes to N5 (Cơ bản)
            Assert.Equal(("N5", "N5 (Cơ bản)"), TelemetryEvaluatorService.DeriveDynamicJlptDetails(1.5, 85.0, 2));
            Assert.Equal("N3", TelemetryEvaluatorService.DeriveDynamicJlptLevel(1.3, 82.0, 0));
        }

        [Fact]
        public async Task FinalizeSessionTelemetryAsync_AndGetIntelligenceProfileAsync_MatchJlpt_WhenPlacementTestAndZeroSessionsExist()
        {
            using var dbContext = CreateInMemoryDbContext();
            var errorDetector = new VietnameseLearnerErrorDetector();
            var telemetryService = new TelemetryEvaluatorService(dbContext, errorDetector);

            // Case A: 0 completed standard sessions (only Active session) -> must fall back to CommunicativeProficiencyIndex (55 -> N5), not 6-metric mean (~82 -> N3)
            const string zeroSesUserId = "user-zero-ses-parity";
            dbContext.LearnerIntelligenceProfiles.Add(new LearnerIntelligenceProfile
            {
                UserId = zeroSesUserId,
                ThetaEstimate = 1.5,
                SpeakingReflexIndex = 85,
                KeigoCommandScore = 85,
                ParticleAccuracyRate = 85,
                AverageMoraRate = 4.8,
                HintDependencyRate = 10,
                CommunicativeConfidenceScore = 85,
                CommunicativeProficiencyIndex = 55
            });
            var cfgA = new ScenarioLevelConfiguration
            {
                Id = 998,
                JLPTLevel = "N4",
                TargetVocabularies = new List<TargetVocabulary>(),
                TargetGrammars = new List<TargetGrammar>()
            };
            dbContext.ScenarioLevelConfigurations.Add(cfgA);
            dbContext.RoleplaySessions.Add(new RoleplaySession
            {
                Id = 998,
                UserId = zeroSesUserId,
                Status = "Active",
                SessionType = "Standard",
                ScenarioLevelConfigurationId = 998,
                ScenarioLevelConfiguration = cfgA
            });
            dbContext.LearnerBehaviorSignals.Add(new LearnerBehaviorSignal
            {
                SessionId = 998,
                TurnIndex = 1,
                LatencyMs = 0,
                TurnScore = 0
            });

            // Case B: Failed PlacementTest + 1 failed Standard session -> PlacementTest must be excluded (consecutiveFailCount == 1 -> N3)
            const string placementUserId = "user-placement-parity";
            dbContext.LearnerIntelligenceProfiles.Add(new LearnerIntelligenceProfile
            {
                UserId = placementUserId,
                ThetaEstimate = 1.8,
                SpeakingReflexIndex = 90,
                KeigoCommandScore = 90,
                ParticleAccuracyRate = 90,
                AverageMoraRate = 5.2,
                HintDependencyRate = 5,
                CommunicativeConfidenceScore = 90,
                CommunicativeProficiencyIndex = 88
            });
            dbContext.RoleplaySessions.AddRange(
                new RoleplaySession
                {
                    Id = 1901,
                    UserId = placementUserId,
                    Status = "Completed",
                    SessionType = "Standard",
                    CompletedAt = DateTime.UtcNow.AddMinutes(-5),
                    ScenarioLevelConfigurationId = 998,
                    ScenarioLevelConfiguration = cfgA
                },
                new RoleplaySession
                {
                    Id = 1902,
                    UserId = placementUserId,
                    Status = "Completed",
                    SessionType = "PlacementTest",
                    CompletedAt = DateTime.UtcNow.AddMinutes(-1)
                });
            dbContext.RoleplayResults.AddRange(
                new RoleplayResult
                {
                    Id = 1901,
                    RoleplaySessionId = 1901,
                    UserId = placementUserId,
                    ScenarioTitle = "Standard",
                    JLPTLevel = "N3",
                    OverallScore = 60,
                    PassStatus = false,
                    CompletedAt = DateTime.UtcNow.AddMinutes(-5),
                    GeneralFeedbackText = "Retry",
                    CompletedMissionsSummaryJson = "[]"
                },
                new RoleplayResult
                {
                    Id = 1902,
                    RoleplaySessionId = 1902,
                    UserId = placementUserId,
                    ScenarioTitle = "Placement",
                    JLPTLevel = "N4",
                    OverallScore = 40,
                    PassStatus = false,
                    CompletedAt = DateTime.UtcNow.AddMinutes(-1),
                    GeneralFeedbackText = "Placement",
                    CompletedMissionsSummaryJson = "[]"
                });
            dbContext.LearnerBehaviorSignals.Add(new LearnerBehaviorSignal
            {
                SessionId = 1901,
                TurnIndex = 1,
                LatencyMs = 1500,
                TurnScore = 90
            });
            await dbContext.SaveChangesAsync();

            var userStore = new Mock<IUserStore<ApplicationUser>>();
            var userManager = new Mock<UserManager<ApplicationUser>>(
                userStore.Object, null!, null!, null!, null!, null!, null!, null!, null!);
            var sessionService = new RoleplaySessionService(
                dbContext,
                userManager.Object,
                new Mock<IAiRoleplayService>().Object,
                new Mock<ILogger<RoleplaySessionService>>().Object,
                errorDetector,
                telemetryService,
                new Mock<IPersonaMemoryService>().Object);

            // Verify Case A parity
            await telemetryService.FinalizeSessionTelemetryAsync(998, zeroSesUserId);
            var profileA = await dbContext.LearnerIntelligenceProfiles.AsNoTracking().FirstAsync(p => p.UserId == zeroSesUserId);
            using var traitsDocA = JsonDocument.Parse(profileA.InferredTraitsJson!);
            var dtoResA = await sessionService.GetIntelligenceProfileAsync(zeroSesUserId);
            Assert.True(dtoResA.Success);
            Assert.Equal("N5", traitsDocA.RootElement.GetProperty("estimatedJlptLevel").GetString());
            Assert.Equal(traitsDocA.RootElement.GetProperty("estimatedJlptLevel").GetString(), dtoResA.Data!.EstimatedJlptLevel);

            // Verify Case B parity
            await telemetryService.FinalizeSessionTelemetryAsync(1901, placementUserId);
            var profileB = await dbContext.LearnerIntelligenceProfiles.AsNoTracking().FirstAsync(p => p.UserId == placementUserId);
            using var traitsDocB = JsonDocument.Parse(profileB.InferredTraitsJson!);
            var dtoResB = await sessionService.GetIntelligenceProfileAsync(placementUserId);
            Assert.True(dtoResB.Success);
            Assert.Equal(1, dtoResB.Data!.ConsecutiveFailCount);
            Assert.Equal("N3", dtoResB.Data.EstimatedJlptLevel);
            Assert.Equal(traitsDocB.RootElement.GetProperty("estimatedJlptLevel").GetString(), dtoResB.Data.EstimatedJlptLevel);
        }
    }
}
