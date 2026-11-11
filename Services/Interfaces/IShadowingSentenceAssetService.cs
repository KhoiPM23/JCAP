using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Shadowing;

namespace JCAP.Services.Interfaces
{
    /// <summary>
    /// Dữ liệu tham chiếu tính sẵn của câu Shadowing (ShadowingSentenceAsset): TẠO bằng VOICEVOX khi soạn bài / tác vụ nền,
    /// ĐỌC khi chấm bài để lúc người học đánh giá không cần VOICEVOX đang chạy.
    /// </summary>
    public interface IShadowingSentenceAssetService
    {
        /// <summary>Cách đọc đã lưu của đúng câu này (theo chữ); null nếu chưa tạo hoặc đã cũ.</summary>
        Task<KanaReading?> FindReadingAsync(string sentenceText, CancellationToken cancellationToken = default);

        /// <summary>Giọng mẫu + mốc mora đã lưu cho câu và giọng; null nếu chưa tạo.</summary>
        Task<ReferenceVoice?> FindReferenceAsync(string sentenceText, int speakerId, CancellationToken cancellationToken = default);

        /// <summary>Furigana đã lưu của các câu (theo Id câu); câu chưa có dữ liệu thì không có trong kết quả.</summary>
        Task<Dictionary<int, List<FuriganaSegmentDto>>> FindFuriganaAsync(IReadOnlyCollection<int> sentenceIds, CancellationToken cancellationToken = default);

        /// <summary>Tạo/cập nhật dữ liệu cho mọi câu của một bài (force: tạo lại cả dữ liệu chưa cũ).</summary>
        Task<ShadowingAssetGenerationReportDto> GenerateForDialogueAsync(int dialogueId, IReadOnlyCollection<int> speakerIds, bool force, CancellationToken cancellationToken = default);

        /// <summary>Tạo dữ liệu còn thiếu/đã cũ cho tối đa <paramref name="maxSentences"/> câu đang hoạt động (tác vụ nền).</summary>
        Task<ShadowingAssetGenerationReportDto> GenerateMissingAsync(IReadOnlyCollection<int> speakerIds, int maxSentences, CancellationToken cancellationToken = default);

        /// <summary>Tình trạng dữ liệu của một bài: câu nào đã có cách đọc / giọng mẫu cho giọng nào.</summary>
        Task<ShadowingAssetStatusDto> GetStatusAsync(int dialogueId, IReadOnlyCollection<int> speakerIds, CancellationToken cancellationToken = default);
    }
}
