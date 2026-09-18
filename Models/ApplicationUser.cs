using Microsoft.AspNetCore.Identity;

namespace JCAP.Models
{
    public class ApplicationUser : IdentityUser
    {
        public string? FullName { get; set; }
        public string Role { get; set; } = "Learner";
        public bool IsActive { get; set; } = true;
        public string? ProfilePictureUrl { get; set; }
        public int CreditBalance { get; set; } = 0;
        public string JLPTLevel { get; set; } = "N5"; // Domain restricted to N5, N4, N3
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}

