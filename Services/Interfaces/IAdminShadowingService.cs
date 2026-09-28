using System.Collections.Generic;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.DTOs.Shadowing.Admin;

namespace JCAP.Services.Interfaces
{
    public interface IAdminShadowingService
    {
        Task<ApiResponse<List<ShadowingDialogueListDto>>> GetAdminCatalogAsync();
        Task<ApiResponse<ShadowingDialogueDetailDto>> GetAdminDetailAsync(int id);
        Task<ApiResponse<ShadowingDialogueDetailDto>> CreateDialogueAsync(CreateShadowingDialogueDto dto);
        Task<ApiResponse<ShadowingDialogueDetailDto>> UpdateDialogueAsync(int id, UpdateShadowingDialogueDto dto);
        Task<ApiResponse<bool>> SoftDeleteDialogueAsync(int id);
    }
}
