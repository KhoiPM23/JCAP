using System.Collections.Generic;
using System.Threading.Tasks;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;

namespace JCAP.Services.Interfaces
{
    public interface IShadowingService
    {
        Task<ApiResponse<List<ShadowingDialogueListDto>>> GetLearnerCatalogAsync(string? keyword, string? jlptLevel, int? scenarioId);
        Task<ApiResponse<ShadowingDialogueDetailDto>> GetLearnerDetailAsync(int id);
    }
}
