using System;
using System.Linq;

namespace JCAP.Services.Implementations
{
    /// <summary>Kết quả kiểm tra âm thanh phía backend.</summary>
    /// <param name="QualityStatus">good | acceptable khi hợp lệ; needs_retry khi không hợp lệ.</param>
    /// <param name="Samples16k">Mẫu 16 kHz mono đã đọc (chỉ khi hợp lệ).</param>
    public sealed record ShadowingAudioValidation(
        bool IsValid,
        string? ErrorCode,
        string? Message,
        string QualityStatus,
        float[]? Samples16k,
        int DurationMs)
    {
        public static ShadowingAudioValidation Fail(string code, string message, int durationMs = 0) =>
            new(false, code, message, "needs_retry", null, durationMs);
    }

    /// <summary>
    /// Kiểm tra âm thanh do BACKEND tự làm trước khi gọi mô hình; không dựa vào kết quả kiểm tra của trình duyệt.
    /// Thứ tự: định dạng thật (byte đầu file, không tin Content-Type) → kích thước → thời lượng → có tiếng nói đủ to → vỡ tiếng.
    ///
    /// Ngưỡng tín hiệu dùng lại VAD của FluencyAnalyzer (đỉnh ≥ −50 dBFS, chênh tiếng nói/nền ≥ 12 dB). Đây là HEURISTIC,
    /// chưa hiệu chỉnh trên micro thật của người học (xem docs/shadowing-v2/MILESTONE-1-PLAN.md mục 6b).
    /// </summary>
    public static class ShadowingAudioValidator
    {
        public const int SampleRate = WavPcmReader.ExpectedSampleRate;
        public const int MinDurationMs = 400;
        public const int MaxDurationMs = 30_000;
        public const int MinSpeechSpanMs = 300;
        public const int MaxAnalysisWavBytes = 2 * 1024 * 1024; // ~60 s WAV 16 kHz mono 16-bit

        private const int FrameLen = SampleRate / 50; // 20 ms
        private const float ClipPeak = 0.99f;
        private const double ClipBlockRatio = 0.3;    // > 30% khung bị vỡ tiếng: thu lại (giống cổng phía trình duyệt)
        private const int ClipWarnFrames = 15;
        private const double GoodVoiceDb = -32;       // giọng nhỏ hơn mức này vẫn chấm nhưng chỉ "acceptable"

