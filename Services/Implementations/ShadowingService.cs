using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations
{
    public class ShadowingService : IShadowingService
    {
        private readonly AppDbContext _context;

        public ShadowingService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<ApiResponse<List<ShadowingDialogueListDto>>> GetLearnerCatalogAsync(string? keyword, string? jlptLevel, int? scenarioId)
        {
            // Learner chỉ được xem nội dung đang hoạt động (IsActive == true)
            var query = _context.ShadowingDialogues
                .AsNoTracking()
                .Include(d => d.Scenario)
                .Include(d => d.Sentences)
                .Where(d => d.IsActive && d.Scenario.IsActive);

            if (!string.IsNullOrWhiteSpace(keyword))
            {
                var term = keyword.Trim().ToLower();
                query = query.Where(d => d.Title.ToLower().Contains(term)
                    || (d.SourceDescription != null && d.SourceDescription.ToLower().Contains(term))
                    || d.Scenario.Title.ToLower().Contains(term));
            }

            if (!string.IsNullOrWhiteSpace(jlptLevel) && jlptLevel != "ALL")
            {
                var level = jlptLevel.Trim().ToUpper();
                query = query.Where(d => d.JLPTLevel == level);
            }

            if (scenarioId.HasValue && scenarioId.Value > 0)
            {
                query = query.Where(d => d.ScenarioId == scenarioId.Value);
            }

            var items = await query
                .OrderByDescending(d => d.Id)
                .Select(d => new ShadowingDialogueListDto
                {
                    Id = d.Id,
                    ScenarioId = d.ScenarioId,
                    ScenarioTitle = d.Scenario.Title,
                    Title = d.Title,
                    JLPTLevel = d.JLPTLevel,
                    SourceDescription = d.SourceDescription,
                    SpeakerRoleA_Name = d.SpeakerRoleA_Name,
                    SpeakerRoleB_Name = d.SpeakerRoleB_Name,
                    TotalSentences = d.Sentences.Count,
                    IsActive = d.IsActive,
                    CreatedAt = d.CreatedAt
                })
                .ToListAsync();

            return ApiResponse<List<ShadowingDialogueListDto>>.Ok(items, "Lấy danh sách bài học Shadowing thành công.");
        }

        public async Task<ApiResponse<ShadowingDialogueDetailDto>> GetLearnerDetailAsync(int id)
        {
            var dialogue = await _context.ShadowingDialogues
                .AsNoTracking()
                .Include(d => d.Scenario)
                .Include(d => d.Sentences.OrderBy(s => s.OrderIndex))
                .FirstOrDefaultAsync(d => d.Id == id && d.IsActive && d.Scenario.IsActive);

            if (dialogue == null)
            {
                return ApiResponse<ShadowingDialogueDetailDto>.Fail($"Không tìm thấy bài học Shadowing với Id = {id} hoặc bài học đã bị ẩn.");
            }

            var detail = new ShadowingDialogueDetailDto
            {
                Id = dialogue.Id,
                ScenarioId = dialogue.ScenarioId,
                ScenarioTitle = dialogue.Scenario.Title,
                Title = dialogue.Title,
                JLPTLevel = dialogue.JLPTLevel,
                SourceDescription = dialogue.SourceDescription,
                SpeakerRoleA_Name = dialogue.SpeakerRoleA_Name,
                SpeakerRoleB_Name = dialogue.SpeakerRoleB_Name,
                IsActive = dialogue.IsActive,
                CreatedAt = dialogue.CreatedAt,
                Sentences = dialogue.Sentences
                    .OrderBy(s => s.OrderIndex)
                    .Select(s => new ShadowingSentenceDto
                    {
                        Id = s.Id,
                        OrderIndex = s.OrderIndex,
                        SpeakerRole = s.SpeakerRole,
                        JapaneseText = s.JapaneseText,
                        RomajiText = s.RomajiText,
                        VietnameseTranslation = s.VietnameseTranslation,
                        NativeAudioUrl = s.NativeAudioUrl
                    })
                    .ToList()
            };

            return ApiResponse<ShadowingDialogueDetailDto>.Ok(detail, "Lấy thông tin chi tiết bài học Shadowing thành công.");
        }
    }
}
