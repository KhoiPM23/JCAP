namespace JCAP.DTOs.Stt;

public class WhisperTranscribeResponseDto
{
    public bool Success { get; set; }
    public string Text { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public double DurationSeconds { get; set; }
    public double SpeechPace { get; set; }
    public string Language { get; set; } = "ja";
    public string? AudioUrl { get; set; }
    public List<WhisperSegmentDto>? Segments { get; set; }
}

public class WhisperSegmentDto
{
    public double Start { get; set; }
    public double End { get; set; }
    public string Text { get; set; } = string.Empty;
    public double Confidence { get; set; }
}
