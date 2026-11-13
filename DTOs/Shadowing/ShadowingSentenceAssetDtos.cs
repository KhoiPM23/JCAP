using System.Collections.Generic;

namespace JCAP.DTOs.Shadowing
{
    /// <summary>Một đoạn chữ của câu; Reading có giá trị khi đoạn chứa chữ Hán (để hiển thị Furigana).</summary>
    public class FuriganaSegmentDto
    {
        public string Text { get; set; } = string.Empty;
        public string? Reading { get; set; }
    }

    public class ShadowingAssetGenerationReportDto
    {
        public int SentencesChecked { get; set; }
        public int ReadingsCreated { get; set; }
        public int AudiosCreated { get; set; }
        public int UpToDate { get; set; }
        public int Failed { get; set; }

        /// <summary>true nếu dừng sớm vì VOICEVOX không dùng được (lần sau chạy tiếp).</summary>
        public bool EngineUnavailable { get; set; }

        public List<string> Errors { get; set; } = new();
    }

    public class ShadowingSentenceAssetStatusDto
    {
        public int SentenceId { get; set; }
        public int OrderIndex { get; set; }
        public string JapaneseText { get; set; } = string.Empty;
        public bool HasReading { get; set; }
        public string? KanaReading { get; set; }
        public List<int> VoicesWithAudio { get; set; } = new();
        /// <summary>Có dữ liệu nhưng câu đã đổi chữ sau khi tạo.</summary>
        public bool IsStale { get; set; }
    }

    public class ShadowingAssetStatusDto
    {
        public int DialogueId { get; set; }
        public int SentenceCount { get; set; }
        public int ReadyForScoring { get; set; }
        public List<ShadowingSentenceAssetStatusDto> Sentences { get; set; } = new();
    }
}
