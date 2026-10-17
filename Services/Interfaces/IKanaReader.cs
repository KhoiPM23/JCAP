using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Services.Implementations;

namespace JCAP.Services.Interfaces
{
    /// <summary>Cách đọc (chuỗi mora) của một văn bản tiếng Nhật.</summary>
    public sealed class KanaReading
    {
        public IReadOnlyList<Mora> Moras { get; init; } = new List<Mora>();

        /// <summary>Số mora không chuyển được thành kana (vd. ký tự lạ). &gt; 0 nghĩa là cách đọc chưa đáng tin cậy.</summary>
        public int UnresolvedCount { get; init; }

        /// <summary>
        /// Chỉ số mora nơi mỗi TỪ (cụm trọng âm) bắt đầu, tăng dần, phần tử đầu là 0. Null/rỗng = nguồn không cung cấp
        /// ranh giới từ (cả câu được coi là một từ).
        /// </summary>
        public IReadOnlyList<int>? WordStarts { get; init; }

        /// <summary>Định danh nguồn cách đọc (hiện là "voicevox").</summary>
        public string Source { get; init; } = string.Empty;
    }

    /// <summary>
    /// Chuyển văn bản (kanji/kana/katakana) thành chuỗi mora. Trả về null nếu nguồn không dùng được;
    /// khi không còn nguồn nào, comparer báo "chưa chấm được" thay vì đoán cách đọc.
    /// </summary>
    public interface IKanaReader
    {
        string SourceId { get; }
        Task<KanaReading?> TryReadAsync(string text, CancellationToken cancellationToken = default);
    }
}
