import { ImageResponse } from "next/og";
import { persona } from "@/lib/persona";

// The share card. Lives at the app root, so every route that doesn't define
// its own opengraph-image inherits it — landing page and report links alike.
//
// Drawn rather than shipped as a PNG so it stays in sync with lib/persona.ts:
// rename the persona or change the accent colour and the card follows, with
// no image to re-export. next/og rasterises this JSX at request time and the
// result is cached by both the platform and the chat apps that fetch it.
//
// Deliberately generic — no chat title, no report text. These URLs get
// fetched and cached by every link-preview crawler that sees them, which is
// not somewhere a specific group's name belongs. The per-report hook lives in
// the og:title text instead (app/r/[token]/page.tsx).

export const runtime = "edge";
export const alt = `${persona.name} — AI reads your chat`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#FFF8F2",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            width: "90px",
            height: "8px",
            borderRadius: "4px",
            background: persona.accent,
            marginBottom: "48px",
          }}
        />
        <div
          style={{
            fontSize: "76px",
            color: "#1F1A16",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          {persona.name}
        </div>
        <div
          style={{
            fontSize: "38px",
            color: "#6B6259",
            marginTop: "28px",
            maxWidth: "900px",
            lineHeight: 1.35,
          }}
        >
          {persona.tagline}
        </div>
        <div
          style={{
            fontSize: "26px",
            color: persona.accent,
            marginTop: "auto",
            letterSpacing: "0.04em",
          }}
        >
          THE CLASSIC REPORT
        </div>
      </div>
    ),
    size,
  );
}
