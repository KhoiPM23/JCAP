using JCAP.Data.Static;
using JCAP.Models;
using Microsoft.AspNetCore.Identity;

namespace JCAP.Data.Seeds
{
    public static class UserSeeder
    {
        public static async Task SeedAsync(IServiceProvider serviceProvider)
        {
            var roleManager = serviceProvider.GetRequiredService<RoleManager<IdentityRole>>();
            var userManager = serviceProvider.GetRequiredService<UserManager<ApplicationUser>>();

            // 1. Tạo các vai trò cơ bản (Admin, Learner)
            string[] roles = { UserRoles.Admin, UserRoles.Learner };
            foreach (var role in roles)
            {
                if (!await roleManager.RoleExistsAsync(role))
                {
                    await roleManager.CreateAsync(new IdentityRole(role));
                }
            }

            // 2. Nạp các tài khoản mẫu từ AccountSeedData
            foreach (var account in AccountSeedData.Accounts)
            {
                var existingUser = await userManager.FindByEmailAsync(account.Email);
                if (existingUser == null)
                {
                    var user = new ApplicationUser
                    {
                        UserName = account.Email,
                        Email = account.Email,
                        FullName = account.FullName,
                        Role = account.Role,
                        EmailConfirmed = true,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    };

                    var result = await userManager.CreateAsync(user, account.Password);
                    if (result.Succeeded)
                    {
                        await userManager.AddToRoleAsync(user, account.Role);
                    }
                }
            }
        }
    }
}

