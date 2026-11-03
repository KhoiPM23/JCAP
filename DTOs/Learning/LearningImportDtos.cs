namespace JCAP.DTOs.Learning;

public record LearningImportIssue(string Sheet, int Row, string Column, string Message, string Severity = "error");
public record LearningImportRow(string Sheet, int Row, string Key, string Text, string Action);
public class LearningImportReport
{
    public string FileHash { get; set; } = "";
    public bool CanImport => Issues.All(i => i.Severity != "error");
    public bool Imported { get; set; }
    public int NewTopics { get; set; }
    public int NewVocabularies { get; set; }
    public int NewGrammars { get; set; }
    public int NewExamples { get; set; }
    public int NewSources { get; set; }
    public int NewLinks { get; set; }
    public int ReusedContents { get; set; }
    public List<LearningImportIssue> Issues { get; set; } = [];
    public List<LearningImportRow> Rows { get; set; } = [];
}
