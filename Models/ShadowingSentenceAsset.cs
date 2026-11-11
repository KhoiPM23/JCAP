using System;

namespace JCAP.Models
{
    /// <summary>
    /// Dữ liệu tham chiếu TÍNH SẴN của một câu Shadowing (Shadowing V2 Decision 2), để lúc người học chấm bài KHÔNG cần VOICEVOX:
    /// cách đọc (G2P của VOICEVOX/OpenJTalk), chuỗi mora, ranh giới từ, Furigana, và theo từng giọng: đường dẫn giọng mẫu + mốc mora.
    ///
    /// Một dòng VoiceId = null chứa phần cách đọc (không phụ thuộc giọng); mỗi giọng VOICEVOX đã tạo có một dòng riêng (kèm cách đọc).
    /// Câu đổi chữ (SourceText khác JapaneseText hiện tại) thì dòng bị coi là cũ và được tạo lại. Không xóa cứng: IsActive = false.
    /// </summary>
    public class ShadowingSentenceAsset
    {
        public int Id { get; set; }
        public int ShadowingSentenceId { get; set; }

        /// <summary>Đúng chữ của câu lúc tạo (so với ShadowingSentence.JapaneseText để biết dữ liệu đã cũ).</summary>
        public string SourceText { get; set; } = string.Empty;

        /// <summary>Văn bản đã gửi engine (NFKC, bỏ khoảng trắng, giữ dấu câu).</summary>
        public string NormalizedText { get; set; } = string.Empty;

        /// <summary>Cách đọc hiển thị (hiragana, trường âm theo kana thông dụng).</summary>
        public string KanaReading { get; set; } = string.Empty;

        /// <summary>JSON [{"c": dạng so sánh, "d": dạng hiển thị}] — đúng chuỗi mora bộ so khớp dùng.</summary>
        public string MoraSequence { get; set; } = "[]";

        /// <summary>JSON mảng chỉ số mora bắt đầu mỗi từ (cụm trọng âm).</summary>
        public string WordStartsJson { get; set; } = "[]";

        /// <summary>JSON [{"t": chữ, "r": cách đọc hoặc null}] để hiển thị Furigana trên chữ Hán; null nếu không gióng được.</summary>
        public string? FuriganaJson { get; set; }

        /// <summary>voicevox</summary>
        public string VoiceProvider { get; set; } = "voicevox";

        /// <summary>Id giọng (speaker) của VOICEVOX; null = dòng chỉ chứa cách đọc.</summary>
        public int? VoiceId { get; set; }

        /// <summary>URL tương đối của giọng mẫu đã lưu (vd. /audio-cache/voicevox/3/{sha256}.wav); null với dòng cách đọc.</summary>
        public string? SampleAudioUrl { get; set; }

        public int? AudioDurationMs { get; set; }

        /// <summary>JSON mốc thời gian từng mora của giọng mẫu (để định vị khoảng dừng, đo trường âm) khi không có engine.</summary>
        public string? MoraTimelineJson { get; set; }

        /// <summary>Phiên bản dữ liệu (vd. "voicevox:0.25.2/asset-v1") để biết khi nào cần tạo lại.</summary>
        public string AudioVersion { get; set; } = string.Empty;

        public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
        public bool IsActive { get; set; } = true;

        public ShadowingSentence? ShadowingSentence { get; set; }
    }
}
