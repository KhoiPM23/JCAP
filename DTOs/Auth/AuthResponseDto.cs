namespace JCAP.DTOs.Auth
{
    public class AuthResponseDto
    {
        public string Token { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string JLPTLevel { get; set; } = "N5";
        public int CreditBalance { get; set; }
        public bool HasPassword { get; set; }
        public DateTime ExpiresAt { get; set; }
        public string PlacementTestStatus { get; set; } = "NotStarted";
        public bool HasSeenPlacementPrompt { get; set; }
        public string? InitialEstimatedLevel { get; set; }
        public string? InitialConfidenceTier { get; set; }
    }
}
