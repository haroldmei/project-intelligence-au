export function WelcomeAfterVerifyTemplate(props: {
  firstName: string;
  lgaSetupUrl: string;
}): { subject: string; html: string } {
  const { firstName, lgaSetupUrl } = props;

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
          <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #1E3A5F;">Welcome, ${firstName}!</h2>

          <p style="margin: 0 0 12px 0; font-size: 16px; line-height: 1.5; color: #334E68;">
            Your email is verified. You're one step away from your first Sunday digest.
          </p>

          <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #334E68;">
            Tell us which Sydney LGAs you work in, and we'll start scanning for re-roof leads this Sunday at 6 pm AEST.
          </p>

          <!-- CTA Button -->
          <table style="margin: 24px 0;">
            <tbody>
              <tr>
                <td>
                  <a href="${lgaSetupUrl}" style="display: inline-block; padding: 12px 24px; background-color: #D97706; color: #FFFFFF; border-radius: 6px; font-weight: 600; font-size: 16px; text-decoration: none; line-height: 24px;">
                    Set Your Service Area
                  </a>
                </td>
              </tr>
            </tbody>
          </table>

          <p style="margin: 16px 0 0 0; font-size: 14px; color: #829AB1;">
            You can change your service area anytime from your account settings.
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
    subject: "Complete your setup: choose your service area",
    html,
  };
}
