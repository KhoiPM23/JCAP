using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Implementations;

namespace JCAP.Services.Interfaces
{
    /// <summary>
    /// Kết quả so khớp giữa câu mẫu và transcript. Là Content Match theo cách ĐỌC (mora),
    /// KHÔNG phải điểm phát âm âm học: nó chỉ đúng khi transcript phản ánh trung thực những gì người học nói.
    /// </summary>
    /// <summary>Một TỪ của câu mẫu: chữ viết gốc và đoạn mora [Start, End) mà nó chiếm.</summary>
    public sealed record TargetWordSpan(string Text, int Start, int End);

    public sealed class JapaneseTextComparison
    {
        /// <summary>Các từ của câu mẫu theo thứ tự (dùng để nêu vị trí khoảng dừng theo từ). Rỗng nếu không áp dụng.</summary>
        public IReadOnlyList<TargetWordSpan> TargetWords { get; init; } = new List<TargetWordSpan>();

        public int ContentMatchScore { get; init; }
        public IReadOnlyList<ShadowingDiffTokenDto> Tokens { get; init; } = new List<ShadowingDiffTokenDto>();
        public string Feedback { get; init; } = string.Empty;

        /// <summary>Nguồn cách đọc đã dùng cho CẢ HAI phía (voicevox). Rỗng nếu không áp dụng.</summary>
        public string ReadingSource { get; init; } = string.Empty;

        /// <summary>
        /// true: KHÔNG chuyển được câu mẫu/transcript thành cách đọc đáng tin cậy (nguồn cách đọc không dùng được
        /// hoặc có ký tự không đọc được). Khi đó không có điểm: ContentMatchScore vô nghĩa, người gọi phải báo "chưa chấm được".
        /// </summary>
        public bool ReadingUnavailable { get; init; }

        public static JapaneseTextComparison Unavailable() => new() { ReadingUnavailable = true };

        /// <summary>Cách đọc của câu mẫu / transcript dưới dạng hiragana (để hiển thị và chẩn đoán).</summary>
        public string TargetReading { get; init; } = string.Empty;
        public string RecognizedReading { get; init; } = string.Empty;

        /// <summary>
        /// Câu người học đã nói để HIỂN THỊ: từ đọc đúng dùng chữ của câu mẫu (có kanji), phần đọc sai/nói thừa giữ kana như đã nghe.
        /// </summary>
        public string RecognizedDisplay { get; init; } = string.Empty;
    }

    /// <summary>
    /// Điểm thay thế cho thuật toán so khớp. Mọi nơi cần Content Match phải đi qua interface này.
    /// </summary>
    public interface IJapaneseTextComparer
    {
        /// <summary>Định danh phương pháp, được ghi vào kết quả để phân biệt các phiên bản.</summary>
        string MethodId { get; }

        Task<JapaneseTextComparison> CompareAsync(string target, string recognized, CancellationToken cancellationToken = default);

        /// <summary>
        /// So với transcript ĐÃ LÀ cách đọc (kana từ bộ nhận dạng âm vị): chỉ câu mẫu cần nguồn cách đọc,
        /// phía người học dùng thẳng chuỗi kana (không đọc lại, nên không có lỗi đọc chữ Hán ở phía này).
        /// </summary>
        Task<JapaneseTextComparison> CompareWithReadingAsync(string target, string recognizedKana, CancellationToken cancellationToken = default);

        /// <summary>Cách đọc (mora, ranh giới từ) của câu mẫu; null nếu không có nguồn cách đọc đáng tin cậy.</summary>
        Task<KanaReading?> ReadTargetAsync(string target, CancellationToken cancellationToken = default);

        /// <summary>
        /// So câu mẫu với chuỗi mora "đã nghe" do chấm theo câu mẫu tạo ra (câu mẫu + các lỗi đã phát hiện).
        /// Cùng cách tách từ, tính điểm, hiển thị và nhận xét như các phương thức trên.
        /// </summary>
        JapaneseTextComparison CompareHeard(string target, KanaReading targetReading, IReadOnlyList<Mora> heard);
    }
}
