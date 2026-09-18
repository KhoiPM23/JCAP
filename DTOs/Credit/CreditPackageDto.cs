namespace JCAP.DTOs.Credit
{
    public class CreditPackageDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public int Credits { get; set; }
        public decimal Price { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
