using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace JCAP.Models
{
    /// <summary>
    /// Lưu trữ ký ức và mức độ thân thiết của người học với từng Persona NPC (Persona Memory Capsule)
    /// </summary>
    public class UserNpcRelationship
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string UserId { get; set; } = null!;

        [ForeignKey(nameof(UserId))]
        public virtual ApplicationUser? User { get; set; }

        /// <summary>
        /// Tên hoặc mã nhân vật AI (VD: "Tanaka_RamenMaster", "Aoi_ConvenienceClerk", "Kenji_Colleague")
        /// </summary>
        [Required]
        [MaxLength(100)]
        public string NpcCode { get; set; } = null!;

        /// <summary>
        /// Mức độ thân thiết (0-100)
        /// </summary>
        public int AffinityScore { get; set; } = 10;

        /// <summary>
        /// Tổng số phiên hội thoại đã thực hiện với NPC này
        /// </summary>
        public int CompletedSessionsCount { get; set; } = 0;

        /// <summary>
        /// Chuỗi JSON nén cực ngắn chứa các sự kiện/thông tin đáng nhớ đã trao đổi (Memory Capsule < 100 bytes)
        /// Ví dụ: ["likes:shoyu_ramen", "weakness:wa_ga", "job:developer"]
        /// </summary>
        public string MemoryCapsuleJson { get; set; } = "[]";

        public DateTime LastInteractedUtc { get; set; } = DateTime.UtcNow;
    }
}
