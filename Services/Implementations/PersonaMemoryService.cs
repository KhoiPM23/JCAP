using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using JCAP.Data;
using JCAP.Models;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations
{
    public class PersonaMemoryService : IPersonaMemoryService
    {
        private readonly AppDbContext _context;

        public PersonaMemoryService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<string> GetCompactMemoryDirectiveAsync(string userId, string npcCode)
        {
            if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(npcCode))
                return string.Empty;

            var rel = await _context.UserNpcRelationships
                .FirstOrDefaultAsync(r => r.UserId == userId && r.NpcCode == npcCode);

            if (rel == null || rel.CompletedSessionsCount == 0)
            {
                return "[MEM: first_meeting=true, affinity=10. Hãy chào đón như người mới lần đầu ghé thăm]";
            }

            // Giải mã capsule JSON
            List<string> facts;
            try
            {
                facts = JsonSerializer.Deserialize<List<string>>(rel.MemoryCapsuleJson) ?? new List<string>();
            }
            catch
            {
                facts = new List<string>();
            }

            string factsSummary = facts.Count > 0 ? string.Join(", ", facts) : "none";
            return $"[MEM: visits={rel.CompletedSessionsCount}, affinity={rel.AffinityScore}, facts=[{factsSummary}]. Hãy tỏ thái độ thân thiện như người quen thân thiết, nhắc nhẹ lại sở thích nếu có cơ hội]";
        }

        public async Task RecordSessionAffinityAsync(string userId, string npcCode, bool completedSuccessfully, string? memorizedFact = null)
        {
            if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(npcCode))
                return;

            var rel = await _context.UserNpcRelationships
                .FirstOrDefaultAsync(r => r.UserId == userId && r.NpcCode == npcCode);

            if (rel == null)
            {
                rel = new UserNpcRelationship
                {
                    UserId = userId,
                    NpcCode = npcCode,
                    AffinityScore = 10,
                    CompletedSessionsCount = 0,
                    MemoryCapsuleJson = "[]",
                    LastInteractedUtc = DateTime.UtcNow
                };
                _context.UserNpcRelationships.Add(rel);
            }

            rel.LastInteractedUtc = DateTime.UtcNow;

            if (completedSuccessfully)
            {
                rel.CompletedSessionsCount += 1;
                rel.AffinityScore = Math.Min(100, rel.AffinityScore + 10);
            }

            if (!string.IsNullOrWhiteSpace(memorizedFact))
            {
                List<string> facts;
                try
                {
                    facts = JsonSerializer.Deserialize<List<string>>(rel.MemoryCapsuleJson) ?? new List<string>();
                }
                catch
                {
                    facts = new List<string>();
                }

                if (!facts.Contains(memorizedFact) && facts.Count < 5)
                {
                    facts.Add(memorizedFact);
                    rel.MemoryCapsuleJson = JsonSerializer.Serialize(facts);
                }
            }

            await _context.SaveChangesAsync();
        }

        public async Task<string?> GetAdaptiveCircadianGreetingAsync(string userId, string npcCode)
        {
            var rel = await _context.UserNpcRelationships
                .FirstOrDefaultAsync(r => r.UserId == userId && r.NpcCode == npcCode);

            if (rel == null || rel.CompletedSessionsCount == 0)
                return null; // Dùng câu chào mặc định của kịch bản

            // Tính giờ VN (UTC+7)
            int hour = DateTime.UtcNow.AddHours(7).Hour;

            if (rel.CompletedSessionsCount >= 3)
            {
                if (hour >= 5 && hour < 11)
                    return "おはようございます！また来てくださって嬉しいです。今日もよろしくお願いしますね。";
                if (hour >= 11 && hour < 18)
                    return "こんにちは！お疲れ様です。今日も一緒に練習しましょう！";
                return "こんばんは！今日もお疲れ様でした。夜の練習も頑張りましょう！";
            }

            return null;
        }
    }
}
