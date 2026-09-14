import type { Metadata, Viewport } from "next";
import "./globals.css";
import { persona } from "@/lib/persona";

export const metadata: Metadata = {
  title: `${persona.name} — AI reads your chat`,
  description: persona.tagline,
};

// Mobile: fit the device width, allow pinch-zoom (don't lock user scaling).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFF8F2",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Brand accent from the persona config → CSS variables, one source of
            truth for the whole site. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--accent:${persona.accent};--accent-fg:${persona.accentFg};}`,
          }}
        />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
