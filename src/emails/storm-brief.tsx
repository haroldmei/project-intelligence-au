// Mid-week storm brief email (#20) — triggered by a BOM severe-weather warning
// for the user's subscribed LGAs. Email only in v1 (no SMS — Spam Act caution +
// cost). Attribution: warning data © Bureau of Meteorology.
//
// Plain-function template returning { subject, html } — matches the existing
// transactional templates (trial-reminder, weekly-digest) and the string-map
// registry in src/lib/email/client.ts.
export function StormBriefTemplate(props: {
  warningTitle: string;
  areasLabel: string; // human summary of the BOM affected area, e.g. "Sydney Metropolitan"
  lgaNames: string[]; // the user's affected LGAs
  issuedAtLabel: string | null; // pre-formatted AEST issue time, or null
  warningUrl: string; // BOM warning detail page
  manageUrl?: string; // /account/storm-brief opt-out
  unsubscribeUrl?: string; // functional no-login unsubscribe
}): { subject: string; html: string } {
  const {
    warningTitle,
    areasLabel,
    lgaNames,
    issuedAtLabel,
    warningUrl,
    manageUrl,
    unsubscribeUrl,
  } = props;

  const areaList = lgaNames.length ? lgaNames.join(", ") : areasLabel;
  const manageHref = manageUrl ?? "/account/storm-brief";
  const unsubHref = unsubscribeUrl ?? manageHref;
  const issuedLine = issuedAtLabel
    ? `Issued ${escapeHtml(issuedAtLabel)} by the Bureau of Meteorology.`
    : `Issued by the Bureau of Meteorology.`;

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
          <span style="display: inline-block; padding: 4px 10px; background-color: #FEF3C7; color: #92400E; border-radius: 4px; font-size: 12px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase;">Storm brief</span>

          <h2 style="margin: 16px 0 12px 0; font-size: 18px; font-weight: 600; color: #1E3A5F;">${escapeHtml(warningTitle)}</h2>

          <p style="margin: 0 0 12px 0; font-size: 16px; line-height: 1.5; color: #334E68;">
            The Bureau of Meteorology has a warning covering your area${lgaNames.length === 1 ? "" : "s"}: <strong>${escapeHtml(areaList)}</strong>.
          </p>

          <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; color: #334E68;">
            Storm and hail damage drives a wave of insurance-funded roof repair and replacement — the enquiries usually land in the day or two after a warning. Worth being ready to pick up the phone.
          </p>

          <table style="margin: 8px 0 20px 0;">
            <tbody>
              <tr>
                <td>
                  <a href="${escapeAttr(warningUrl)}" style="display: inline-block; padding: 12px 24px; background-color: #D97706; color: #FFFFFF; border-radius: 6px; font-weight: 600; font-size: 16px; text-decoration: none; line-height: 24px;">
                    View the BOM warning
                  </a>
                </td>
              </tr>
            </tbody>
          </table>

          <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #627D98;">
            ${issuedLine}
          </p>
        </td>
      </tr>

      <tr>
        <td style="padding: 24px 16px; background-color: #F0F4F8; border-top: 1px solid #E5E5E5; font-size: 12px; color: #627D98;">
          <p style="margin: 0 0 8px 0;">Warning data © Bureau of Meteorology. This is a heads-up, not an official emergency alert — always check the BOM and NSW SES for current advice.</p>
          <p style="margin: 0 0 8px 0;">ProjectIntelligence AU Pty Ltd</p>
          <p style="margin: 0 0 8px 0;">Level 1, 123 Business Street, Sydney NSW 2000 AU</p>
          <p style="margin: 0;">
            <a href="${escapeAttr(manageHref)}" style="color: #1E3A5F; text-decoration: underline;">Manage storm-brief settings</a>
            &nbsp;·&nbsp;
            <a href="${escapeAttr(unsubHref)}" style="color: #1E3A5F; text-decoration: underline;">Unsubscribe</a>
          </p>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

  return {
    subject: `Storm brief: ${warningTitle} for ${areaList}`,
    html,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
