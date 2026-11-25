using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    public class CloudinaryStorageService : ICloudStorageService
    {
        private static readonly Regex SafeFileNameRegex = new(@"[^a-zA-Z0-9_-]", RegexOptions.Compiled);
        private readonly Cloudinary? _cloudinary;
        private readonly ILogger<CloudinaryStorageService> _logger;
        private readonly IWebHostEnvironment _env;

        public CloudinaryStorageService(
            IConfiguration configuration,
            ILogger<CloudinaryStorageService> logger,
            IWebHostEnvironment env)
        {
            _logger = logger;
            _env = env;
            var cloudName = configuration["Cloudinary:CloudName"];
            var apiKey = configuration["Cloudinary:ApiKey"];
            var apiSecret = configuration["Cloudinary:ApiSecret"];

            if (!string.IsNullOrEmpty(cloudName) && !string.IsNullOrEmpty(apiKey) && !string.IsNullOrEmpty(apiSecret))
            {
                var account = new Account(cloudName, apiKey, apiSecret);
                _cloudinary = new Cloudinary(account);
                _cloudinary.Api.Secure = true;
            }
            else
            {
                _logger.LogWarning("Cloudinary is not fully configured in appsettings.");
            }
        }

        public async Task<string> UploadFileAsync(IFormFile file, string folder = "issues")
        {
            if (file == null || file.Length == 0)
            {
                throw new ArgumentException("File is empty or null.", nameof(file));
            }

            // Chỉ cho phép lưu trữ cục bộ (Local Fallback) trong môi trường Development
            if (_cloudinary == null)
            {
                if (_env.IsDevelopment())
                {
                    _logger.LogWarning("Cloudinary is not configured. Falling back to local storage in Development for folder: {Folder}", folder);
                    return await SaveLocallyAsync(file, folder);
                }

                throw new InvalidOperationException("Dịch vụ lưu trữ đám mây chưa được cấu hình.");
            }

            try
            {
                using var stream = file.OpenReadStream();
                var ext = Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? string.Empty;
                var isImage = file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
                    || ext is ".jpg" or ".jpeg" or ".png" or ".webp" or ".gif";

                if (isImage)
                {
                    var uploadParams = new ImageUploadParams
                    {
                        File = new FileDescription(file.FileName, stream),
                        Folder = folder,
                        UseFilename = true,
                        UniqueFilename = true,
                        Overwrite = false
                    };
                    var uploadResult = await _cloudinary.UploadAsync(uploadParams);
                    if (uploadResult.Error != null)
                    {
                        _logger.LogWarning("Cloudinary image upload error: {Error}.", uploadResult.Error.Message);
                        if (_env.IsDevelopment())
                        {
                            return await SaveLocallyAsync(file, folder);
                        }
                        throw new InvalidOperationException("Không thể tải ảnh lên dịch vụ lưu trữ.");
                    }
                    return uploadResult.SecureUrl?.ToString() ?? uploadResult.Url?.ToString() ?? string.Empty;
                }
                else
                {
                    var rawParams = new RawUploadParams
                    {
                        File = new FileDescription(file.FileName, stream),
                        Folder = folder,
                        UseFilename = true,
                        UniqueFilename = true
                    };
                    var uploadResult = await _cloudinary.UploadAsync(rawParams);
                    if (uploadResult.Error != null)
                    {
                        _logger.LogWarning("Cloudinary raw upload error: {Error}.", uploadResult.Error.Message);
                        if (_env.IsDevelopment())
                        {
                            return await SaveLocallyAsync(file, folder);
                        }
                        throw new InvalidOperationException("Không thể tải tệp lên dịch vụ lưu trữ.");
                    }
                    return uploadResult.SecureUrl?.ToString() ?? uploadResult.Url?.ToString() ?? string.Empty;
                }
            }
            catch (Exception ex) when (_env.IsDevelopment())
            {
                _logger.LogWarning(ex, "Exception during Cloudinary upload in Development. Falling back to local storage.");
                return await SaveLocallyAsync(file, folder);
            }
        }

        private async Task<string> SaveLocallyAsync(IFormFile file, string folder)
        {
            var webRoot = _env.WebRootPath;
            if (string.IsNullOrEmpty(webRoot))
            {
                webRoot = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            }

            var targetDir = Path.Combine(webRoot, "uploads", folder);
            Directory.CreateDirectory(targetDir);

            var ext = Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? string.Empty;
            var rawBaseName = Path.GetFileNameWithoutExtension(file.FileName) ?? "file";
            // Loại bỏ ký tự đặc biệt (#, ?, khoảng trắng, dấu...) để tránh URL bị cắt fragment hoặc 404
            var cleanBase = SafeFileNameRegex.Replace(rawBaseName, "_").Trim('_');
            if (string.IsNullOrWhiteSpace(cleanBase)) cleanBase = "file";
            if (cleanBase.Length > 60) cleanBase = cleanBase[..60];

            var safeName = $"{cleanBase}_{Guid.NewGuid():N}{ext}";
            var filePath = Path.Combine(targetDir, safeName);

            using (var fileStream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(fileStream);
            }

            return $"/uploads/{folder}/{safeName}";
        }

        public async Task<bool> DeleteFileAsync(string publicId)
        {
            if (string.IsNullOrWhiteSpace(publicId)) return false;

            if (publicId.StartsWith("/uploads/") || publicId.StartsWith("uploads/"))
            {
                try
                {
                    var webRoot = _env.WebRootPath;
                    if (string.IsNullOrWhiteSpace(webRoot))
                    {
                        webRoot = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
                    }
                    var uploadsRoot = Path.GetFullPath(Path.Combine(webRoot, "uploads"));
                    var fullLocalPath = Path.GetFullPath(Path.Combine(webRoot, publicId.TrimStart('/')));

                    // Kiểm tra Path Traversal: Cần đảm bảo Path.GetFullPath(localPath) nằm trọn trong thư mục uploads trước khi gọi File.Delete.
                    if (!fullLocalPath.StartsWith(uploadsRoot, StringComparison.OrdinalIgnoreCase))
                    {
                        return false;
                    }

                    if (File.Exists(fullLocalPath)) File.Delete(fullLocalPath);
                    return true;
                }
                catch { return false; }
            }

            if (_cloudinary == null) return false;

            var deletionParams = new DeletionParams(publicId);
            var result = await _cloudinary.DestroyAsync(deletionParams);
            return result.Result == "ok";
        }
    }
}
