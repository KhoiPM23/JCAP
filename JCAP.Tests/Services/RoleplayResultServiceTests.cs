using JCAP.Data;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;

namespace JCAP.Tests.Services
{
    public class RoleplayResultServiceTests
    {
        private static AppDbContext CreateInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase($"JCAP_RoleplayResult_Test_{Guid.NewGuid()}")
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

        [Fact]
        public async Task CompleteSessionAsync_CreatesAiScoredResultAndIsIdempotent()
        {
            using var dbContext = CreateInMemoryDbContext();
            dbContext.RoleplaySessions.Add(CreateSession(10, "learner-1"));
            await dbContext.SaveChangesAsync();
            var provider = new Mock<IRoleplaySessionSnapshotProvider>();
            provider
                .Setup(item => item.GetCompletableSessionAsync(10, "learner-1"))
                .ReturnsAsync(new RoleplaySessionSnapshot
                {
                    SessionId = 10,
                    UserId = "learner-1",
                    ScenarioTitle = "Gọi món tại quán Ramen",
                    JLPTLevel = "N5",
                    CompletedMissions =
                    [
                        new CompletedMissionSnapshot { MissionId = 1, Title = "Gọi một tô ramen" }
                    ]
                });

            var service = CreateService(dbContext, provider.Object);

            var first = await service.CompleteSessionAsync("learner-1", 10);
            var second = await service.CompleteSessionAsync("learner-1", 10);

            Assert.True(first.Success);
            Assert.NotNull(first.Data);
            Assert.False(first.Data.IsExistingResult);
            Assert.False(first.Data.IsMockEvaluation);
            Assert.True(second.Success);
            Assert.NotNull(second.Data);
            Assert.True(second.Data.IsExistingResult);
            Assert.Equal(first.Data.ResultId, second.Data.ResultId);
            Assert.Single(await dbContext.RoleplayResults.ToListAsync());
            var savedResult = await dbContext.RoleplayResults.SingleAsync();
            Assert.Equal(95, savedResult.OverallScore);
            Assert.Equal(90, savedResult.GrammarScore);
            Assert.Equal(90, savedResult.VocabularyScore);
            Assert.Equal(92, savedResult.ImpressionScore);
            Assert.True(savedResult.PassStatus);
            var completedSession = await dbContext.RoleplaySessions.SingleAsync();
            Assert.Equal("Completed", completedSession.Status);
            Assert.NotNull(completedSession.CompletedAt);
            provider.Verify(
                item => item.GetCompletableSessionAsync(10, "learner-1"),
                Times.Once);
        }

        [Fact]
        public async Task CompleteSessionAsync_SavesIncompleteMissionResultAsFailed()
        {
            using var dbContext = CreateInMemoryDbContext();
            var session = CreateSession(11, "learner-1");
            session.SessionMissions.Add(new RoleplaySessionMission
            {
                MissionId = 2,
                IsCompleted = false
            });
            dbContext.RoleplaySessions.Add(session);
            await dbContext.SaveChangesAsync();
            var provider = new Mock<IRoleplaySessionSnapshotProvider>();
            provider
                .Setup(item => item.GetCompletableSessionAsync(11, "learner-1"))
                .ReturnsAsync(new RoleplaySessionSnapshot
                {
                    SessionId = 11,
                    UserId = "learner-1",
                    ScenarioTitle = "Gọi món tại quán Ramen",
                    JLPTLevel = "N5",
                    CompletedMissions =
                    [
                        new CompletedMissionSnapshot { MissionId = 1, Title = "Gọi một tô ramen" }
                    ]
                });

            var service = CreateService(dbContext, provider.Object);
            var response = await service.CompleteSessionAsync("learner-1", 11);

            Assert.True(response.Success);
            var savedResult = await dbContext.RoleplayResults.SingleAsync();
            Assert.False(savedResult.PassStatus);
            Assert.Equal(59, savedResult.OverallScore);
            Assert.Contains("1/2", savedResult.GeneralFeedbackText);
            Assert.Contains("Chưa đạt", savedResult.GeneralFeedbackText);
        }

