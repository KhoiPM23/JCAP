using JCAP.Models;

namespace JCAP.Services.Interfaces
{
    public interface IRoleplaySessionSnapshotProvider
    {
        Task<RoleplaySessionSnapshot?> GetCompletableSessionAsync(int sessionId, string userId);
    }
}
