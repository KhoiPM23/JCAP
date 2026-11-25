namespace JCAP.DTOs.Profile
{
    public class LearnerProfileDto
    {
        public string Id { get; set; } = string.Empty;
        public string? FullName { get; set; }
        public string? Email { get; set; }
        public string? PhoneNumber { get; set; }
        public string? ProfilePictureUrl { get; set; }
        public string JLPTLevel { get; set; } = "N5"; // N5, N4, N3
        public string Role { get; set; } = "Learner";
        public int CreditBalance { get; set; }
        public DateTime CreatedAt { get; set; }
        public string PlacementTestStatus { get; set; } = "NotStarted";
        public bool HasSeenPlacementPrompt { get; set; }
        public string? InitialEstimatedLevel { get; set; }
        public string? InitialConfidenceTier { get; set; }
        public string? InitialProficiencySnapshotJson { get; set; }
        public DateTime? PlacementTestCompletedAtUtc { get; set; }
    }
}
