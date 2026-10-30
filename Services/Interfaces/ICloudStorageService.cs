using Microsoft.AspNetCore.Http;

namespace JCAP.Services.Interfaces
{
    public interface ICloudStorageService
    {
        Task<string> UploadFileAsync(IFormFile file, string folder = "issues");
        Task<bool> DeleteFileAsync(string publicId);
    }
}
