using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.DTOs.Shadowing.Admin;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    public class AdminShadowingService : IAdminShadowingService
    {
        private readonly AppDbContext _context;
        private readonly ILogger<AdminShadowingService> _logger;

        public AdminShadowingService(AppDbContext context, ILogger<AdminShadowingService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<ApiResponse<List<ShadowingDialogueListDto>>> GetAdminCatalogAsync()
        {
            // Admin thấy toàn bộ danh sách kể cả IsActive = false
            var items = await _context.ShadowingDialogues
                .AsNoTracking()
                .Include(d => d.Scenario)
                .Include(d => d.Sentences)
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

            return ApiResponse<List<ShadowingDialogueListDto>>.Ok(items, "Lấy danh sách quản trị Shadowing thành công.");
        }

        public async Task<ApiResponse<ShadowingDialogueDetailDto>> GetAdminDetailAsync(int id)
        {
            var dialogue = await _context.ShadowingDialogues
                .AsNoTracking()
                .Include(d => d.Scenario)
                .Include(d => d.Sentences.OrderBy(s => s.OrderIndex))
                .FirstOrDefaultAsync(d => d.Id == id);

            if (dialogue == null)
            {
                return ApiResponse<ShadowingDialogueDetailDto>.Fail($"Không tìm thấy bài học Shadowing với Id = {id}.");
            }

            var detail = MapToDetailDto(dialogue);
            return ApiResponse<ShadowingDialogueDetailDto>.Ok(detail, "Lấy thông tin chi tiết bài học thành công.");
        }

        public async Task<ApiResponse<ShadowingDialogueDetailDto>> CreateDialogueAsync(CreateShadowingDialogueDto dto)
        {
            // 1. Verify Scenario exists
            var scenarioExists = await _context.Scenarios.AnyAsync(s => s.Id == dto.ScenarioId);
            if (!scenarioExists)
            {
                return ApiResponse<ShadowingDialogueDetailDto>.Fail($"Kịch bản cha (ScenarioId = {dto.ScenarioId}) không tồn tại trong hệ thống.");
            }

            // 2. Transaction create dialogue + sentences
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var dialogue = new ShadowingDialogue
                {
                    ScenarioId = dto.ScenarioId,
                    Title = dto.Title.Trim(),
                    JLPTLevel = dto.JLPTLevel.Trim().ToUpper(),
                    SourceDescription = dto.SourceDescription?.Trim(),
                    SpeakerRoleA_Name = dto.SpeakerRoleA_Name.Trim(),
                    SpeakerRoleB_Name = dto.SpeakerRoleB_Name.Trim(),
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };

                _context.ShadowingDialogues.Add(dialogue);
                await _context.SaveChangesAsync();

                // Add sentences
                int autoIndex = 1;
                foreach (var sDto in dto.Sentences.OrderBy(s => s.OrderIndex))
                {
                    var sentence = new ShadowingSentence
                    {
                        ShadowingDialogueId = dialogue.Id,
                        OrderIndex = autoIndex++,
                        SpeakerRole = sDto.SpeakerRole.Trim().ToUpper(),
                        JapaneseText = sDto.JapaneseText.Trim(),
                        RomajiText = sDto.RomajiText?.Trim(),
                        VietnameseTranslation = sDto.VietnameseTranslation.Trim(),
                        NativeAudioUrl = sDto.NativeAudioUrl.Trim()
                    };
                    _context.ShadowingSentences.Add(sentence);
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                // Fetch full detail with scenario
                var created = await _context.ShadowingDialogues
                    .AsNoTracking()
                    .Include(d => d.Scenario)
                    .Include(d => d.Sentences.OrderBy(s => s.OrderIndex))
                    .FirstAsync(d => d.Id == dialogue.Id);

                return ApiResponse<ShadowingDialogueDetailDto>.Ok(MapToDetailDto(created), "Tạo mới bài học Shadowing thành công.");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Lỗi xảy ra khi tạo mới bài học Shadowing.");
                return ApiResponse<ShadowingDialogueDetailDto>.Fail("Lỗi hệ thống khi tạo mới bài học Shadowing.");
            }
        }

        public async Task<ApiResponse<ShadowingDialogueDetailDto>> UpdateDialogueAsync(int id, UpdateShadowingDialogueDto dto)
        {
            var dialogue = await _context.ShadowingDialogues
                .Include(d => d.Sentences)
                .FirstOrDefaultAsync(d => d.Id == id);

            if (dialogue == null)
            {
                return ApiResponse<ShadowingDialogueDetailDto>.Fail($"Không tìm thấy bài học Shadowing với Id = {id}.");
            }

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                dialogue.Title = dto.Title.Trim();
                dialogue.JLPTLevel = dto.JLPTLevel.Trim().ToUpper();
                dialogue.SourceDescription = dto.SourceDescription?.Trim();
                dialogue.SpeakerRoleA_Name = dto.SpeakerRoleA_Name.Trim();
                dialogue.SpeakerRoleB_Name = dto.SpeakerRoleB_Name.Trim();
                dialogue.IsActive = dto.IsActive;

                // Đồng bộ danh sách câu: xóa các câu cũ và thêm mới lại theo thứ tự
                _context.ShadowingSentences.RemoveRange(dialogue.Sentences);

                int autoIndex = 1;
                foreach (var sDto in dto.Sentences.OrderBy(s => s.OrderIndex))
                {
                    var sentence = new ShadowingSentence
                    {
                        ShadowingDialogueId = dialogue.Id,
                        OrderIndex = autoIndex++,
                        SpeakerRole = sDto.SpeakerRole.Trim().ToUpper(),
                        JapaneseText = sDto.JapaneseText.Trim(),
                        RomajiText = sDto.RomajiText?.Trim(),
                        VietnameseTranslation = sDto.VietnameseTranslation.Trim(),
                        NativeAudioUrl = sDto.NativeAudioUrl.Trim()
                    };
                    _context.ShadowingSentences.Add(sentence);
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                var updated = await _context.ShadowingDialogues
                    .AsNoTracking()
                    .Include(d => d.Scenario)
                    .Include(d => d.Sentences.OrderBy(s => s.OrderIndex))
                    .FirstAsync(d => d.Id == dialogue.Id);

                return ApiResponse<ShadowingDialogueDetailDto>.Ok(MapToDetailDto(updated), "Cập nhật bài học Shadowing thành công.");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Lỗi xảy ra khi cập nhật bài học Shadowing Id = {Id}", id);
                return ApiResponse<ShadowingDialogueDetailDto>.Fail("Lỗi hệ thống khi cập nhật bài học Shadowing.");
            }
        }

        public async Task<ApiResponse<bool>> SoftDeleteDialogueAsync(int id)
        {
            var dialogue = await _context.ShadowingDialogues.FindAsync(id);
            if (dialogue == null)
            {
                return ApiResponse<bool>.Fail($"Không tìm thấy bài học Shadowing với Id = {id}.");
            }

            // Soft delete: gán IsActive = false theo đúng convention dự án
            dialogue.IsActive = false;
            await _context.SaveChangesAsync();

            return ApiResponse<bool>.Ok(true, "Đã vô hiệu hóa (xóa mềm) bài học Shadowing thành công.");
        }

        private static ShadowingDialogueDetailDto MapToDetailDto(ShadowingDialogue dialogue)
        {
            return new ShadowingDialogueDetailDto
            {
                Id = dialogue.Id,
                ScenarioId = dialogue.ScenarioId,
                ScenarioTitle = dialogue.Scenario?.Title ?? string.Empty,
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
        }
    }
}
