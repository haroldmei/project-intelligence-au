export function VerifyEmailTemplate(props: { email: string; code: string }): { subject: string; html: string } {
  const { email, code } = props;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background-color: #FAFAFA;">
  <table style="width: 100%; max-width: 600px; margin: 0 auto;">
    <tbody>
      <!-- Header -->
      <tr>
        <td style="padding: 24px 16px; background-color: #FFFFFF; border-bottom: 1px solid #E5E5E5;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #1E3A5F;">ProjectIntelligence</h1>
        </td>
      </tr>

      <!-- Content -->
      <tr>
        <td style="padding: 32px 16px; background-color: #FFFFFF;">
          <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #1E3A5F;">Verify your email</h2>
          <p style="margin: 0 0 12px 0; font-size: 16px; line-height: 1.5; color: #334E68;">We sent a 6-digit code to <strong>${email}</strong>.</p>
          <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #334E68;">Code expires in 10 minutes.</p>

          <!-- Code display (plain text, easy to copy) -->
          <div style="margin: 24px 0; padding: 16px; background-color: #F0F4F8; border-left: 4px solid #D97706; font-family: monospace; font-size: 24px; font-weight: 600; color: #1E3A5F; letter-spacing: 4px;">
            ${code}
          </div>

          <p style="margin: 24px 0 0 0; font-size: 14px; color: #627D98;">
            Enter this code in your browser to verify your email address.
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding: 24px 16px; background-color: #F0F4F8; border-top: 1px solid #E5E5E5; font-size: 12px; color: #627D98;">
          <p style="margin: 0 0 8px 0;">ProjectIntelligence AU Pty Ltd</p>
          <p style="margin: 0;">Level 1, 123 Business Street, Sydney NSW 2000 AU</p>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

  return {
    subject: "Verify your ProjectIntelligence email",
    html,
  };
}
