import { PRICE_AMOUNT, GST_SUFFIX } from "@/lib/pricing";

// Dunning email sent on invoice.payment_failed (FR-018, FR-030). The renewal
// charge on the card on file bounced, so the account is now past_due — the
// user has to update their card or the Sunday digest stops. Transactional
// (service-critical), so no unsubscribe link: this isn't a marketing send and
// suppressing it would leave the user silently churned.
export function PaymentFailedTemplate(props: {
  manageBillingUrl: string;
}): { subject: string; html: string } {
  const { manageBillingUrl } = props;

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
          <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #1E3A5F;">We couldn't charge your card</h2>

          <p style="margin: 0 0 12px 0; font-size: 16px; line-height: 1.5; color: #334E68;">
            Your ProjectIntelligence renewal payment of ${PRICE_AMOUNT} (${GST_SUFFIX}) didn't go through — usually an expired card, a spending limit, or your bank blocking the charge.
          </p>

          <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #334E68;">
            Update your card in the next few days to keep the Sunday digest landing. We'll retry automatically once your details are current — no need to re-subscribe.
          </p>

          <table style="margin: 24px 0;">
            <tbody>
              <tr>
                <td>
                  <a href="${manageBillingUrl}" style="display: inline-block; padding: 12px 24px; background-color: #D97706; color: #FFFFFF; border-radius: 6px; font-weight: 600; font-size: 16px; text-decoration: none; line-height: 24px;">
                    Update your card
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
          <p style="margin: 0;">You're receiving this because your ProjectIntelligence subscription payment failed.</p>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

  return {
    subject: "Action needed: your ProjectIntelligence payment failed",
    html,
  };
}
