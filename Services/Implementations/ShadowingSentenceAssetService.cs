using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Shadowing;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    /// <summary>Nguồn tạo dữ liệu câu mẫu (VOICEVOX). Tách ra để kiểm thử không cần engine.</summary>
    public interface IShadowingAssetSource
    {
        Task<KanaReading?> ReadAsync(string text, CancellationToken cancellationToken);
        Task<byte[]> SynthesizeAsync(string text, int speakerId, CancellationToken cancellationToken);
        Task<IReadOnlyList<MoraTiming>?> GetTimelineAsync(string text, int speakerId, CancellationToken cancellationToken);
    }

    public sealed class VoiceVoxAssetSource : IShadowingAssetSource
    {
        private readonly VoiceVoxKanaReader _reader;
        private readonly IVoiceVoxService _voiceVox;

        public VoiceVoxAssetSource(VoiceVoxKanaReader reader, IVoiceVoxService voiceVox)
        {
            _reader = reader;
            _voiceVox = voiceVox;
        }

        public Task<KanaReading?> ReadAsync(string text, CancellationToken cancellationToken) => _reader.ReadForGenerationAsync(text, cancellationToken);
        public Task<byte[]> SynthesizeAsync(string text, int speakerId, CancellationToken cancellationToken) => _voiceVox.SynthesizeAsync(text, speakerId, cancellationToken);
        public Task<IReadOnlyList<MoraTiming>?> GetTimelineAsync(string text, int speakerId, CancellationToken cancellationToken) =>
            _voiceVox.GetMoraTimelineAsync(text, speakerId, cancellationToken);
    }

    /// <summary>
    /// Dữ liệu tham chiếu tính sẵn của câu Shadowing. Xem Models/ShadowingSentenceAsset.cs và docs/shadowing-v2.
    /// Giọng mẫu được lưu thành tệp riêng dưới wwwroot/audio-cache/shadowing-assets (không phụ thuộc cách đặt tên cache của VoiceVoxService).
    /// </summary>
    public sealed class ShadowingSentenceAssetService : IShadowingSentenceAssetService
    {
        public const string Provider = "voicevox";
        public const string Version = "voicevox/asset-v1";
        private const string AudioFolder = "audio-cache/shadowing-assets";

        private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

        private readonly AppDbContext _context;
        private readonly IShadowingAssetSource _source;
        private readonly string _webRoot;
        private readonly ILogger<ShadowingSentenceAssetService> _logger;

        public ShadowingSentenceAssetService(
            AppDbContext context, IShadowingAssetSource source, IWebHostEnvironment environment, ILogger<ShadowingSentenceAssetService> logger)
            : this(context, source, environment.WebRootPath ?? Path.Combine(environment.ContentRootPath, "wwwroot"), logger)
        {
        }

        public ShadowingSentenceAssetService(AppDbContext context, IShadowingAssetSource source, string webRoot, ILogger<ShadowingSentenceAssetService> logger)
        {
            _context = context;
            _source = source;
            _webRoot = webRoot;
            _logger = logger;
        }

        // ---- Đọc (lúc chấm bài) ----

        public async Task<KanaReading?> FindReadingAsync(string sentenceText, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(sentenceText)) return null;
            var row = await _context.ShadowingSentenceAssets.AsNoTracking()
                .Where(a => a.SourceText == sentenceText && a.IsActive && a.VoiceProvider == Provider && a.AudioVersion == Version)
                .OrderBy(a => a.VoiceId == null ? 0 : 1).ThenByDescending(a => a.GeneratedAt)
                .FirstOrDefaultAsync(cancellationToken);
            return row == null ? null : ToReading(row);
        }

        public async Task<ReferenceVoice?> FindReferenceAsync(string sentenceText, int speakerId, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(sentenceText)) return null;
            var row = await _context.ShadowingSentenceAssets.AsNoTracking()
                .Where(a => a.SourceText == sentenceText && a.IsActive && a.VoiceProvider == Provider && a.VoiceId == speakerId
                    && a.AudioVersion == Version && a.SampleAudioUrl != null)
                .OrderByDescending(a => a.GeneratedAt)
                .FirstOrDefaultAsync(cancellationToken);
            if (row == null) return null;

            var path = PhysicalPath(row.SampleAudioUrl!);
            if (path == null || !File.Exists(path)) return null;
            var wav = await File.ReadAllBytesAsync(path, cancellationToken);
            var timeline = row.MoraTimelineJson == null ? null : JsonSerializer.Deserialize<List<MoraTiming>>(row.MoraTimelineJson, Json);
            return new ReferenceVoice { Wav = wav, SpeakerId = speakerId, Timeline = timeline, Source = "voicevox-stored" };
        }

        public async Task<Dictionary<int, List<FuriganaSegmentDto>>> FindFuriganaAsync(IReadOnlyCollection<int> sentenceIds, CancellationToken cancellationToken = default)
        {
            var ids = sentenceIds.Distinct().ToList();
            var rows = await _context.ShadowingSentenceAssets.AsNoTracking()
                .Where(a => ids.Contains(a.ShadowingSentenceId) && a.VoiceId == null && a.IsActive && a.AudioVersion == Version
                    && a.FuriganaJson != null && a.SourceText == a.ShadowingSentence!.JapaneseText)
                .ToListAsync(cancellationToken);
            var result = new Dictionary<int, List<FuriganaSegmentDto>>();
            foreach (var r in rows)
            {
                // Gióng lại từ cách đọc đã lưu (rẻ, không cần VOICEVOX): bản furigana tạo trước khi bộ gióng dùng ranh giới cụm
                // có thể chia sai mora giữa hai cụm chữ Hán cách nhau bởi dấu câu. Không gióng được thì dùng bản đã lưu.
                var reading = ToReading(r);
                var segments = BuildFurigana(r.SourceText, reading.Moras, reading.WordStarts)
                    ?? JsonSerializer.Deserialize<List<FuriganaSegmentDto>>(r.FuriganaJson!, Json);
                if (segments != null) result[r.ShadowingSentenceId] = segments;
            }
            return result;
        }

        // ---- Tạo (soạn bài / tác vụ nền) ----

        public async Task<ShadowingAssetGenerationReportDto> GenerateForDialogueAsync(
            int dialogueId, IReadOnlyCollection<int> speakerIds, bool force, CancellationToken cancellationToken = default)
        {
            var sentences = await _context.ShadowingSentences
                .Where(s => s.ShadowingDialogueId == dialogueId)
                .OrderBy(s => s.OrderIndex)
                .ToListAsync(cancellationToken);
            return await GenerateAsync(sentences, speakerIds, force, cancellationToken);
        }

        public async Task<ShadowingAssetGenerationReportDto> GenerateMissingAsync(
            IReadOnlyCollection<int> speakerIds, int maxSentences, CancellationToken cancellationToken = default)
        {
            var speakers = speakerIds.Distinct().ToList();
            var needed = speakers.Count + 1; // một dòng cách đọc + một dòng mỗi giọng
            // Câu đang hoạt động chưa đủ dữ liệu mới (đúng chữ hiện tại, đúng phiên bản)
            var candidates = await _context.ShadowingSentences
                .Where(s => s.ShadowingDialogue.IsActive)
                .Where(s => _context.ShadowingSentenceAssets.Count(a => a.ShadowingSentenceId == s.Id && a.IsActive
                    && a.AudioVersion == Version && a.SourceText == s.JapaneseText
                    && (a.VoiceId == null || speakers.Contains(a.VoiceId.Value))) < needed)
                .OrderBy(s => s.ShadowingDialogueId).ThenBy(s => s.OrderIndex)
                .Take(Math.Max(1, maxSentences))
                .ToListAsync(cancellationToken);
            return await GenerateAsync(candidates, speakers, force: false, cancellationToken);
        }

        public async Task<ShadowingAssetStatusDto> GetStatusAsync(int dialogueId, IReadOnlyCollection<int> speakerIds, CancellationToken cancellationToken = default)
        {
            var sentences = await _context.ShadowingSentences.AsNoTracking()
                .Where(s => s.ShadowingDialogueId == dialogueId)
                .OrderBy(s => s.OrderIndex)
                .ToListAsync(cancellationToken);
            var ids = sentences.Select(s => s.Id).ToList();
            var rows = await _context.ShadowingSentenceAssets.AsNoTracking()
                .Where(a => ids.Contains(a.ShadowingSentenceId) && a.IsActive && a.VoiceProvider == Provider)
                .ToListAsync(cancellationToken);

            var status = new ShadowingAssetStatusDto { DialogueId = dialogueId, SentenceCount = sentences.Count };
            foreach (var s in sentences)
            {
                var mine = rows.Where(r => r.ShadowingSentenceId == s.Id).ToList();
                var fresh = mine.Where(r => r.SourceText == s.JapaneseText && r.AudioVersion == Version).ToList();
                var reading = fresh.FirstOrDefault(r => r.VoiceId == null);
                var item = new ShadowingSentenceAssetStatusDto
                {
                    SentenceId = s.Id,
                    OrderIndex = s.OrderIndex,
                    JapaneseText = s.JapaneseText,
                    HasReading = reading != null,
                    KanaReading = reading?.KanaReading,
                    VoicesWithAudio = fresh.Where(r => r.VoiceId.HasValue && r.SampleAudioUrl != null).Select(r => r.VoiceId!.Value).OrderBy(v => v).ToList(),
                    IsStale = mine.Count > fresh.Count,
                };
                status.Sentences.Add(item);
            }
            status.ReadyForScoring = status.Sentences.Count(x => x.HasReading);
            return status;
        }

        private async Task<ShadowingAssetGenerationReportDto> GenerateAsync(
            IReadOnlyList<ShadowingSentence> sentences, IReadOnlyCollection<int> speakerIds, bool force, CancellationToken cancellationToken)
        {
            var report = new ShadowingAssetGenerationReportDto();
            var speakers = speakerIds.Distinct().ToList();
            foreach (var sentence in sentences)
            {
                cancellationToken.ThrowIfCancellationRequested();
                report.SentencesChecked++;
                try
                {
                    var changed = await GenerateSentenceAsync(sentence, speakers, force, report, cancellationToken);
                    if (!changed) report.UpToDate++;
                }
                catch (Exception ex) when (ex is System.Net.Http.HttpRequestException || ex is TaskCanceledException && !cancellationToken.IsCancellationRequested)
                {
                    // Engine tắt/không phản hồi: dừng cả lượt, lần sau chạy tiếp (không đánh dấu gì là lỗi vĩnh viễn).
                    report.EngineUnavailable = true;
                    report.Errors.Add($"Câu {sentence.Id}: VOICEVOX không dùng được ({ex.GetType().Name}).");
                    _logger.LogWarning("Dừng tạo dữ liệu câu mẫu: VOICEVOX không dùng được ({Error}).", ex.Message);
                    break;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    report.Failed++;
                    report.Errors.Add($"Câu {sentence.Id}: {ex.Message}");
                    _logger.LogWarning(ex, "Không tạo được dữ liệu cho câu {SentenceId}.", sentence.Id);
                }
            }
            return report;
        }

        /// <summary>Tạo/cập nhật dòng cách đọc và dòng giọng mẫu của từng giọng. Trả về true nếu có thay đổi.</summary>
        private async Task<bool> GenerateSentenceAsync(
            ShadowingSentence sentence, IReadOnlyList<int> speakers, bool force, ShadowingAssetGenerationReportDto report, CancellationToken cancellationToken)
        {
            var text = sentence.JapaneseText ?? string.Empty;
            if (text.Length == 0 || text.Length > 400) return false;

            var rows = await _context.ShadowingSentenceAssets
                .Where(a => a.ShadowingSentenceId == sentence.Id && a.VoiceProvider == Provider)
                .ToListAsync(cancellationToken);
            bool Fresh(ShadowingSentenceAsset? a) => !force && a != null && a.IsActive && a.SourceText == text && a.AudioVersion == Version;

            var readingRow = rows.FirstOrDefault(a => a.VoiceId == null);
            var missingVoices = speakers.Where(v => !Fresh(rows.FirstOrDefault(a => a.VoiceId == v)) ||
                rows.First(a => a.VoiceId == v).SampleAudioUrl == null).ToList();
            if (Fresh(readingRow) && missingVoices.Count == 0) return false;

            var reading = await _source.ReadAsync(text, cancellationToken)
                ?? throw new InvalidOperationException("VOICEVOX không trả cách đọc cho câu này.");
            if (reading.UnresolvedCount > 0 || reading.Moras.Count == 0)
                throw new InvalidOperationException("Câu có ký tự không đọc được.");

            var normalized = VoiceVoxKanaReader.ForEngine(text);
            var moraJson = JsonSerializer.Serialize(reading.Moras.Select(m => new MoraJson(m.Canon, m.Display)), Json);
            var startsJson = JsonSerializer.Serialize(reading.WordStarts ?? new List<int>(), Json);
            var furigana = BuildFurigana(text, reading.Moras, reading.WordStarts);
            var furiganaJson = furigana == null ? null : JsonSerializer.Serialize(furigana, Json);

            void Fill(ShadowingSentenceAsset a)
            {
                a.ShadowingSentenceId = sentence.Id;
                a.SourceText = text;
                a.NormalizedText = normalized.Length > 400 ? normalized[..400] : normalized;
                a.KanaReading = Truncate(JapaneseMora.Join(reading.Moras), 1000);
                a.MoraSequence = moraJson;
                a.WordStartsJson = startsJson;
                a.FuriganaJson = furiganaJson;
                a.VoiceProvider = Provider;
                a.AudioVersion = Version;
                a.GeneratedAt = DateTime.UtcNow;
                a.IsActive = true;
            }

            if (!Fresh(readingRow))
            {
                if (readingRow == null)
                {
                    readingRow = new ShadowingSentenceAsset();
                    _context.ShadowingSentenceAssets.Add(readingRow);
                }
                Fill(readingRow);
                readingRow.VoiceId = null;
                readingRow.SampleAudioUrl = null;
                readingRow.AudioDurationMs = null;
                readingRow.MoraTimelineJson = null;
                report.ReadingsCreated++;
            }

            foreach (var speaker in missingVoices)
            {
                var wav = await _source.SynthesizeAsync(text, speaker, cancellationToken);
                if (wav.Length == 0) throw new InvalidOperationException($"VOICEVOX trả audio rỗng (giọng {speaker}).");
                var timeline = await _source.GetTimelineAsync(text, speaker, cancellationToken);
                var url = await SaveAudioAsync(sentence.Id, speaker, text, wav, cancellationToken);

                var row = rows.FirstOrDefault(a => a.VoiceId == speaker);
                if (row == null)
                {
                    row = new ShadowingSentenceAsset();
                    _context.ShadowingSentenceAssets.Add(row);
                }
                Fill(row);
                row.VoiceId = speaker;
                row.SampleAudioUrl = url;
                row.AudioDurationMs = DurationMs(wav);
                row.MoraTimelineJson = timeline == null ? null : JsonSerializer.Serialize(timeline, Json);
                report.AudiosCreated++;
            }

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        private async Task<string> SaveAudioAsync(int sentenceId, int speaker, string text, byte[] wav, CancellationToken cancellationToken)
        {
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{speaker}:{text}")))[..16].ToLowerInvariant();
            var relative = $"{AudioFolder}/{speaker}/{sentenceId}-{hash}.wav";
            var path = Path.Combine(_webRoot, relative.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await File.WriteAllBytesAsync(path, wav, cancellationToken);
            return "/" + relative;
        }

        /// <summary>Đường dẫn vật lý của URL đã lưu; null nếu URL không nằm trong thư mục dữ liệu câu mẫu (chống đọc tệp tùy ý).</summary>
        private string? PhysicalPath(string url)
        {
            var relative = url.TrimStart('/');
            if (!relative.StartsWith(AudioFolder + "/", StringComparison.Ordinal) || relative.Contains("..")) return null;
            return Path.Combine(_webRoot, relative.Replace('/', Path.DirectorySeparatorChar));
        }

        private static int? DurationMs(byte[] wav)
        {
            try
            {
                var samples = WavPcmReader.ReadMonoAnyRate(wav, out var rate);
                return rate > 0 ? (int)((long)samples.Length * 1000 / rate) : null;
            }
            catch (WavFormatException)
            {
                return null;
            }
        }

        /// <summary>
        /// Furigana: gióng chữ viết với chuỗi mora (JapaneseSurfaceAligner); mỗi cụm chữ Hán nhận cách đọc của khoảng mora nó chiếm.
        /// Không gióng được thì null (không đoán cách đọc).
        /// </summary>
        internal static List<FuriganaSegmentDto>? BuildFurigana(string text, IReadOnlyList<Mora> moras, IReadOnlyList<int>? phraseStarts = null)
        {
            var items = JapaneseSurfaceAligner.Segment(text);
            var ranges = JapaneseSurfaceAligner.Align(items, moras, phraseStarts);
            if (ranges == null) return null;

            var result = new List<FuriganaSegmentDto>();
            for (var i = 0; i < items.Count; i++)
            {
                var item = items[i];
                var hasHan = item.IsWildcard && item.Text.Any(IsHan);
                string? reading = null;
                if (hasHan)
                {
                    var (s, e) = ranges[i];
                    reading = JapaneseMora.Join(moras.Skip(s).Take(e - s));
                    if (reading.Length == 0) reading = null;
                }
                // Gộp các đoạn không có chữ Hán liền nhau cho gọn
                if (reading == null && result.Count > 0 && result[^1].Reading == null) result[^1].Text += item.Text;
                else result.Add(new FuriganaSegmentDto { Text = item.Text, Reading = reading });
            }
            return result;
        }

        private static bool IsHan(char c) =>
            (c >= '㐀' && c <= '䶿') || (c >= '一' && c <= '鿿') || (c >= '豈' && c <= '﫿') || c == '々' || c == '〆';

        private static KanaReading ToReading(ShadowingSentenceAsset row)
        {
            var moras = (JsonSerializer.Deserialize<List<MoraJson>>(row.MoraSequence, Json) ?? new())
                .Select(m => new Mora(m.C, m.D)).ToList();
            var starts = JsonSerializer.Deserialize<List<int>>(row.WordStartsJson, Json) ?? new();
            return new KanaReading
            {
                Moras = moras,
                UnresolvedCount = moras.Count(m => m.IsUnresolved),
                WordStarts = starts,
                Source = VoiceVoxKanaReader.Id,
            };
        }

        private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];

        private sealed record MoraJson(string C, string D);
    }
}
