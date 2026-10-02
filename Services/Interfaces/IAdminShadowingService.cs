using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.DTOs.Shadowing.Admin;
using Microsoft.AspNetCore.Http;

namespace JCAP.Services.Interfaces
{
    public interface IAdminShadowingService
    {
        Task<ApiResponse<List<ShadowingDialogueListDto>>> GetAdminCatalogAsync();
        Task<ApiResponse<ShadowingDialogueDetailDto>> GetAdminDetailAsync(int id);
        Task<ApiResponse<ShadowingDialogueDetailDto>> CreateDialogueAsync(CreateShadowingDialogueDto dto);
        Task<ApiResponse<ShadowingDialogueDetailDto>> UpdateDialogueAsync(int id, UpdateShadowingDialogueDto dto);
        Task<ApiResponse<bool>> SoftDeleteDialogueAsync(int id);
        Task<ApiResponse<GeneratedShadowingDialogueDto>> GenerateDialogueDraftAsync(GenerateShadowingDialogueRequest request, CancellationToken cancellationToken = default);
        Task<ApiResponse<TranslateAssistResponse>> TranslateAssistAsync(TranslateAssistRequest request, CancellationToken cancellationToken = default);
        Task<ApiResponse<string>> UploadAudioAsync(IFormFile file, CancellationToken cancellationToken = default);
        Task<ApiResponse<List<ShadowingVocabularyDto>>> GetSharedVocabulariesAsync(string? keyword = null, string? jlptLevel = null);
        Task<ApiResponse<List<ShadowingGrammarDto>>> GetSharedGrammarsAsync(string? keyword = null, string? jlptLevel = null);
    }
}
