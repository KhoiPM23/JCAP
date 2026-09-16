namespace JCAP.Models
{
    public sealed class EmailOptions
    {
        public const string SectionName = "Email";

        public string Host { get; set; } = string.Empty;

        public int Port { get; set; } = 25;

        public string Username { get; set; } = string.Empty;

        public string Password { get; set; } = string.Empty;

        public string From { get; set; } = string.Empty;

        public string DisplayName { get; set; } = string.Empty;

        public bool EnableSsl { get; set; }
    }
}
