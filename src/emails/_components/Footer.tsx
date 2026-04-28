import React from "react";

interface FooterProps {
  unsubscribeUrl?: string;
  smsOptIn?: boolean;
}

export function Footer({ unsubscribeUrl, smsOptIn }: FooterProps): React.ReactElement {
  return (
    <table style={{ width: "100%", marginTop: "32px" }}>
      <tbody>
        <tr>
          <td style={{ borderTop: "1px solid #E5E5E5", paddingTop: "16px", fontSize: "12px", color: "#627D98" }}>
            <p style={{ margin: 0, marginBottom: "8px" }}>ProjectIntelligence AU Pty Ltd</p>
            <p style={{ margin: 0, marginBottom: "8px" }}>Level 1, 123 Business Street, Sydney NSW 2000 AU</p>
            <p style={{ margin: 0, marginBottom: "8px" }}>ABN: XX XXX XXX XXX</p>

            {smsOptIn && <p style={{ margin: 0, marginBottom: "8px" }}>Reply STOP to any SMS to unsubscribe.</p>}

            {unsubscribeUrl && (
              <p style={{ margin: 0 }}>
                <a href={unsubscribeUrl} style={{ color: "#1E3A5F", textDecoration: "underline" }}>
                  Manage Email Preferences
                </a>
              </p>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
