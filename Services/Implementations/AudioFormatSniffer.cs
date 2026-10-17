using System;
using System.Collections.Generic;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Kiểm tra MIME khai báo có khớp nội dung thực của file audio hay không (đọc vài byte đầu).
    /// Chỉ chặn trường hợp rõ ràng sai/không hỗ trợ; không đảm bảo file giải mã được.
    /// </summary>
    public static class AudioFormatSniffer
    {
        private static readonly Dictionary<string, string> MimeToFamily = new(StringComparer.OrdinalIgnoreCase)
        {
            ["audio/webm"] = "webm",
            ["video/webm"] = "webm",
            ["audio/ogg"] = "ogg",
            ["audio/mp4"] = "mp4",
            ["audio/x-m4a"] = "mp4",
            ["audio/m4a"] = "mp4",
            ["audio/wav"] = "wav",
            ["audio/x-wav"] = "wav",
            ["audio/wave"] = "wav",
            ["audio/mpeg"] = "mp3",
            ["audio/mp3"] = "mp3",
            ["audio/flac"] = "flac",
            ["audio/x-flac"] = "flac",
            ["audio/aac"] = "aac",
        };

        /// <summary>"audio/webm;codecs=opus" → "audio/webm".</summary>
        public static string NormalizeMime(string? mime)
        {
            if (string.IsNullOrWhiteSpace(mime)) return string.Empty;
            var semicolon = mime.IndexOf(';');
            var baseType = semicolon >= 0 ? mime[..semicolon] : mime;
            return baseType.Trim().ToLowerInvariant();
        }

        public static bool IsSupportedMime(string normalizedMime) => MimeToFamily.ContainsKey(normalizedMime);

        public static string FamilyOfMime(string normalizedMime) =>
            MimeToFamily.TryGetValue(normalizedMime, out var f) ? f : "unknown";

        /// <summary>Nhận diện họ định dạng từ byte đầu. Trả về "unknown" nếu không nhận ra.</summary>
        public static string DetectFamily(ReadOnlySpan<byte> d)
        {
            if (d.Length >= 4 && d[0] == 0x1A && d[1] == 0x45 && d[2] == 0xDF && d[3] == 0xA3) return "webm";
            if (d.Length >= 4 && d[0] == 'O' && d[1] == 'g' && d[2] == 'g' && d[3] == 'S') return "ogg";
            if (d.Length >= 12 && d[0] == 'R' && d[1] == 'I' && d[2] == 'F' && d[3] == 'F'
                && d[8] == 'W' && d[9] == 'A' && d[10] == 'V' && d[11] == 'E') return "wav";
            if (d.Length >= 8 && d[4] == 'f' && d[5] == 't' && d[6] == 'y' && d[7] == 'p') return "mp4";
            if (d.Length >= 4 && d[0] == 'f' && d[1] == 'L' && d[2] == 'a' && d[3] == 'C') return "flac";
            if (d.Length >= 3 && d[0] == 'I' && d[1] == 'D' && d[2] == '3') return "mp3";
            if (d.Length >= 2 && d[0] == 0xFF && (d[1] & 0xE0) == 0xE0)
            {
                var layer = (d[1] >> 1) & 0x03;
                return layer == 0 ? "aac" : "mp3";
            }
            return "unknown";
        }

        public static bool MimeMatchesContent(string normalizedMime, ReadOnlySpan<byte> data) =>
            IsSupportedMime(normalizedMime) && FamilyOfMime(normalizedMime) == DetectFamily(data);
    }
}
