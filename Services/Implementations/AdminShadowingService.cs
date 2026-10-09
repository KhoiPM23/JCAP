using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Shadowing;
using JCAP.DTOs.Shadowing.Admin;
using JCAP.Models;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    public class AdminShadowingService : IAdminShadowingService
    {
        private readonly AppDbContext _context;
        private readonly ILogger<AdminShadowingService> _logger;
        private readonly IConfiguration _configuration;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IWebHostEnvironment _environment;
        private readonly IAiClient? _aiClient;

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNameCaseInsensitive = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        public AdminShadowingService(
            AppDbContext context,
            ILogger<AdminShadowingService> logger,
            IConfiguration configuration,
            IHttpClientFactory httpClientFactory,
            IWebHostEnvironment environment,
            IAiClient? aiClient = null)
        {
            _context = context;
            _logger = logger;
            _configuration = configuration;
            _httpClientFactory = httpClientFactory;
            _environment = environment;
            _aiClient = aiClient;
        }

        public async Task<ApiResponse<List<ShadowingDialogueListDto>>> GetAdminCatalogAsync()
        {
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
                .Include(d => d.DialogueVocabularies).ThenInclude(dv => dv.Vocabulary)
                .Include(d => d.DialogueGrammars).ThenInclude(dg => dg.Grammar)
                .FirstOrDefaultAsync(d => d.Id == id);

            if (dialogue == null)
            {
                return ApiResponse<ShadowingDialogueDetailDto>.Fail($"Không tìm thấy bài học Shadowing với Id = {id}.");
            }

            var levelConfig = await _context.ScenarioLevelConfigurations
                .AsNoTracking()
                .Include(c => c.TargetVocabularies)
                .Include(c => c.TargetGrammars)
                .FirstOrDefaultAsync(c => c.ScenarioId == dialogue.ScenarioId && c.JLPTLevel == dialogue.JLPTLevel);

            var detail = MapToDetailDto(dialogue, levelConfig);
            return ApiResponse<ShadowingDialogueDetailDto>.Ok(detail, "Lấy thông tin chi tiết bài học thành công.");
        }

        public async Task<ApiResponse<ShadowingDialogueDetailDto>> CreateDialogueAsync(CreateShadowingDialogueDto dto)
        {
            var scenarioExists = await _context.Scenarios.AnyAsync(s => s.Id == dto.ScenarioId);
            if (!scenarioExists)
            {
                return ApiResponse<ShadowingDialogueDetailDto>.Fail($"Kịch bản cha (ScenarioId = {dto.ScenarioId}) không tồn tại trong hệ thống.");
            }

            var rolesList = ResolveSpeakerRoles(dto.SpeakerRoles, dto.SpeakerRoleA_Name, dto.SpeakerRoleB_Name);

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var dialogue = new ShadowingDialogue
                {
                    ScenarioId = dto.ScenarioId,
                    Title = dto.Title.Trim(),
                    JLPTLevel = dto.JLPTLevel.Trim().ToUpper(),
                    SourceDescription = dto.SourceDescription?.Trim(),
                    SpeakerRoleA_Name = rolesList.Count > 0 ? rolesList[0] : dto.SpeakerRoleA_Name.Trim(),
                    SpeakerRoleB_Name = rolesList.Count > 1 ? rolesList[1] : dto.SpeakerRoleB_Name.Trim(),
                    SpeakerRolesJson = JsonSerializer.Serialize(rolesList, JsonOptions),
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };

                _context.ShadowingDialogues.Add(dialogue);
                await _context.SaveChangesAsync();

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
                        NativeAudioUrl = string.IsNullOrWhiteSpace(sDto.NativeAudioUrl) ? null : sDto.NativeAudioUrl.Trim(),
                        AudioDurationMs = sDto.AudioDurationMs
                    };
                    _context.ShadowingSentences.Add(sentence);
                }

                await AttachSharedVocabulariesAsync(dialogue.Id, dialogue.JLPTLevel, dto.TargetVocabularies);
                await AttachSharedGrammarsAsync(dialogue.Id, dialogue.JLPTLevel, dto.TargetGrammars);

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                var created = await _context.ShadowingDialogues
                    .AsNoTracking()
                    .Include(d => d.Scenario)
                    .Include(d => d.Sentences.OrderBy(s => s.OrderIndex))
                    .Include(d => d.DialogueVocabularies).ThenInclude(dv => dv.Vocabulary)
                    .Include(d => d.DialogueGrammars).ThenInclude(dg => dg.Grammar)
                    .FirstAsync(d => d.Id == dialogue.Id);

                return ApiResponse<ShadowingDialogueDetailDto>.Ok(MapToDetailDto(created, null), "Tạo mới bài học Shadowing thành công.");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Lỗi xảy ra khi tạo mới bài học Shadowing.");
                return ApiResponse<ShadowingDialogueDetailDto>.Fail("Lỗi hệ thống khi tạo mới bài học Shadowing: " + ex.Message);
            }
        }

        public async Task<ApiResponse<ShadowingDialogueDetailDto>> UpdateDialogueAsync(int id, UpdateShadowingDialogueDto dto)
        {
            var dialogue = await _context.ShadowingDialogues
                .Include(d => d.Sentences)
                .Include(d => d.DialogueVocabularies)
                .Include(d => d.DialogueGrammars)
                .FirstOrDefaultAsync(d => d.Id == id);

            if (dialogue == null)
            {
                return ApiResponse<ShadowingDialogueDetailDto>.Fail($"Không tìm thấy bài học Shadowing với Id = {id}.");
            }

            var rolesList = ResolveSpeakerRoles(dto.SpeakerRoles, dto.SpeakerRoleA_Name, dto.SpeakerRoleB_Name);

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                dialogue.Title = dto.Title.Trim();
                dialogue.JLPTLevel = dto.JLPTLevel.Trim().ToUpper();
                dialogue.SourceDescription = dto.SourceDescription?.Trim();
                dialogue.SpeakerRoleA_Name = rolesList.Count > 0 ? rolesList[0] : dto.SpeakerRoleA_Name.Trim();
                dialogue.SpeakerRoleB_Name = rolesList.Count > 1 ? rolesList[1] : dto.SpeakerRoleB_Name.Trim();
                dialogue.SpeakerRolesJson = JsonSerializer.Serialize(rolesList, JsonOptions);
                dialogue.IsActive = dto.IsActive;

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
                        NativeAudioUrl = string.IsNullOrWhiteSpace(sDto.NativeAudioUrl) ? null : sDto.NativeAudioUrl.Trim(),
                        AudioDurationMs = sDto.AudioDurationMs
                    };
                    _context.ShadowingSentences.Add(sentence);
                }

                _context.ShadowingDialogueVocabularies.RemoveRange(dialogue.DialogueVocabularies);
                _context.ShadowingDialogueGrammars.RemoveRange(dialogue.DialogueGrammars);
                await _context.SaveChangesAsync();

                await AttachSharedVocabulariesAsync(dialogue.Id, dialogue.JLPTLevel, dto.TargetVocabularies);
                await AttachSharedGrammarsAsync(dialogue.Id, dialogue.JLPTLevel, dto.TargetGrammars);

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                var updated = await _context.ShadowingDialogues
                    .AsNoTracking()
                    .Include(d => d.Scenario)
                    .Include(d => d.Sentences.OrderBy(s => s.OrderIndex))
                    .Include(d => d.DialogueVocabularies).ThenInclude(dv => dv.Vocabulary)
                    .Include(d => d.DialogueGrammars).ThenInclude(dg => dg.Grammar)
                    .FirstAsync(d => d.Id == dialogue.Id);

                return ApiResponse<ShadowingDialogueDetailDto>.Ok(MapToDetailDto(updated, null), "Cập nhật bài học Shadowing thành công.");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Lỗi xảy ra khi cập nhật bài học Shadowing Id = {Id}", id);
                return ApiResponse<ShadowingDialogueDetailDto>.Fail("Lỗi hệ thống khi cập nhật bài học Shadowing: " + ex.Message);
            }
        }

        public async Task<ApiResponse<bool>> SoftDeleteDialogueAsync(int id)
        {
            var dialogue = await _context.ShadowingDialogues.FindAsync(id);
            if (dialogue == null)
            {
                return ApiResponse<bool>.Fail($"Không tìm thấy bài học Shadowing với Id = {id}.");
            }

            dialogue.IsActive = false;
            await _context.SaveChangesAsync();

            return ApiResponse<bool>.Ok(true, "Đã vô hiệu hóa (xóa mềm) bài học Shadowing thành công.");
        }

        public async Task<ApiResponse<string>> UploadAudioAsync(IFormFile file, CancellationToken cancellationToken = default)
        {
            if (file == null || file.Length == 0)
            {
                return ApiResponse<string>.Fail("Tệp âm thanh không hợp lệ hoặc rỗng.");
            }

            const long maxFileSize = 20 * 1024 * 1024; // 20 MB
            if (file.Length > maxFileSize)
            {
                return ApiResponse<string>.Fail("Kích thước tệp âm thanh vượt quá giới hạn 20MB.");
            }

            var allowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                ".mp3", ".wav", ".webm", ".m4a", ".ogg", ".aac"
            };

            var ext = Path.GetExtension(file.FileName);
            if (string.IsNullOrWhiteSpace(ext) || !allowedExtensions.Contains(ext))
            {
                ext = ".webm";
            }

            try
            {
                var webRoot = _environment.WebRootPath;
                if (string.IsNullOrWhiteSpace(webRoot))
                {
                    webRoot = Path.Combine(_environment.ContentRootPath, "wwwroot");
                }

                var targetDir = Path.Combine(webRoot, "audio", "shadowing");
                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }

                var safeFileName = $"shd_{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Guid.NewGuid():N}{ext}";
                var fullPath = Path.Combine(targetDir, safeFileName);

                await using (var stream = new FileStream(fullPath, FileMode.Create))
                {
                    await file.CopyToAsync(stream, cancellationToken);
                }

                var relativeUrl = $"/audio/shadowing/{safeFileName}";
                return ApiResponse<string>.Ok(relativeUrl, "Tải lên tệp âm thanh thành công.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi lưu trữ tệp âm thanh Shadowing.");
                return ApiResponse<string>.Fail("Lỗi lưu trữ tệp âm thanh: " + ex.Message);
            }
        }

        public async Task<ApiResponse<GeneratedShadowingDialogueDto>> GenerateDialogueDraftAsync(
            GenerateShadowingDialogueRequest request,
            CancellationToken cancellationToken = default)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.ContextTitle))
            {
                return ApiResponse<GeneratedShadowingDialogueDto>.Fail("Chủ đề hoặc tiêu đề không được để trống.");
            }

            var level = (request.JLPTLevel ?? "N5").Trim().ToUpperInvariant();
            var title = request.ContextTitle.Trim();
            var desc = request.ContextDescription?.Trim() ?? string.Empty;
            var roles = ResolveSpeakerRoles(request.SpeakerRoles, "Khách hàng (Học viên)", "Nhân viên");

            int sentenceCount = Math.Clamp(request.SentenceCount, 2, 16);
            int vocabCount = Math.Clamp(request.VocabCount, 1, 8);
            int grammarCount = Math.Clamp(request.GrammarCount, 1, 6);

            if (_aiClient != null)
            {
                try
                {
                    var aiResult = await TryGenerateDialogueWithAiClientAsync(
                        title, desc, level, roles, sentenceCount, vocabCount, grammarCount, request.CustomInstructions, cancellationToken);
                    if (aiResult != null && aiResult.Sentences.Count > 0)
                    {
                        return ApiResponse<GeneratedShadowingDialogueDto>.Ok(aiResult, "Tạo bài hội thoại Shadowing AI thành công.");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "AI call failed, falling back to heuristic generator.");
                }
            }

            var fallback = GenerateHeuristicDialogue(title, desc, level, roles, sentenceCount, vocabCount, grammarCount);
            return ApiResponse<GeneratedShadowingDialogueDto>.Ok(fallback, "Tạo bài hội thoại Shadowing (Bộ tạo tích hợp) thành công.");
        }

        public async Task<ApiResponse<TranslateAssistResponse>> TranslateAssistAsync(
            TranslateAssistRequest request,
            CancellationToken cancellationToken = default)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Text))
            {
                return ApiResponse<TranslateAssistResponse>.Fail("Nội dung không được để trống.");
            }

            var input = request.Text.Trim();
            var isJa = request.SourceLanguage?.ToLowerInvariant() == "ja";
            var level = request.JLPTLevel ?? "N5";

            if (_aiClient != null)
            {
                try
                {
                    var aiResult = await TryTranslateWithAiClientAsync(input, isJa, level, cancellationToken);
                    if (aiResult != null)
                    {
                        return ApiResponse<TranslateAssistResponse>.Ok(aiResult, "Hỗ trợ dịch thuật AI thành công.");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "TranslateAssist AI call failed, falling back to local assistant.");
                }
            }

            var fallback = GenerateHeuristicTranslation(input, isJa);
            return ApiResponse<TranslateAssistResponse>.Ok(fallback, "Hỗ trợ dịch thuật thành công.");
        }

        private static List<string> ResolveSpeakerRoles(List<string>? roles, string? fallbackA, string? fallbackB)
        {
            var list = new List<string>();
            if (roles != null && roles.Count > 0)
            {
                foreach (var r in roles)
                {
                    if (!string.IsNullOrWhiteSpace(r))
                    {
                        list.Add(r.Trim());
                    }
                }
            }

            if (list.Count == 0)
            {
                list.Add(!string.IsNullOrWhiteSpace(fallbackA) ? fallbackA.Trim() : "Vai A (Học viên)");
                list.Add(!string.IsNullOrWhiteSpace(fallbackB) ? fallbackB.Trim() : "Vai B (Bản xứ)");
            }
            else if (list.Count == 1)
            {
                list.Add(!string.IsNullOrWhiteSpace(fallbackB) ? fallbackB.Trim() : "Vai B (Bản xứ)");
            }

            return list;
        }

        private static ShadowingDialogueDetailDto MapToDetailDto(
            ShadowingDialogue dialogue,
            ScenarioLevelConfiguration? levelConfig)
        {
            List<string> roles = new();
            if (!string.IsNullOrWhiteSpace(dialogue.SpeakerRolesJson))
            {
                try
                {
                    roles = JsonSerializer.Deserialize<List<string>>(dialogue.SpeakerRolesJson, JsonOptions) ?? new();
                }
                catch
                {
                    roles = new();
                }
            }

            if (roles.Count == 0)
            {
                if (!string.IsNullOrWhiteSpace(dialogue.SpeakerRoleA_Name)) roles.Add(dialogue.SpeakerRoleA_Name);
                if (!string.IsNullOrWhiteSpace(dialogue.SpeakerRoleB_Name)) roles.Add(dialogue.SpeakerRoleB_Name);
            }

            List<ShadowingVocabularyDto> vocabList;
            if (dialogue.DialogueVocabularies != null && dialogue.DialogueVocabularies.Any())
            {
                vocabList = dialogue.DialogueVocabularies
                    .OrderBy(dv => dv.OrderIndex)
                    .Select(dv => new ShadowingVocabularyDto
                    {
                        Id = dv.Vocabulary.Id,
                        Word = dv.Vocabulary.Word,
                        Reading = dv.Vocabulary.Reading,
                        Meaning = dv.Vocabulary.Meaning
                    }).ToList();
            }
            else
            {
                vocabList = levelConfig?.TargetVocabularies?.Select(v => new ShadowingVocabularyDto
                {
                    Id = v.Id,
                    Word = v.Word,
                    Reading = v.Reading,
                    Meaning = v.Meaning
                }).ToList() ?? new List<ShadowingVocabularyDto>();
            }

            List<ShadowingGrammarDto> grammarList;
            if (dialogue.DialogueGrammars != null && dialogue.DialogueGrammars.Any())
            {
                grammarList = dialogue.DialogueGrammars
                    .OrderBy(dg => dg.OrderIndex)
                    .Select(dg => new ShadowingGrammarDto
                    {
                        Id = dg.Grammar.Id,
                        Pattern = dg.Grammar.Pattern,
                        Meaning = dg.Grammar.Meaning,
                        ExampleSentence = dg.Grammar.ExampleSentence
                    }).ToList();
            }
            else
            {
                grammarList = levelConfig?.TargetGrammars?.Select(g => new ShadowingGrammarDto
                {
                    Id = g.Id,
                    Pattern = g.Pattern,
                    Meaning = g.Meaning,
                    ExampleSentence = g.ExampleSentence
                }).ToList() ?? new List<ShadowingGrammarDto>();
            }

            return new ShadowingDialogueDetailDto
            {
                Id = dialogue.Id,
                ScenarioId = dialogue.ScenarioId,
                ScenarioTitle = dialogue.Scenario?.Title ?? string.Empty,
                ScenarioDescription = dialogue.Scenario?.Description,
                ScenarioLevelDescription = levelConfig?.Description,
                Title = dialogue.Title,
                JLPTLevel = dialogue.JLPTLevel,
                SourceDescription = dialogue.SourceDescription,
                SpeakerRoleA_Name = dialogue.SpeakerRoleA_Name,
                SpeakerRoleB_Name = dialogue.SpeakerRoleB_Name,
                SpeakerRoles = roles,
                SpeakerRolesJson = dialogue.SpeakerRolesJson,
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
                        NativeAudioUrl = s.NativeAudioUrl,
                        AudioDurationMs = s.AudioDurationMs
                    })
                    .ToList(),
                TargetVocabularies = vocabList,
                TargetGrammars = grammarList
            };
        }

        private async Task<GeneratedShadowingDialogueDto?> TryGenerateDialogueWithAiClientAsync(
            string title,
            string desc,
            string level,
            List<string> roles,
            int sentenceCount,
            int vocabCount,
            int grammarCount,
            string? customInstructions,
            CancellationToken cancellationToken)
        {
            if (_aiClient == null) return null;

            var rolesDesc = string.Join(", ", roles.Select((r, idx) => $"Vai {(char)('A' + idx)}: {r}"));
            var customNotes = !string.IsNullOrWhiteSpace(customInstructions)
                ? $"\n- Chỉ dẫn bổ sung từ Admin: \"{customInstructions.Trim()}\""
                : string.Empty;

            var prompt = $@"Bạn là chuyên gia sư phạm tiếng Nhật chuẩn JLPT {level}.
Nhiệm vụ: Tạo một bài hội thoại Shadowing mẫu chất lượng cao dựa trên bối cảnh:
- Chủ đề: ""{title}""
- Bối cảnh chi tiết: ""{desc}""
- Trình độ JLPT: {level}
- Các vai đối thoại: {rolesDesc}
- Số lượng câu đối thoại: {sentenceCount} câu
- Số lượng từ vựng trọng tâm: {vocabCount} từ
- Số lượng ngữ pháp trọng tâm: {grammarCount} mẫu{customNotes}

Yêu cầu:
1. Các câu đối thoại luân phiên giữa các vai (A, B, C...).
2. Câu tiếng Nhật tự nhiên, chuẩn văn phong hội thoại Nhật Bản ở trình độ {level}.
3. Kèm Romaji chuẩn và bản dịch tiếng Việt mượt mà.
4. Trả về JSON thuần túy theo schema sau:
{{
  ""title"": ""Tiêu đề bài hội thoại Shadowing (tiếng Việt)"",
  ""contextDescription"": ""Mô tả ngắn gọn bối cảnh giao tiếp"",
  ""sentences"": [
    {{
      ""orderIndex"": 1,
      ""speakerRole"": ""A"",
      ""japaneseText"": ""Câu tiếng Nhật"",
      ""romajiText"": ""Romaji chuẩn"",
      ""vietnameseTranslation"": ""Bản dịch tiếng Việt""
    }}
  ],
  ""targetVocabularies"": [
    {{
      ""word"": ""Từ vựng (Kanji/Kana)"",
      ""reading"": ""Hiragana cách đọc"",
      ""meaning"": ""Nghĩa tiếng Việt""
    }}
  ],
  ""targetGrammars"": [
    {{
      ""pattern"": ""Mẫu ngữ pháp"",
      ""meaning"": ""Ý nghĩa"",
      ""exampleSentence"": ""Ví dụ ngắn""
    }}
  ]
}}";

            var aiRequest = AiRequest.CreateJson(null, prompt);
            var aiResponse = await _aiClient.GenerateAsync(aiRequest, cancellationToken);
            if (!aiResponse.IsSuccess || string.IsNullOrWhiteSpace(aiResponse.Content)) return null;

            var parsed = JsonSerializer.Deserialize<GeneratedShadowingDialogueDto>(aiResponse.Content, JsonOptions);
            if (parsed == null) return null;

            parsed.JLPTLevel = level;
            parsed.SpeakerRoles = roles;
            for (int i = 0; i < parsed.Sentences.Count; i++)
            {
                parsed.Sentences[i].OrderIndex = i + 1;
                var rawRole = parsed.Sentences[i].SpeakerRole?.Trim() ?? string.Empty;
                if (rawRole.Equals("B", StringComparison.OrdinalIgnoreCase) || (roles.Count > 1 && rawRole.Equals(roles[1], StringComparison.OrdinalIgnoreCase)))
                {
                    parsed.Sentences[i].SpeakerRole = "B";
                }
                else if (rawRole.Equals("A", StringComparison.OrdinalIgnoreCase) || (roles.Count > 0 && rawRole.Equals(roles[0], StringComparison.OrdinalIgnoreCase)))
                {
                    parsed.Sentences[i].SpeakerRole = "A";
                }
                else
                {
                    parsed.Sentences[i].SpeakerRole = ((char)('A' + (i % roles.Count))).ToString();
                }
            }

            return parsed;
        }

        private async Task<TranslateAssistResponse?> TryTranslateWithAiClientAsync(
            string text,
            bool isJa,
            string level,
            CancellationToken cancellationToken)
        {
            if (_aiClient == null) return null;

            var direction = isJa
                ? "Dịch câu tiếng Nhật sau sang tiếng Việt tự nhiên và cung cấp phiên âm Romaji."
                : $"Dịch câu tiếng Việt sau sang tiếng Nhật tự nhiên chuẩn JLPT {level} và cung cấp phiên âm Romaji.";

            var prompt = $@"{direction}
Văn bản đầu vào: ""{text}""

Trả về duy nhất JSON thuần túy theo schema:
{{
  ""japaneseText"": ""Câu tiếng Nhật"",
  ""romajiText"": ""Romaji tương ứng"",
  ""vietnameseTranslation"": ""Bản dịch tiếng Việt""
}}";

            var aiRequest = AiRequest.CreateJson(null, prompt, temperature: 0.3);
            var aiResponse = await _aiClient.GenerateAsync(aiRequest, cancellationToken);
            if (!aiResponse.IsSuccess || string.IsNullOrWhiteSpace(aiResponse.Content)) return null;

            return JsonSerializer.Deserialize<TranslateAssistResponse>(aiResponse.Content, JsonOptions);
        }

        private static GeneratedShadowingDialogueDto GenerateHeuristicDialogue(
            string title,
            string desc,
            string level,
            List<string> roles,
            int sentenceCount,
            int vocabCount,
            int grammarCount)
        {
            bool isFood = title.Contains("Ramen", StringComparison.OrdinalIgnoreCase) ||
                          title.Contains("ăn", StringComparison.OrdinalIgnoreCase) ||
                          title.Contains("quán", StringComparison.OrdinalIgnoreCase);

            var result = new GeneratedShadowingDialogueDto
            {
                Title = $"{title} - Luyện Shadowing ({level})",
                JLPTLevel = level,
                ContextDescription = string.IsNullOrWhiteSpace(desc) ? $"Tình huống giao tiếp về {title}" : desc,
                SpeakerRoles = roles
            };

            var sentences = new List<CreateShadowingSentenceDto>();
            if (isFood)
            {
                sentences.Add(new CreateShadowingSentenceDto
                {
                    OrderIndex = 1,
                    SpeakerRole = "A",
                    JapaneseText = "いらっしゃいませ。何名様でしょうか。",
                    RomajiText = "Irasshaimase. Nan-mei-sama deshō ka.",
                    VietnameseTranslation = "Kính chào quý khách. Quý khách đi mấy người ạ?",
                    NativeAudioUrl = null
                });
                sentences.Add(new CreateShadowingSentenceDto
                {
                    OrderIndex = 2,
                    SpeakerRole = "B",
                    JapaneseText = "一人です。カウンター席は空いていますか。",
                    RomajiText = "Hitori desu. Kauntā-seki wa aite imasu ka.",
                    VietnameseTranslation = "Một người ạ. Ghế quầy bar còn trống không bạn?",
                    NativeAudioUrl = null
                });
                sentences.Add(new CreateShadowingSentenceDto
                {
                    OrderIndex = 3,
                    SpeakerRole = "A",
                    JapaneseText = "はい、こちらへどうぞ。ご注文が決まりましたらお呼びください。",
                    RomajiText = "Hai, kochira e dōzo. Go-chūmon ga kimarimashitara oyobi kudasai.",
                    VietnameseTranslation = "Vâng, xin mời lối này. Khi nào chọn món xong quý khách vui lòng gọi nhé.",
                    NativeAudioUrl = null
                });
                sentences.Add(new CreateShadowingSentenceDto
                {
                    OrderIndex = 4,
                    SpeakerRole = "B",
                    JapaneseText = "すみません、おすすめのラーメンをひとつお願いします。",
                    RomajiText = "Sumimasen, osusume no rāmen o hitotsu onegai shimasu.",
                    VietnameseTranslation = "Xin lỗi, cho tôi xin một tô mì ramen đặc biệt của quán nhé.",
                    NativeAudioUrl = null
                });
            }
            else
            {
                sentences.Add(new CreateShadowingSentenceDto
                {
                    OrderIndex = 1,
                    SpeakerRole = "A",
                    JapaneseText = "こんにちは、今日はお時間いただきありがとうございます。",
                    RomajiText = "Konnichiwa, kyō wa o-jikan itadaki arigatō gozaimasu.",
                    VietnameseTranslation = "Xin chào, cảm ơn bạn hôm nay đã dành thời gian.",
                    NativeAudioUrl = null
                });
                sentences.Add(new CreateShadowingSentenceDto
                {
                    OrderIndex = 2,
                    SpeakerRole = "B",
                    JapaneseText = "こちらこそ、よろしくお願いいたします。",
                    RomajiText = "Kochira koso, yoroshiku onegai itashimasu.",
                    VietnameseTranslation = "Chính tôi mới là người cần sự giúp đỡ từ bạn ạ.",
                    NativeAudioUrl = null
                });
                sentences.Add(new CreateShadowingSentenceDto
                {
                    OrderIndex = 3,
                    SpeakerRole = "A",
                    JapaneseText = "まずは最近の状況について教えていただけますか。",
                    RomajiText = "Mazu wa saikin no jōkyō ni tsuite oshiete itadakemasu ka.",
                    VietnameseTranslation = "Trước tiên bạn có thể chia sẻ về tình hình dạo gần đây không?",
                    NativeAudioUrl = null
                });
                sentences.Add(new CreateShadowingSentenceDto
                {
                    OrderIndex = 4,
                    SpeakerRole = "B",
                    JapaneseText = "はい、準備は順調に進んでおります。",
                    RomajiText = "Hai, junbi wa junchō ni susunde orimasu.",
                    VietnameseTranslation = "Vâng, mọi sự chuẩn bị đang diễn ra rất thuận lợi ạ.",
                    NativeAudioUrl = null
                });
            }

            while (sentences.Count < sentenceCount)
            {
                int nextIdx = sentences.Count + 1;
                char roleChar = (char)('A' + ((nextIdx - 1) % roles.Count));
                sentences.Add(new CreateShadowingSentenceDto
                {
                    OrderIndex = nextIdx,
                    SpeakerRole = roleChar.ToString(),
                    JapaneseText = $"了解いたしました。ステップ{nextIdx}を確認します。",
                    RomajiText = $"Ryōkai itashimashita. Suteppu {nextIdx} o kakunin shimasu.",
                    VietnameseTranslation = $"Tôi đã hiểu rõ. Xin xác nhận bước thứ {nextIdx}.",
                    NativeAudioUrl = null
                });
            }

            result.Sentences = sentences.Take(sentenceCount).ToList();

            result.TargetVocabularies = new List<CreateShadowingVocabularyDto>
            {
                new() { Word = "おすすめ", Reading = "おすすめ", Meaning = "Món gợi ý / Khuyên dùng" },
                new() { Word = "注文", Reading = "ちゅうもん", Meaning = "Gọi món / Đặt hàng" },
                new() { Word = "確認", Reading = "かくにん", Meaning = "Xác nhận / Kiểm tra" }
            }.Take(vocabCount).ToList();

            result.TargetGrammars = new List<CreateShadowingGrammarDto>
            {
                new() { Pattern = "～をお願いします", Meaning = "Xin vui lòng cho tôi...", ExampleSentence = "お水をひとつお願いします。" },
                new() { Pattern = "～ていただけますか", Meaning = "Có thể làm... giúp tôi được không?", ExampleSentence = "教えていただけますか。" }
            }.Take(grammarCount).ToList();

            return result;
        }

        private static TranslateAssistResponse GenerateHeuristicTranslation(string text, bool isJa)
        {
            if (isJa)
            {
                return new TranslateAssistResponse
                {
                    JapaneseText = text,
                    RomajiText = text,
                    VietnameseTranslation = "Bản dịch nghĩa sơ bộ cho câu: " + text
                };
            }
            else
            {
                return new TranslateAssistResponse
                {
                    JapaneseText = "どうぞよろしくお願いします。",
                    RomajiText = "Dōzo yoroshiku onegai shimasu.",
                    VietnameseTranslation = text
                };
            }
        }

        private async Task AttachSharedVocabulariesAsync(int dialogueId, string jlptLevel, List<CreateShadowingVocabularyDto>? vocabDtos)
        {
            if (vocabDtos == null || !vocabDtos.Any()) return;

            int order = 1;
            foreach (var v in vocabDtos)
            {
                var word = v.Word?.Trim() ?? string.Empty;
                var meaning = v.Meaning?.Trim() ?? string.Empty;
                var reading = v.Reading?.Trim();
                if (string.IsNullOrWhiteSpace(word) || string.IsNullOrWhiteSpace(meaning)) continue;

                Vocabulary? vocab = null;
                if (v.Id.HasValue && v.Id.Value > 0)
                {
                    vocab = await _context.Vocabularies.FindAsync(v.Id.Value);
                }

                if (vocab == null)
                {
                    vocab = await _context.Vocabularies.FirstOrDefaultAsync(item => item.Word == word && item.Meaning == meaning);
                }

                if (vocab == null)
                {
                    vocab = new Vocabulary
                    {
                        Word = word,
                        Reading = reading,
                        Meaning = meaning,
                        JLPTLevel = jlptLevel
                    };
                    _context.Vocabularies.Add(vocab);
                    await _context.SaveChangesAsync();
                }

                _context.ShadowingDialogueVocabularies.Add(new ShadowingDialogueVocabulary
                {
                    ShadowingDialogueId = dialogueId,
                    VocabularyId = vocab.Id,
                    OrderIndex = order++
                });
            }
        }

        private async Task AttachSharedGrammarsAsync(int dialogueId, string jlptLevel, List<CreateShadowingGrammarDto>? grammarDtos)
        {
            if (grammarDtos == null || !grammarDtos.Any()) return;

            int order = 1;
            foreach (var g in grammarDtos)
            {
                var pattern = g.Pattern?.Trim() ?? string.Empty;
                var meaning = g.Meaning?.Trim() ?? string.Empty;
                var example = g.ExampleSentence?.Trim();
                if (string.IsNullOrWhiteSpace(pattern) || string.IsNullOrWhiteSpace(meaning)) continue;

                Grammar? grammar = null;
                if (g.Id.HasValue && g.Id.Value > 0)
                {
                    grammar = await _context.Grammars.FindAsync(g.Id.Value);
                }

                if (grammar == null)
                {
                    grammar = await _context.Grammars.FirstOrDefaultAsync(item => item.Pattern == pattern && item.Meaning == meaning);
                }

                if (grammar == null)
                {
                    grammar = new Grammar
                    {
                        Pattern = pattern,
                        Meaning = meaning,
                        ExampleSentence = example,
                        JLPTLevel = jlptLevel
                    };
                    _context.Grammars.Add(grammar);
                    await _context.SaveChangesAsync();
                }

                _context.ShadowingDialogueGrammars.Add(new ShadowingDialogueGrammar
                {
                    ShadowingDialogueId = dialogueId,
                    GrammarId = grammar.Id,
                    OrderIndex = order++
                });
            }
        }

        public async Task<ApiResponse<List<ShadowingVocabularyDto>>> GetSharedVocabulariesAsync(string? keyword = null, string? jlptLevel = null)
        {
            var query = _context.Vocabularies.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(keyword))
            {
                var kw = keyword.Trim();
                query = query.Where(v => v.Word.Contains(kw) || v.Meaning.Contains(kw) || (v.Reading != null && v.Reading.Contains(kw)));
            }

            if (!string.IsNullOrWhiteSpace(jlptLevel) && !jlptLevel.Equals("ALL", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(v => v.JLPTLevel == jlptLevel.Trim().ToUpper());
            }

            var items = await query
                .OrderBy(v => v.Word)
                .Take(50)
                .Select(v => new ShadowingVocabularyDto
                {
                    Id = v.Id,
                    Word = v.Word,
                    Reading = v.Reading,
                    Meaning = v.Meaning,
                    JLPTLevel = v.JLPTLevel
                })
                .ToListAsync();

            return ApiResponse<List<ShadowingVocabularyDto>>.Ok(items, "Lấy danh sách từ vựng dùng chung thành công.");
        }

        public async Task<ApiResponse<List<ShadowingGrammarDto>>> GetSharedGrammarsAsync(string? keyword = null, string? jlptLevel = null)
        {
            var query = _context.Grammars.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(keyword))
            {
                var kw = keyword.Trim();
                query = query.Where(g => g.Pattern.Contains(kw) || g.Meaning.Contains(kw));
            }

            if (!string.IsNullOrWhiteSpace(jlptLevel) && !jlptLevel.Equals("ALL", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(g => g.JLPTLevel == jlptLevel.Trim().ToUpper());
            }

            var items = await query
                .OrderBy(g => g.Pattern)
                .Take(50)
                .Select(g => new ShadowingGrammarDto
                {
                    Id = g.Id,
                    Pattern = g.Pattern,
                    Meaning = g.Meaning,
                    ExampleSentence = g.ExampleSentence,
                    JLPTLevel = g.JLPTLevel
                })
                .ToListAsync();

            return ApiResponse<List<ShadowingGrammarDto>>.Ok(items, "Lấy danh sách ngữ pháp dùng chung thành công.");
        }
    }
}
