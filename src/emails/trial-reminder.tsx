import { PRICING, PRICE_AMOUNT, GST_SUFFIX } from "@/lib/pricing";

export function TrialReminderTemplate(props: {
  daysLeft: number;
  manageBillingUrl: string;
  unsubscribeUrl?: string;
}): { subject: string; html: string } {
  const { daysLeft, manageBillingUrl, unsubscribeUrl } = props;
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
          <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #1E3A5F;">Your trial ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}</h2>

          <p style="margin: 0 0 12px 0; font-size: 16px; line-height: 1.5; color: #334E68;">
            Your ${PRICING.trialDays}-day ProjectIntelligence trial ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}. After that, your card on file will be charged ${PRICE_AMOUNT} (${GST_SUFFIX}) so the Sunday digest keeps landing.
          </p>

          <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #334E68;">
            Not feeling it? You can cancel any time from billing settings — you'll keep access through the rest of the trial, no charge.
          </p>

          <table style="margin: 24px 0;">
            <tbody>
              <tr>
                <td>
                  <a href="${manageBillingUrl}" style="display: inline-block; padding: 12px 24px; background-color: #D97706; color: #FFFFFF; border-radius: 6px; font-weight: 600; font-size: 16px; text-decoration: none; line-height: 24px;">
                    Manage billing
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
    subject: `Your ProjectIntelligence trial ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`,
    html,
  };
}
