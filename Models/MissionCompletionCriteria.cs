namespace JCAP.Models
{
    public class MissionCompletionCriteria
    {
        public string Intent { get; set; } = string.Empty;
        public string Target { get; set; } = string.Empty;
        public List<string> Conditions { get; set; } = new List<string>();
    }
}
