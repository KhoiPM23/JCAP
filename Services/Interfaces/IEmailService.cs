namespace JCAP.Services.Interfaces
{
    public interface IEmailService
    {
        Task SendAsync(
            string recipientEmail,
            string subject,
            string htmlBody,
            CancellationToken cancellationToken = default);
    }
}
