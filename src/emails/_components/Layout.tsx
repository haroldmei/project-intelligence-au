import React from "react";

export function Layout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: 0 }}>
        <table style={{ width: "100%", maxWidth: "600px", margin: "0 auto", backgroundColor: "#FAFAFA" }}>
          <tbody>
            {/* Header with PI-AU branding */}
            <tr>
              <td style={{ padding: "24px 16px", backgroundColor: "#FFFFFF", borderBottom: "1px solid #E5E5E5" }}>
                <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "600", color: "#1E3A5F" }}>ProjectIntelligence</h1>
              </td>
            </tr>

            {/* Content area */}
            <tr>
              <td style={{ padding: "32px 16px", backgroundColor: "#FFFFFF" }}>{children}</td>
            </tr>

            {/* Footer */}
            <tr>
              <td style={{ padding: "24px 16px", backgroundColor: "#F0F4F8", borderTop: "1px solid #E5E5E5", fontSize: "12px", color: "#627D98" }}>
                <p style={{ margin: "0 0 12px 0" }}>ProjectIntelligence AU</p>
                <p style={{ margin: "0 0 12px 0" }}>Level 1, 123 Business Street, Sydney NSW 2000 AU</p>
                <p style={{ margin: "0" }}>
                  <a href="https://pi-au.example.com/unsubscribe" style={{ color: "#1E3A5F", textDecoration: "underline" }}>
                    Manage Preferences
                  </a>
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
