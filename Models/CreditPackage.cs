namespace JCAP.Models
{
    public class CreditPackage
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public int Credits { get; set; }
        public decimal Price { get; set; }       // VND
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; }
    }

}
