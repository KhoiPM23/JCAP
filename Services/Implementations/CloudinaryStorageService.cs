using System;
using System.IO;
using System.Threading.Tasks;
using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    public class CloudinaryStorageService : ICloudStorageService
    {
        private readonly Cloudinary? _cloudinary;
        private readonly ILogger<CloudinaryStorageService> _logger;

        public CloudinaryStorageService(IConfiguration configuration, ILogger<CloudinaryStorageService> logger)
        {
            _logger = logger;
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
            if (_cloudinary == null)
            {
                throw new InvalidOperationException("Cloudinary configuration is missing. Please check Cloudinary settings in appsettings.");
            }

            if (file == null || file.Length == 0)
            {
                throw new ArgumentException("File is empty or null.", nameof(file));
            }

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
                    _logger.LogError("Cloudinary image upload error: {Error}", uploadResult.Error.Message);
                    throw new Exception($"Cloudinary error: {uploadResult.Error.Message}");
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
                    _logger.LogError("Cloudinary raw upload error: {Error}", uploadResult.Error.Message);
                    throw new Exception($"Cloudinary error: {uploadResult.Error.Message}");
                }
                return uploadResult.SecureUrl?.ToString() ?? uploadResult.Url?.ToString() ?? string.Empty;
            }
        }

        public async Task<bool> DeleteFileAsync(string publicId)
        {
            if (_cloudinary == null || string.IsNullOrWhiteSpace(publicId)) return false;

            var deletionParams = new DeletionParams(publicId);
            var result = await _cloudinary.DestroyAsync(deletionParams);
            return result.Result == "ok";
        }
    }
}
