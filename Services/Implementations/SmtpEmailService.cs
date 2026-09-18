using JCAP.Models;
using JCAP.Services.Interfaces;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace JCAP.Services.Implementations
{
    public sealed class SmtpEmailService : IEmailService
    {
        private readonly EmailOptions _options;
        private readonly ILogger<SmtpEmailService> _logger;

        public SmtpEmailService(
            IOptions<EmailOptions> options,
            ILogger<SmtpEmailService> logger)
        {
            _options = options.Value;
            _logger = logger;
        }

        public async Task SendAsync(
            string recipientEmail,
            string subject,
            string htmlBody,
            CancellationToken cancellationToken = default)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(recipientEmail);
            ArgumentException.ThrowIfNullOrWhiteSpace(subject);
            ArgumentNullException.ThrowIfNull(htmlBody);

            ValidateConfiguration();

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(_options.DisplayName, _options.From));
            message.To.Add(MailboxAddress.Parse(recipientEmail));
            message.Subject = subject;
            message.Body = new BodyBuilder
            {
                HtmlBody = htmlBody
            }.ToMessageBody();

            using var client = new SmtpClient();
            var isConnected = false;

            try
            {
                await client.ConnectAsync(
                    _options.Host,
                    _options.Port,
                    _options.EnableSsl ? SecureSocketOptions.StartTls : SecureSocketOptions.None,
                    cancellationToken);
                isConnected = true;

                if (!string.IsNullOrWhiteSpace(_options.Username))
                {
                    await client.AuthenticateAsync(
                        _options.Username,
                        _options.Password,
                        cancellationToken);
                }

                await client.SendAsync(message, cancellationToken);

                _logger.LogInformation(
                    "Email sent successfully to {RecipientEmail} with subject {Subject}.",
                    recipientEmail,
                    subject);
            }
            catch (Exception exception)
            {
                _logger.LogError(
                    exception,
                    "Failed to send email to {RecipientEmail} with subject {Subject}.",
                    recipientEmail,
                    subject);
                throw;
            }
            finally
            {
                if (isConnected)
                {
                    await client.DisconnectAsync(true, cancellationToken);
                }
            }
        }

        private void ValidateConfiguration()
        {
            if (string.IsNullOrWhiteSpace(_options.Host))
            {
                throw new InvalidOperationException("Email:Host is not configured.");
            }

            if (_options.Port <= 0 || _options.Port > 65535)
            {
                throw new InvalidOperationException("Email:Port must be between 1 and 65535.");
            }

            if (string.IsNullOrWhiteSpace(_options.From))
            {
                throw new InvalidOperationException("Email:From is not configured.");
            }
        }
    }
}
