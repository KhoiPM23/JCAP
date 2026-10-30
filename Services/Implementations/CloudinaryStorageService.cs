using System;
using System.IO;
using System.Threading.Tasks;
using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    public class CloudinaryStorageService : ICloudStorageService
    {
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

            // Nếu Cloudinary chưa được cấu hình, tự động lưu trữ cục bộ (Local Fallback)
            if (_cloudinary == null)
            {
                _logger.LogWarning("Cloudinary is not configured. Falling back to local storage for folder: {Folder}", folder);
                return await SaveLocallyAsync(file, folder);
            }

            try
            {
                using var stream = file.OpenReadStream();
                var isImage = file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase);

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
                        _logger.LogWarning("Cloudinary image upload error: {Error}. Falling back to local storage.", uploadResult.Error.Message);
                        return await SaveLocallyAsync(file, folder);
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
                        _logger.LogWarning("Cloudinary raw upload error: {Error}. Falling back to local storage.", uploadResult.Error.Message);
                        return await SaveLocallyAsync(file, folder);
                    }
                    return uploadResult.SecureUrl?.ToString() ?? uploadResult.Url?.ToString() ?? string.Empty;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Exception during Cloudinary upload. Falling back to local storage.");
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

            var ext = Path.GetExtension(file.FileName);
            var safeName = $"{Path.GetFileNameWithoutExtension(file.FileName)}_{Guid.NewGuid():N}{ext}";
            var filePath = Path.Combine(targetDir, safeName);

            using (var fileStream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(fileStream);
            }

            // Đồng bộ sang jcap-web/public/uploads để Vite dev server phục vụ trực tiếp
            try
            {
                var frontendPublicUploads = Path.Combine(Directory.GetCurrentDirectory(), "jcap-web", "public", "uploads", folder);
                Directory.CreateDirectory(frontendPublicUploads);
                var frontendPath = Path.Combine(frontendPublicUploads, safeName);
                File.Copy(filePath, frontendPath, true);
            }
            catch
            {
                // Bỏ qua nếu không copy được sang frontend
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
                    var localPath = Path.Combine(_env.WebRootPath ?? "wwwroot", publicId.TrimStart('/'));
                    if (File.Exists(localPath)) File.Delete(localPath);
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
