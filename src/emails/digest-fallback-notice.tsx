export function DigestFallbackNoticeTemplate(props: {
  lgas: string[];
  daCount: number;
}): { subject: string; html: string } {
  const { lgas, daCount } = props;

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
          <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #D97706;">This week's digest is keyword-only</h2>

          <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.5; color: #334E68;">
            We found ${daCount} development applications in ${lgas.join(" + ")} this week, but our AI ranking temporarily degraded to keyword-only mode to manage costs.
          </p>

          <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.5; color: #334E68;">
            To see your curated digest, log in to your account:
          </p>

          <table style="margin: 24px 0;">
            <tbody>
              <tr>
                <td>
                  <a href="https://pi-au.example.com/portal/digest" style="display: inline-block; padding: 12px 24px; background-color: #1E3A5F; color: #FFFFFF; border-radius: 6px; font-weight: 600; font-size: 16px; text-decoration: none; line-height: 24px;">
                    View Digest in Portal
                  </a>
                </td>
              </tr>
            </tbody>
          </table>

          <p style="margin: 16px 0 0 0; font-size: 14px; color: #829AB1;">
            This is a temporary limitation. We'll be back to personalized ranking next week.
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
    subject: "This week's digest — keyword-only mode",
    html,
  };
}
