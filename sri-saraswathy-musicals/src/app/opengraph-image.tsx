import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/seo";

export const alt = "Sri Saraswathy Musicals — musical instruments in Chennai since 1965";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 90px",
          background: "#0A0908",
          color: "#FAF6EC",
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: 8, color: "#C9A24B", textTransform: "uppercase" }}>Since 1965 · Chennai</div>
        <div style={{ fontSize: 88, fontWeight: 700, marginTop: 24, lineHeight: 1.05 }}>{SITE_NAME}</div>
        <div style={{ fontSize: 36, marginTop: 28, color: "#C8BEAB" }}>
          Indian classical &amp; Western instruments, set up by hand.
        </div>
        <div style={{ height: 4, width: 160, background: "#C9A24B", marginTop: 48 }} />
      </div>
    ),
    size,
  );
}
