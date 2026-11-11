using System.Collections.Generic;

namespace JCAP.Services.Interfaces
{
    /// <summary>
    /// Nhận dạng âm vị tiếng Nhật trực tiếp từ bản ghi của JCAP (không dùng nhận dạng của trình duyệt).
    /// Cho biết người học thực sự phát ra âm nào, kèm thời điểm và độ tự tin; không đoán theo nghĩa của câu.
    /// </summary>
    public interface IPhonemeRecognizer
    {
        /// <summary>false nếu tính năng tắt hoặc thiếu tệp mô hình (khi đó Recognize trả null).</summary>
        bool IsAvailable { get; }

        /// <param name="samples16k">Mẫu âm thanh mono 16 kHz, giá trị trong [-1, 1].</param>
        PhonemeRecognitionResult? Recognize(float[] samples16k);
    }

    /// <summary>Một âm vị nhận được. Confidence là xác suất trung bình (0..1) của nhãn này trên các khung của nó.</summary>
    public sealed record RecognizedPhoneme(string Label, int StartMs, int EndMs, double Confidence);

    public sealed class PhonemeRecognitionResult
    {
        /// <summary>Âm vị theo thứ tự thời gian (gồm cả `pau`/`sil` để biết chỗ ngắt).</summary>
        public IReadOnlyList<RecognizedPhoneme> Phonemes { get; init; } = new List<RecognizedPhoneme>();

        /// <summary>Cách đọc (hiragana) ghép từ các âm vị; rỗng nếu không nghe thấy tiếng nói.</summary>
        public string Kana { get; init; } = string.Empty;

        public int FrameMs { get; init; }
        public double ElapsedMs { get; init; }

        /// <summary>
        /// Log-xác suất (log-softmax) của từng nhãn ở từng khung, để chấm theo câu mẫu (PronunciationAligner).
        /// Rỗng nếu bộ nhận dạng không cung cấp.
        /// </summary>
        public float[][] LogProbabilities { get; init; } = System.Array.Empty<float[]>();

        /// <summary>Tên nhãn theo chỉ số cột của LogProbabilities.</summary>
        public IReadOnlyList<string> Labels { get; init; } = System.Array.Empty<string>();
    }
}
