using System.Net;

namespace JCAP.Services.Helpers
{
    public static class EmailTemplateHelper
    {
        /// <summary>
        /// Tạo nội dung HTML cho email xác minh tài khoản đăng ký mới.
        /// </summary>
        public static string BuildEmailConfirmationBody(string fullName, string confirmationUrl)
        {
            var encodedName = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(fullName) ? "bạn" : fullName);
            var encodedUrl = WebUtility.HtmlEncode(confirmationUrl);

            return $$"""
                <!DOCTYPE html>
                <html lang="vi">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Xác minh email tài khoản JCAP</title>
                </head>
                <body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1E293B;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 40px 15px;">
                        <tr>
                            <td align="center">
                                <table role="presentation" width="100%" style="max-width: 580px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #E2E8F0;">
                                    <!-- Header -->
                                    <tr>
                                        <td style="background-color: #071A44; padding: 28px 36px; text-align: center;">
                                            <h1 style="margin: 0; color: #FFFFFF; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">
                                                JCAP Platform
                                            </h1>
                                            <p style="margin: 6px 0 0 0; color: #94A3B8; font-size: 13px;">
                                                Luyện nói tiếng Nhật phản xạ cùng AI
                                            </p>
                                        </td>
                                    </tr>

                                    <!-- Body Content -->
                                    <tr>
                                        <td style="padding: 36px 36px 28px 36px;">
                                            <h2 style="margin: 0 0 16px 0; color: #0F172A; font-size: 20px; font-weight: 600;">
                                                Xác minh tài khoản của bạn
                                            </h2>
                                            <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                                                Xin chào <strong>{{encodedName}}</strong>,
                                            </p>
                                            <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                                                Cảm ơn bạn đã đăng ký tham gia nền tảng luyện nói tiếng Nhật JCAP. Để bắt đầu hành trình học tập và kích hoạt tài khoản của mình, vui lòng nhấn vào nút bên dưới để hoàn tất xác minh:
                                            </p>

                                            <!-- CTA Button -->
                                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                                                <tr>
                                                    <td align="center">
                                                        <a href="{{encodedUrl}}" target="_blank" style="display: inline-block; background-color: #0878EE; color: #FFFFFF; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 6px rgba(8, 120, 238, 0.35);">
                                                            Xác minh email ngay &rarr;
                                                        </a>
                                                    </td>
                                                </tr>
                                            </table>

                                            <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: #64748B;">
                                                <em>Lưu ý: Liên kết xác minh này có hiệu lực trong vòng 24 giờ.</em>
                                            </p>

                                            <!-- Fallback Link -->
                                            <div style="background-color: #F1F5F9; border-radius: 8px; padding: 14px; margin-top: 20px; word-break: break-all; font-size: 12px; color: #64748B; line-height: 1.5;">
                                                <p style="margin: 0 0 6px 0; font-weight: 600; color: #475569;">
                                                    Nếu nút trên không bấm được, bạn vui lòng copy và dán liên kết sau vào trình duyệt:
                                                </p>
                                                <a href="{{encodedUrl}}" target="_blank" style="color: #0878EE; text-decoration: underline;">
                                                    {{encodedUrl}}
                                                </a>
                                            </div>

                                            <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 28px 0 20px 0;" />

                                            <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #94A3B8;">
                                                Nếu bạn không thực hiện thao tác đăng ký tài khoản tại JCAP, vui lòng bỏ qua email này. Tài khoản sẽ không được kích hoạt nếu chưa xác nhận.
                                            </p>
                                        </td>
                                    </tr>

                                    <!-- Footer -->
                                    <tr>
                                        <td style="background-color: #F8FAFC; padding: 20px 36px; text-align: center; border-top: 1px solid #E2E8F0;">
                                            <p style="margin: 0; font-size: 12px; color: #94A3B8;">
                                                &copy; 2026 JCAP - Nền tảng luyện nói tiếng Nhật phản xạ cùng AI.
                                            </p>
                                            <p style="margin: 4px 0 0 0; font-size: 11px; color: #CBD5E1;">
                                                Đây là email gửi tự động, vui lòng không phản hồi thư này.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
                """;
        }

