using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace JCAP.Models
{
    /// <summary>
    /// Đánh giá độ thành thục của từng kỹ năng/ngữ pháp qua các buổi hội thoại theo thuật toán FSRS.
    /// </summary>
    public class LearnerSkillMastery
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string UserId { get; set; } = null!;

        [ForeignKey(nameof(UserId))]
        public virtual ApplicationUser? User { get; set; }

        /// <summary>
        /// Mã định danh kỹ năng (Ví dụ: "PARTICLE_NI_DE", "KEIGO_KENJOU", "DESU_MASU_CONSISTENCY", "TRANSITIVE_O")
        /// </summary>
        [Required]
        [MaxLength(100)]
        public string SkillCode { get; set; } = null!;

        [Required]
        [MaxLength(200)]
        public string SkillName { get; set; } = null!;

        /// <summary>
        /// Phân loại (Grammar, Vocabulary, Pronunciation, Pragmatics)
        /// </summary>
        [MaxLength(50)]
        public string Category { get; set; } = "Grammar";

        /// <summary>
        /// Điểm độ bền trí nhớ theo FSRS (FSRS Stability - số ngày có thể duy trì)
        /// </summary>
        public double Stability { get; set; } = 1.0;

        /// <summary>
        /// Độ khó tương đối theo FSRS (1.0 - 10.0)
        /// </summary>
        public double Difficulty { get; set; } = 5.0;

        /// <summary>
        /// Số lần đã gặp/luyện tập trong hội thoại
        /// </summary>
        public int Repetitions { get; set; } = 0;

        /// <summary>
        /// Số lần mắc lỗi tái phát (Lapses)
        /// </summary>
        public int Lapses { get; set; } = 0;

        public DateTime LastPracticedUtc { get; set; } = DateTime.UtcNow;
        public DateTime NextRecommendedReviewUtc { get; set; } = DateTime.UtcNow.AddDays(1);
    }
}
