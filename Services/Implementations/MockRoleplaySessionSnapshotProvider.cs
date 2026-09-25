using JCAP.Services.Interfaces;
using JCAP.Services.Models;

namespace JCAP.Services.Implementations
{
    public class MockRoleplaySessionSnapshotProvider : IRoleplaySessionSnapshotProvider
    {
        public Task<RoleplaySessionSnapshot?> GetCompletableSessionAsync(int sessionId, string userId)
        {
            if (sessionId <= 0 || string.IsNullOrWhiteSpace(userId))
            {
                return Task.FromResult<RoleplaySessionSnapshot?>(null);
            }

            var scenario = sessionId switch
            {
                1 => ("Gọi món tại quán mì Ramen", "N5", new[]
                {
                    "Chào hỏi và cho biết số lượng khách",
                    "Gọi món bằng mẫu câu phù hợp",
                    "Yêu cầu thêm món hoặc đồ uống"
                }),
                2 => ("Hỏi đường đi tàu điện tại ga Shinjuku", "N4", new[]
                {
                    "Hỏi cách mua vé",
                    "Xác nhận tuyến tàu cần đi",
                    "Hỏi điểm đổi tuyến",
                    "Cảm ơn nhân viên nhà ga"
                }),
                3 => ("Phỏng vấn xin việc làm thêm (Baito)", "N3", new[]
                {
                    "Tự giới thiệu bản thân",
                    "Trình bày kinh nghiệm",
                    "Nêu thời gian có thể làm việc",
                    "Sử dụng cách nói lịch sự"
                }),
                _ => ("Kịch bản hội thoại mẫu", "N5", new[]
                {
                    "Mở đầu cuộc hội thoại phù hợp",
                    "Truyền đạt đúng ý định giao tiếp"
                })
            };

            return Task.FromResult<RoleplaySessionSnapshot?>(new RoleplaySessionSnapshot
            {
                SessionId = sessionId,
                UserId = userId,
                ScenarioTitle = scenario.Item1,
                JLPTLevel = scenario.Item2,
                CompletedMissions = scenario.Item3
                    .Select((title, index) => new CompletedMissionSnapshot
                    {
                        MissionId = index + 1,
                        Title = title
                    })
                    .ToList()
            });
        }
    }
}
