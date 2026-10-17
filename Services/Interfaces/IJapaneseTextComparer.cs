using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Shadowing;

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
    }

    /// <summary>
    /// Điểm thay thế cho thuật toán so khớp. Mọi nơi cần Content Match phải đi qua interface này.
    /// </summary>
    public interface IJapaneseTextComparer
    {
        /// <summary>Định danh phương pháp, được ghi vào kết quả để phân biệt các phiên bản.</summary>
        string MethodId { get; }

        Task<JapaneseTextComparison> CompareAsync(string target, string recognized, CancellationToken cancellationToken = default);
    }
}
