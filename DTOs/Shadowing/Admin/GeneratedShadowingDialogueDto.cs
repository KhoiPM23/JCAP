using System.Collections.Generic;

namespace JCAP.DTOs.Shadowing.Admin
{
    public class GeneratedShadowingDialogueDto
    {
        public string Title { get; set; } = string.Empty;
        public string JLPTLevel { get; set; } = "N5";
        public string? ContextDescription { get; set; }
        public List<string> SpeakerRoles { get; set; } = new List<string>();
        public List<CreateShadowingSentenceDto> Sentences { get; set; } = new List<CreateShadowingSentenceDto>();
        public List<CreateShadowingVocabularyDto> TargetVocabularies { get; set; } = new List<CreateShadowingVocabularyDto>();
        public List<CreateShadowingGrammarDto> TargetGrammars { get; set; } = new List<CreateShadowingGrammarDto>();
    }
}
