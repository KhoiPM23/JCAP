namespace JCAP.Data.Seeds
{
    public class SeedAccountModel
    {
        public string FullName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
    }

    public static class AccountSeedData
    {
        public static readonly List<SeedAccountModel> Accounts = new()
        {
            // 3 Tài khoản Admin
            new SeedAccountModel
            {
                FullName = "Admin Quản Trị 1",
                Email = "admin1@jcap.com",
                Password = "Admin@123!",
                Role = "Admin"
            },
            new SeedAccountModel
            {
                FullName = "Admin Quản Trị 2",
                Email = "admin2@jcap.com",
                Password = "Admin@123!",
                Role = "Admin"
            },
            new SeedAccountModel
            {
                FullName = "Admin Quản Trị 3",
                Email = "admin3@jcap.com",
                Password = "Admin@123!",
                Role = "Admin"
            },

            // 3 Tài khoản Learner
            new SeedAccountModel
            {
                FullName = "Học Viên Luyện Nói 1",
                Email = "learner1@jcap.com",
                Password = "Learner@123!",
                Role = "Learner"
            },
            new SeedAccountModel
            {
                FullName = "Học Viên Luyện Nói 2",
                Email = "learner2@jcap.com",
                Password = "Learner@123!",
                Role = "Learner"
            },
            new SeedAccountModel
            {
                FullName = "Học Viên Luyện Nói 3",
                Email = "learner3@jcap.com",
                Password = "Learner@123!",
                Role = "Learner"
            }
        };
    }
}