        [Fact]
        public async Task CompleteSessionAsync_RejectsSessionOwnedByAnotherUser()
        {
            using var dbContext = CreateInMemoryDbContext();
            var provider = new Mock<IRoleplaySessionSnapshotProvider>();
            provider
                .Setup(item => item.GetCompletableSessionAsync(20, "learner-1"))
                .ReturnsAsync(new RoleplaySessionSnapshot
                {
                    SessionId = 20,
                    UserId = "learner-2",
                    ScenarioTitle = "Phỏng vấn",
                    JLPTLevel = "N3"
                });

            var service = CreateService(dbContext, provider.Object);
            var response = await service.CompleteSessionAsync("learner-1", 20);

            Assert.False(response.Success);
            Assert.Empty(await dbContext.RoleplayResults.ToListAsync());
        }

        [Fact]
        public async Task CompleteSessionAsync_RejectsSessionWithoutLearnerMessages()
        {
            using var dbContext = CreateInMemoryDbContext();
            dbContext.RoleplaySessions.Add(new RoleplaySession
            {
                Id = 21,
                UserId = "learner-1",
                ScenarioLevelConfigurationId = 1,
                Status = "Active"
            });
            await dbContext.SaveChangesAsync();
            var provider = new Mock<IRoleplaySessionSnapshotProvider>();
            provider
                .Setup(item => item.GetCompletableSessionAsync(21, "learner-1"))
                .ReturnsAsync(new RoleplaySessionSnapshot
                {
                    SessionId = 21,
                    UserId = "learner-1",
                    ScenarioTitle = "Gọi món",
                    JLPTLevel = "N5"
                });

            var service = CreateService(dbContext, provider.Object);
            var response = await service.CompleteSessionAsync("learner-1", 21);

            Assert.False(response.Success);
            Assert.Contains("ít nhất một câu", response.Message);
            Assert.Empty(await dbContext.RoleplayResults.ToListAsync());
            Assert.Equal("Active", (await dbContext.RoleplaySessions.SingleAsync()).Status);
        }

        [Fact]
        public async Task CompleteSessionAsync_RejectsSimulatorOnlyFeedback()
        {
            using var dbContext = CreateInMemoryDbContext();
            dbContext.RoleplaySessions.Add(new RoleplaySession
            {
                Id = 22,
                UserId = "learner-1",
                ScenarioLevelConfigurationId = 1,
                Status = "Active",
                Messages =
                [
                    new RoleplayMessage
                    {
                        Sender = "User",
                        JapaneseText = "ラーメンをください。",
                        LinguisticFeedbackJson = """
                        {
                          "evaluationSource": "Simulator",
                          "status": "Good",
                          "summary": "Phản xạ tự nhiên • Đúng ngữ cảnh"
                        }
                        """
                    }
                ]
            });
            await dbContext.SaveChangesAsync();
            var provider = new Mock<IRoleplaySessionSnapshotProvider>();
            provider
                .Setup(item => item.GetCompletableSessionAsync(22, "learner-1"))
                .ReturnsAsync(new RoleplaySessionSnapshot
                {
                    SessionId = 22,
                    UserId = "learner-1",
                    ScenarioTitle = "Gọi món",
                    JLPTLevel = "N5"
                });

            var service = CreateService(dbContext, provider.Object);
            var response = await service.CompleteSessionAsync("learner-1", 22);

            Assert.False(response.Success);
            Assert.Contains("Gemini", response.Message);
            Assert.Empty(await dbContext.RoleplayResults.ToListAsync());
            Assert.Equal("Active", (await dbContext.RoleplaySessions.SingleAsync()).Status);
        }

        [Fact]
        public async Task CompleteSessionAsync_AllowsDifferentSessionsForDifferentLearners()
        {
            using var dbContext = CreateInMemoryDbContext();
            dbContext.RoleplaySessions.AddRange(
                CreateSession(1, "learner-1"),
                CreateSession(2, "learner-2"));
            await dbContext.SaveChangesAsync();
            var provider = new Mock<IRoleplaySessionSnapshotProvider>();
            provider
                .Setup(item => item.GetCompletableSessionAsync(It.IsAny<int>(), It.IsAny<string>()))
                .ReturnsAsync((int sessionId, string userId) => new RoleplaySessionSnapshot
                {
                    SessionId = sessionId,
                    UserId = userId,
                    ScenarioTitle = "Gọi món tại quán Ramen",
                    JLPTLevel = "N5"
                });

            var service = CreateService(dbContext, provider.Object);
            var firstLearner = await service.CompleteSessionAsync("learner-1", 1);
            var secondLearner = await service.CompleteSessionAsync("learner-2", 2);

            Assert.True(firstLearner.Success);
            Assert.True(secondLearner.Success);
            Assert.Equal(2, await dbContext.RoleplayResults.CountAsync());
        }

