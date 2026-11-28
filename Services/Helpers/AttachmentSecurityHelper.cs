using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace JCAP.Services.Helpers
{
    public static class AttachmentSecurityHelper
    {
        public const int MaxAttachmentsPerItem = 5;
        public const int MaxPostContentLength = 10000;
        public const int MaxCommentContentLength = 5000;
        public const int MaxFeedbackContentLength = 10000;

        /// <summary>
        /// Chỉ cho phép đường dẫn tệp đính kèm từ Cloudinary của dự án hoặc thư mục /uploads/issues/ cục bộ.
        /// Chặn URL ngoài (ảnh theo dõi lộ IP, link lừa đảo, blob:, data:, javascript:).
        /// </summary>
        public static bool IsAllowedAttachmentUrl(string? url, string? configuredCloudName)
        {
            if (string.IsNullOrWhiteSpace(url))
            {
                return false;
            }

            var trimmed = url.Trim();

            // 1. Đường dẫn cục bộ do backend sinh ra khi chạy Development fallback
            if (trimmed.StartsWith("/uploads/issues/", StringComparison.OrdinalIgnoreCase))
            {
                if (trimmed.Contains("..", StringComparison.Ordinal)
                    || trimmed.Contains('\\', StringComparison.Ordinal)
                    || trimmed.Contains('?', StringComparison.Ordinal)
                    || trimmed.Contains('#', StringComparison.Ordinal))
                {
                    return false;
                }
                return trimmed.Length > "/uploads/issues/".Length;
            }

            // 2. Đường dẫn HTTPS từ Cloudinary của dự án
            if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri))
            {
                return false;
            }

            if (!string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            if (!string.Equals(uri.Host, "res.cloudinary.com", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            if (!string.IsNullOrWhiteSpace(configuredCloudName))
            {
                var expectedPrefix = $"/{configuredCloudName.Trim()}/";
                if (!uri.AbsolutePath.StartsWith(expectedPrefix, StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>
        /// Kiểm tra magic bytes / nội dung thực tế khớp với phần mở rộng tệp để tránh giả mạo định dạng.
        /// </summary>
        public static async Task<bool> HasValidFileSignatureAsync(IFormFile file, string ext)
        {
            if (file == null || file.Length == 0)
            {
                return false;
            }

            var header = new byte[Math.Min(512, (int)Math.Min(file.Length, 512))];
            using var stream = file.OpenReadStream();
            var bytesRead = await stream.ReadAsync(header.AsMemory(0, header.Length));
            if (bytesRead == 0)
            {
                return false;
            }

            return ext switch
            {
                ".png" => bytesRead >= 8
                    && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47
                    && header[4] == 0x0D && header[5] == 0x0A && header[6] == 0x1A && header[7] == 0x0A,

                ".jpg" or ".jpeg" => bytesRead >= 3
                    && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,

                ".gif" => bytesRead >= 4
                    && header[0] == 0x47 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x38,

                ".webp" => bytesRead >= 12
                    && header[0] == 0x52 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x46
                    && header[8] == 0x57 && header[9] == 0x45 && header[10] == 0x42 && header[11] == 0x50,

                ".pdf" => bytesRead >= 5
                    && header[0] == 0x25 && header[1] == 0x50 && header[2] == 0x44 && header[3] == 0x46 && header[4] == 0x2D,

                ".zip" or ".docx" => bytesRead >= 4
                    && header[0] == 0x50 && header[1] == 0x4B
                    && ((header[2] == 0x03 && header[3] == 0x04)
                        || (header[2] == 0x05 && header[3] == 0x06)
                        || (header[2] == 0x07 && header[3] == 0x08)),

                ".doc" => bytesRead >= 8
                    && header[0] == 0xD0 && header[1] == 0xCF && header[2] == 0x11 && header[3] == 0xE0
                    && header[4] == 0xA1 && header[5] == 0xB1 && header[6] == 0x1A && header[7] == 0xE1,

                ".txt" or ".log" or ".json" => !ContainsNullByte(header, bytesRead),

                _ => false
            };
        }

        private static bool ContainsNullByte(byte[] buffer, int length)
        {
            for (var i = 0; i < length; i++)
            {
                if (buffer[i] == 0x00)
                {
                    return true;
                }
            }
            return false;
        }
    }
}
