using JCAP.Data;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Tests.Services
{
    public class RoleplaySessionSnapshotProviderTests
    {
        [Fact]
        public async Task GetCompletableSessionAsync_ReturnsOwnedSessionWithCompletedMissions()
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase($"JCAP_RoleplaySnapshot_Test_{Guid.NewGuid()}")
                .Options;

            await using var dbContext = new AppDbContext(options);
            var scenario = new Scenario { Id = 1, Title = "Gọi món tại quán Ramen" };
            var configuration = new ScenarioLevelConfiguration
            {
                Id = 2,
                ScenarioId = scenario.Id,
                Scenario = scenario,
                Title = "Ramen N5",
                JLPTLevel = "N5"
            };
            var completedMission = new Mission
            {
                Id = 3,
                ScenarioLevelConfigurationId = configuration.Id,
                Content = "Gọi một tô ramen",
                Order = 1
            };
            var pendingMission = new Mission
            {
                Id = 4,
                ScenarioLevelConfigurationId = configuration.Id,
                Content = "Yêu cầu thêm đồ uống",
                Order = 2
            };
            var session = new RoleplaySession
            {
                Id = 5,
                UserId = "learner-1",
                ScenarioLevelConfigurationId = configuration.Id,
                ScenarioLevelConfiguration = configuration,
                SessionMissions =
                [
                    new RoleplaySessionMission
                    {
                        MissionId = completedMission.Id,
                        Mission = completedMission,
                        IsCompleted = true
                    },
                    new RoleplaySessionMission
                    {
                        MissionId = pendingMission.Id,
                        Mission = pendingMission,
                        IsCompleted = false
                    }
                ]
            };

            dbContext.RoleplaySessions.Add(session);
            await dbContext.SaveChangesAsync();

            var provider = new RoleplaySessionSnapshotProvider(dbContext);
            var snapshot = await provider.GetCompletableSessionAsync(5, "learner-1");

            Assert.NotNull(snapshot);
            Assert.Equal("Gọi món tại quán Ramen", snapshot.ScenarioTitle);
            Assert.Equal("N5", snapshot.JLPTLevel);
            var mission = Assert.Single(snapshot.CompletedMissions);
            Assert.Equal(completedMission.Id, mission.MissionId);
            Assert.Equal(completedMission.Content, mission.Title);
        }

        [Fact]
        public async Task GetCompletableSessionAsync_DoesNotExposeAnotherLearnersSession()
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase($"JCAP_RoleplaySnapshot_Test_{Guid.NewGuid()}")
                .Options;

            await using var dbContext = new AppDbContext(options);
            dbContext.RoleplaySessions.Add(new RoleplaySession
            {
                Id = 8,
                UserId = "learner-2",
                ScenarioLevelConfigurationId = 1
            });
            await dbContext.SaveChangesAsync();

            var provider = new RoleplaySessionSnapshotProvider(dbContext);
            var snapshot = await provider.GetCompletableSessionAsync(8, "learner-1");

            Assert.Null(snapshot);
        }
    }
}
