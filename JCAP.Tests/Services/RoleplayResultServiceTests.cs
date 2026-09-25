using JCAP.Data;
using JCAP.Models;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
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
                new Mock<ILogger<RoleplayResultService>>().Object);
        }

        [Fact]
        public async Task CompleteSessionAsync_CreatesMockResultAndIsIdempotent()
        {
            using var dbContext = CreateInMemoryDbContext();
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
            Assert.True(first.Data.IsMockEvaluation);
            Assert.True(second.Success);
            Assert.NotNull(second.Data);
            Assert.True(second.Data.IsExistingResult);
            Assert.Equal(first.Data.ResultId, second.Data.ResultId);
            Assert.Single(await dbContext.RoleplayResults.ToListAsync());
            provider.Verify(
                item => item.GetCompletableSessionAsync(10, "learner-1"),
                Times.Once);
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
        public async Task CompleteSessionAsync_AllowsMockScenarioForDifferentLearners()
        {
            using var dbContext = CreateInMemoryDbContext();
            var provider = new Mock<IRoleplaySessionSnapshotProvider>();
            provider
                .Setup(item => item.GetCompletableSessionAsync(1, It.IsAny<string>()))
                .ReturnsAsync((int sessionId, string userId) => new RoleplaySessionSnapshot
                {
                    SessionId = sessionId,
                    UserId = userId,
                    ScenarioTitle = "Gọi món tại quán Ramen",
                    JLPTLevel = "N5"
                });

            var service = CreateService(dbContext, provider.Object);
            var firstLearner = await service.CompleteSessionAsync("learner-1", 1);
            var secondLearner = await service.CompleteSessionAsync("learner-2", 1);

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
    }
}
