interface DACard {
  id: string;
  address: string;
  lga: string;
  value?: string;
  why: string;
  scope: string;
  applicant: string;
  relevanceScore: number; // 0-10
  portalUrl: string;
  thumbUpUrl: string;
  thumbDownUrl: string;
}

export function WeeklyDigestTemplate(props: {
  weekStart: string;
  leadCount: number;
  lgas: string[];
  cards: DACard[];
  precisionBadge?: { precision: number; weeks: number };
  smsEnabled: boolean;
}): { subject: string; html: string } {
  const { weekStart, leadCount, lgas, cards, precisionBadge, smsEnabled } = props;

  // Relevance pip: 1-5 dots filled left-to-right, mapped from 0-10 score
  const getPips = (score: number): string => {
    const pips = Math.min(5, Math.max(1, Math.round((score / 10) * 5)));
    return Array(5)
      .fill(0)
      .map((_, i) => (i < pips ? "●" : "○"))
      .join("");
  };

  const cardHtml = cards
    .map(
      (card) => `
  <tr>
    <td style="padding: 0;">
      <table style="width: 100%; border: 1px solid #E5E5E5; border-radius: 6px; overflow: hidden;">
        <tbody>
          <!-- Card header: LGA + relevance pips -->
          <tr>
            <td style="padding: 12px 16px; background-color: #FFFFFF; border-bottom: 1px solid #E5E5E5;">
              <table style="width: 100%;">
                <tr>
                  <td style="font-size: 12px; color: #627D98;">
                    <span style="display: inline-block; padding: 4px 8px; background-color: #FEF3C7; color: #78350F; border-radius: 4px; font-weight: 500;">${card.lga}</span>
                  </td>
                  <td style="text-align: right; font-size: 12px; color: #627D98; letter-spacing: 2px;">${getPips(card.relevanceScore)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Address (text-lg weight) -->
          <tr>
            <td style="padding: 16px; background-color: #FFFFFF; border-bottom: 1px solid #F0F4F8;">
              <p style="margin: 0; font-size: 18px; font-weight: 500; color: #1E3A5F; line-height: 1.4;">${card.address}</p>
            </td>
          </tr>

          <!-- Value -->
          ${
            card.value
              ? `
          <tr>
            <td style="padding: 8px 16px; background-color: #FFFFFF; border-bottom: 1px solid #F0F4F8;">
              <p style="margin: 0; font-size: 14px; color: #627D98;">Est. ${card.value}</p>
            </td>
          </tr>
          `
              : ""
          }

          <!-- Why (italic) -->
          <tr>
            <td style="padding: 8px 16px; background-color: #FFFFFF; border-bottom: 1px solid #F0F4F8;">
              <p style="margin: 0; font-size: 14px; font-style: italic; color: #829AB1;">"${card.why}"</p>
            </td>
          </tr>

          <!-- Scope -->
          <tr>
            <td style="padding: 8px 16px; background-color: #FFFFFF; border-bottom: 1px solid #F0F4F8;">
              <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #404040;">${card.scope}</p>
            </td>
          </tr>

          <!-- Applicant -->
          <tr>
            <td style="padding: 8px 16px; background-color: #FFFFFF; border-bottom: 1px solid #F0F4F8;">
              <p style="margin: 0; font-size: 12px; color: #A3A3A3;">Applicant: ${card.applicant}</p>
            </td>
          </tr>

          <!-- Footer row: View DA link + thumb buttons -->
          <tr>
            <td style="padding: 12px 16px; background-color: #F0F4F8;">
              <table style="width: 100%;">
                <tr>
                  <td>
                    <a href="${card.portalUrl}" style="color: #1E3A5F; text-decoration: none; font-size: 14px; font-weight: 600;">View DA →</a>
                  </td>
                  <td style="text-align: right;">
                    <!-- Thumb buttons: 44×44px link with HMAC-signed token -->
                    <a href="${card.thumbUpUrl}" style="display: inline-block; width: 44px; height: 44px; line-height: 44px; text-align: center; margin-right: 8px; text-decoration: none; font-size: 18px;" title="Thumb up">👍</a>
                    <a href="${card.thumbDownUrl}" style="display: inline-block; width: 44px; height: 44px; line-height: 44px; text-align: center; text-decoration: none; font-size: 18px;" title="Thumb down">👎</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </td>
  </tr>
  <tr><td style="height: 12px;"></td></tr>
`
    )
    .join("");

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

      <!-- Digest header: week date, lead count, LGAs -->
      <tr>
        <td style="padding: 24px 16px; background-color: #FFFFFF; border-bottom: 1px solid #E5E5E5;">
          <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #1E3A5F;">Your Sydney Roofing Digest</h2>
          <p style="margin: 0 0 4px 0; font-size: 14px; color: #627D98;">Week of ${weekStart}</p>
          <p style="margin: 0; font-size: 14px; color: #627D98; font-weight: 600;">${leadCount} leads · ${lgas.join(" + ")}</p>
        </td>
      </tr>

      <!-- Precision badge (week 4+) -->
      ${
        precisionBadge
          ? `
      <tr>
        <td style="padding: 0 16px;">
          <table style="margin: 12px 0; width: 100%; border: 1px solid #FEF3C7; background-color: #FFFBEB; border-radius: 6px;">
            <tr>
              <td style="padding: 12px 16px; font-size: 14px; color: #78350F; font-weight: 600;">
                ✓ Last ${precisionBadge.weeks} weeks: ${precisionBadge.precision}% precision
              </td>
            </tr>
          </table>
        </td>
      </tr>
      `
          : ""
      }

      <!-- DA cards -->
      <tr>
        <td style="padding: 16px;">
          <table style="width: 100%;">
            <tbody>
              ${cardHtml}
            </tbody>
          </table>
        </td>
      </tr>

      <!-- End of digest divider -->
      <tr>
        <td style="padding: 24px 16px; text-align: center; color: #829AB1; font-size: 12px;">
          — End of digest · ${leadCount} leads —
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding: 24px 16px; background-color: #F0F4F8; border-top: 1px solid #E5E5E5; font-size: 12px; color: #627D98;">
          <p style="margin: 0 0 8px 0;">ProjectIntelligence AU Pty Ltd</p>
          <p style="margin: 0 0 8px 0;">Level 1, 123 Business Street, Sydney NSW 2000 AU</p>
          ${smsEnabled ? '<p style="margin: 0 0 8px 0;">Reply STOP to any SMS to unsubscribe.</p>' : ""}
          <p style="margin: 0;">
            <a href="https://pi-au.example.com/unsubscribe" style="color: #1E3A5F; text-decoration: underline;">Manage Email Preferences</a>
          </p>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

  return {
    subject: `Your Sydney Roofing Digest — ${leadCount} leads this week`,
    html,
  };
}
