// FR-016 verification reminder (issue #130). Sent once to an unverified account
// before the Thursday preceding its first expected Sunday digest, because an
// unverified account gets no digest at all. Links to /login, where an
// unverified user is routed to the OTP screen and can request a fresh code.
export function VerificationReminderTemplate(props: {
  verifyUrl: string;
  unsubscribeUrl?: string;
}): { subject: string; html: string } {
  const { verifyUrl, unsubscribeUrl } = props;
  // Spam Act 2003: functional no-login unsubscribe on every commercial email.
  const unsubHref = unsubscribeUrl ?? "/account";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background-color: #FAFAFA;">
  <table style="width: 100%; max-width: 600px; margin: 0 auto;">
    <tbody>
      <tr>
        <td style="padding: 24px 16px; background-color: #FFFFFF; border-bottom: 1px solid #E5E5E5;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #1E3A5F;">ProjectIntelligence</h1>
        </td>
      </tr>

      <tr>
        <td style="padding: 32px 16px; background-color: #FFFFFF;">
          <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #1E3A5F;">Verify your email to start your Sunday digest</h2>

          <p style="margin: 0 0 12px 0; font-size: 16px; line-height: 1.5; color: #334E68;">
            You signed up for the Sunday-night DA digest but haven't verified your email yet — so we can't send it. Your leads are waiting.
          </p>

          <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #334E68;">
            Log in and enter the 6-digit code we email you to switch on this Sunday's digest.
          </p>

          <table style="margin: 24px 0;">
            <tbody>
              <tr>
                <td>
                  <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #D97706; color: #FFFFFF; border-radius: 6px; font-weight: 600; font-size: 16px; text-decoration: none; line-height: 24px;">
                    Verify my email
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding: 24px 16px; background-color: #F0F4F8; border-top: 1px solid #E5E5E5; font-size: 12px; color: #627D98;">
          <p style="margin: 0 0 8px 0;">ProjectIntelligence AU Pty Ltd</p>
          <p style="margin: 0 0 8px 0;">Level 1, 123 Business Street, Sydney NSW 2000 AU</p>
          <p style="margin: 0;">
            <a href="${unsubHref}" style="color: #1E3A5F; text-decoration: underline;">Unsubscribe from these emails</a>
          </p>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

  return {
    subject: "Verify your email to start your Sunday digest",
    html,
  };
}
