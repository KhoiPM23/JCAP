using Microsoft.AspNetCore.Identity;

namespace JCAP.Models
{
    public class ApplicationUser : IdentityUser
    {
        public string? FullName { get; set; }
        public string Role { get; set; } = "Learner";
        public bool IsActive { get; set; } = true;
        public string? ProfilePictureUrl { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}

