import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1E3A5F",
          color: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: 80,
          gap: 24,
        }}
      >
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -6 }}>Pi</div>
        <div style={{ fontSize: 56, fontWeight: 700 }}>ProjectIntelligence</div>
        <div style={{ fontSize: 32, color: "#D97706", fontWeight: 600 }}>
          Sunday-night DA leads for Sydney roofers.
        </div>
      </div>
    ),
    { ...size },
  );
}