        [Fact]
        public async Task GetHistoryAsync_ReturnsOnlyCurrentLearnerAndAppliesPassFilter()
        {
            using var dbContext = CreateInMemoryDbContext();
            dbContext.RoleplayResults.AddRange(
                CreateResult(1, "learner-1", true, DateTime.UtcNow.AddMinutes(-1)),
                CreateResult(2, "learner-1", false, DateTime.UtcNow.AddMinutes(-2)),
                CreateResult(3, "learner-2", true, DateTime.UtcNow));
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, Mock.Of<IRoleplaySessionSnapshotProvider>());
            var response = await service.GetHistoryAsync("learner-1", 1, 10, passStatus: true);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);
            Assert.Single(response.Data.Items);
            Assert.True(response.Data.Items[0].PassStatus);
            Assert.Equal(1, response.Data.TotalCount);
        }

        [Fact]
        public async Task GetHistoryAsync_MarksPersistedTimestampAsUtc()
        {
            using var dbContext = CreateInMemoryDbContext();
            var persistedUtcValue = DateTime.SpecifyKind(
                new DateTime(2026, 9, 28, 2, 30, 0),
                DateTimeKind.Unspecified);
            dbContext.RoleplayResults.Add(
                CreateResult(10, "learner-1", true, persistedUtcValue));
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, Mock.Of<IRoleplaySessionSnapshotProvider>());
            var response = await service.GetHistoryAsync("learner-1");

            Assert.True(response.Success);
            Assert.NotNull(response.Data);
            var item = Assert.Single(response.Data.Items);
            Assert.Equal(DateTimeKind.Utc, item.CompletedAt.Kind);
            Assert.Equal(persistedUtcValue, item.CompletedAt);
        }

        [Fact]
        public async Task GetDetailAsync_MarksPersistedTimestampAsUtc()
        {
            using var dbContext = CreateInMemoryDbContext();
            var persistedUtcValue = DateTime.SpecifyKind(
                new DateTime(2026, 9, 28, 2, 30, 0),
                DateTimeKind.Unspecified);
            var result = CreateResult(20, "learner-1", true, persistedUtcValue);
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, Mock.Of<IRoleplaySessionSnapshotProvider>());
            var response = await service.GetDetailAsync("learner-1", result.Id);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);
            Assert.Equal(DateTimeKind.Utc, response.Data.CompletedAt.Kind);
            Assert.Equal(persistedUtcValue, response.Data.CompletedAt);
        }

        [Fact]
        public async Task GetDetailAsync_PreservesSnapshotAfterSourceSessionChanges()
        {
            using var dbContext = CreateInMemoryDbContext();
            var session = CreateSession(40, "learner-1");
            dbContext.RoleplaySessions.Add(session);
            await dbContext.SaveChangesAsync();
            var snapshot = new RoleplaySessionSnapshot
            {
                SessionId = 40,
                UserId = "learner-1",
                ScenarioTitle = "Gọi món tại quán Ramen",
                JLPTLevel = "N5",
                CompletedMissions = [new CompletedMissionSnapshot { MissionId = 1, Title = "Gọi một tô ramen" }]
            };
            var provider = new Mock<IRoleplaySessionSnapshotProvider>();
            provider.Setup(item => item.GetCompletableSessionAsync(40, "learner-1")).ReturnsAsync(snapshot);
            var service = CreateService(dbContext, provider.Object);
            var completion = await service.CompleteSessionAsync("learner-1", 40);
            Assert.True(completion.Success);
            Assert.NotNull(completion.Data);
            var original = (await service.GetDetailAsync("learner-1", completion.Data.ResultId)).Data;
            Assert.NotNull(original);

            // Later edits to the source must not change a learner's saved result.
            snapshot.ScenarioTitle = "Kịch bản đã chỉnh sửa";
            snapshot.JLPTLevel = "N3";
            snapshot.CompletedMissions[0].Title = "Nhiệm vụ đã chỉnh sửa";
            session.Messages.First().LinguisticFeedbackJson = null;
            foreach (var sessionMission in session.SessionMissions)
            {
                sessionMission.IsCompleted = false;
            }
            await dbContext.SaveChangesAsync();
            dbContext.ChangeTracker.Clear();

            var repeated = await service.CompleteSessionAsync("learner-1", 40);
            var reopened = await service.GetDetailAsync("learner-1", completion.Data.ResultId);

            Assert.True(repeated.Success);
            Assert.NotNull(repeated.Data);
            Assert.True(repeated.Data.IsExistingResult);
            Assert.Equal(completion.Data.ResultId, repeated.Data.ResultId);
            Assert.True(reopened.Success);
            Assert.NotNull(reopened.Data);
            Assert.Equal(original.ScenarioTitle, reopened.Data.ScenarioTitle);
            Assert.Equal(original.JLPTLevel, reopened.Data.JLPTLevel);
            Assert.Equal(original.OverallScore, reopened.Data.OverallScore);
            Assert.Equal(original.GrammarScore, reopened.Data.GrammarScore);
            Assert.Equal(original.VocabularyScore, reopened.Data.VocabularyScore);
            Assert.Equal(original.ImpressionScore, reopened.Data.ImpressionScore);
            Assert.Equal(original.PassStatus, reopened.Data.PassStatus);
            Assert.Equal(original.GeneralFeedbackText, reopened.Data.GeneralFeedbackText);
            Assert.Equal(original.CompletedAt, reopened.Data.CompletedAt);
            var mission = Assert.Single(reopened.Data.CompletedMissions);
            Assert.Equal(1, mission.MissionId);
            Assert.Equal("Gọi một tô ramen", mission.Title);
            provider.Verify(item => item.GetCompletableSessionAsync(40, "learner-1"), Times.Once);
        }

        [Fact]
        public async Task GetDetailAsync_DoesNotExposeAnotherLearnersResult()
        {
            using var dbContext = CreateInMemoryDbContext();
            var result = CreateResult(30, "learner-2", true, DateTime.UtcNow);
            dbContext.RoleplayResults.Add(result);
            await dbContext.SaveChangesAsync();

            var service = CreateService(dbContext, Mock.Of<IRoleplaySessionSnapshotProvider>());
            var response = await service.GetDetailAsync("learner-1", result.Id);

            Assert.False(response.Success);
            Assert.Null(response.Data);
        }

        private static RoleplayResult CreateResult(
            int sessionId,
            string userId,
            bool passStatus,
            DateTime completedAt)
        {
            return new RoleplayResult
            {
                RoleplaySessionId = sessionId,
                UserId = userId,
                ScenarioTitle = $"Scenario {sessionId}",
                JLPTLevel = "N5",
                OverallScore = passStatus ? 80 : 50,
                GrammarScore = 80,
                VocabularyScore = 80,
                ImpressionScore = 80,
                PassStatus = passStatus,
                GeneralFeedbackText = "Mock feedback",
                CompletedMissionsSummaryJson = "[]",
                CompletedAt = completedAt
            };
        }

        private static RoleplaySession CreateSession(int sessionId, string userId)
        {
            return new RoleplaySession
            {
                Id = sessionId,
                UserId = userId,
                ScenarioLevelConfigurationId = 1,
                Status = "Active",
                IsNaturallyConcluded = true,
                Messages =
                [
                    new RoleplayMessage
                    {
                        Sender = "User",
                        JapaneseText = "ラーメンをください。",
                        LinguisticFeedbackJson = """
                        {
                          "evaluationSource": "AI",
                          "status": "Good",
                          "summary": "Rất tốt",
                          "details": [
                            { "type": "success", "aspect": "Ngữ pháp", "comment": "Cấu trúc câu chính xác." },
                            { "type": "success", "aspect": "Từ vựng", "comment": "Dùng từ phù hợp." },
                            { "type": "success", "aspect": "Ngữ cảnh", "comment": "Phản hồi đúng tình huống." }
                          ]
                        }
                        """
                    }
                ],
                SessionMissions =
                [
                    new RoleplaySessionMission
                    {
                        MissionId = 1,
                        IsCompleted = true,
                        CompletedAt = DateTime.UtcNow
                    }
                ]
            };
        }
    }
}
