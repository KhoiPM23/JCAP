using JCAP.Data;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations
{
    public class RoleplaySessionSnapshotProvider : IRoleplaySessionSnapshotProvider
    {
        private readonly AppDbContext _dbContext;

        public RoleplaySessionSnapshotProvider(AppDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<RoleplaySessionSnapshot?> GetCompletableSessionAsync(
            int sessionId,
            string userId)
        {
            if (sessionId <= 0 || string.IsNullOrWhiteSpace(userId))
            {
                return null;
            }

            return await _dbContext.RoleplaySessions
                .AsNoTracking()
                .Where(session => session.Id == sessionId && session.UserId == userId)
                .Select(session => new RoleplaySessionSnapshot
                {
                    SessionId = session.Id,
                    UserId = session.UserId,
                    ScenarioTitle = session.ScenarioLevelConfiguration!.Scenario!.Title,
                    JLPTLevel = session.ScenarioLevelConfiguration.JLPTLevel,
                    CompletedMissions = session.SessionMissions
                        .Where(sessionMission => sessionMission.IsCompleted)
                        .OrderBy(sessionMission => sessionMission.Mission!.Order)
                        .Select(sessionMission => new CompletedMissionSnapshot
                        {
                            MissionId = sessionMission.MissionId,
                            Title = sessionMission.Mission!.Content
                        })
                        .ToList()
                })
                .FirstOrDefaultAsync();
        }
    }
}
