using System;

namespace JCAP.DTOs.Shadowing
{
    public class ShadowingDialogueListDto
    {
        public int Id { get; set; }
        public int ScenarioId { get; set; }
        public string ScenarioTitle { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string JLPTLevel { get; set; } = "N5";
        public string? SourceDescription { get; set; }
        public string SpeakerRoleA_Name { get; set; } = string.Empty;
        public string SpeakerRoleB_Name { get; set; } = string.Empty;
        public int TotalSentences { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
