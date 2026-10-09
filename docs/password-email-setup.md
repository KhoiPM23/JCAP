# Password flows and SMTP setup

## Google accounts (issue 62)

- `GET /api/auth/me` returns `hasPassword` from Identity.
- The account security page loads this state before showing the form.
- A verified Google account without a JCAP password sees **Tạo mật khẩu JCAP** and submits a new password and confirmation.
- `POST /api/auth/change-password` checks the authenticated user's actual password state. It calls `AddPasswordAsync` only for a verified, Google-linked, passwordless account; existing passwords require the current password and `ChangePasswordAsync`.
- Creating a JCAP password preserves the Google login. Email/password and Google login both remain available.
- Forgot/reset password continues to use an emailed Identity reset token, including for Google accounts without a password. A successful reset invalidates reuse of that token.
- No database migration is needed; the password hash and external login are existing Identity fields.

## Send real email

Merge the following fields into the existing `appsettings.Local.json` at the backend root. Keep other settings in that file. It is ignored by Git. The property names must be under `Email`.

```json
{
  "FrontendUrl": "http://localhost:5173",
  "BackendUrl": "http://localhost:5254",
  "Email": {
    "Host": "smtp.gmail.com",
    "Port": 587,
    "EnableSsl": true,
    "Username": "YOUR_SENDER_EMAIL",
    "Password": "YOUR_SMTP_CREDENTIAL",
    "From": "YOUR_SENDER_EMAIL",
    "DisplayName": "JCAP"
  }
}
```

Use the SMTP credential required by the chosen mail provider. Port 587 uses STARTTLS; port 465 uses TLS on connection when `EnableSsl` is true. Credentials require TLS. Certificate validation remains enabled. The sender must be authorized by the mail provider.

Restart the backend after changing local settings. Set `FrontendUrl` and `BackendUrl` to reachable HTTPS application URLs for a deployed environment; do not send localhost links to remote testers. The existing development defaults (`localhost:2525`, no credentials/TLS) remain suitable for smtp4dev when no real SMTP settings override them.

## Manual checks

1. Log in with a fresh Google account. Open Profile → account security; only new password and confirmation should be required.
2. Set a valid password. The form should switch to requiring the current password.
3. Log out, then sign in with the same email and the new password. Google sign-in should still work.
4. Request a password reset for that address, open the newest email and follow its full link. Reset the password, then sign in with the replacement.
5. Repeat step 4 for a Google account that has never set a password.
6. Wrong/expired/used reset tokens, wrong current passwords and mismatched confirmation must fail. Accounts with an existing password must not bypass the current-password check by omitting the field.

The public forgot-password response is deliberately identical for unknown addresses and mail delivery failures. Inspect the backend email error log when troubleshooting; never log credentials or reset tokens.