        /// <summary>
        /// Tạo nội dung HTML cho email yêu cầu đặt lại mật khẩu.
        /// </summary>
        public static string BuildPasswordResetBody(string fullName, string resetUrl)
        {
            var encodedName = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(fullName) ? "bạn" : fullName);
            var encodedUrl = WebUtility.HtmlEncode(resetUrl);

            return $$"""
                <!DOCTYPE html>
                <html lang="vi">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Đặt lại mật khẩu tài khoản JCAP</title>
                </head>
                <body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1E293B;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 40px 15px;">
                        <tr>
                            <td align="center">
                                <table role="presentation" width="100%" style="max-width: 580px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #E2E8F0;">
                                    <!-- Header -->
                                    <tr>
                                        <td style="background-color: #071A44; padding: 28px 36px; text-align: center;">
                                            <h1 style="margin: 0; color: #FFFFFF; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">
                                                JCAP Platform
                                            </h1>
                                            <p style="margin: 6px 0 0 0; color: #94A3B8; font-size: 13px;">
                                                Luyện nói tiếng Nhật phản xạ cùng AI
                                            </p>
                                        </td>
                                    </tr>

                                    <!-- Body Content -->
                                    <tr>
                                        <td style="padding: 36px 36px 28px 36px;">
                                            <h2 style="margin: 0 0 16px 0; color: #0F172A; font-size: 20px; font-weight: 600;">
                                                Yêu cầu đặt lại mật khẩu
                                            </h2>
                                            <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                                                Xin chào <strong>{{encodedName}}</strong>,
                                            </p>
                                            <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                                                Hệ thống JCAP đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Nhấn vào nút bên dưới để tiến hành tạo mật khẩu mới:
                                            </p>

                                            <!-- CTA Button -->
                                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                                                <tr>
                                                    <td align="center">
                                                        <a href="{{encodedUrl}}" target="_blank" style="display: inline-block; background-color: #DC2626; color: #FFFFFF; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 6px rgba(220, 38, 38, 0.35);">
                                                            Đặt lại mật khẩu &rarr;
                                                        </a>
                                                    </td>
                                                </tr>
                                            </table>

                                            <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: #64748B;">
                                                <em>Lưu ý: Liên kết đặt lại mật khẩu chỉ có hiệu lực một lần và sẽ hết hạn sau 24 giờ.</em>
                                            </p>

                                            <!-- Fallback Link -->
                                            <div style="background-color: #F1F5F9; border-radius: 8px; padding: 14px; margin-top: 20px; word-break: break-all; font-size: 12px; color: #64748B; line-height: 1.5;">
                                                <p style="margin: 0 0 6px 0; font-weight: 600; color: #475569;">
                                                    Nếu nút trên không bấm được, bạn vui lòng copy và dán liên kết sau vào trình duyệt:
                                                </p>
                                                <a href="{{encodedUrl}}" target="_blank" style="color: #0878EE; text-decoration: underline;">
                                                    {{encodedUrl}}
                                                </a>
                                            </div>

                                            <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 28px 0 20px 0;" />

                                            <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #94A3B8;">
                                                Nếu bạn không gửi yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này. Mật khẩu hiện tại của bạn vẫn được bảo vệ an toàn.
                                            </p>
                                        </td>
                                    </tr>

                                    <!-- Footer -->
                                    <tr>
                                        <td style="background-color: #F8FAFC; padding: 20px 36px; text-align: center; border-top: 1px solid #E2E8F0;">
                                            <p style="margin: 0; font-size: 12px; color: #94A3B8;">
                                                &copy; 2026 JCAP - Nền tảng luyện nói tiếng Nhật phản xạ cùng AI.
                                            </p>
                                            <p style="margin: 4px 0 0 0; font-size: 11px; color: #CBD5E1;">
                                                Đây là email gửi tự động, vui lòng không phản hồi thư này.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
                """;
        }
    }
}
