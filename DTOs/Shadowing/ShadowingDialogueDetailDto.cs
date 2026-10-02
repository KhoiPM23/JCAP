using System;
using System.Collections.Generic;

namespace JCAP.DTOs.Shadowing
{
    public class ShadowingDialogueDetailDto
    {
        public int Id { get; set; }
        public int ScenarioId { get; set; }
        public string ScenarioTitle { get; set; } = string.Empty;
        public string? ScenarioDescription { get; set; }
        public string? ScenarioLevelDescription { get; set; }
        public string Title { get; set; } = string.Empty;
        public string JLPTLevel { get; set; } = "N5";
        public string? SourceDescription { get; set; }
        public string SpeakerRoleA_Name { get; set; } = string.Empty;
        public string SpeakerRoleB_Name { get; set; } = string.Empty;
        public List<string> SpeakerRoles { get; set; } = new List<string>();
        public string? SpeakerRolesJson { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        public List<ShadowingSentenceDto> Sentences { get; set; } = new List<ShadowingSentenceDto>();
        public List<ShadowingVocabularyDto> TargetVocabularies { get; set; } = new List<ShadowingVocabularyDto>();
        public List<ShadowingGrammarDto> TargetGrammars { get; set; } = new List<ShadowingGrammarDto>();
    }

    public class ShadowingVocabularyDto
    {
        public int Id { get; set; }
        public string Word { get; set; } = string.Empty;
        public string? Reading { get; set; }
        public string Meaning { get; set; } = string.Empty;
    }

    public class ShadowingGrammarDto
    {
        public int Id { get; set; }
        public string Pattern { get; set; } = string.Empty;
        public string Meaning { get; set; } = string.Empty;
        public string? ExampleSentence { get; set; }
    }
}

