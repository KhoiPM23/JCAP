using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.Models;
using JCAP.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Phiên luyện Shadowing đang diễn ra (ShadowingPracticeProgress). Xem docs/shadowing-v2/MILESTONE-1-PLAN.md mục 6b.
    ///
    /// Chống phiên trùng hai lớp: (1) tìm phiên in_progress trước khi tạo; (2) index duy nhất có lọc trong CSDL. Khi hai request
    /// cùng tạo, request thua gặp lỗi trùng khóa → đọc lại và trả phiên của request thắng.
    /// </summary>
    public class ShadowingPracticeProgressService : IShadowingPracticeProgressService
    {
        private readonly AppDbContext _context;

        public ShadowingPracticeProgressService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<ApiResponse<ShadowingPracticeProgressDto>> StartAsync(string userId, StartShadowingProgressDto dto)
        {
            var role = NormalizeRole(dto.LearnerRole);
            if (role == null) return ApiResponse<ShadowingPracticeProgressDto>.Fail("Vai luyện tập không hợp lệ.");

            var dialogue = await _context.ShadowingDialogues.AsNoTracking()
                .FirstOrDefaultAsync(d => d.Id == dto.DialogueId && d.IsActive);
            if (dialogue == null) return ApiResponse<ShadowingPracticeProgressDto>.Fail("Không tìm thấy bài học Shadowing.");

            var sentenceCount = await _context.ShadowingSentences.CountAsync(s => s.ShadowingDialogueId == dialogue.Id);
            if (sentenceCount == 0) return ApiResponse<ShadowingPracticeProgressDto>.Fail("Bài học chưa có câu nào để luyện.");

            var active = await FindActiveAsync(userId, dialogue.Id, role);
            if (active != null && !dto.Restart)
                return ApiResponse<ShadowingPracticeProgressDto>.Ok(await ToDtoAsync(active, created: false), "Tiếp tục phiên luyện.");

            if (active != null && dto.Restart && dto.ExpectedProgressId.HasValue && dto.ExpectedProgressId.Value != active.Id)
            {
                // Phiên đang luyện đã khác phiên client đang thấy (vd. tab khác vừa làm lại): không tạo thêm phiên.
                return ApiResponse<ShadowingPracticeProgressDto>.Ok(await ToDtoAsync(active, created: false), "Phiên luyện đã được làm lại ở nơi khác.");
            }

            var now = DateTime.UtcNow;
            var startIndex = 0;
            if (active == null && !dto.Restart && dto.SuggestedSentenceIndex is { } suggested)
            {
                // Dữ liệu cũ trong trình duyệt chỉ được dùng khi server CHƯA TỪNG có phiên nào cho bài + vai này.
                var everStarted = await _context.ShadowingPracticeProgresses
                    .AnyAsync(p => p.UserId == userId && p.ShadowingDialogueId == dialogue.Id && p.LearnerRole == role);
                if (!everStarted) startIndex = Math.Clamp(suggested, 0, sentenceCount - 1);
            }

            var progress = new ShadowingPracticeProgress
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                ShadowingDialogueId = dialogue.Id,
                LearnerRole = role,
                Status = ShadowingPracticeProgress.StatusInProgress,
                CurrentSentenceIndex = startIndex,
                StartedAt = now,
                LastActivityAt = now,
            };

            await using var transaction = await BeginTransactionAsync();
            try
            {
                if (active != null)
                {
                    // Làm lại: phiên cũ giữ nguyên lịch sử chấm, chỉ chuyển sang abandoned (không xóa cứng).
                    // Lưu riêng trước khi tạo phiên mới để index duy nhất không thấy hai phiên in_progress cùng lúc.
                    active.Status = ShadowingPracticeProgress.StatusAbandoned;
                    active.LastActivityAt = now;
                    await _context.SaveChangesAsync();
                }

                _context.ShadowingPracticeProgresses.Add(progress);
                await _context.SaveChangesAsync();
                if (transaction != null) await transaction.CommitAsync();
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            {
                // Request khác vừa tạo phiên cho cùng bài + vai: dùng phiên đó thay vì báo lỗi.
                if (transaction != null) await transaction.RollbackAsync();
                _context.ChangeTracker.Clear();
                var winner = await FindActiveAsync(userId, dialogue.Id, role);
                if (winner == null) throw;
                return ApiResponse<ShadowingPracticeProgressDto>.Ok(await ToDtoAsync(winner, created: false), "Tiếp tục phiên luyện.");
            }

            return ApiResponse<ShadowingPracticeProgressDto>.Ok(await ToDtoAsync(progress, created: true), "Đã bắt đầu phiên luyện.");
        }

        public async Task<ApiResponse<ShadowingPracticeProgressDto?>> GetActiveAsync(string userId, int dialogueId, string learnerRole)
        {
            var role = NormalizeRole(learnerRole);
            if (role == null) return ApiResponse<ShadowingPracticeProgressDto?>.Fail("Vai luyện tập không hợp lệ.");
            var active = await FindActiveAsync(userId, dialogueId, role);
            return ApiResponse<ShadowingPracticeProgressDto?>.Ok(active == null ? null : await ToDtoAsync(active, created: false));
        }

        public async Task<ApiResponse<ShadowingPracticeProgressDto?>> GetLatestAsync(string userId)
        {
            var latest = await _context.ShadowingPracticeProgresses
                .Where(p => p.UserId == userId
                    && p.Status == ShadowingPracticeProgress.StatusInProgress
                    && p.ShadowingDialogue!.IsActive)
                .OrderByDescending(p => p.LastActivityAt)
                .FirstOrDefaultAsync();
            return ApiResponse<ShadowingPracticeProgressDto?>.Ok(latest == null ? null : await ToDtoAsync(latest, created: false));
        }

        public async Task<ApiResponse<ShadowingPracticeProgressDto>> UpdatePositionAsync(string userId, Guid progressId, UpdateShadowingProgressDto dto)
        {
            var progress = await _context.ShadowingPracticeProgresses.FirstOrDefaultAsync(p => p.Id == progressId && p.UserId == userId);
            if (progress == null) return ApiResponse<ShadowingPracticeProgressDto>.Fail("Không tìm thấy phiên luyện.");
            if (progress.Status != ShadowingPracticeProgress.StatusInProgress)
                return ApiResponse<ShadowingPracticeProgressDto>.Fail("Phiên luyện đã kết thúc.");

            var sentenceCount = await _context.ShadowingSentences.CountAsync(s => s.ShadowingDialogueId == progress.ShadowingDialogueId);
            if (dto.CurrentSentenceIndex < 0 || dto.CurrentSentenceIndex >= sentenceCount)
                return ApiResponse<ShadowingPracticeProgressDto>.Fail("Vị trí câu không hợp lệ.");

            progress.CurrentSentenceIndex = dto.CurrentSentenceIndex;
            progress.LastActivityAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return ApiResponse<ShadowingPracticeProgressDto>.Ok(await ToDtoAsync(progress, created: false), "Đã cập nhật vị trí luyện.");
        }

        public async Task<string?> ValidateForEvaluationAsync(string userId, Guid progressId, ShadowingSentence sentence)
        {
            var progress = await _context.ShadowingPracticeProgresses.FirstOrDefaultAsync(p => p.Id == progressId && p.UserId == userId);
            if (progress == null) return "Không tìm thấy phiên luyện.";
            if (progress.Status != ShadowingPracticeProgress.StatusInProgress) return "Phiên luyện đã kết thúc.";
            // Thay cho khóa ngoại ghép (sẽ phải sửa bảng ShadowingSentences của thành viên khác): kiểm tra ở tầng ứng dụng.
            if (sentence.ShadowingDialogueId != progress.ShadowingDialogueId) return "Câu không thuộc bài của phiên luyện.";
            if (!string.Equals(sentence.SpeakerRole, progress.LearnerRole, StringComparison.OrdinalIgnoreCase))
                return "Câu không thuộc vai của người học trong phiên luyện.";

            progress.LastActivityAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return null;
        }

        private Task<ShadowingPracticeProgress?> FindActiveAsync(string userId, int dialogueId, string role) =>
            _context.ShadowingPracticeProgresses.FirstOrDefaultAsync(p =>
                p.UserId == userId && p.ShadowingDialogueId == dialogueId && p.LearnerRole == role
                && p.Status == ShadowingPracticeProgress.StatusInProgress);

        private async Task<IDbContextTransaction?> BeginTransactionAsync() =>
            _context.Database.IsRelational() ? await _context.Database.BeginTransactionAsync() : null;

        /// <summary>SQL Server: 2601 = trùng index duy nhất, 2627 = trùng ràng buộc duy nhất/khóa chính.</summary>
        internal static bool IsUniqueViolation(DbUpdateException ex) =>
            ex.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 };

        private static string? NormalizeRole(string? role)
        {
            var r = (role ?? string.Empty).Trim().ToUpperInvariant();
            return r is "A" or "B" ? r : null;
        }

        private async Task<ShadowingPracticeProgressDto> ToDtoAsync(ShadowingPracticeProgress progress, bool created)
        {
            var dialogue = await _context.ShadowingDialogues.AsNoTracking().FirstAsync(d => d.Id == progress.ShadowingDialogueId);
            var sentences = await _context.ShadowingSentences.AsNoTracking()
                .Where(s => s.ShadowingDialogueId == progress.ShadowingDialogueId)
                .OrderBy(s => s.OrderIndex).ThenBy(s => s.Id)
                .Select(s => new { s.Id, s.SpeakerRole, s.JapaneseText })
                .ToListAsync();
            var evaluations = await _context.ShadowingSentenceEvaluations.AsNoTracking()
                .Where(e => e.ShadowingPracticeProgressId == progress.Id)
                .Select(e => new { e.ShadowingSentenceId, e.OverallScore, e.ErrorCode, e.CreatedAt })
                .ToListAsync();

            var learnerSentences = new List<ShadowingProgressSentenceDto>();
            for (var i = 0; i < sentences.Count; i++)
            {
                var s = sentences[i];
                if (!string.Equals(s.SpeakerRole, progress.LearnerRole, StringComparison.OrdinalIgnoreCase)) continue;
                var mine = evaluations.Where(e => e.ShadowingSentenceId == s.Id).OrderBy(e => e.CreatedAt).ToList();
                var scored = mine.Where(e => e.OverallScore.HasValue).ToList();
                var last = mine.LastOrDefault();
                learnerSentences.Add(new ShadowingProgressSentenceDto
                {
                    SentenceId = s.Id,
                    SentenceIndex = i,
                    State = scored.Count > 0 ? "EVALUATED" : mine.Count > 0 ? "EVALUATION_FAILED" : "NOT_STARTED",
                    SubmissionCount = mine.Count,
                    BestScore = scored.Count > 0 ? scored.Max(e => e.OverallScore!.Value) : null,
                    LastErrorCode = last != null && !last.OverallScore.HasValue ? last.ErrorCode : null,
                    LastSubmittedAt = last == null ? null : AsUtc(last.CreatedAt),
                });
            }

            var index = Math.Clamp(progress.CurrentSentenceIndex, 0, Math.Max(0, sentences.Count - 1));
            return new ShadowingPracticeProgressDto
            {
                Id = progress.Id,
                DialogueId = dialogue.Id,
                DialogueTitle = dialogue.Title,
                JlptLevel = dialogue.JLPTLevel,
                LearnerRole = progress.LearnerRole,
                Status = progress.Status,
                CurrentSentenceIndex = progress.CurrentSentenceIndex,
                CurrentSentenceText = sentences.Count > 0 ? sentences[index].JapaneseText : string.Empty,
                TotalSentenceCount = sentences.Count,
                LearnerSentenceCount = learnerSentences.Count,
                EvaluatedSentenceCount = learnerSentences.Count(x => x.State == "EVALUATED"),
                StartedAt = AsUtc(progress.StartedAt),
                LastActivityAt = AsUtc(progress.LastActivityAt),
                CompletedAt = progress.CompletedAt.HasValue ? AsUtc(progress.CompletedAt.Value) : null,
                SessionId = progress.ShadowingPracticeSessionId,
                Created = created,
                Sentences = learnerSentences,
            };
        }

        private static DateTime AsUtc(DateTime value) =>
            value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);
    }
}