        /// <param name="analysisWav">WAV PCM 16-bit mono 16 kHz do client tạo (nguồn chấm).</param>
        /// <param name="rawAudio">Bản ghi gốc (webm/ogg/mp4/wav), tùy chọn; chỉ kiểm tra định dạng.</param>
        public static ShadowingAudioValidation Validate(byte[]? analysisWav, byte[]? rawAudio)
        {
            if (rawAudio is { Length: > 0 } && DetectContainer(rawAudio) == null)
                return ShadowingAudioValidation.Fail("INVALID_AUDIO_FORMAT", "Bản ghi không phải định dạng âm thanh được hỗ trợ.");

            if (analysisWav == null || analysisWav.Length == 0)
            {
                return rawAudio is { Length: > 0 }
                    ? ShadowingAudioValidation.Fail("ANALYSIS_AUDIO_MISSING",
                        "Thiếu bản ghi phân tích (WAV) để chấm. Hãy cập nhật trang (tải lại) rồi thu lại.")
                    : ShadowingAudioValidation.Fail("EMPTY_AUDIO", "Không tìm thấy dữ liệu âm thanh.");
            }

            if (analysisWav.Length > MaxAnalysisWavBytes)
                return ShadowingAudioValidation.Fail("AUDIO_TOO_LARGE", "Bản ghi quá dài. Hãy thu từng câu, tối đa 30 giây.");

            if (DetectContainer(analysisWav) != "wav")
                return ShadowingAudioValidation.Fail("INVALID_AUDIO_FORMAT", "Bản ghi phân tích không phải WAV.");

            float[] samples;
            try
            {
                samples = WavPcmReader.ReadMono16k(analysisWav);
            }
            catch (WavFormatException)
            {
                return ShadowingAudioValidation.Fail("INVALID_AUDIO_FORMAT", "Bản ghi phân tích không đúng định dạng PCM 16-bit mono 16 kHz.");
            }

            var durationMs = (int)((long)samples.Length * 1000 / SampleRate);
            if (durationMs < MinDurationMs)
                return ShadowingAudioValidation.Fail("AUDIO_TOO_SHORT", "Bản ghi quá ngắn. Hãy nói trọn câu rồi mới dừng.", durationMs);
            if (durationMs > MaxDurationMs)
                return ShadowingAudioValidation.Fail("AUDIO_TOO_LONG", "Bản ghi quá dài. Hãy thu từng câu, tối đa 30 giây.", durationMs);

            var segments = FluencyAnalyzer.DetectSegments(samples, out var failure);
            if (segments == null || segments.Count == 0)
            {
                return failure switch
                {
                    "LOW_LEVEL" => ShadowingAudioValidation.Fail("AUDIO_TOO_QUIET",
                        "Âm lượng quá nhỏ. Hãy nói gần micro hơn hoặc kiểm tra micro đã chọn.", durationMs),
                    "NOISE_ONLY" => ShadowingAudioValidation.Fail("AUDIO_NOISE_ONLY",
                        "Chỉ nghe thấy tiếng ồn, không rõ giọng nói. Hãy thu lại ở nơi yên tĩnh hơn.", durationMs),
                    _ => ShadowingAudioValidation.Fail("AUDIO_SILENT", "Không nghe thấy âm thanh nào. Hãy kiểm tra micro rồi thu lại.", durationMs),
                };
            }
            if (segments[^1].end - segments[0].start < MinSpeechSpanMs)
                return ShadowingAudioValidation.Fail("AUDIO_TOO_SHORT", "Đoạn nói quá ngắn. Hãy nói trọn câu.", durationMs);

            var frames = samples.Length / FrameLen;
            var clipped = 0;
            for (var f = 0; f < frames; f++)
            {
                var peak = 0f;
                for (var i = f * FrameLen; i < (f + 1) * FrameLen; i++) peak = Math.Max(peak, Math.Abs(samples[i]));
                if (peak >= ClipPeak) clipped++;
            }
            if (frames > 0 && clipped > frames * ClipBlockRatio)
                return ShadowingAudioValidation.Fail("AUDIO_CLIPPED", "Âm thanh bị vỡ tiếng (nói quá sát micro). Hãy lùi xa micro một chút.", durationMs);

            var voiceDb = SpeechLevelDb(samples, segments);
            var quality = voiceDb >= GoodVoiceDb && clipped <= ClipWarnFrames ? "good" : "acceptable";
            return new ShadowingAudioValidation(true, null, null, quality, samples, durationMs);
        }

        /// <summary>Loại tệp theo byte đầu (không tin Content-Type): wav | webm | ogg | mp4 | null.</summary>
        internal static string? DetectContainer(byte[] data)
        {
            if (data.Length >= 12 && Ascii(data, 0, "RIFF") && Ascii(data, 8, "WAVE")) return "wav";
            if (data.Length >= 4 && data[0] == 0x1A && data[1] == 0x45 && data[2] == 0xDF && data[3] == 0xA3) return "webm";
            if (data.Length >= 4 && Ascii(data, 0, "OggS")) return "ogg";
            if (data.Length >= 8 && Ascii(data, 4, "ftyp")) return "mp4";
            return null;
        }

        private static bool Ascii(byte[] data, int offset, string text) =>
            text.Select((c, i) => data[offset + i] == (byte)c).All(x => x);

        private static double SpeechLevelDb(float[] samples, System.Collections.Generic.List<(int start, int end)> segments)
        {
            double sum = 0;
            long count = 0;
            foreach (var (s, e) in segments)
            {
                var from = Math.Clamp(s * SampleRate / 1000, 0, samples.Length);
                var to = Math.Clamp(e * SampleRate / 1000, from, samples.Length);
                for (var i = from; i < to; i++) { sum += samples[i] * (double)samples[i]; count++; }
            }
            return count == 0 ? -120 : 10 * Math.Log10(Math.Max(sum / count, 1e-12));
        }
    }
}
